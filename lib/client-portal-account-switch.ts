import { createClient } from '@supabase/supabase-js';
import { standardizePhone } from '@/app/api/retell/_lib/phone-utils';
import { supabase } from './supabase';
import { getClientServiceType } from './client-service-type';
import { getHouseholdPeerClientIds } from './client-household';
import { areHouseholdServiceTypesCompatible } from './client-household-link-compat';
import { fetchClientsByEmail, fetchClientsByPhone } from './client-login-accounts';
import {
    isHouseholdFoodPoolingEligible,
    sortHouseholdOrderMembers,
    type HouseholdOrderMember,
} from './household-food-order-pool';

export type SwitchableClientAccount = {
    id: string;
    name: string;
    address?: string;
    serviceType?: string;
};

function normalizeEmail(email: string): string {
    return email.replace(/\s+/g, '').toLowerCase();
}

function getServiceSupabaseClient() {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceRoleKey) {
        return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
            auth: { persistSession: false },
        });
    }
    return supabase;
}

/**
 * Contact-matched peers for a client: same email OR same phone (primary/secondary),
 * plus household peers of those contact matches (same expansion as login account picker).
 */
async function getContactMatchedPeerClientIds(clientId: string): Promise<string[]> {
    const supabaseClient = getServiceSupabaseClient();
    const { data: current, error } = await supabaseClient
        .from('clients')
        .select('id, email, phone_number, secondary_phone_number')
        .eq('id', clientId)
        .maybeSingle();

    if (error || !current) return [];

    const contactMatchedIds = new Set<string>();

    const normalizedEmail = current.email ? normalizeEmail(current.email) : '';
    if (normalizedEmail) {
        for (const id of await fetchClientsByEmail(normalizedEmail)) {
            if (id !== clientId) contactMatchedIds.add(id);
        }
    }

    const phoneKeys = new Set<string>();
    for (const raw of [current.phone_number, current.secondary_phone_number]) {
        const digits = standardizePhone(raw);
        if (digits.length >= 10) phoneKeys.add(digits);
    }
    for (const phone of phoneKeys) {
        for (const id of await fetchClientsByPhone(phone)) {
            if (id !== clientId) contactMatchedIds.add(id);
        }
    }

    const allIds = new Set(contactMatchedIds);
    for (const matchedId of contactMatchedIds) {
        for (const peerId of await getHouseholdPeerClientIds(matchedId)) {
            if (peerId !== clientId) allIds.add(peerId);
        }
    }

    return [...allIds];
}

/**
 * Clients the portal session may switch into: formal household peers plus
 * accounts sharing the same email or phone (even when not formally linked).
 */
export async function getSwitchableClientAccounts(clientId: string): Promise<SwitchableClientAccount[]> {
    const supabaseClient = getServiceSupabaseClient();
    const { data: current, error } = await supabaseClient
        .from('clients')
        .select('id, full_name, address, service_type, upcoming_order')
        .eq('id', clientId)
        .maybeSingle();

    if (error || !current) return [];

    const byId = new Map<string, SwitchableClientAccount>();

    const addRow = (row: {
        id: string;
        full_name?: string | null;
        address?: string | null;
        service_type?: string | null;
        upcoming_order?: unknown;
    }) => {
        if (!row.id) return;
        byId.set(row.id, {
            id: row.id,
            name: row.full_name?.trim() || 'Client',
            address: row.address?.trim() || undefined,
            serviceType: getClientServiceType(row) || undefined,
        });
    };

    addRow(current);

    const peerIds = new Set<string>();
    for (const id of await getHouseholdPeerClientIds(clientId)) {
        peerIds.add(id);
    }
    for (const id of await getContactMatchedPeerClientIds(clientId)) {
        peerIds.add(id);
    }

    const idsToLoad = [...peerIds].filter((id) => id && id !== clientId);
    if (idsToLoad.length > 0) {
        // Chunk .in() lists to stay under URL/query size limits
        const chunkSize = 150;
        for (let i = 0; i < idsToLoad.length; i += chunkSize) {
            const chunk = idsToLoad.slice(i, i + chunkSize);
            const { data: peers } = await supabaseClient
                .from('clients')
                .select('id, full_name, address, service_type, upcoming_order')
                .in('id', chunk);

            for (const row of peers ?? []) {
                addRow(row);
            }
        }
    }

    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Load budgets + saved orders for formally linked Food/Meal household members only.
 * Contact-matched (email/phone) accounts can switch but do not pool a cart unless linked.
 */
export async function getHouseholdOrderMembersForPortal(
    portalClientId: string,
    portalServiceType: string,
    switchableAccounts: SwitchableClientAccount[] = [],
): Promise<HouseholdOrderMember[]> {
    if (!isHouseholdFoodPoolingEligible(portalServiceType)) {
        return [];
    }

    const householdPeerIds = await getHouseholdPeerClientIds(portalClientId);
    if (householdPeerIds.length === 0) {
        return [];
    }

    const supabaseClient = getServiceSupabaseClient();
    const ids = [portalClientId, ...householdPeerIds].filter(Boolean);
    const { data: rows, error } = await supabaseClient
        .from('clients')
        .select('id, full_name, approved_meals_per_week, service_type, upcoming_order')
        .in('id', ids);

    if (error || !rows?.length) return [];

    const nameById = new Map(switchableAccounts.map((a) => [a.id, a.name]));
    const members: HouseholdOrderMember[] = [];
    for (const row of rows) {
        if (!row.id) continue;
        const memberType = getClientServiceType(row);
        if (!areHouseholdServiceTypesCompatible(portalServiceType, memberType)) continue;
        members.push({
            id: row.id,
            name: row.full_name?.trim() || nameById.get(row.id) || 'Client',
            serviceType: memberType || undefined,
            approvedMealsPerWeek: Math.max(0, Number(row.approved_meals_per_week) || 0),
            upcomingOrder: row.upcoming_order ?? undefined,
        });
    }

    if (members.length < 2) return [];
    return sortHouseholdOrderMembers(members, portalClientId);
}

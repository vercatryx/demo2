import { createClient } from '@supabase/supabase-js';
import { getSearchVariants, standardizePhone } from '@/app/api/retell/_lib/phone-utils';
import { getClientServiceType } from './client-service-type';
import { getHouseholdPeerClientIds } from './client-household';
import { supabase } from './supabase';

export type LoginClientAccountOption = {
    id: string;
    type: 'client';
    name: string;
    address?: string;
    serviceType?: string;
    statusLabel?: string;
    canOrder?: boolean;
};

function normalizeEmail(email: string): string {
    return email.replace(/\s+/g, '').toLowerCase();
}

function isClientStatusApproved(statusName: string | null | undefined): boolean {
    return (statusName ?? '').trim().toLowerCase() === 'approved';
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

/** Client ids whose email matches (normalized: trim spaces, case-insensitive). */
export async function fetchClientsByEmail(normalizedEmail: string): Promise<string[]> {
    const email = normalizeEmail(normalizedEmail);
    if (!email) return [];

    const supabaseClient = getServiceSupabaseClient();
    const { data } = await supabaseClient
        .from('clients')
        .select('id, email')
        .ilike('email', email);

    return (data ?? [])
        .filter((row) => row.id && row.email && normalizeEmail(row.email) === email)
        .map((row) => row.id as string);
}

/** Client ids whose primary or secondary phone matches. */
export async function fetchClientsByPhone(phoneInput: string): Promise<string[]> {
    const normalizedPhone = standardizePhone(phoneInput);
    if (!normalizedPhone || normalizedPhone.length < 10) return [];

    const supabaseClient = getServiceSupabaseClient();
    const variants = getSearchVariants(normalizedPhone);
    if (variants.length === 0) return [];

    const orFilter = variants
        .flatMap((v) => [`phone_number.eq.${v}`, `secondary_phone_number.eq.${v}`])
        .join(',');

    const { data } = await supabaseClient
        .from('clients')
        .select('id')
        .or(orFilter);

    return (data ?? []).map((row) => row.id as string).filter(Boolean);
}

async function loadClientLoginOptions(clientIds: string[]): Promise<LoginClientAccountOption[]> {
    const uniqueIds = [...new Set(clientIds.filter(Boolean))];
    if (uniqueIds.length === 0) return [];

    const supabaseClient = getServiceSupabaseClient();
    const { data: clients, error } = await supabaseClient
        .from('clients')
        .select('id, full_name, address, upcoming_order, service_type, status_id')
        .in('id', uniqueIds);

    if (error || !clients?.length) return [];

    const statusIds = [...new Set(clients.map((c) => c.status_id).filter(Boolean))];
    const statusNameById = new Map<string, string>();
    if (statusIds.length > 0) {
        const { data: statuses } = await supabaseClient
            .from('client_statuses')
            .select('id, name')
            .in('id', statusIds);
        for (const status of statuses ?? []) {
            if (status.id) {
                statusNameById.set(status.id, (status.name ?? 'Unknown').trim() || 'Unknown');
            }
        }
    }

    return clients
        .map((client) => {
            const statusLabel = client.status_id
                ? statusNameById.get(client.status_id) ?? 'Unknown'
                : 'Unknown';
            return {
                id: client.id,
                type: 'client' as const,
                name: client.full_name?.trim() || 'Client',
                address: client.address?.trim() || undefined,
                serviceType: getClientServiceType(client) || undefined,
                statusLabel,
                canOrder: isClientStatusApproved(statusLabel),
            };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * All client accounts a user may authenticate into for this email or phone.
 * Includes contact matches plus household peers (same group, no shared contact required).
 * Does not filter by approval status — any match may sign in; ordering limits apply in the portal.
 */
export async function getLoginClientAccountsForIdentifier(
    identifier: string,
    isPhone: boolean,
): Promise<LoginClientAccountOption[]> {
    const contactMatchedIds = isPhone
        ? await fetchClientsByPhone(identifier)
        : await fetchClientsByEmail(normalizeEmail(identifier));

    if (contactMatchedIds.length === 0) return [];

    const allIds = new Set(contactMatchedIds);
    for (const clientId of contactMatchedIds) {
        const peerIds = await getHouseholdPeerClientIds(clientId);
        for (const peerId of peerIds) {
            allIds.add(peerId);
        }
    }

    return loadClientLoginOptions([...allIds]);
}

/** True when at least one client account can authenticate for this identifier. */
export async function hasLoginClientAccountsForIdentifier(
    identifier: string,
    isPhone: boolean,
): Promise<boolean> {
    const accounts = await getLoginClientAccountsForIdentifier(identifier, isPhone);
    return accounts.length > 0;
}

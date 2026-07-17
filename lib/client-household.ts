'use server';

import { createClient } from '@supabase/supabase-js';
import { supabase } from './supabase';

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
 * All client ids in the same household group as clientId (excluding clientId itself).
 * demo-food has no staff-facing household-linking UI (client_household_members /
 * client_household_groups are not migrated here) — this always returns [] via the
 * error path below, so portal account switching gracefully falls back to the
 * parent/dependent + contact-matched logic in `client-portal-account-switch.ts`.
 */
export async function getHouseholdPeerClientIds(clientId: string): Promise<string[]> {
    if (!clientId) return [];
    const supabaseClient = getServiceSupabaseClient();
    const { data: membership, error } = await supabaseClient
        .from('client_household_members')
        .select('group_id')
        .eq('client_id', clientId)
        .maybeSingle();

    if (error || !membership?.group_id) return [];

    const { data: peers, error: peersError } = await supabaseClient
        .from('client_household_members')
        .select('client_id')
        .eq('group_id', membership.group_id)
        .neq('client_id', clientId);

    if (peersError || !peers) return [];
    return peers.map((row: { client_id: string }) => row.client_id).filter(Boolean);
}

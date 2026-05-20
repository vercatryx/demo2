/**
 * Shared filters for admin usage list + summary endpoints.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase builder chain differs between .select variants */
export type UsageQueryParams = {
    from?: string | null;
    to?: string | null;
    kind?: string | null;
    channel?: string | null;
    client_id?: string | null;
    phone?: string | null;
    model?: string | null;
    provider?: string | null;
    sms_direction?: string | null;
    q?: string | null;
};

/** Resolve client UUIDs whose full_name matches search (for `q`). */
export async function clientIdsMatchingName(supabase: SupabaseClient, q: string): Promise<string[]> {
    const term = q.trim();
    if (!term) return [];
    const { data, error } = await supabase.from('clients').select('id').ilike('full_name', `%${term}%`).limit(500);
    if (error) {
        console.error('[usage-admin-query] client name search', error);
        return [];
    }
    return (data ?? []).map(r => r.id as string);
}

function sanitizeIlike(raw: string): string {
    return raw.replace(/%/g, '').slice(0, 120);
}

/**
 * Apply filters to a `usage_events` query. Call `.order()` / `.range()` after.
 */
export function applyUsageFilters(qb: any, p: UsageQueryParams, clientIdsFromNameSearch: string[]): any {
    let q = qb;
    if (p.from) q = q.gte('occurred_at', p.from);
    if (p.to) q = q.lte('occurred_at', p.to);
    if (p.kind && p.kind !== 'all') q = q.eq('kind', p.kind);
    if (p.channel && p.channel !== 'all') q = q.eq('channel', p.channel);
    if (p.client_id) q = q.eq('client_id', p.client_id);
    if (p.phone?.trim()) {
        const digits = p.phone.replace(/\D/g, '');
        if (digits.length >= 3) q = q.ilike('phone_e164', `%${digits}%`);
    }
    if (p.model?.trim()) q = q.eq('model', p.model.trim());
    if (p.provider?.trim()) q = q.eq('provider', p.provider.trim());
    if (p.sms_direction && (p.sms_direction === 'inbound' || p.sms_direction === 'outbound')) {
        q = q.eq('sms_direction', p.sms_direction);
    }

    const search = p.q?.trim();
    if (search) {
        const esc = sanitizeIlike(search);
        const clauses: string[] = [`phone_e164.ilike.%${esc}%`];
        const tid = search.trim();
        if (/^[A-Za-z0-9_-]{16,}$/.test(tid)) {
            clauses.push(`retell_call_id.eq.${tid}`);
        }
        for (const id of clientIdsFromNameSearch.slice(0, 120)) {
            clauses.push(`client_id.eq.${id}`);
        }
        q = q.or(clauses.join(','));
    }

    return q;
}

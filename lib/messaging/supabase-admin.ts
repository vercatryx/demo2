import { createClient, SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

export function getMessagingSupabase(): SupabaseClient {
    if (cached) return cached;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }
    cached = createClient(url, key, { auth: { persistSession: false } });
    return cached;
}

export async function loadAllClientsForMessaging() {
    const supabase = getMessagingSupabase();
    const pageSize = 1000;
    const all: Array<{
        id: string;
        full_name: string | null;
        email: string | null;
        phone_number: string | null;
        secondary_phone_number: string | null;
        upcoming_order: unknown;
        client_statuses: { name?: string } | { name?: string }[] | null;
    }> = [];

    let from = 0;
    while (true) {
        const { data, error } = await supabase
            .from('clients')
            .select('id, full_name, email, phone_number, secondary_phone_number, upcoming_order, client_statuses(name)')
            .range(from, from + pageSize - 1)
            .order('id');
        if (error) throw error;
        if (!data?.length) break;
        all.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
    }

    return all;
}

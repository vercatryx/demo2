import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseDbApiKey, getSupabaseServerSecretKey } from '@/lib/supabase-env';

/** Service-role / secret Supabase client for internal reports (bypasses RLS). */
export function createReportsSupabase(): SupabaseClient {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const key = getSupabaseServerSecretKey() ?? getSupabaseDbApiKey();
    if (!url || !key) {
        throw new Error(
            'Missing Supabase config for internal reports. Set NEXT_PUBLIC_SUPABASE_URL and ' +
                'SUPABASE_SECRET_KEY (preferred) or SUPABASE_SERVICE_ROLE_KEY in .env.local.'
        );
    }
    return createClient(url, key, { auth: { persistSession: false } });
}

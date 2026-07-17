import type { PostgrestError } from '@supabase/supabase-js';

/** Supabase/PostgREST returns at most this many rows per request unless paginated. */
export const SUPABASE_MAX_ROWS_PER_REQUEST = 1000;

type PageResult<T> = {
    data: T[] | null;
    error: PostgrestError | null;
};

/**
 * Fetch all rows for a query that may exceed Supabase's 1000-row page limit.
 * Pass a callback that applies filters/order and calls `.range(from, to)`.
 *
 * @example
 * const rows = await fetchAllSupabaseRows((from, to) =>
 *   supabase.from('menu_items').select('id, value, quota_value').order('id').range(from, to)
 * );
 */
export async function fetchAllSupabaseRows<T>(
    fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>
): Promise<T[]> {
    const all: T[] = [];
    let from = 0;

    while (true) {
        const to = from + SUPABASE_MAX_ROWS_PER_REQUEST - 1;
        const { data, error } = await fetchPage(from, to);
        if (error) throw error;

        const batch = data ?? [];
        all.push(...batch);
        if (batch.length < SUPABASE_MAX_ROWS_PER_REQUEST) break;
        from += SUPABASE_MAX_ROWS_PER_REQUEST;
    }

    return all;
}

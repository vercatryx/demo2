import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllSupabaseRows } from '@/lib/supabase/fetch-all-rows';

/**
 * Paginated catalog reads for order creation / verification.
 * PostgREST caps at 1000 rows — menu_items alone exceeds that.
 */
export async function fetchAllMenuItems(
    supabase: SupabaseClient,
    select: string
): Promise<any[]> {
    return fetchAllSupabaseRows((from, to) =>
        supabase.from('menu_items').select(select).order('id', { ascending: true }).range(from, to)
    );
}

export async function fetchAllBreakfastItems(
    supabase: SupabaseClient,
    select: string
): Promise<any[]> {
    return fetchAllSupabaseRows((from, to) =>
        supabase.from('breakfast_items').select(select).order('id', { ascending: true }).range(from, to)
    );
}

/** breakfast_items sorted for UI lists (getMealItems). */
export async function fetchAllBreakfastItemsSorted(
    supabase: SupabaseClient,
    select: string = '*'
): Promise<any[]> {
    return fetchAllSupabaseRows((from, to) =>
        supabase
            .from('breakfast_items')
            .select(select)
            .order('sort_order', { ascending: true })
            .order('name', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to)
    );
}

/** All menu_items for one vendor (vendor portal menus). */
export async function fetchMenuItemsForVendor(
    supabase: SupabaseClient,
    vendorId: string,
    select: string = '*'
): Promise<any[]> {
    return fetchAllSupabaseRows((from, to) =>
        supabase
            .from('menu_items')
            .select(select)
            .eq('vendor_id', vendorId)
            .order('id', { ascending: true })
            .range(from, to)
    );
}

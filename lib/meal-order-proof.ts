/**
 * Derive meal type from order_items for proof / verifier matching.
 * Meal orders do not store meal_type on the orders row — type comes from item categories.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllBreakfastItems, fetchAllMenuItems } from '@/lib/order-catalog-load';
import { mealOrderTupleKey } from '@/lib/create-orders-week-utils';

export type MealTypeMaps = {
    mealItemIdToMealType: Map<string, string>;
    menuItemIdToMealType: Map<string, string>;
};

export async function loadMealTypeMaps(supabase: SupabaseClient): Promise<MealTypeMaps> {
    const [breakfastCatRes, itemCatRes, mealItemsData, menuItemsData] = await Promise.all([
        supabase.from('breakfast_categories').select('id, meal_type'),
        supabase.from('item_categories').select('id, meal_type'),
        fetchAllBreakfastItems(supabase, 'id, category_id'),
        fetchAllMenuItems(supabase, 'id, category_id')
    ]);

    const categoryIdToMealType = new Map<string, string>(
        (breakfastCatRes.data ?? []).map((c: { id: string; meal_type?: string }) => [c.id, c.meal_type || 'Lunch'])
    );
    const itemCategoryIdToMealType = new Map<string, string>(
        (itemCatRes.data ?? []).map((c: { id: string; meal_type?: string }) => [c.id, c.meal_type || 'Lunch'])
    );

    const mealItemIdToMealType = new Map<string, string>();
    for (const i of mealItemsData) {
        mealItemIdToMealType.set(i.id as string, categoryIdToMealType.get(i.category_id as string) || 'Lunch');
    }

    const menuItemIdToMealType = new Map<string, string>();
    for (const i of menuItemsData) {
        menuItemIdToMealType.set(i.id as string, itemCategoryIdToMealType.get(i.category_id as string) || 'Lunch');
    }

    return { mealItemIdToMealType, menuItemIdToMealType };
}

export function deriveMealTypeFromItemRows(
    rows: { meal_item_id?: string | null; menu_item_id?: string | null }[],
    maps: MealTypeMaps
): string | null {
    const types = new Set<string>();
    for (const row of rows) {
        if (row.meal_item_id) {
            const mt = maps.mealItemIdToMealType.get(row.meal_item_id);
            if (mt) types.add(mt);
        }
        if (row.menu_item_id) {
            const mt =
                maps.mealItemIdToMealType.get(row.menu_item_id) ??
                maps.menuItemIdToMealType.get(row.menu_item_id);
            if (mt) types.add(mt);
        }
    }
    if (types.size === 0) return null;
    return [...types].sort()[0];
}

export const MEAL_TYPE_UNCLASSIFIED = '__unclassified__';

export function mealCoverageKey(
    clientId: string,
    deliveryDate: string,
    vendorId: string,
    mealType: string | null
): string {
    return mealOrderTupleKey(
        clientId,
        deliveryDate,
        vendorId,
        mealType ?? MEAL_TYPE_UNCLASSIFIED
    );
}

export async function loadOrderItemsByOrderId(
    supabase: SupabaseClient,
    orderIds: string[]
): Promise<Map<string, { meal_item_id?: string | null; menu_item_id?: string | null }[]>> {
    const byOrder = new Map<string, { meal_item_id?: string | null; menu_item_id?: string | null }[]>();
    for (let i = 0; i < orderIds.length; i += 200) {
        const chunk = orderIds.slice(i, i + 200);
        const { data, error } = await supabase
            .from('order_items')
            .select('order_id, meal_item_id, menu_item_id')
            .in('order_id', chunk);
        if (error) throw error;
        for (const row of data ?? []) {
            if (!byOrder.has(row.order_id)) byOrder.set(row.order_id, []);
            byOrder.get(row.order_id)!.push(row);
        }
    }
    return byOrder;
}

export function tryConsumeCoverageCount(counts: Map<string, number>, key: string): boolean {
    const n = counts.get(key) ?? 0;
    if (n <= 0) return false;
    if (n === 1) counts.delete(key);
    else counts.set(key, n - 1);
    return true;
}

/** Match expected meal slot to an actual order, allowing unclassified meal rows. */
export function tryConsumeMealCoverage(
    counts: Map<string, number>,
    clientId: string,
    deliveryDate: string,
    vendorId: string,
    mealType: string
): boolean {
    if (tryConsumeCoverageCount(counts, mealCoverageKey(clientId, deliveryDate, vendorId, mealType))) {
        return true;
    }
    return tryConsumeCoverageCount(
        counts,
        mealCoverageKey(clientId, deliveryDate, vendorId, MEAL_TYPE_UNCLASSIFIED)
    );
}

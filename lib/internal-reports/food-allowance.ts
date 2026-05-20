import type { SupabaseClient } from '@supabase/supabase-js';
import { effectiveServiceType } from '@/lib/internal-reports/service-type';

function flattenVendorSelectionQuantities(vs: Record<string, unknown>): Record<string, number> {
    const ibd = (vs.itemsByDay ?? vs.items_by_day) as Record<string, Record<string, number>> | undefined;
    if (ibd && typeof ibd === 'object' && Object.keys(ibd).length > 0) {
        const out: Record<string, number> = {};
        for (const dayItems of Object.values(ibd)) {
            if (!dayItems || typeof dayItems !== 'object') continue;
            for (const [id, q] of Object.entries(dayItems)) {
                out[id] = (out[id] ?? 0) + (Number(q) || 0);
            }
        }
        return out;
    }
    const items = vs.items as Record<string, number> | undefined;
    if (!items || typeof items !== 'object' || Object.keys(items).length === 0) return {};
    const days =
        (Array.isArray(vs.selectedDeliveryDays) && vs.selectedDeliveryDays.length > 0
            ? vs.selectedDeliveryDays.length
            : Array.isArray(vs.selected_delivery_days) && vs.selected_delivery_days.length > 0
              ? vs.selected_delivery_days.length
              : 1) as number;
    const out: Record<string, number> = {};
    for (const [id, q] of Object.entries(items)) {
        out[id] = (Number(q) || 0) * days;
    }
    return out;
}

function weeklyVendorMealPoints(vendorSelections: unknown[], menuItemValueById: Map<string, number>): number {
    let total = 0;
    for (const vs of vendorSelections) {
        if (!vs || typeof vs !== 'object') continue;
        const flat = flattenVendorSelectionQuantities(vs as Record<string, unknown>);
        for (const [itemId, qty] of Object.entries(flat)) {
            const mv = Math.max(1, Number(menuItemValueById.get(itemId)) || 1);
            total += (Number(qty) || 0) * mv;
        }
    }
    return total;
}

function collectVendorSelections(upcoming: Record<string, unknown>): unknown[] {
    const out: unknown[] = [];
    const top = upcoming.vendorSelections ?? upcoming.vendor_selections;
    if (Array.isArray(top)) out.push(...top);
    const ddo = (upcoming.deliveryDayOrders ?? upcoming.delivery_day_orders) as Record<string, unknown> | undefined;
    if (ddo && typeof ddo === 'object') {
        for (const day of Object.values(ddo)) {
            if (!day || typeof day !== 'object') continue;
            const d = day as Record<string, unknown>;
            const arr = d.vendorSelections ?? d.vendor_selections;
            if (Array.isArray(arr)) out.push(...arr);
        }
    }
    const keyed = upcoming.Food ?? upcoming.food;
    if (keyed && typeof keyed === 'object') {
        out.push(...collectVendorSelections(keyed as Record<string, unknown>));
    }
    return out;
}

export type FoodAllowanceSnapshot = {
    success: true;
    approved_meals_per_week: number;
    used_meals_total: number;
    remaining_meals: number;
};

/** Approximate weekly food allowance usage (aligned with SMS menu tool math). */
export async function getFoodAllowanceSnapshot(
    supabase: SupabaseClient,
    client: {
        id: string;
        approved_meals_per_week?: number | null;
        service_type?: string | null;
        upcoming_order?: unknown;
    }
): Promise<FoodAllowanceSnapshot | { success: false }> {
    if (effectiveServiceType({ ...client, service_type: client.service_type ?? undefined }) !== 'Food') {
        return { success: false };
    }
    const approved = Math.max(0, Number(client.approved_meals_per_week) || 0);
    const uo = client.upcoming_order;
    if (!uo || typeof uo !== 'object') {
        return { success: true, approved_meals_per_week: approved, used_meals_total: 0, remaining_meals: approved };
    }

    const { data: menuItems } = await supabase.from('menu_items').select('id, value').eq('is_active', true);
    const menuItemValueById = new Map<string, number>();
    for (const mi of menuItems ?? []) {
        menuItemValueById.set((mi as { id: string }).id, Math.max(1, Number((mi as { value?: number }).value) || 1));
    }

    const { data: mealItems } = await supabase.from('breakfast_items').select('id, quota_value').eq('is_active', true);
    const mealQuotaById = new Map<string, number>();
    for (const it of mealItems ?? []) {
        mealQuotaById.set((it as { id: string }).id, Math.max(0, Number((it as { quota_value?: number }).quota_value) || 0));
    }

    const upcoming = uo as Record<string, unknown>;
    let vendorMealsTotal = weeklyVendorMealPoints(collectVendorSelections(upcoming), menuItemValueById);

    let mealSelectionsTotal = 0;
    const ms = (upcoming.mealSelections ?? upcoming.meal_selections) as Record<string, { items?: Record<string, number> }> | undefined;
    if (ms && typeof ms === 'object') {
        for (const config of Object.values(ms)) {
            const items = config?.items;
            if (!items || typeof items !== 'object') continue;
            for (const [itemId, qty] of Object.entries(items)) {
                mealSelectionsTotal += (Number(qty) || 0) * (mealQuotaById.get(itemId) ?? 0);
            }
        }
    }

    const usedMealsTotal = vendorMealsTotal + mealSelectionsTotal;
    const remainingMeals = Math.max(0, approved - usedMealsTotal);
    return {
        success: true,
        approved_meals_per_week: approved,
        used_meals_total: usedMealsTotal,
        remaining_meals: remainingMeals,
    };
}

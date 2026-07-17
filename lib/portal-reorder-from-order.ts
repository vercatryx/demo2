/**
 * Rebuild a portal OrderConfiguration from a historical `orders` row
 * (order_vendor_selections / order_items / order_box_selections).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { deriveMealTypeFromItemRows, loadMealTypeMaps } from '@/lib/meal-order-proof';
import type { OrderConfiguration } from '@/lib/types';

function parseBoxItemsJson(items: unknown): Record<string, number> {
    if (!items) return {};
    let obj: unknown = items;
    if (typeof items === 'string') {
        try {
            obj = JSON.parse(items);
        } catch {
            return {};
        }
    }
    if (!obj || typeof obj !== 'object') return {};
    const out: Record<string, number> = {};
    for (const [itemId, raw] of Object.entries(obj as Record<string, unknown>)) {
        const qty =
            typeof raw === 'number'
                ? raw
                : typeof raw === 'object' && raw !== null && 'quantity' in raw
                  ? Number((raw as { quantity?: unknown }).quantity)
                  : Number(raw);
        if (Number.isFinite(qty) && qty > 0) out[itemId] = (out[itemId] ?? 0) + qty;
    }
    return out;
}

function parseBoxItemNotesJson(notes: unknown): Record<string, string> {
    if (!notes) return {};
    let obj: unknown = notes;
    if (typeof notes === 'string') {
        try {
            obj = JSON.parse(notes);
        } catch {
            return {};
        }
    }
    if (!obj || typeof obj !== 'object') return {};
    const out: Record<string, string> = {};
    for (const [itemId, raw] of Object.entries(obj as Record<string, unknown>)) {
        if (typeof raw === 'string' && raw.trim()) out[itemId] = raw.trim();
        else if (raw && typeof raw === 'object' && typeof (raw as { note?: unknown }).note === 'string') {
            const note = String((raw as { note: string }).note).trim();
            if (note) out[itemId] = note;
        }
    }
    return out;
}

function countPositiveItems(items: Record<string, number> | undefined): number {
    if (!items) return 0;
    return Object.values(items).reduce((sum, qty) => sum + (Number(qty) > 0 ? 1 : 0), 0);
}

type OrderRow = {
    id: string;
    client_id: string;
    service_type: string | null;
    case_id?: string | null;
    notes?: string | null;
};

export type PortalReorderBuildResult = {
    config: OrderConfiguration;
    itemCount: number;
};

async function buildFoodConfig(
    supabase: SupabaseClient,
    order: OrderRow,
): Promise<PortalReorderBuildResult> {
    const { data: vendorSelections } = await supabase
        .from('order_vendor_selections')
        .select('id, vendor_id')
        .eq('order_id', order.id);

    const vendorSelectionsOut: NonNullable<OrderConfiguration['vendorSelections']> = [];
    let itemCount = 0;

    for (const vs of vendorSelections ?? []) {
        const { data: items } = await supabase
            .from('order_items')
            .select('menu_item_id, meal_item_id, quantity, notes')
            .eq('vendor_selection_id', (vs as { id: string }).id);

        const itemsMap: Record<string, number> = {};
        const itemNotes: Record<string, string> = {};

        for (const row of items ?? []) {
            const qty = Number((row as { quantity?: number }).quantity) || 0;
            if (qty <= 0) continue;
            const itemId =
                (row as { menu_item_id?: string | null }).menu_item_id ||
                (row as { meal_item_id?: string | null }).meal_item_id;
            if (!itemId) continue;
            itemsMap[itemId] = (itemsMap[itemId] ?? 0) + qty;
            const note = (row as { notes?: string | null }).notes?.trim();
            if (note) itemNotes[itemId] = note;
        }

        if (Object.keys(itemsMap).length === 0) continue;
        itemCount += countPositiveItems(itemsMap);
        vendorSelectionsOut.push({
            vendorId: String((vs as { vendor_id: string }).vendor_id),
            items: itemsMap,
            ...(Object.keys(itemNotes).length > 0 ? { itemNotes } : {}),
        });
    }

    // Fallback when items are only linked by order_id (legacy / partial rows).
    if (vendorSelectionsOut.length === 0) {
        const { data: directItems } = await supabase
            .from('order_items')
            .select('menu_item_id, meal_item_id, quantity, notes, vendor_selection_id')
            .eq('order_id', order.id);

        const vsIdToVendor = new Map(
            (vendorSelections ?? []).map((vs) => [
                String((vs as { id: string }).id),
                String((vs as { vendor_id: string }).vendor_id),
            ]),
        );
        const byVendor = new Map<string, { items: Record<string, number>; itemNotes: Record<string, string> }>();

        for (const row of directItems ?? []) {
            const qty = Number((row as { quantity?: number }).quantity) || 0;
            if (qty <= 0) continue;
            const itemId =
                (row as { menu_item_id?: string | null }).menu_item_id ||
                (row as { meal_item_id?: string | null }).meal_item_id;
            if (!itemId) continue;
            const vsId = (row as { vendor_selection_id?: string | null }).vendor_selection_id;
            const vendorId =
                (vsId && vsIdToVendor.get(String(vsId))) ||
                (vendorSelections?.[0] ? String((vendorSelections[0] as { vendor_id: string }).vendor_id) : '');
            if (!vendorId) continue;
            if (!byVendor.has(vendorId)) byVendor.set(vendorId, { items: {}, itemNotes: {} });
            const bucket = byVendor.get(vendorId)!;
            bucket.items[itemId] = (bucket.items[itemId] ?? 0) + qty;
            const note = (row as { notes?: string | null }).notes?.trim();
            if (note) bucket.itemNotes[itemId] = note;
        }

        for (const [vendorId, bucket] of byVendor) {
            if (Object.keys(bucket.items).length === 0) continue;
            itemCount += countPositiveItems(bucket.items);
            vendorSelectionsOut.push({
                vendorId,
                items: bucket.items,
                ...(Object.keys(bucket.itemNotes).length > 0 ? { itemNotes: bucket.itemNotes } : {}),
            });
        }
    }

    const config: OrderConfiguration = {
        serviceType: 'Food',
        caseId: order.case_id ?? undefined,
        vendorSelections: vendorSelectionsOut,
        mealSelections: {},
    };

    return { config, itemCount };
}

async function buildMealConfig(
    supabase: SupabaseClient,
    order: OrderRow,
): Promise<PortalReorderBuildResult> {
    const { data: vendorSelections } = await supabase
        .from('order_vendor_selections')
        .select('id, vendor_id')
        .eq('order_id', order.id);

    const mealMaps = await loadMealTypeMaps(supabase);
    const mealSelections: NonNullable<OrderConfiguration['mealSelections']> = {};
    let itemCount = 0;

    const vsList = vendorSelections ?? [];
    if (vsList.length === 0) {
        const { data: rows } = await supabase
            .from('order_items')
            .select('menu_item_id, meal_item_id, quantity, notes')
            .eq('order_id', order.id);
        const mealType =
            deriveMealTypeFromItemRows(rows ?? [], mealMaps) || 'Lunch';
        const items: Record<string, number> = {};
        const itemNotes: Record<string, string> = {};
        for (const row of rows ?? []) {
            const qty = Number((row as { quantity?: number }).quantity) || 0;
            if (qty <= 0) continue;
            const itemId =
                (row as { meal_item_id?: string | null }).meal_item_id ||
                (row as { menu_item_id?: string | null }).menu_item_id;
            if (!itemId) continue;
            items[itemId] = (items[itemId] ?? 0) + qty;
            const note = (row as { notes?: string | null }).notes?.trim();
            if (note) itemNotes[itemId] = note;
        }
        if (Object.keys(items).length > 0) {
            itemCount += countPositiveItems(items);
            mealSelections[mealType] = {
                vendorId: undefined,
                items,
                ...(Object.keys(itemNotes).length > 0 ? { itemNotes } : {}),
            };
        }
    } else {
        for (const vs of vsList) {
            const { data: rows } = await supabase
                .from('order_items')
                .select('menu_item_id, meal_item_id, quantity, notes')
                .eq('vendor_selection_id', (vs as { id: string }).id);

            const mealType =
                deriveMealTypeFromItemRows(rows ?? [], mealMaps) || 'Lunch';
            const existing = mealSelections[mealType] ?? {
                vendorId: String((vs as { vendor_id: string }).vendor_id) || undefined,
                items: {},
                itemNotes: {},
            };
            const items = { ...(existing.items || {}) };
            const itemNotes = { ...(existing.itemNotes || {}) };

            for (const row of rows ?? []) {
                const qty = Number((row as { quantity?: number }).quantity) || 0;
                if (qty <= 0) continue;
                const itemId =
                    (row as { meal_item_id?: string | null }).meal_item_id ||
                    (row as { menu_item_id?: string | null }).menu_item_id;
                if (!itemId) continue;
                items[itemId] = (items[itemId] ?? 0) + qty;
                const note = (row as { notes?: string | null }).notes?.trim();
                if (note) itemNotes[itemId] = note;
            }

            if (Object.keys(items).length === 0) continue;
            itemCount += countPositiveItems(items);
            mealSelections[mealType] = {
                vendorId:
                    existing.vendorId ??
                    (String((vs as { vendor_id: string }).vendor_id) || undefined),
                items,
                ...(Object.keys(itemNotes).length > 0 ? { itemNotes } : {}),
            };
        }
    }

    const config: OrderConfiguration = {
        // Portal food mode persists as Food with mealSelections (same as live upcoming_order).
        serviceType: 'Food',
        caseId: order.case_id ?? undefined,
        vendorSelections: [],
        mealSelections,
    };

    return { config, itemCount };
}

async function buildBoxesConfig(
    supabase: SupabaseClient,
    order: OrderRow,
): Promise<PortalReorderBuildResult> {
    const { data: boxSelections } = await supabase
        .from('order_box_selections')
        .select('box_type_id, vendor_id, quantity, items, item_notes')
        .eq('order_id', order.id);

    const boxOrders: NonNullable<OrderConfiguration['boxOrders']> = [];
    let itemCount = 0;

    for (const box of boxSelections ?? []) {
        const items = parseBoxItemsJson((box as { items?: unknown }).items);
        const itemNotes = parseBoxItemNotesJson((box as { item_notes?: unknown }).item_notes);
        itemCount += countPositiveItems(items);
        boxOrders.push({
            boxTypeId: (box as { box_type_id?: string | null }).box_type_id ?? undefined,
            vendorId: (box as { vendor_id?: string | null }).vendor_id ?? undefined,
            quantity: Number((box as { quantity?: number | null }).quantity) || 1,
            items,
            ...(Object.keys(itemNotes).length > 0 ? { itemNotes } : {}),
        });
    }

    const first = boxOrders[0];
    const config: OrderConfiguration = {
        serviceType: 'Boxes',
        caseId: order.case_id ?? undefined,
        boxOrders,
        vendorId: first?.vendorId,
        boxTypeId: first?.boxTypeId,
        boxQuantity: first?.quantity ?? 1,
        items: first?.items ?? {},
    };

    return { config, itemCount };
}

/**
 * Build an upcoming-order-shaped config from a persisted order.
 * Caller must verify the order belongs to the portal client.
 */
export async function buildPortalReorderConfigFromOrder(
    supabase: SupabaseClient,
    order: OrderRow,
): Promise<PortalReorderBuildResult> {
    const serviceType = (order.service_type ?? '').toString();
    if (serviceType === 'Boxes') {
        return buildBoxesConfig(supabase, order);
    }
    if (serviceType === 'Meal') {
        return buildMealConfig(supabase, order);
    }
    return buildFoodConfig(supabase, order);
}

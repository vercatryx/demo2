import type { SupabaseClient } from '@supabase/supabase-js';
import {
    clientFacingDeliveryStatus,
    type ClientFacingDeliveryStatus,
} from '@/lib/client-facing-delivery-status';
import { fetchOrderVendorNames, formatVendorLabel } from '@/lib/order-vendor-names';
import {
    catalogDropdownMetaFromMenuRow,
    clientFacingOrderItemDetailLines,
    type CatalogDropdownMeta,
} from '@/lib/client-facing-order-item-details';

export type ClientFacingOrderHistoryItem = {
    name: string;
    quantity: number;
    note?: string | null;
    detail_lines: string[];
};

export type ClientFacingOrderHistoryEntry = {
    id: string;
    order_number: number;
    scheduled_delivery_date: string | null;
    delivered_at: string | null;
    delivery_photo_url: string | null;
    service_type: string;
    status: ClientFacingDeliveryStatus;
    vendors: string[];
    vendor_label: string | null;
    items: ClientFacingOrderHistoryItem[];
};

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
    for (const [itemId, raw] of Object.entries(obj as Record<string, string>)) {
        if (typeof raw === 'string' && raw.trim()) out[itemId] = raw.trim();
    }
    return out;
}

type CatalogNameMaps = {
    menu: Map<string, string>;
    breakfast: Map<string, string>;
    dropdownById: Map<string, CatalogDropdownMeta>;
};

async function loadCatalogMaps(
    supabase: SupabaseClient,
    itemIds: string[],
): Promise<CatalogNameMaps> {
    const menu = new Map<string, string>();
    const breakfast = new Map<string, string>();
    const dropdownById = new Map<string, CatalogDropdownMeta>();
    if (itemIds.length === 0) return { menu, breakfast, dropdownById };

    for (let i = 0; i < itemIds.length; i += 200) {
        const chunk = itemIds.slice(i, i + 200);
        const [{ data: menuRows }, { data: breakfastRows }] = await Promise.all([
            supabase
                .from('menu_items')
                .select('id, name, dropdown_enabled, dropdown_options')
                .in('id', chunk),
            supabase.from('breakfast_items').select('id, name').in('id', chunk),
        ]);
        for (const row of menuRows ?? []) {
            const id = String((row as { id: string }).id);
            menu.set(id, String((row as { name?: string }).name ?? 'Item'));
            dropdownById.set(id, catalogDropdownMetaFromMenuRow(row as { dropdown_enabled?: boolean | null; dropdown_options?: unknown }));
        }
        for (const row of breakfastRows ?? []) {
            breakfast.set(String((row as { id: string }).id), String((row as { name?: string }).name ?? 'Item'));
        }
    }
    return { menu, breakfast, dropdownById };
}

function resolveCatalogItemName(itemId: string, maps: CatalogNameMaps): string | null {
    if (maps.menu.has(itemId)) return maps.menu.get(itemId)!;
    if (maps.breakfast.has(itemId)) return maps.breakfast.get(itemId)!;
    return null;
}

function resolveOrderItemDisplayName(
    row: {
        menu_item_id?: string | null;
        meal_item_id?: string | null;
        custom_name?: string | null;
    },
    maps: CatalogNameMaps,
): string {
    if (row.custom_name?.trim()) return row.custom_name.trim();
    if (row.meal_item_id) {
        const fromBreakfast = maps.breakfast.get(row.meal_item_id);
        if (fromBreakfast) return fromBreakfast;
    }
    if (row.menu_item_id) {
        const fromMenu = resolveCatalogItemName(row.menu_item_id, maps);
        if (fromMenu) return fromMenu;
    }
    return 'Item';
}

function buildFoodHistoryItem(
    row: {
        menu_item_id?: string | null;
        meal_item_id?: string | null;
        quantity?: number | null;
        custom_name?: string | null;
        notes?: string | null;
    },
    maps: CatalogNameMaps,
): ClientFacingOrderHistoryItem | null {
    const quantity = Number(row.quantity) || 0;
    if (quantity <= 0) return null;

    const name = resolveOrderItemDisplayName(row, maps);
    const note = row.notes?.trim() || null;
    const catalogId = row.menu_item_id ?? row.meal_item_id ?? null;
    const dropdownMeta = catalogId ? maps.dropdownById.get(catalogId) : undefined;

    return {
        name,
        quantity,
        note,
        detail_lines: clientFacingOrderItemDetailLines({
            itemName: name,
            quantity,
            note,
            dropdownEnabled: dropdownMeta?.dropdownEnabled,
            dropdownGroups: dropdownMeta?.dropdownGroups,
        }),
    };
}

async function fetchFoodOrderRows(
    supabase: SupabaseClient,
    orderId: string,
): Promise<ClientFacingOrderHistoryItem[]> {
    const { data: orderItemRows } = await supabase
        .from('order_items')
        .select('menu_item_id, meal_item_id, quantity, custom_name, notes')
        .eq('order_id', orderId);

    let rows = orderItemRows ?? [];
    if (rows.length === 0) {
        const { data: vsList } = await supabase
            .from('order_vendor_selections')
            .select('id')
            .eq('order_id', orderId);

        const collected: typeof rows = [];
        for (const vs of vsList ?? []) {
            const { data: oiList } = await supabase
                .from('order_items')
                .select('menu_item_id, meal_item_id, quantity, custom_name, notes')
                .eq('vendor_selection_id', (vs as { id: string }).id);
            if (oiList?.length) collected.push(...oiList);
        }
        rows = collected;
    }

    if (rows.length === 0) return [];

    const catalogIds = new Set<string>();
    for (const row of rows) {
        if (row.menu_item_id) catalogIds.add(row.menu_item_id);
        if (row.meal_item_id) catalogIds.add(row.meal_item_id);
    }
    const maps = await loadCatalogMaps(supabase, [...catalogIds]);

    return rows
        .map((row) => buildFoodHistoryItem(row, maps))
        .filter((item): item is ClientFacingOrderHistoryItem => item != null);
}

async function fetchBoxOrderItems(
    supabase: SupabaseClient,
    orderId: string,
): Promise<ClientFacingOrderHistoryItem[]> {
    const { data: boxSelections } = await supabase
        .from('order_box_selections')
        .select('items, item_notes')
        .eq('order_id', orderId);

    const qtyByItemId: Record<string, number> = {};
    const notesByItemId: Record<string, string> = {};
    for (const box of boxSelections ?? []) {
        const parsed = parseBoxItemsJson((box as { items?: unknown }).items);
        for (const [itemId, qty] of Object.entries(parsed)) {
            qtyByItemId[itemId] = (qtyByItemId[itemId] ?? 0) + qty;
        }
        const boxNotes = parseBoxItemNotesJson((box as { item_notes?: unknown }).item_notes);
        for (const [itemId, note] of Object.entries(boxNotes)) {
            if (note) notesByItemId[itemId] = note;
        }
    }

    const itemIds = Object.keys(qtyByItemId);
    if (itemIds.length === 0) return [];

    const maps = await loadCatalogMaps(supabase, itemIds);
    const items: ClientFacingOrderHistoryItem[] = [];
    for (const itemId of itemIds) {
        const quantity = qtyByItemId[itemId] ?? 0;
        if (quantity <= 0) continue;
        const name = resolveCatalogItemName(itemId, maps) ?? 'Item';
        const note = notesByItemId[itemId]?.trim() || null;
        items.push({
            name,
            quantity,
            note,
            detail_lines: clientFacingOrderItemDetailLines({
                itemName: name,
                quantity,
                note,
            }),
        });
    }
    return items.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

async function fetchOrderItems(
    supabase: SupabaseClient,
    orderId: string,
    serviceType: string,
): Promise<ClientFacingOrderHistoryItem[]> {
    if (serviceType === 'Boxes') {
        return fetchBoxOrderItems(supabase, orderId);
    }
    return fetchFoodOrderRows(supabase, orderId);
}

export async function loadClientFacingOrderHistory(
    supabase: SupabaseClient,
    clientId: string,
    options?: { limit?: number },
): Promise<{ orders: ClientFacingOrderHistoryEntry[]; error?: string }> {
    let query = supabase
        .from('orders')
        .select('id, order_number, status, scheduled_delivery_date, actual_delivery_date, service_type, delivery_proof_url')
        .eq('client_id', clientId)
        .order('scheduled_delivery_date', { ascending: false, nullsFirst: false });

    if (options?.limit != null) {
        query = query.limit(options.limit);
    }

    const { data: orderList, error: ordersError } = await query;
    if (ordersError) return { orders: [], error: 'database_error' };

    const result: ClientFacingOrderHistoryEntry[] = [];
    for (const ord of orderList ?? []) {
        const serviceType = (ord.service_type ?? '').toString();
        const deliveryPhotoUrl = (ord.delivery_proof_url ?? '').trim() || null;
        const deliveredAt =
            ord.actual_delivery_date
                ? String(ord.actual_delivery_date)
                : ord.scheduled_delivery_date
                  ? String(ord.scheduled_delivery_date)
                  : null;

        const [vendors, items] = await Promise.all([
            fetchOrderVendorNames(supabase, ord.id),
            fetchOrderItems(supabase, ord.id, serviceType),
        ]);
        result.push({
            id: String(ord.id),
            order_number: Number(ord.order_number) || 0,
            scheduled_delivery_date: ord.scheduled_delivery_date ? String(ord.scheduled_delivery_date) : null,
            delivered_at: deliveredAt,
            delivery_photo_url: deliveryPhotoUrl,
            service_type: serviceType,
            status: clientFacingDeliveryStatus(ord),
            vendors,
            vendor_label: formatVendorLabel(vendors),
            items,
        });
    }

    return { orders: result };
}

/**
 * Single-shape converter for clients.upcoming_order (Food/Meal).
 *
 * Canonical shape: vendorSelections only (with itemsByDay, selectedDeliveryDays, itemNotesByDay).
 * Legacy shape: deliveryDayOrders (day -> { vendorSelections: [] }).
 *
 * Use normalizeUpcomingOrder() on read so the app only ever sees vendorSelections.
 * Persist only vendorSelections (no deliveryDayOrders) on write.
 */

export type DeliveryDayOrders = Record<
    string,
    { vendorSelections?: Array<{ vendorId?: string; items?: Record<string, number>; itemNotes?: Record<string, string> }> }
>;

export type VendorSelectionNormalized = {
    vendorId: string;
    items?: Record<string, number>;
    itemsByDay: Record<string, Record<string, number>>;
    selectedDeliveryDays: string[];
    itemNotes?: Record<string, string>;
    itemNotesByDay: Record<string, Record<string, string>>;
};

function normalizeQtyMap(raw: Record<string, unknown> | undefined | null): Record<string, number> {
    if (!raw || typeof raw !== 'object') return {};
    const out: Record<string, number> = {};
    for (const [id, val] of Object.entries(raw)) {
        const q = typeof val === 'number' ? val : Number((val as { quantity?: number; qty?: number })?.quantity ?? (val as { qty?: number })?.qty ?? val ?? 0);
        if (q > 0) out[id] = q;
    }
    return out;
}

/** Merge per-day qty with flat items; per-day values win when both are set. */
export function mergeVendorSelectionQtyMaps(
    perDay: Record<string, unknown> | undefined | null,
    flat: Record<string, unknown> | undefined | null,
): Record<string, number> {
    const out = normalizeQtyMap(flat);
    const dayMap = normalizeQtyMap(perDay);
    for (const [id, q] of Object.entries(dayMap)) {
        if (q > 0) out[id] = q;
    }
    return out;
}

/**
 * Resolve qty map for one delivery day from a vendor selection.
 * When itemsByDay is in use, an empty bucket for this day does not pull from flat `items`
 * if another day already has per-day quantities (avoids dropping or duplicating lines).
 */
export function vendorSelectionItemsForDeliveryDay(
    vs: {
        items?: Record<string, number>;
        itemsByDay?: Record<string, Record<string, number>>;
        selectedDeliveryDays?: string[];
    },
    day: string,
): Record<string, number> {
    const flat = vs.items && typeof vs.items === 'object' ? vs.items : {};
    const itemsByDay = vs.itemsByDay && typeof vs.itemsByDay === 'object' ? vs.itemsByDay : null;

    if (!itemsByDay || Object.keys(itemsByDay).length === 0) {
        return normalizeQtyMap(flat);
    }

    const bucket = itemsByDay[day];
    const bucketQty =
        bucket !== undefined && typeof bucket === 'object' ? normalizeQtyMap(bucket) : null;
    if (bucketQty && Object.keys(bucketQty).length > 0) {
        return bucketQty;
    }

    const anyPerDayQty = Object.values(itemsByDay).some(
        (b) => b && typeof b === 'object' && Object.keys(normalizeQtyMap(b)).length > 0,
    );
    if (anyPerDayQty) {
        return {};
    }

    const flatQty = normalizeQtyMap(flat);
    if (Object.keys(flatQty).length === 0) {
        return {};
    }

    // Legacy shape: flat items with empty per-day buckets — attach to one day only (not every key in itemsByDay).
    const primaryDay =
        (Array.isArray(vs.selectedDeliveryDays) && vs.selectedDeliveryDays[0]) ||
        Object.keys(itemsByDay)[0] ||
        'Monday';
    if (day !== primaryDay) {
        return {};
    }
    return flatQty;
}

/** Merge per-day notes with flat itemNotes; per-day values win when both are set. */
export function mergeVendorSelectionNoteMaps(
    perDay: Record<string, unknown> | undefined | null,
    flat: Record<string, unknown> | undefined | null,
): Record<string, string> {
    const out: Record<string, string> = {};
    if (flat && typeof flat === 'object') {
        for (const [id, note] of Object.entries(flat)) {
            if (note != null && String(note).trim() !== '') out[id] = String(note);
        }
    }
    if (perDay && typeof perDay === 'object') {
        for (const [id, note] of Object.entries(perDay)) {
            if (note != null && String(note).trim() !== '') out[id] = String(note);
        }
    }
    return out;
}

/** Items for one delivery day (or flat items when day is omitted). */
export function vendorSelectionItemsForDay(
    vs: { items?: Record<string, number>; itemsByDay?: Record<string, Record<string, number>> },
    day?: string | null,
): Record<string, number> {
    const flat = vs.items && typeof vs.items === 'object' ? vs.items : {};
    if (day) {
        return vendorSelectionItemsForDeliveryDay(vs, day);
    }
    const flatNorm = normalizeQtyMap(flat);
    if (Object.keys(flatNorm).length > 0) return flatNorm;
    const merged: Record<string, number> = {};
    if (vs.itemsByDay && typeof vs.itemsByDay === 'object') {
        for (const bucket of Object.values(vs.itemsByDay)) {
            for (const [id, q] of Object.entries(mergeVendorSelectionQtyMaps(bucket, {}))) {
                merged[id] = (merged[id] || 0) + q;
            }
        }
    }
    return merged;
}

/** Notes for one delivery day; mirrors vendorSelectionItemsForDeliveryDay. */
export function vendorSelectionItemNotesForDeliveryDay(
    vs: {
        itemNotes?: Record<string, string>;
        itemNotesByDay?: Record<string, Record<string, string>>;
        selectedDeliveryDays?: string[];
    },
    day: string,
): Record<string, string> {
    const flat = vs.itemNotes && typeof vs.itemNotes === 'object' ? vs.itemNotes : {};
    const notesByDay = vs.itemNotesByDay && typeof vs.itemNotesByDay === 'object' ? vs.itemNotesByDay : null;

    if (!notesByDay || Object.keys(notesByDay).length === 0) {
        return mergeVendorSelectionNoteMaps(undefined, flat);
    }

    const bucket = notesByDay[day];
    const bucketNotes =
        bucket !== undefined && typeof bucket === 'object' ? mergeVendorSelectionNoteMaps(bucket, {}) : null;
    if (bucketNotes && Object.keys(bucketNotes).length > 0) {
        return bucketNotes;
    }

    const anyPerDayNotes = Object.values(notesByDay).some(
        (b) => b && typeof b === 'object' && Object.keys(mergeVendorSelectionNoteMaps(b, {})).length > 0,
    );
    if (anyPerDayNotes) {
        return {};
    }

    const flatNotes = mergeVendorSelectionNoteMaps(undefined, flat);
    if (Object.keys(flatNotes).length === 0) {
        return {};
    }

    const primaryDay =
        (Array.isArray(vs.selectedDeliveryDays) && vs.selectedDeliveryDays[0]) ||
        Object.keys(notesByDay)[0] ||
        'Monday';
    if (day !== primaryDay) {
        return {};
    }
    return flatNotes;
}

export function vendorSelectionItemNotesForDay(
    vs: { itemNotes?: Record<string, string>; itemNotesByDay?: Record<string, Record<string, string>>; selectedDeliveryDays?: string[] },
    day?: string | null,
): Record<string, string> {
    const flat = vs.itemNotes && typeof vs.itemNotes === 'object' ? vs.itemNotes : {};
    if (day) {
        return vendorSelectionItemNotesForDeliveryDay(vs, day);
    }
    const out = mergeVendorSelectionNoteMaps(undefined, flat);
    if (vs.itemNotesByDay && typeof vs.itemNotesByDay === 'object') {
        for (const bucket of Object.values(vs.itemNotesByDay)) {
            for (const [id, note] of Object.entries(mergeVendorSelectionNoteMaps(bucket, {}))) {
                if (!out[id]) out[id] = note;
            }
        }
    }
    return out;
}

/**
 * Converts deliveryDayOrders format into vendorSelections format (with itemsByDay / selectedDeliveryDays).
 * Idempotent-friendly: only includes selections that have a vendorId.
 */
export function deliveryDayOrdersToVendorSelections(
    deliveryDayOrders: DeliveryDayOrders
): VendorSelectionNormalized[] {
    if (!deliveryDayOrders || typeof deliveryDayOrders !== 'object' || Object.keys(deliveryDayOrders).length === 0) {
        return [];
    }

    const vendorMap = new Map<string, VendorSelectionNormalized>();

    for (const day of Object.keys(deliveryDayOrders).sort()) {
        const dayData = deliveryDayOrders[day];
        const selections = dayData?.vendorSelections ?? [];

        for (const sel of selections) {
            if (!sel?.vendorId) continue;

            if (!vendorMap.has(sel.vendorId)) {
                vendorMap.set(sel.vendorId, {
                    vendorId: sel.vendorId,
                    items: {},
                    itemsByDay: {},
                    selectedDeliveryDays: [],
                    itemNotesByDay: {}
                });
            }

            const v = vendorMap.get(sel.vendorId)!;
            if (!v.selectedDeliveryDays.includes(day)) {
                v.selectedDeliveryDays.push(day);
            }
            v.itemsByDay[day] = sel.items && typeof sel.items === 'object' ? { ...sel.items } : {};
            if (sel.itemNotes && typeof sel.itemNotes === 'object') {
                v.itemNotesByDay[day] = { ...sel.itemNotes };
            } else if (!v.itemNotesByDay[day]) {
                v.itemNotesByDay[day] = {};
            }
        }
    }

    return Array.from(vendorMap.values());
}

/**
 * Converts vendorSelections (with itemsByDay) format into deliveryDayOrders format.
 * Used by Create Orders Next Week to derive per-day Food orders from the canonical shape.
 */
export function vendorSelectionsToDeliveryDayOrders(
    vendorSelections: Array<{ vendorId?: string; items?: Record<string, number>; itemsByDay?: Record<string, Record<string, number>>; selectedDeliveryDays?: string[]; itemNotes?: Record<string, string>; itemNotesByDay?: Record<string, Record<string, string>> }>
): DeliveryDayOrders {
    const byDay: DeliveryDayOrders = {};
    if (!Array.isArray(vendorSelections)) return byDay;

    for (const vs of vendorSelections) {
        const vendorId = (vs as any)?.vendorId ?? (vs as any)?.vendor_id;
        if (!vendorId) continue;

        let days: string[] = [];
        const itemsByDay = (vs as any).itemsByDay ?? (vs as any).items_by_day;
        const selectedDeliveryDays = (vs as any).selectedDeliveryDays ?? (vs as any).selected_delivery_days;
        const items = (vs as any).items;
        if (itemsByDay && typeof itemsByDay === 'object' && Object.keys(itemsByDay).length > 0) {
            days = Object.keys(itemsByDay);
        } else if (selectedDeliveryDays && Array.isArray(selectedDeliveryDays) && selectedDeliveryDays.length > 0 && items && Object.keys(items || {}).length > 0) {
            days = [...selectedDeliveryDays];
        }
        // Fallback: UI may save items without itemsByDay/selectedDeliveryDays; create at least one order (Monday) so orders are not dropped
        if (days.length === 0 && items && typeof items === 'object' && Object.keys(items).length > 0) {
            days = ['Monday'];
        }
        if (days.length === 0) continue;

        const itemNotesByDay = (vs as any).itemNotesByDay ?? (vs as any).item_notes_by_day;
        const itemNotes = (vs as any).itemNotes ?? (vs as any).item_notes;

        for (const day of days) {
            const dayItems = vendorSelectionItemsForDeliveryDay(
                {
                    items: items && typeof items === 'object' ? items : {},
                    itemsByDay,
                    selectedDeliveryDays,
                },
                day,
            );
            if (Object.keys(dayItems).length === 0) continue;

            const dayNotes = vendorSelectionItemNotesForDeliveryDay(
                { itemNotes, itemNotesByDay, selectedDeliveryDays },
                day,
            );

            if (!byDay[day]) byDay[day] = { vendorSelections: [] };
            byDay[day].vendorSelections!.push({
                vendorId,
                items: dayItems,
                itemNotes: dayNotes
            });
        }
    }
    return byDay;
}

export type UpcomingOrderRaw = {
    serviceType?: string;
    caseId?: string | null;
    vendorSelections?: any[];
    deliveryDayOrders?: DeliveryDayOrders;
    mealSelections?: Record<string, any>;
    boxOrders?: any[];
    notes?: string | null;
    [key: string]: any;
};

/**
 * Normalizes a raw upcoming_order payload to the single canonical shape:
 * - Food/Meal: vendorSelections only; deliveryDayOrders removed (converted into vendorSelections).
 * - Other fields (mealSelections, boxOrders, caseId, notes, etc.) are preserved as-is.
 * - Non-Food/Meal payloads are returned unchanged (no deliveryDayOrders to convert).
 */
export function normalizeUpcomingOrder(raw: UpcomingOrderRaw | null | undefined): UpcomingOrderRaw | null {
    if (raw == null || typeof raw !== 'object') {
        return raw ?? null;
    }

    const serviceType = raw.serviceType ?? 'Food';
    if (serviceType !== 'Food' && serviceType !== 'Meal') {
        return raw;
    }

    const hasVendorSelections =
        Array.isArray(raw.vendorSelections) &&
        raw.vendorSelections.length > 0 &&
        raw.vendorSelections.some((s: any) => s?.vendorId || (s?.items && Object.keys(s.items || {}).length > 0));

    const hasDeliveryDayOrders =
        raw.deliveryDayOrders &&
        typeof raw.deliveryDayOrders === 'object' &&
        Object.keys(raw.deliveryDayOrders).length > 0;

    if (!hasDeliveryDayOrders) {
        return raw;
    }

    // Merge deliveryDayOrders into vendorSelections (do not drop new day/vendor lines when both exist).
    const fromDays = deliveryDayOrdersToVendorSelections(raw.deliveryDayOrders!);
    if (!hasVendorSelections) {
        const out: UpcomingOrderRaw = { ...raw };
        out.vendorSelections = fromDays.length > 0 ? fromDays : [];
        delete out.deliveryDayOrders;
        return out;
    }

    const merged = new Map<string, VendorSelectionNormalized>();
    for (const sel of raw.vendorSelections || []) {
        const vendorId = sel?.vendorId;
        if (!vendorId) continue;
        merged.set(vendorId, {
            vendorId,
            items: sel.items && typeof sel.items === 'object' ? { ...sel.items } : {},
            itemsByDay: sel.itemsByDay && typeof sel.itemsByDay === 'object' ? { ...sel.itemsByDay } : {},
            selectedDeliveryDays: Array.isArray(sel.selectedDeliveryDays) ? [...sel.selectedDeliveryDays] : [],
            itemNotes: sel.itemNotes && typeof sel.itemNotes === 'object' ? { ...sel.itemNotes } : {},
            itemNotesByDay: sel.itemNotesByDay && typeof sel.itemNotesByDay === 'object' ? { ...sel.itemNotesByDay } : {},
        });
    }

    for (const daySel of fromDays) {
        const existing = merged.get(daySel.vendorId);
        if (!existing) {
            merged.set(daySel.vendorId, daySel);
            continue;
        }
        for (const day of daySel.selectedDeliveryDays) {
            if (!existing.selectedDeliveryDays.includes(day)) {
                existing.selectedDeliveryDays.push(day);
            }
            existing.itemsByDay[day] = daySel.itemsByDay[day] || {};
            existing.itemNotesByDay[day] = daySel.itemNotesByDay[day] || {};
        }
    }

    const out: UpcomingOrderRaw = { ...raw };
    out.vendorSelections = Array.from(merged.values());
    delete out.deliveryDayOrders;
    return out;
}

/**
 * Shape fixes on upcoming_order JSON only (client-side use).
 * - deliveryDayOrders merged into vendorSelections (via normalizeUpcomingOrder)
 * - legacy Meal tag → Food
 */
export function normalizeUpcomingOrderJson(
    raw: UpcomingOrderRaw | null | undefined,
): UpcomingOrderRaw | null {
    const order = normalizeUpcomingOrder(raw);
    if (!order || typeof order !== 'object') return order ?? null;
    if (order.serviceType === 'Meal') {
        return { ...order, serviceType: 'Food' };
    }
    return order;
}

/**
 * Returns true if the payload is in legacy shape (has deliveryDayOrders with content).
 * Useful for migration scripts to count how many need conversion.
 */
export function hasLegacyDeliveryDayOrders(raw: UpcomingOrderRaw | null | undefined): boolean {
    if (raw == null || typeof raw !== 'object') return false;
    const ddo = raw.deliveryDayOrders;
    if (!ddo || typeof ddo !== 'object') return false;
    return Object.keys(ddo).length > 0;
}

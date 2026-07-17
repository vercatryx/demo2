import type { MenuItem } from '@/lib/types';
import { sortWeekdays } from '@/lib/order-dates';
import { shouldShowFoodItemToViewer } from '@/lib/food-item-phaseout';
import { getItemQtyFromVendorBlock } from '@/lib/portal-vendor-selection';

/** Normalize DB/API delivery day lists (array, single string, or empty). */
export function normalizeDeliveryDayList(raw: unknown): string[] {
    if (Array.isArray(raw)) return raw.map((d) => String(d).trim()).filter(Boolean);
    if (raw != null && `${raw}`.trim()) return [`${raw}`.trim()];
    return [];
}

/**
 * Days an item may be ordered on for phone/SMS/portal parity.
 * Empty item days = all vendor days (or unrestricted if vendor also empty).
 * When both lists are set, returns the intersection (may be empty = unorderable).
 */
export function effectiveFoodItemDeliveryDays(itemDays: unknown, vendorDays: unknown): string[] {
    const item = normalizeDeliveryDayList(itemDays);
    const vendor = normalizeDeliveryDayList(vendorDays);
    if (item.length === 0) return vendor;
    if (vendor.length === 0) return item;
    return item.filter((d) => vendor.includes(d));
}

/** Item is available on the given delivery day (empty deliveryDays = all days). */
export function isFoodItemAllowedOnDay(item: MenuItem, day: string): boolean {
    const days = normalizeDeliveryDayList(item.deliveryDays);
    if (days.length === 0) return true;
    return days.includes(day);
}

export function filterFoodItemsForVendorDay(
    menuItems: MenuItem[],
    vendorId: string,
    day: string | null | undefined,
    selection: unknown,
    hidePhaseoutUnlessOnOrder?: boolean,
): MenuItem[] {
    const list = menuItems
        .filter((i) => {
            if (i.vendorId !== vendorId) return false;
            const qty = selection
                ? getItemQtyFromVendorBlock(selection as Parameters<typeof getItemQtyFromVendorBlock>[0], i.id, day ?? undefined)
                : 0;
            return shouldShowFoodItemToViewer(i, {
                hidePhaseoutUnlessOnOrder: hidePhaseoutUnlessOnOrder === true,
                existingQty: qty,
                itemKind: 'menu',
            });
        })
        .sort(
            (a, b) =>
                (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
                a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
        );

    if (!day) return list;
    return list.filter((i) => isFoodItemAllowedOnDay(i, day));
}

/** Activate a delivery day for shopping (adds to selectedDeliveryDays + itemsByDay if needed). */
export function ensureVendorShoppingDay(prev: { vendorSelections?: unknown[] }, blockIndex: number, day: string) {
    if (!prev.vendorSelections?.[blockIndex]) return prev;
    const updated = [...prev.vendorSelections] as Record<string, unknown>[];
    const block = { ...(updated[blockIndex] as Record<string, unknown>) };

    const selected = [...((block.selectedDeliveryDays as string[]) || [])];
    if (!selected.includes(day)) {
        selected.push(day);
        block.selectedDeliveryDays = sortWeekdays(selected);
        const itemsByDay = { ...((block.itemsByDay as Record<string, Record<string, number>>) || {}) };
        const notesByDay = { ...((block.itemNotesByDay as Record<string, Record<string, string>>) || {}) };
        const flatItems = (block.items as Record<string, number>) || {};
        const flatNotes = (block.itemNotes as Record<string, string>) || {};
        // First time entering day-mode: migrate flat cart + dropdown notes into this day
        // before clearing flat maps (otherwise notes vanish from UI/save reads).
        if (!itemsByDay[day]) {
            itemsByDay[day] = Object.keys(flatItems).length > 0 ? { ...flatItems } : {};
        }
        if (!notesByDay[day]) {
            notesByDay[day] = Object.keys(flatNotes).length > 0 ? { ...flatNotes } : {};
        }
        block.itemsByDay = itemsByDay;
        block.itemNotesByDay = notesByDay;
        block.items = {};
        block.itemNotes = { ...flatNotes };
    }

    updated[blockIndex] = block;
    return { ...prev, vendorSelections: updated };
}

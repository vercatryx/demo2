import type { BoxSelectorBoxValue } from '@/components/admin/box-selector-demo/BoxSelectorDemoClient';
import {
    computeBillableBoxCount,
    normalizeMultiBoxOrderQuantities,
    type BoxOrderQuantityRow,
} from '@/lib/box-order-quantity';

export type { BoxOrderQuantityRow };
export { computeBillableBoxCount, normalizeMultiBoxOrderQuantities };

/** Authorized box count used to multiply per-category allowances (client portal). */
export function getBoxAllowanceMultiplier(approvedMealsPerWeek: number | null | undefined): number {
    const n = typeof approvedMealsPerWeek === 'number' ? approvedMealsPerWeek : Number(approvedMealsPerWeek);
    if (!Number.isFinite(n) || n <= 0) return 1;
    return Math.max(1, Math.floor(n));
}

function sumRecordQty(
    target: Record<string, number>,
    source: Record<string, number> | undefined,
): void {
    if (!source || typeof source !== 'object') return;
    for (const [itemId, qty] of Object.entries(source)) {
        const q = Number(qty) || 0;
        if (q <= 0) continue;
        target[itemId] = (target[itemId] || 0) + q;
    }
}

function mergeNotesFirstWins(
    target: Record<string, string>,
    source: Record<string, string> | undefined,
): void {
    if (!source || typeof source !== 'object') return;
    for (const [itemId, note] of Object.entries(source)) {
        if (note && target[itemId] === undefined) {
            target[itemId] = note;
        }
    }
}

/**
 * Merge multiple legacy boxOrders into one picker value (sum items, first-wins notes).
 */
export function mergeBoxOrdersForPortal(
    boxOrders: BoxSelectorBoxValue[] | undefined,
    multiplier: number,
): BoxSelectorBoxValue {
    const list = Array.isArray(boxOrders) ? boxOrders.filter(Boolean) : [];
    if (list.length === 0) {
        return { quantity: multiplier, items: {}, itemNotes: {} };
    }

    const primary = list[0];
    const items: Record<string, number> = {};
    const itemNotes: Record<string, string> = {};

    for (const box of list) {
        sumRecordQty(items, box.items);
        mergeNotesFirstWins(itemNotes, box.itemNotes);
    }

    return {
        boxTypeId: primary.boxTypeId,
        vendorId: primary.vendorId,
        quantity: multiplier,
        items,
        itemNotes,
    };
}

/** Persist client portal selection as a single boxOrders row with authorized quantity. */
export function consolidateBoxOrdersOnSave(
    box: BoxSelectorBoxValue,
    multiplier: number,
): BoxSelectorBoxValue[] {
    const qty = getBoxAllowanceMultiplier(multiplier);
    return [
        {
            boxTypeId: box.boxTypeId,
            vendorId: box.vendorId,
            quantity: qty,
            items: box.items && typeof box.items === 'object' ? { ...box.items } : {},
            itemNotes:
                box.itemNotes && typeof box.itemNotes === 'object' ? { ...box.itemNotes } : {},
        },
    ];
}

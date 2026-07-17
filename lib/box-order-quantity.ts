export type BoxOrderQuantityRow = { quantity?: number | null };

/**
 * Billable physical box count from selection rows or boxOrders.
 * - One row → use its quantity (portal consolidated: 1 row × N boxes).
 * - Multiple rows → one box per row (admin model); ignore stale portal multiplier on row 0.
 */
export function computeBillableBoxCount(selections: BoxOrderQuantityRow[]): number {
    if (selections.length === 0) return 0;
    if (selections.length === 1) {
        const q = Number(selections[0].quantity);
        return Number.isFinite(q) && q > 0 ? Math.round(q) : 1;
    }
    return selections.length;
}

/**
 * When admin adds per-box rows alongside a legacy portal row (quantity = allowance),
 * force quantity 1 on every row so totals and billing count boxes, not double-count.
 */
export function normalizeMultiBoxOrderQuantities<T extends BoxOrderQuantityRow>(
    boxOrders: T[] | undefined | null,
): T[] {
    if (!Array.isArray(boxOrders) || boxOrders.length <= 1) {
        return boxOrders ?? [];
    }
    return boxOrders.map((box) => ({ ...box, quantity: 1 }));
}

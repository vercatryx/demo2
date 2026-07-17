import type { BoxType, ItemCategory, MenuItem } from '@/lib/types';
import type { BoxQuota } from '@/lib/types';
import type { BoxSelectorBoxValue } from '@/components/admin/box-selector-demo/BoxSelectorDemoClient';
import {
    applyFoodBoxExclusiveItems,
    getFoodBoxExclusiveConflict,
} from '@/lib/box-food-exclusive';
import { consolidateBoxOrdersOnSave, mergeBoxOrdersForPortal } from '@/lib/box-order-consolidation';

export function getActiveBoxFromConfig(orderConfig: any, boxMultiplier: number): BoxSelectorBoxValue {
    const raw = orderConfig?.boxOrders || [];
    return mergeBoxOrdersForPortal(raw, boxMultiplier);
}

/** Match legacy portal: default box vendor from first active box type when order has none yet. */
export function resolveEffectiveBoxVendorId(
    orderConfig: any,
    boxMultiplier: number,
    boxTypes: BoxType[],
): string | undefined {
    const fromOrder = getActiveBoxFromConfig(orderConfig, boxMultiplier).vendorId;
    if (fromOrder) return fromOrder;
    return boxTypes.find((bt) => bt.isActive !== false)?.vendorId || undefined;
}

export function categoryPointsUsed(
    categoryId: string,
    items: Record<string, number> | undefined,
    menuItems: MenuItem[],
): number {
    let total = 0;
    for (const [itemId, qty] of Object.entries(items || {})) {
        const item = menuItems.find((i) => i.id === itemId);
        if (!item || item.categoryId !== categoryId) continue;
        total += (Number(qty) || 0) * (item.quotaValue ?? 1);
    }
    return total;
}

export function getRequiredCategoryQuota(
    categoryId: string,
    categories: ItemCategory[],
    quotasByBoxType: Record<string, BoxQuota[]>,
    boxTypeId: string | undefined,
    boxMultiplier: number,
): number | null {
    const cat = categories.find((c) => c.id === categoryId);
    if (cat?.setValue != null && cat.setValue > 0) return cat.setValue * boxMultiplier;
    const quotas = boxTypeId ? quotasByBoxType[boxTypeId] ?? [] : [];
    const q = quotas.find((row) => row.categoryId === categoryId);
    if (q?.targetValue != null && q.targetValue > 0) return q.targetValue * boxMultiplier;
    return null;
}

export function canIncreaseBoxItem(
    item: MenuItem,
    orderConfig: any,
    menuItems: MenuItem[],
    categories: ItemCategory[],
    quotasByBoxType: Record<string, BoxQuota[]>,
    boxMultiplier: number,
): boolean {
    if (!item.categoryId) return true;
    const box = getActiveBoxFromConfig(orderConfig, boxMultiplier);
    const req = getRequiredCategoryQuota(
        item.categoryId,
        categories,
        quotasByBoxType,
        box.boxTypeId,
        boxMultiplier,
    );
    if (req === null) return true;
    const current = categoryPointsUsed(item.categoryId, box.items, menuItems);
    const points = item.quotaValue ?? 1;
    return current + points <= req + 1e-9;
}

export function setBoxItemQty(
    prev: any,
    itemId: string,
    qty: number,
    menuItems: MenuItem[],
    foodBoxCategoryId: string | null | undefined,
    boxMultiplier: number,
    onFoodBoxConflict?: (conflict: 'clearOthers' | 'clearFood') => void,
): any {
    const box = getActiveBoxFromConfig(prev, boxMultiplier);
    const conflict = getFoodBoxExclusiveConflict(
        box.items || {},
        menuItems,
        foodBoxCategoryId ?? null,
        itemId,
        qty,
    );
    if (qty > 0 && foodBoxCategoryId && conflict !== 'none') {
        onFoodBoxConflict?.(conflict);
        return prev;
    }

    const applied = applyFoodBoxExclusiveItems(
        box.items || {},
        box.itemNotes || {},
        menuItems,
        foodBoxCategoryId ?? null,
        itemId,
        qty,
    );
    const nextBox: BoxSelectorBoxValue = {
        ...box,
        items: applied.items,
        itemNotes: applied.itemNotes,
    };
    const consolidated = consolidateBoxOrdersOnSave(nextBox, boxMultiplier);
    return {
        ...prev,
        serviceType: 'Boxes',
        boxOrders: consolidated,
        vendorId: consolidated[0]?.vendorId,
        boxTypeId: consolidated[0]?.boxTypeId,
        boxQuantity: consolidated[0]?.quantity || 1,
        items: consolidated[0]?.items || {},
    };
}

export function getBoxItemQty(orderConfig: any, itemId: string, boxMultiplier: number): number {
    const box = getActiveBoxFromConfig(orderConfig, boxMultiplier);
    return Number(box.items?.[itemId]) || 0;
}

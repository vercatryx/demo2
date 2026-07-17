import type { ClientProfile, MealItem, MenuItem } from '@/lib/types';
import { getItemPoints, isExceedingMaximum } from '@/lib/utils';
import { mergeDeliveryDayOrdersToVendorSelections } from '@/lib/portal-vendor-selection';

export function getTotalMealCountAllDays(
    orderConfig: any,
    menuItems: MenuItem[],
    mealItems: MealItem[],
    serviceType: string,
): number {
    let total = 0;
    const vendorSelections = mergeDeliveryDayOrdersToVendorSelections(orderConfig);

    for (const selection of vendorSelections) {
        if (!selection?.vendorId) continue;
        if (selection.itemsByDay && typeof selection.itemsByDay === 'object') {
            for (const day of Object.keys(selection.itemsByDay)) {
                const dayItems = selection.itemsByDay[day] || {};
                for (const [itemId, qty] of Object.entries(dayItems)) {
                    const item = menuItems.find((i) => i.id === itemId);
                    if (item) total += (Number(qty) || 0) * getItemPoints(item);
                }
            }
        } else if (selection.items) {
            const daysCount =
                selection.selectedDeliveryDays?.length > 0
                    ? selection.selectedDeliveryDays.length
                    : 1;
            for (const [itemId, qty] of Object.entries(selection.items)) {
                const item = menuItems.find((i) => i.id === itemId);
                if (item) total += (Number(qty) || 0) * getItemPoints(item) * daysCount;
            }
        }
    }

    if (serviceType === 'Food' && orderConfig.mealSelections) {
        const vendorItemIds = new Set<string>();
        for (const selection of vendorSelections) {
            if (selection.itemsByDay) {
                for (const day of Object.keys(selection.itemsByDay)) {
                    for (const itemId of Object.keys(selection.itemsByDay[day] || {})) {
                        vendorItemIds.add(itemId);
                    }
                }
            }
            if (selection.items) {
                for (const itemId of Object.keys(selection.items)) vendorItemIds.add(itemId);
            }
        }
        for (const mealKey of Object.keys(orderConfig.mealSelections)) {
            const meal = orderConfig.mealSelections[mealKey];
            const items = meal?.items || {};
            for (const [itemId, qty] of Object.entries(items)) {
                if (vendorItemIds.has(itemId)) continue;
                const item = mealItems.find((i) => i.id === itemId);
                if (item) total += (Number(qty) || 0) * getItemPoints(item);
            }
        }
    }

    return total;
}

export function getSingleIncrementPointCost(
    item: MenuItem | MealItem,
    selection?: any,
    day?: string,
    client?: ClientProfile,
): number {
    const points = getItemPoints(item);
    if (day && selection?.itemsByDay) return points;
    if (selection && selection.items !== undefined && !selection.itemsByDay) {
        const daysCount =
            selection.selectedDeliveryDays?.length > 0
                ? selection.selectedDeliveryDays.length
                : (client as any)?.delivery_days?.length || 1;
        return points * daysCount;
    }
    return points;
}

export function wouldAddingPointsExceedLimit(
    orderConfig: any,
    menuItems: MenuItem[],
    mealItems: MealItem[],
    client: ClientProfile,
    serviceType: string,
    additionalPoints: number,
    weeklyLimitOverride?: number,
): boolean {
    const limit = weeklyLimitOverride ?? client.approvedMealsPerWeek ?? 0;
    if (limit <= 0) return false;
    if (serviceType !== 'Food' && serviceType !== 'Meal') return false;
    if (additionalPoints <= 0) return false;
    const current = getTotalMealCountAllDays(orderConfig, menuItems, mealItems, serviceType);
    return isExceedingMaximum(current + additionalPoints, limit);
}

export function canIncrementFoodItem(
    orderConfig: any,
    menuItems: MenuItem[],
    mealItems: MealItem[],
    client: ClientProfile,
    serviceType: string,
    item: MenuItem | MealItem,
    selection?: any,
    day?: string,
    weeklyLimitOverride?: number,
): boolean {
    const cost = getSingleIncrementPointCost(item, selection, day, client);
    return !wouldAddingPointsExceedLimit(
        orderConfig,
        menuItems,
        mealItems,
        client,
        serviceType,
        cost,
        weeklyLimitOverride,
    );
}

export function applyVendorItemQtyChange(
    prev: any,
    blockIndex: number,
    itemId: string,
    qty: number,
    day?: string,
    note?: string,
): any {
    const newConfig = { ...prev };
    if (!newConfig.vendorSelections?.[blockIndex]) return prev;
    const updated = [...newConfig.vendorSelections];
    const block = { ...updated[blockIndex] };

    // Keep flat + by-day notes/qtys mirrored so a save/refresh cannot "lose" dropdown
    // selections that were written to only one of the two maps.
    const itemNotes = { ...(block.itemNotes || {}) };
    if (day && block.selectedDeliveryDays && block.selectedDeliveryDays.length > 0) {
        if (!block.itemsByDay) block.itemsByDay = {};
        if (!block.itemsByDay[day]) block.itemsByDay[day] = {};
        if (!block.itemNotesByDay) block.itemNotesByDay = {};
        if (!block.itemNotesByDay[day]) block.itemNotesByDay[day] = {};

        if (qty > 0) {
            block.itemsByDay[day][itemId] = qty;
            if (note !== undefined) {
                if (note.trim() === '') {
                    delete block.itemNotesByDay[day][itemId];
                    delete itemNotes[itemId];
                } else {
                    block.itemNotesByDay[day][itemId] = note;
                    itemNotes[itemId] = note;
                }
            }
        } else if (note !== undefined) {
            // Note-only update with qty 0: keep the line if it still exists in flat storage;
            // never delete as a side effect of a dropdown write.
            if (note.trim() === '') {
                delete block.itemNotesByDay[day][itemId];
                delete itemNotes[itemId];
            } else {
                block.itemNotesByDay[day][itemId] = note;
                itemNotes[itemId] = note;
            }
        } else {
            delete block.itemsByDay[day][itemId];
            delete block.itemNotesByDay[day][itemId];
            delete itemNotes[itemId];
        }
        block.itemNotes = itemNotes;
    } else {
        const items = { ...(block.items || {}) };
        if (qty > 0) {
            items[itemId] = qty;
            if (note !== undefined) {
                if (note.trim() === '') delete itemNotes[itemId];
                else itemNotes[itemId] = note;
            }
        } else if (note !== undefined) {
            // Note-only: do not delete the item line.
            if (note.trim() === '') delete itemNotes[itemId];
            else itemNotes[itemId] = note;
        } else {
            delete items[itemId];
            delete itemNotes[itemId];
        }
        block.items = items;
        block.itemNotes = itemNotes;
        // If delivery days already exist, keep by-day notes in sync too.
        if (note !== undefined && Array.isArray(block.selectedDeliveryDays) && block.selectedDeliveryDays.length > 0) {
            if (!block.itemNotesByDay) block.itemNotesByDay = {};
            for (const d of block.selectedDeliveryDays) {
                if (!block.itemNotesByDay[d]) block.itemNotesByDay[d] = {};
                if (note.trim() !== '') block.itemNotesByDay[d][itemId] = note;
                else delete block.itemNotesByDay[d][itemId];
            }
        }
    }

    updated[blockIndex] = block;
    newConfig.vendorSelections = updated;
    return newConfig;
}

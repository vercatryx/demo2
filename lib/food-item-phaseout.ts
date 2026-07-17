/** Item ids with quantity > 0 anywhere in a Food/Meal order config. */
export function getSelectedFoodItemIdsFromOrderConfig(orderConfig: unknown): Set<string> {
    const ids = new Set<string>();
    if (!orderConfig || typeof orderConfig !== 'object') return ids;

    const oc = orderConfig as Record<string, unknown>;

    const vendorSelections = oc.vendorSelections;
    if (Array.isArray(vendorSelections)) {
        for (const selection of vendorSelections) {
            addItemIdsFromVendorSelection(selection, ids);
        }
    }

    const deliveryDayOrders = oc.deliveryDayOrders;
    if (deliveryDayOrders && typeof deliveryDayOrders === 'object') {
        for (const dayOrder of Object.values(deliveryDayOrders as Record<string, unknown>)) {
            if (!dayOrder || typeof dayOrder !== 'object') continue;
            const daySelections = (dayOrder as Record<string, unknown>).vendorSelections;
            if (Array.isArray(daySelections)) {
                for (const selection of daySelections) {
                    addItemIdsFromVendorSelection(selection, ids);
                }
            }
        }
    }

    const mealSelections = oc.mealSelections;
    if (mealSelections && typeof mealSelections === 'object') {
        for (const config of Object.values(mealSelections as Record<string, unknown>)) {
            addItemIdsFromItemsMap((config as Record<string, unknown>)?.items, ids);
        }
    }

    const boxOrders = oc.boxOrders;
    if (Array.isArray(boxOrders)) {
        for (const box of boxOrders) {
            if (!box || typeof box !== 'object') continue;
            addItemIdsFromItemsMap((box as Record<string, unknown>).items, ids);
        }
    }

    addItemIdsFromItemsMap(oc.items, ids);

    return ids;
}

function addItemIdsFromVendorSelection(selection: unknown, ids: Set<string>): void {
    if (!selection || typeof selection !== 'object') return;
    const sel = selection as Record<string, unknown>;
    addItemIdsFromItemsMap(sel.items, ids);

    const itemsByDay = sel.itemsByDay;
    if (itemsByDay && typeof itemsByDay === 'object') {
        for (const dayItems of Object.values(itemsByDay as Record<string, unknown>)) {
            addItemIdsFromItemsMap(dayItems, ids);
        }
    }
}

function addItemIdsFromItemsMap(items: unknown, ids: Set<string>): void {
    if (!items || typeof items !== 'object') return;
    for (const [itemId, qty] of Object.entries(items as Record<string, unknown>)) {
        if (Number(qty) > 0) ids.add(itemId);
    }
}

export function getItemQtyInVendorSelection(
    selection: unknown,
    itemId: string,
    day: string | null = null,
): number {
    if (!selection || typeof selection !== 'object') return 0;
    const sel = selection as Record<string, unknown>;

    if (day && sel.itemsByDay && typeof sel.itemsByDay === 'object') {
        const dayItems = (sel.itemsByDay as Record<string, unknown>)[day];
        if (dayItems && typeof dayItems === 'object') {
            return Number((dayItems as Record<string, unknown>)[itemId] || 0);
        }
    }

    if (sel.items && typeof sel.items === 'object') {
        return Number((sel.items as Record<string, unknown>)[itemId] || 0);
    }

    return 0;
}

type FoodItemVisibility = {
    id?: string;
    isActive?: boolean;
    phaseout?: boolean;
};

/**
 * Whether a food or meal line item should appear in an ordering catalog.
 * Admins/vendors pass hidePhaseoutUnlessOnOrder=false; clients pass true.
 */
export function shouldShowFoodItemToViewer(
    item: FoodItemVisibility,
    ctx: {
        hidePhaseoutUnlessOnOrder: boolean;
        existingQty: number;
        itemKind: 'menu' | 'meal';
    },
): boolean {
    const { hidePhaseoutUnlessOnOrder, existingQty, itemKind } = ctx;
    const isInactive = item.isActive === false;

    if (isInactive) {
        if (itemKind === 'meal') return existingQty > 0;
        return false;
    }

    if (item.phaseout === true && hidePhaseoutUnlessOnOrder && existingQty <= 0) {
        return false;
    }

    return true;
}

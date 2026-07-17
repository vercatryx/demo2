import type { MenuItem } from '@/lib/types';

export type FoodBoxExclusiveConflict = 'none' | 'clearOthers' | 'clearFood';

export function applyFoodBoxExclusiveItems(
    items: Record<string, number>,
    itemNotes: Record<string, string>,
    menuItems: MenuItem[],
    foodBoxCategoryId: string | undefined | null,
    targetItemId: string,
    qty: number,
): { items: Record<string, number>; itemNotes: Record<string, string> } {
    const notes = { ...itemNotes };

    if (qty <= 0) {
        const next = { ...items };
        delete next[targetItemId];
        delete notes[targetItemId];
        return { items: next, itemNotes: notes };
    }

    if (!foodBoxCategoryId) {
        return {
            items: { ...items, [targetItemId]: qty },
            itemNotes: notes,
        };
    }

    const targetCat = menuItems.find((m) => m.id === targetItemId)?.categoryId ?? '';
    const targetIsFood = targetCat === foodBoxCategoryId;

    const filtered: Record<string, number> = {};
    for (const [id, q] of Object.entries(items)) {
        if (!q || q <= 0) continue;
        if (id === targetItemId) continue;
        const cat = menuItems.find((m) => m.id === id)?.categoryId ?? '';
        const rowIsFood = cat === foodBoxCategoryId;
        if (targetIsFood && rowIsFood) filtered[id] = q;
        else if (!targetIsFood && !rowIsFood) filtered[id] = q;
    }
    filtered[targetItemId] = qty;

    const filteredNotes: Record<string, string> = {};
    for (const id of Object.keys(filtered)) {
        if (notes[id]) filteredNotes[id] = notes[id];
    }
    return { items: filtered, itemNotes: filteredNotes };
}

export function getFoodBoxExclusiveConflict(
    items: Record<string, number>,
    menuItems: MenuItem[],
    foodBoxCategoryId: string | undefined | null,
    targetItemId: string,
    qty: number,
): FoodBoxExclusiveConflict {
    if (!foodBoxCategoryId || qty <= 0) return 'none';
    const targetCat = menuItems.find((m) => m.id === targetItemId)?.categoryId ?? '';
    const targetIsFood = targetCat === foodBoxCategoryId;

    let hasFood = false;
    let hasOther = false;
    for (const [id, q] of Object.entries(items)) {
        if (!q || q <= 0) continue;
        if (id === targetItemId) continue;
        const cat = menuItems.find((m) => m.id === id)?.categoryId ?? '';
        if (cat === foodBoxCategoryId) hasFood = true;
        else hasOther = true;
    }

    if (targetIsFood && hasOther) return 'clearOthers';
    if (!targetIsFood && hasFood) return 'clearFood';
    return 'none';
}

/** True when the box holds items from both the food box category and other categories. */
export function boxHasFoodBoxMixConflict(
    items: Record<string, number>,
    menuItems: MenuItem[],
    foodBoxCategoryId: string | undefined | null,
): boolean {
    if (!foodBoxCategoryId) return false;
    let hasFood = false;
    let hasOther = false;
    for (const [id, q] of Object.entries(items)) {
        if (!q || q <= 0) continue;
        const cat = menuItems.find((m) => m.id === id)?.categoryId ?? '';
        if (cat === foodBoxCategoryId) hasFood = true;
        else if (cat) hasOther = true;
    }
    return hasFood && hasOther;
}

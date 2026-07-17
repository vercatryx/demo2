import type { BoxSubMenuNode } from '@/lib/boxes/box-catalog-order';

export const UNASSIGNED_FOOD_SUBMENU_ID = '__unassigned__';

export type FoodMenuLayoutConfig = {
    orderedVendorIds: string[];
    subMenusByVendor: Record<string, BoxSubMenuNode[]>;
    itemSubMenuByItemId: Record<string, string>;
    sectionHeroImages?: Record<string, string>;
};

/**
 * Normalize a sub-menu forest, dropping any node whose id was already seen
 * anywhere in this forest. Duplicate ids break React keys (items get omitted
 * from the rendered list) and folder-path resolution, so we keep the first
 * occurrence and drop later duplicates (and their subtrees).
 */
function normalizeSubMenuForest(raw: unknown, seen: Set<string> = new Set()): BoxSubMenuNode[] {
    if (!Array.isArray(raw)) return [];
    const out: BoxSubMenuNode[] = [];
    for (const x of raw) {
        const row = x as { id?: string; name?: string; children?: unknown };
        const id = String(row.id ?? '');
        const name = String(row.name ?? '');
        if (!id || !name) continue;
        if (seen.has(id)) continue;
        seen.add(id);
        out.push({ id, name, children: normalizeSubMenuForest(row.children, seen) });
    }
    return out;
}

export function normalizeFoodMenuLayoutConfig(raw: FoodMenuLayoutConfig | null): FoodMenuLayoutConfig | null {
    if (!raw) return null;
    const subMenusByVendor: Record<string, BoxSubMenuNode[]> = {};
    if (raw.subMenusByVendor && typeof raw.subMenusByVendor === 'object') {
        for (const [vendorId, forest] of Object.entries(raw.subMenusByVendor)) {
            subMenusByVendor[vendorId] = normalizeSubMenuForest(forest);
        }
    }
    return {
        orderedVendorIds: Array.isArray(raw.orderedVendorIds) ? raw.orderedVendorIds : [],
        subMenusByVendor,
        itemSubMenuByItemId:
            raw.itemSubMenuByItemId && typeof raw.itemSubMenuByItemId === 'object'
                ? { ...raw.itemSubMenuByItemId }
                : {},
        sectionHeroImages:
            raw.sectionHeroImages && typeof raw.sectionHeroImages === 'object'
                ? { ...raw.sectionHeroImages }
                : {},
    };
}

export function foodLayoutToDemoShape(config: FoodMenuLayoutConfig | null) {
    const normalized = normalizeFoodMenuLayoutConfig(config);
    if (!normalized) return null;
    return {
        orderedCategoryIds: normalized.orderedVendorIds,
        subMenusByCategory: normalized.subMenusByVendor,
        itemSubMenuByItemId: normalized.itemSubMenuByItemId,
    };
}

export function demoLayoutToFoodShape(config: {
    orderedCategoryIds: string[];
    subMenusByCategory: Record<string, BoxSubMenuNode[]>;
    itemSubMenuByItemId: Record<string, string>;
}, sectionHeroImages?: Record<string, string>): FoodMenuLayoutConfig {
    return {
        orderedVendorIds: Array.isArray(config.orderedCategoryIds) ? config.orderedCategoryIds : [],
        subMenusByVendor: config.subMenusByCategory ?? {},
        itemSubMenuByItemId: config.itemSubMenuByItemId ?? {},
        sectionHeroImages: sectionHeroImages ?? {},
    };
}

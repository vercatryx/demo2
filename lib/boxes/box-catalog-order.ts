import type { ItemCategory, MenuItem } from '@/lib/types';

export const UNASSIGNED_SUBMENU_ID = '__unassigned__';

export type BoxSubMenuNode = {
    id: string;
    name: string;
    children: BoxSubMenuNode[];
};

/**
 * Normalize a sub-menu forest, dropping any node whose id was already seen
 * anywhere in this forest. Duplicate ids break React keys (items get omitted
 * from the rendered list) and folder-path resolution (findPathToNode /
 * collectSubtreeIdsForId assume globally-unique ids), so we keep the first
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

/** Normalize layout JSON from `box_menu_layout_configs`. */
export function normalizeBoxMenuLayoutConfig(raw: BoxMenuLayoutConfig | null): BoxMenuLayoutConfig | null {
    if (!raw) return null;
    const subMenusByCategory: Record<string, BoxSubMenuNode[]> = {};
    if (raw.subMenusByCategory && typeof raw.subMenusByCategory === 'object') {
        for (const [catId, forest] of Object.entries(raw.subMenusByCategory)) {
            subMenusByCategory[catId] = normalizeSubMenuForest(forest);
        }
    }
    return {
        orderedCategoryIds: Array.isArray(raw.orderedCategoryIds) ? raw.orderedCategoryIds : [],
        subMenusByCategory,
        itemSubMenuByItemId:
            raw.itemSubMenuByItemId && typeof raw.itemSubMenuByItemId === 'object'
                ? { ...raw.itemSubMenuByItemId }
                : {},
    };
}

export type BoxMenuLayoutConfig = {
    orderedCategoryIds: string[];
    subMenusByCategory: Record<string, BoxSubMenuNode[]>;
    itemSubMenuByItemId: Record<string, string>;
};

export type BoxCatalogPdfItem = {
    name: string;
    itemNumber: number | null;
    quotaValue: number;
};

function formatPointsAmount(value: number): string {
    if (Number.isInteger(value)) return String(value);
    return value.toFixed(2).replace(/\.?0+$/, '');
}

/** e.g. "pick up to 28 points" */
export function formatCategoryPickUpToPoints(setValue: number | null | undefined): string | null {
    if (setValue == null || setValue <= 0) return null;
    const amount = formatPointsAmount(setValue);
    const unit = setValue === 1 ? 'point' : 'points';
    return `pick up to ${amount} ${unit}`;
}

export function categoryCatalogDisplayName(
    name: string,
    setValue: number | null | undefined,
): string {
    const pick = formatCategoryPickUpToPoints(setValue);
    return pick ? `${name} — ${pick}` : name;
}

export type BoxCatalogPdfRow =
    | { kind: 'category'; name: string; setValue: number | null | undefined }
    | { kind: 'folder'; label: string; depth: number }
    | { kind: 'item'; item: BoxCatalogPdfItem; organizationPath: string };

/** Same ordering as Boxes Org / box selector UI. */
export function sortBoxCategoriesForCatalog(
    categories: ItemCategory[],
    orderedCategoryIds: string[] | null | undefined,
): ItemCategory[] {
    const active = categories.filter((c) => c.isActive !== false);
    if (!orderedCategoryIds?.length) {
        return [...active].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    }
    const map = new Map(active.map((c) => [c.id, c]));
    const ordered: ItemCategory[] = [];
    for (const id of orderedCategoryIds) {
        const c = map.get(id);
        if (c) {
            ordered.push(c);
            map.delete(id);
        }
    }
    for (const c of map.values()) ordered.push(c);
    return ordered;
}

function isBoxMenuItem(item: MenuItem): boolean {
    return item.vendorId == null || item.vendorId === '';
}

function isBoxCatalogItem(item: MenuItem): boolean {
    return isBoxMenuItem(item) && item.isActive !== false && item.phaseout !== true;
}

function compareBoxMenuItems(a: MenuItem, b: MenuItem): number {
    const orderDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    if (orderDiff !== 0) return orderDiff;
    const numA = a.itemNumber;
    const numB = b.itemNumber;
    if (numA == null && numB == null) {
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    }
    if (numA == null) return 1;
    if (numB == null) return -1;
    if (numA !== numB) return numA - numB;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

function collectAllNodeIds(roots: BoxSubMenuNode[]): Set<string> {
    const s = new Set<string>();
    function walk(nodes: BoxSubMenuNode[]) {
        for (const n of nodes) {
            s.add(n.id);
            if (n.children?.length) walk(n.children);
        }
    }
    walk(roots);
    return s;
}

function menuItemToPdfItem(item: MenuItem): BoxCatalogPdfItem {
    const q = item.quotaValue;
    const quotaValue = typeof q === 'number' && !Number.isNaN(q) ? q : 1;
    return {
        name: item.name,
        itemNumber: item.itemNumber ?? null,
        quotaValue,
    };
}

function walkFolderRows(
    nodes: BoxSubMenuNode[],
    pathNames: string[],
    itemsByFolderId: Map<string, MenuItem[]>,
    out: BoxCatalogPdfRow[],
): void {
    for (const node of nodes) {
        const trail = [...pathNames, node.name];
        const assigned = itemsByFolderId.get(node.id) ?? [];
        if (assigned.length > 0) {
            const depth = trail.length - 1;
            const orgPath = trail.join(' › ');
            out.push({ kind: 'folder', label: orgPath, depth });
            for (const item of assigned) {
                out.push({ kind: 'item', item: menuItemToPdfItem(item), organizationPath: orgPath });
            }
        }
        walkFolderRows(node.children ?? [], trail, itemsByFolderId, out);
    }
}

function rowsForCategory(
    category: ItemCategory,
    menuItems: MenuItem[],
    layout: BoxMenuLayoutConfig | null,
): BoxCatalogPdfRow[] {
    const rows: BoxCatalogPdfRow[] = [
        { kind: 'category', name: category.name, setValue: category.setValue ?? null },
    ];

    const categoryItems = menuItems
        .filter((i) => i.categoryId === category.id && isBoxCatalogItem(i))
        .sort(compareBoxMenuItems);

    if (categoryItems.length === 0) return rows;

    const roots = layout?.subMenusByCategory[category.id] ?? [];
    if (roots.length === 0) {
        for (const item of categoryItems) {
            rows.push({ kind: 'item', item: menuItemToPdfItem(item), organizationPath: '' });
        }
        return rows;
    }

    const validFolderIds = collectAllNodeIds(roots);
    const itemsByFolderId = new Map<string, MenuItem[]>();
    const unassigned: MenuItem[] = [];

    for (const item of categoryItems) {
        const assigned = layout?.itemSubMenuByItemId[item.id];
        if (!assigned || !validFolderIds.has(assigned)) {
            unassigned.push(item);
            continue;
        }
        const list = itemsByFolderId.get(assigned) ?? [];
        list.push(item);
        itemsByFolderId.set(assigned, list);
    }

    for (const list of itemsByFolderId.values()) {
        list.sort(compareBoxMenuItems);
    }
    unassigned.sort(compareBoxMenuItems);

    walkFolderRows(roots, [], itemsByFolderId, rows);

    if (unassigned.length > 0) {
        rows.push({ kind: 'folder', label: 'Unassigned', depth: 0 });
        for (const item of unassigned) {
            rows.push({ kind: 'item', item: menuItemToPdfItem(item), organizationPath: 'Unassigned' });
        }
    }

    return rows;
}

export function buildBoxCatalogRows(
    categories: ItemCategory[],
    menuItems: MenuItem[],
    layout: BoxMenuLayoutConfig | null,
): BoxCatalogPdfRow[] {
    const sorted = sortBoxCategoriesForCatalog(categories, layout?.orderedCategoryIds);
    const rows: BoxCatalogPdfRow[] = [];
    for (const cat of sorted) {
        const section = rowsForCategory(cat, menuItems, layout);
        const hasItems = section.some((r) => r.kind === 'item');
        if (hasItems) rows.push(...section);
    }
    return rows;
}

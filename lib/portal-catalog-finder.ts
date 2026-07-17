import type { MenuItem } from '@/lib/types';
import type { BoxSubMenuNode } from '@/lib/boxes/box-catalog-order';
import {
    collectAllNodeIds,
    collectSubtreeIdsForId,
    findNode,
    findPathToNode,
    getSubMenuOptionsAtStep,
} from '@/components/admin/box-selector-demo/subMenuTree';

export const UNASSIGNED_SUBMENU_ID = '__unassigned__';
export const ALL_CATALOG_ITEMS_ID = '__all__';

/** Child folders visible when browsing `folderPath` within a department forest. */
export function sectionNodesAtPath(roots: BoxSubMenuNode[], folderPath: string[]): BoxSubMenuNode[] {
    return getSubMenuOptionsAtStep(roots, folderPath);
}

export function folderNodeHasChildren(roots: BoxSubMenuNode[], folderId: string): boolean {
    const node = findNode(roots, folderId);
    return (node?.children?.length ?? 0) > 0;
}

/** True when every id in `path` is reachable from `roots` in order. */
export function isFolderPathValid(roots: BoxSubMenuNode[], path: string[]): boolean {
    if (path.length === 0) return true;
    let current = roots;
    for (const id of path) {
        if (id === ALL_CATALOG_ITEMS_ID || id === UNASSIGNED_SUBMENU_ID) return true;
        const n = current.find((x) => x.id === id);
        if (!n) return false;
        current = n.children ?? [];
    }
    return true;
}

/** Prefer a valid path from `roots` to the leaf folder (fixes stale intermediate ids). */
export function canonicalFolderPath(roots: BoxSubMenuNode[], path: string[]): string[] {
    if (path.length === 0) return path;
    const leaf = path[path.length - 1];
    if (leaf === ALL_CATALOG_ITEMS_ID || leaf === UNASSIGNED_SUBMENU_ID) return path;
    if (isFolderPathValid(roots, path)) return path;
    return findPathToNode(roots, leaf) ?? path;
}

/**
 * Items assigned to `sectionFolderId` or any folder beneath it in the catalog tree.
 * Used for parent section filters and "view items" on a folder with children.
 */
export function itemsAssignedUnderSection(
    roots: BoxSubMenuNode[],
    sectionFolderId: string,
    itemSubMenuByItemId: Record<string, string> | undefined,
    baseItems: MenuItem[],
): MenuItem[] {
    if (sectionFolderId === ALL_CATALOG_ITEMS_ID) return baseItems;

    const subtreeIds = collectSubtreeIdsForId(roots, sectionFolderId);
    if (subtreeIds.size === 0) {
        return baseItems.filter((item) => itemSubMenuByItemId?.[item.id] === sectionFolderId);
    }

    return baseItems.filter((item) => {
        const assigned = itemSubMenuByItemId?.[item.id];
        return assigned != null && assigned !== '' && subtreeIds.has(assigned);
    });
}

/**
 * Items visible at `path`: assigned to the leaf folder or any of its descendants.
 * Matches box-selector demo at leaf depth; at parent folders includes descendant assignments.
 */
export function itemsForFolderPath(
    roots: BoxSubMenuNode[],
    path: string[],
    itemSubMenuByItemId: Record<string, string> | undefined,
    baseItems: MenuItem[],
): MenuItem[] {
    if (roots.length === 0) return baseItems;
    if (path.length === 0) return [];

    const resolvedPath = canonicalFolderPath(roots, path);
    const validIds = collectAllNodeIds(roots);
    const leaf = resolvedPath[resolvedPath.length - 1];

    if (leaf === ALL_CATALOG_ITEMS_ID) {
        return baseItems;
    }
    if (leaf === UNASSIGNED_SUBMENU_ID) {
        return baseItems.filter((item) => {
            const a = itemSubMenuByItemId?.[item.id];
            return !a || !validIds.has(a);
        });
    }

    return itemsAssignedUnderSection(roots, leaf, itemSubMenuByItemId, baseItems);
}

/** @deprecated Prefer itemsForFolderPath(roots, ...) — kept for callers that only have scope map. */
export function itemsForFinderPath(
    scopeId: string | null,
    path: string[],
    subMenusByScope: Record<string, BoxSubMenuNode[]> | undefined,
    itemSubMenuByItemId: Record<string, string> | undefined,
    baseItems: MenuItem[],
): MenuItem[] {
    if (!scopeId) return [];
    const roots = subMenusByScope?.[scopeId] ?? [];
    return itemsForFolderPath(roots, path, itemSubMenuByItemId, baseItems);
}

export type SubcategoryFilterNode = {
    id: string;
    name: string;
    depth: number;
    count: number;
    hasChildren: boolean;
};

/**
 * Flattened, pre-order folder tree for the "filter by section" sidebar. Keeps
 * the parent → child structure (with depth for indentation) instead of a flat
 * list of leaf names, and only includes folders that actually contain items.
 */
export function buildSubcategoryFilterTree(
    roots: BoxSubMenuNode[],
    itemSubMenuByItemId: Record<string, string> | undefined,
    baseItems: MenuItem[],
): SubcategoryFilterNode[] {
    if (roots.length === 0) return [];

    const validIds = collectAllNodeIds(roots);
    const direct = new Map<string, number>();
    for (const item of baseItems) {
        const fid = itemSubMenuByItemId?.[item.id];
        if (fid && validIds.has(fid)) direct.set(fid, (direct.get(fid) ?? 0) + 1);
    }

    const subtree = new Map<string, number>();
    const countSubtree = (node: BoxSubMenuNode): number => {
        let c = direct.get(node.id) ?? 0;
        for (const child of node.children ?? []) c += countSubtree(child);
        subtree.set(node.id, c);
        return c;
    };
    for (const r of roots) countSubtree(r);

    const out: SubcategoryFilterNode[] = [];
    const emit = (nodes: BoxSubMenuNode[], depth: number) => {
        for (const n of nodes) {
            if ((subtree.get(n.id) ?? 0) <= 0) continue;
            const children = n.children ?? [];
            const hasChildren = children.some((c) => (subtree.get(c.id) ?? 0) > 0);
            out.push({ id: n.id, name: n.name, depth, count: subtree.get(n.id) ?? 0, hasChildren });
            emit(children, depth + 1);
        }
    };
    emit(roots, 0);
    return out;
}

export type SubcategoryGroup = { folderId: string; label: string; items: MenuItem[] };

const OTHER_GROUP_ID = '__other__';

/**
 * Group `items` by the sub-menu folder each item is assigned to, ordered to
 * match the catalog tree (depth-first). `baseDepth` is the number of folder
 * levels already represented by the current browse path, so group labels show
 * only the structure *below* where the user is (e.g. browsing "Vegetables"
 * yields groups "Fresh Vegetables › Cabbage", "Frozen › Broccoli", …).
 * Items with no/!unknown folder assignment fall into a trailing "More" group.
 */
export function groupItemsBySubcategory(
    roots: BoxSubMenuNode[],
    itemSubMenuByItemId: Record<string, string> | undefined,
    items: MenuItem[],
    baseDepth = 0,
): SubcategoryGroup[] {
    if (roots.length === 0) return [{ folderId: '', label: '', items }];

    const orderIndex = new Map<string, number>();
    const trailById = new Map<string, string[]>();
    let idx = 0;
    const walk = (nodes: BoxSubMenuNode[], trail: string[]) => {
        for (const n of nodes) {
            const here = [...trail, n.name];
            orderIndex.set(n.id, idx++);
            trailById.set(n.id, here);
            if (n.children?.length) walk(n.children, here);
        }
    };
    walk(roots, []);

    const buckets = new Map<string, MenuItem[]>();
    for (const item of items) {
        const fid = itemSubMenuByItemId?.[item.id];
        const key = fid && orderIndex.has(fid) ? fid : OTHER_GROUP_ID;
        const bucket = buckets.get(key);
        if (bucket) bucket.push(item);
        else buckets.set(key, [item]);
    }

    const groups: (SubcategoryGroup & { order: number })[] = [];
    for (const [key, groupItems] of buckets) {
        if (key === OTHER_GROUP_ID) continue;
        const trail = trailById.get(key) ?? [];
        const relTrail = trail.slice(baseDepth);
        const label = (relTrail.length ? relTrail : trail.slice(-1)).join(' › ');
        groups.push({ folderId: key, label, items: groupItems, order: orderIndex.get(key) ?? 0 });
    }
    groups.sort((a, b) => a.order - b.order);

    const result: SubcategoryGroup[] = groups.map(({ folderId, label, items: gi }) => ({ folderId, label, items: gi }));
    const other = buckets.get(OTHER_GROUP_ID);
    if (other && other.length) result.push({ folderId: OTHER_GROUP_ID, label: 'More', items: other });
    return result;
}

export function folderTrailLabel(
    roots: BoxSubMenuNode[],
    path: string[],
    subMenusByScope: Record<string, BoxSubMenuNode[]>,
    scopeId: string,
): string {
    const nodes = subMenusByScope[scopeId] ?? roots;
    const resolved = canonicalFolderPath(nodes, path);
    const parts: string[] = [];
    let current = nodes;
    for (const id of resolved) {
        if (id === ALL_CATALOG_ITEMS_ID) {
            parts.push('All');
            break;
        }
        if (id === UNASSIGNED_SUBMENU_ID) {
            parts.push('Unassigned');
            break;
        }
        const found = current.find((n) => n.id === id);
        if (!found) break;
        parts.push(found.name);
        current = found.children ?? [];
    }
    return parts.join(' › ');
}

import type { DemoBoxLayoutConfig } from './constants';
import type { DemoSubMenuNode } from './constants';
import { UNASSIGNED_SUBMENU_ID } from './layoutStorage';
import { collectAllNodeIds, findPathToNode } from './subMenuTree';
import type { ItemCategory, MenuItem } from '@/lib/types';

export type BoxCatalogSearchHit =
    | {
          type: 'item';
          categoryId: string;
          itemId: string;
          folderPath: string[];
          itemNumber: number | null;
          label: string;
          tokens: string;
      }
    | {
          type: 'folder';
          categoryId: string;
          folderId: string;
          folderPath: string[];
          label: string;
          tokens: string;
      }
    | {
          type: 'category';
          categoryId: string;
          label: string;
          tokens: string;
      };

function normalizeSearchText(...parts: (string | number | null | undefined)[]): string {
    return parts
        .filter((p) => p !== null && p !== undefined && String(p).trim() !== '')
        .join(' ')
        .toLowerCase();
}

function folderLabels(roots: DemoSubMenuNode[], pathIds: string[]): string[] {
    return pathIds.map((id) => {
        const walk = (nodes: DemoSubMenuNode[]): string | null => {
            for (const n of nodes) {
                if (n.id === id) return n.name;
                const sub = walk(n.children ?? []);
                if (sub) return sub;
            }
            return null;
        };
        return walk(roots) ?? id.slice(0, 8);
    });
}

function walkFolderHits(
    categoryId: string,
    categoryName: string,
    nodes: DemoSubMenuNode[],
    pathIds: string[],
    pathNames: string[],
    out: BoxCatalogSearchHit[],
): void {
    for (const node of nodes) {
        const nextIds = [...pathIds, node.id];
        const nextNames = [...pathNames, node.name];
        const trail = nextNames.join(' › ');
        out.push({
            type: 'folder',
            categoryId,
            folderId: node.id,
            folderPath: nextIds,
            label: `${trail} · ${categoryName}`,
            tokens: normalizeSearchText(categoryName, trail, node.name, node.id),
        });
        walkFolderHits(categoryId, categoryName, node.children ?? [], nextIds, nextNames, out);
    }
}

/** Searchable catalog entries for one box (vendor-filtered items). */
export function buildBoxCatalogSearchHits(
    sortedCategories: ItemCategory[],
    menuItems: MenuItem[],
    layoutConfig: DemoBoxLayoutConfig | null,
    vendorId: string | undefined,
): BoxCatalogSearchHit[] {
    const hits: BoxCatalogSearchHit[] = [];

    const itemsForCategory = (categoryId: string) =>
        menuItems.filter(
            (i) =>
                i.isActive !== false &&
                i.categoryId === categoryId &&
                ((i.vendorId == null || i.vendorId === '') || i.vendorId === vendorId),
        );

    for (const cat of sortedCategories) {
        hits.push({
            type: 'category',
            categoryId: cat.id,
            label: cat.name,
            tokens: normalizeSearchText(cat.name, cat.id),
        });

        const roots = layoutConfig?.subMenusByCategory[cat.id] ?? [];
        walkFolderHits(cat.id, cat.name, roots, [], [], hits);

        const validFolderIds = roots.length > 0 ? collectAllNodeIds(roots) : new Set<string>();
        const categoryItems = itemsForCategory(cat.id);

        for (const item of categoryItems) {
            const assigned = layoutConfig?.itemSubMenuByItemId[item.id];
            let folderPath: string[] = [];
            let folderTrail = '';

            if (roots.length > 0) {
                if (!assigned || !validFolderIds.has(assigned)) {
                    folderPath = [UNASSIGNED_SUBMENU_ID];
                    folderTrail = 'Unassigned';
                } else {
                    folderPath = findPathToNode(roots, assigned) ?? [];
                    const names = folderLabels(roots, folderPath);
                    folderTrail = names.join(' › ');
                }
            }

            const idBits: string[] = [item.id];
            if (item.itemNumber != null) idBits.push(String(item.itemNumber));
            if (item.uspId) idBits.push(item.uspId);

            const labelParts: string[] = [];
            if (item.itemNumber != null) labelParts.push(`Item#${item.itemNumber}`);
            labelParts.push(item.name);
            if (folderTrail) labelParts.push(folderTrail);
            labelParts.push(cat.name);

            hits.push({
                type: 'item',
                categoryId: cat.id,
                itemId: item.id,
                folderPath,
                itemNumber: item.itemNumber ?? null,
                label: labelParts.join(' · '),
                tokens: normalizeSearchText(
                    item.name,
                    cat.name,
                    folderTrail,
                    item.itemNumber != null ? `item#${item.itemNumber}` : '',
                    ...idBits,
                    item.itemNumber,
                ),
            });
        }
    }

    return hits;
}

/** True when the user is typing an item number (optional leading #). */
export function isItemNumberSearchQuery(query: string): boolean {
    const digits = query.trim().replace(/^#/, '');
    return digits.length > 0 && /^\d+$/.test(digits);
}

function itemNumberQueryDigits(query: string): string {
    return query.trim().replace(/^#/, '');
}

function itemMatchesItemNumberQuery(itemNumber: number | null, digits: string): boolean {
    if (itemNumber == null || !digits) return false;
    const n = String(itemNumber);
    return n === digits || n.startsWith(digits);
}

function sortAndLimitHits(hits: BoxCatalogSearchHit[], q: string, limit: number): BoxCatalogSearchHit[] {
    const rank = (h: BoxCatalogSearchHit) => {
        const labelLower = h.label.toLowerCase();
        const starts = labelLower.startsWith(q) || h.tokens.startsWith(q);
        if (h.type === 'item' && h.itemNumber != null) {
            const num = String(h.itemNumber);
            const digits = itemNumberQueryDigits(q);
            if (digits && (num === digits || num.startsWith(digits))) return 0;
        }
        return starts ? 1 : 2;
    };
    return [...hits].sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label)).slice(0, limit);
}

export function filterBoxCatalogSearchHits(
    hits: BoxCatalogSearchHit[],
    query: string,
    limit = 24,
): BoxCatalogSearchHit[] {
    const raw = query.trim();
    if (!raw) return [];

    if (isItemNumberSearchQuery(raw)) {
        const digits = itemNumberQueryDigits(raw);
        const idMatches = hits.filter(
            (h): h is Extract<BoxCatalogSearchHit, { type: 'item' }> =>
                h.type === 'item' && itemMatchesItemNumberQuery(h.itemNumber, digits),
        );
        if (idMatches.length > 0) {
            return sortAndLimitHits(idMatches, digits, limit);
        }
    }

    const q = raw.toLowerCase();
    const matched = hits.filter((h) => h.tokens.includes(q));
    return sortAndLimitHits(matched, q, limit);
}

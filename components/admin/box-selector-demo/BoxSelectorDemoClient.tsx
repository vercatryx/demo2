'use client';

import {
    Fragment,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import { MobileShelfDrilldown } from './mobileShelfTree';
import type { BoxQuota, BoxType, ItemCategory, MenuItem, Vendor } from '@/lib/types';
import { getBoxMenuLayoutConfig } from '@/lib/merge-triangle-actions';
import { isExceedingMaximum, isMeetingExactTarget } from '@/lib/utils';
import styles from './box-selector-demo.module.css';
import type { DemoBoxLayoutConfig } from './constants';
import { UNASSIGNED_SUBMENU_ID } from './layoutStorage';
import { CategoryStackIcon } from './CategoryStackIcon';
import {
    buildBoxCatalogSearchHits,
    filterBoxCatalogSearchHits,
    type BoxCatalogSearchHit,
} from './boxCatalogSearch';
import {
    buildFinderColumns,
    collectAllNodeIds,
    findNode,
    findPathToNode,
    getSubMenuOptionsAtStep,
} from './subMenuTree';

type Props = {
    menuItems: MenuItem[];
    categories: ItemCategory[];
    boxTypes: BoxType[];
    vendors: Vendor[];
    quotasByBoxType: Record<string, BoxQuota[]>;
    value?: BoxSelectorBoxValue[];
    onChange?: (nextBoxes: BoxSelectorBoxValue[]) => void;
    maxBoxes?: number;
    embedded?: boolean;
    showCategoryStrip?: boolean;
    showRefreshButton?: boolean;
    /** When true, renders the Kitchen / vendor picker (staff only). Omitted entirely when false — no placeholder. */
    showKitchenVendorPicker?: boolean;
    /** Client portal: progressive dropdowns instead of folder columns / drill-down shelves. */
    simpleUi?: boolean;
    /** Client portal: optional “easier interface” call-to-action inside the picker’s main column. */
    embeddedFinderEasePrompt?: ReactNode;
    /**
     * When set (Global Settings), items from this category cannot mix with other categories in the same box.
     */
    foodBoxCategoryId?: string | null;
};

type BoxOrderState = {
    boxTypeId?: string;
    vendorId?: string;
    quantity: number;
    items: Record<string, number>;
    itemNotes?: Record<string, string>;
};

export type BoxSelectorBoxValue = {
    boxTypeId?: string;
    vendorId?: string;
    quantity?: number;
    items?: Record<string, number>;
    itemNotes?: Record<string, string>;
};

/** Stable React key + DB-shaped fields without persisting slot id */
type BoxRow = BoxOrderState & { slotId: string };

function sortCategoriesForUi(categories: ItemCategory[], storageOrder: string[] | null): ItemCategory[] {
    const active = categories.filter((c) => c.isActive !== false);
    if (!storageOrder?.length) {
        return [...active].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    }
    const map = new Map(active.map((c) => [c.id, c]));
    const ordered: ItemCategory[] = [];
    for (const id of storageOrder) {
        const c = map.get(id);
        if (c) {
            ordered.push(c);
            map.delete(id);
        }
    }
    for (const c of map.values()) ordered.push(c);
    return ordered;
}

/** Single program in prod is usually “Standard Box”; demo always uses that row when present. */
function getStandardBoxType(boxTypes: BoxType[]): BoxType | undefined {
    const active = boxTypes.filter((b) => b.isActive !== false);
    return (
        active.find((b) => /standard\s*box/i.test((b.name ?? '').trim())) ??
        active.find((b) => /\bstandard\b/i.test(b.name ?? '')) ??
        active[0]
    );
}

function defaultBox(boxTypes: BoxType[]): BoxOrderState {
    const bt = getStandardBoxType(boxTypes);
    return {
        boxTypeId: bt?.id,
        vendorId: bt?.vendorId ?? undefined,
        quantity: 1,
        items: {},
        itemNotes: {},
    };
}

function makeBoxRow(boxTypes: BoxType[]): BoxRow {
    return { slotId: crypto.randomUUID(), ...defaultBox(boxTypes) };
}

function normalizeBoxValue(input: BoxSelectorBoxValue | undefined, boxTypes: BoxType[]): BoxOrderState {
    const base = defaultBox(boxTypes);
    const qty = typeof input?.quantity === 'number' ? input.quantity : Number(input?.quantity ?? 1);
    return {
        boxTypeId: input?.boxTypeId ?? base.boxTypeId,
        vendorId: input?.vendorId ?? base.vendorId,
        quantity: Number.isFinite(qty) && qty > 0 ? Math.floor(qty) : 1,
        items: input?.items && typeof input.items === 'object' ? input.items : {},
        itemNotes: input?.itemNotes && typeof input.itemNotes === 'object' ? input.itemNotes : {},
    };
}

function rowsFromValue(
    value: BoxSelectorBoxValue[] | undefined,
    previousRows: BoxRow[],
    boxTypes: BoxType[],
): BoxRow[] {
    const source = Array.isArray(value) && value.length > 0 ? value : [defaultBox(boxTypes)];
    return source.map((entry, index) => ({
        slotId: previousRows[index]?.slotId ?? crypto.randomUUID(),
        ...normalizeBoxValue(entry, boxTypes),
    }));
}

function serializeRows(rows: BoxRow[]): BoxSelectorBoxValue[] {
    return rows.map((row) => ({
        boxTypeId: row.boxTypeId,
        vendorId: row.vendorId,
        quantity: row.quantity,
        items: row.items || {},
        itemNotes: row.itemNotes || {},
    }));
}

/** Drop conflicting rows when adding qty > 0 from the exclusive food-box category or from others. */
function applyFoodBoxExclusiveItems(
    items: Record<string, number>,
    itemNotes: Record<string, string>,
    menuItems: MenuItem[],
    foodBoxCategoryId: string | undefined | null,
    targetItemId: string,
    qty: number
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

type FoodBoxExclusiveConflict = 'none' | 'clearOthers' | 'clearFood';

type FoodBoxSwitchPromptState = {
    conflict: Exclude<FoodBoxExclusiveConflict, 'none'>;
    slotId: string;
    itemId: string;
    qty: number;
};

/** Whether applying qty would drop selections from the other side of the exclusive rule. */
function getFoodBoxExclusiveConflict(
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

function countAssignedToNode(nodeId: string, layout: DemoBoxLayoutConfig | null, baseItems: MenuItem[]): number {
    return baseItems.filter((item) => layout?.itemSubMenuByItemId[item.id] === nodeId).length;
}

/** Items for current Finder path (nested sub-menus or Unassigned). */
/** Visual “tabs” between nested folder levels in column 1 (~2× typical tab width per step). */
const FOLD_INDENT_BASE_PX = 18;
const FOLD_INDENT_PER_LEVEL_PX = 52;

function itemsForFinderPath(
    categoryId: string | null,
    path: string[],
    layout: DemoBoxLayoutConfig | null,
    baseItems: MenuItem[],
): MenuItem[] {
    if (!categoryId) return [];
    const roots = layout?.subMenusByCategory[categoryId] ?? [];
    if (roots.length === 0) return baseItems;
    if (path.length === 0) return [];
    const validIds = collectAllNodeIds(roots);
    const leaf = path[path.length - 1];
    if (leaf === UNASSIGNED_SUBMENU_ID) {
        return baseItems.filter((item) => {
            const a = layout?.itemSubMenuByItemId[item.id];
            return !a || !validIds.has(a);
        });
    }
    return baseItems.filter((item) => layout?.itemSubMenuByItemId[item.id] === leaf);
}

type BoxPickerWindowProps = {
    box: BoxRow;
    boxIndex: number;
    narrowShelf: boolean;
    menuItems: MenuItem[];
    categories: ItemCategory[];
    boxTypes: BoxType[];
    vendors: Vendor[];
    quotasByBoxType: Record<string, BoxQuota[]>;
    sortedCategories: ItemCategory[];
    layoutConfig: DemoBoxLayoutConfig | null;
    onPatchBox: (slotId: string, patch: Partial<BoxOrderState>) => void;
    onSetItemQty: (slotId: string, itemId: string, qty: number) => void;
    onRemoveBox: (slotId: string) => void;
    canRemove: boolean;
    showCategoryStrip: boolean;
    showKitchenVendorPicker: boolean;
    simpleUi?: boolean;
    finderEasePrompt?: ReactNode;
    foodBoxCategoryId?: string | null;
};

function renderItemNumberEmphasis(
    itemNumber: number,
    itemNumberEmphasisClass: string,
): ReactNode {
    return <span className={itemNumberEmphasisClass}>Item#{itemNumber}</span>;
}

function renderCatalogSearchHitLabel(
    hit: BoxCatalogSearchHit,
    itemNumberEmphasisClass: string,
): ReactNode {
    if (hit.type !== 'item' || hit.itemNumber == null) return hit.label;
    const prefix = `Item#${hit.itemNumber}`;
    const rest = hit.label.startsWith(`${prefix} · `) ? hit.label.slice(prefix.length + 3) : hit.label;
    return (
        <>
            {renderItemNumberEmphasis(hit.itemNumber, itemNumberEmphasisClass)}
            {rest ? <> · {rest}</> : null}
        </>
    );
}

function BoxPickerWindow({
    box,
    boxIndex,
    narrowShelf,
    menuItems,
    categories,
    boxTypes,
    vendors,
    quotasByBoxType,
    sortedCategories,
    layoutConfig,
    onPatchBox,
    onSetItemQty,
    onRemoveBox,
    canRemove,
    showCategoryStrip,
    showKitchenVendorPicker,
    simpleUi = false,
    finderEasePrompt,
    foodBoxCategoryId,
}: BoxPickerWindowProps) {
    const finderRef = useRef<HTMLDivElement>(null);
    const [finderCategoryId, setFinderCategoryId] = useState<string | null>(null);
    const [finderSubMenuPath, setFinderSubMenuPath] = useState<string[]>([]);
    const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
    const [catalogSearchQuery, setCatalogSearchQuery] = useState('');
    const [catalogSearchOpen, setCatalogSearchOpen] = useState(false);
    const catalogSearchRef = useRef<HTMLDivElement>(null);

    const quotasFlat = useMemo(() => {
        const btid = box.boxTypeId;
        return btid ? quotasByBoxType[btid] ?? [] : [];
    }, [box.boxTypeId, quotasByBoxType]);

    const foodBoxCategoryLabel = useMemo(
        () =>
            foodBoxCategoryId
                ? sortedCategories.find((c) => c.id === foodBoxCategoryId)?.name ??
                  categories.find((c) => c.id === foodBoxCategoryId)?.name
                : null,
        [foodBoxCategoryId, sortedCategories, categories],
    );

    const getRequiredQuota = useCallback(
        (categoryId: string): number | null => {
            const cat = categories.find((c) => c.id === categoryId);
            if (cat?.setValue !== undefined && cat?.setValue !== null) return cat.setValue;
            if (!box.boxTypeId) return null;
            const q = quotasFlat.find((x) => x.categoryId === categoryId);
            return q ? q.targetValue : null;
        },
        [categories, box.boxTypeId, quotasFlat],
    );

    const categoryPoints = useCallback(
        (categoryId: string) => {
            const items = box.items || {};
            let total = 0;
            for (const [itemId, qty] of Object.entries(items)) {
                const item = menuItems.find((i) => i.id === itemId);
                if (item && item.categoryId === categoryId) {
                    const pts = item.quotaValue ?? 1;
                    total += (qty || 0) * pts;
                }
            }
            return total;
        },
        [box.items, menuItems],
    );

    const itemsForCategory = useCallback(
        (categoryId: string) => {
            const vid = box.vendorId;
            return menuItems.filter(
                (i) =>
                    i.isActive !== false &&
                    i.categoryId === categoryId &&
                    ((i.vendorId == null || i.vendorId === '') || i.vendorId === vid),
            );
        },
        [menuItems, box.vendorId],
    );

    const canIncreaseItem = useCallback(
        (item: MenuItem) => {
            if (!item.categoryId) return true;
            const req = getRequiredQuota(item.categoryId);
            if (req === null) return true;
            const current = categoryPoints(item.categoryId);
            const points = item.quotaValue ?? 1;
            return current + points <= req + 1e-9;
        },
        [getRequiredQuota, categoryPoints],
    );

    const finderRoots = useMemo(
        () => (finderCategoryId ? layoutConfig?.subMenusByCategory[finderCategoryId] ?? [] : []),
        [finderCategoryId, layoutConfig],
    );

    const shelfEmptyItemsLabel = useMemo(
        () => (finderRoots.length > 0 ? 'No items for this selection' : 'No items for this vendor'),
        [finderRoots.length],
    );

    const navPathOnly = useMemo(
        () => finderSubMenuPath.filter((id) => id !== UNASSIGNED_SUBMENU_ID),
        [finderSubMenuPath],
    );

    const finderCols = useMemo(() => {
        if (!finderCategoryId || finderRoots.length === 0) return [];
        return buildFinderColumns(finderRoots, navPathOnly);
    }, [finderCategoryId, finderRoots, navPathOnly]);

    const finderItems = useMemo(() => {
        if (!finderCategoryId) return [];
        const base = itemsForCategory(finderCategoryId);
        return itemsForFinderPath(finderCategoryId, finderSubMenuPath, layoutConfig, base);
    }, [finderCategoryId, finderSubMenuPath, layoutConfig, itemsForCategory]);

    const baseCategoryItems = useMemo(
        () => (finderCategoryId ? itemsForCategory(finderCategoryId) : []),
        [finderCategoryId, itemsForCategory],
    );

    const unassignedCount = useMemo(() => {
        if (!finderCategoryId || finderRoots.length === 0) return 0;
        const validIds = collectAllNodeIds(finderRoots);
        return baseCategoryItems.filter((item) => {
            const a = layoutConfig?.itemSubMenuByItemId[item.id];
            return !a || !validIds.has(a);
        }).length;
    }, [finderCategoryId, finderRoots, baseCategoryItems, layoutConfig?.itemSubMenuByItemId]);

    const finderStripNodes = useMemo(() => {
        if (!finderCategoryId || finderRoots.length === 0) return [];
        return finderCols[navPathOnly.length] ?? [];
    }, [finderCategoryId, finderRoots.length, finderCols, navPathOnly.length]);

    const browsingUnassignedOnly =
        finderSubMenuPath.length === 1 && finderSubMenuPath[0] === UNASSIGNED_SUBMENU_ID;

    const showPickSubmenus =
        Boolean(finderCategoryId) &&
        finderRoots.length > 0 &&
        !browsingUnassignedOnly &&
        finderStripNodes.length > 0;

    /** Items for the current path can appear together with child-folder rows (same folder may list both). */
    const showPickItems =
        Boolean(finderCategoryId) &&
        (finderRoots.length === 0 ||
            finderSubMenuPath.length > 0 ||
            browsingUnassignedOnly);

    const finderPathBreadcrumb = useMemo(() => {
        if (!finderCategoryId) return null;
        const cat = sortedCategories.find((c) => c.id === finderCategoryId);
        if (!cat) return null;

        const crumbs: ReactNode[] = [];
        const atCategoryOnly = navPathOnly.length === 0 && !browsingUnassignedOnly;

        if (atCategoryOnly) {
            crumbs.push(
                <span key="crumb-cat" className={styles.finderCrumbCurrent}>
                    {cat.name}
                </span>,
            );
        } else {
            crumbs.push(
                <button
                    key="crumb-cat"
                    type="button"
                    className={styles.finderCrumb}
                    onClick={() => {
                        setFinderSubMenuPath([]);
                        setSelectedItemId(null);
                    }}
                >
                    {cat.name}
                </button>,
            );
        }

        navPathOnly.forEach((id, i) => {
            const label = findNode(finderRoots, id)?.name ?? id.slice(0, 8);
            const isLast = i === navPathOnly.length - 1 && !browsingUnassignedOnly;
            crumbs.push(
                <span key={`crumb-sep-${i}`} className={styles.finderCrumbSep}>
                    /
                </span>,
            );
            if (isLast) {
                crumbs.push(
                    <span key={`crumb-seg-${i}`} className={styles.finderCrumbCurrent}>
                        {label}
                    </span>,
                );
            } else {
                crumbs.push(
                    <button
                        key={`crumb-seg-${i}`}
                        type="button"
                        className={styles.finderCrumb}
                        onClick={() => {
                            setFinderSubMenuPath(navPathOnly.slice(0, i + 1));
                            setSelectedItemId(null);
                        }}
                    >
                        {label}
                    </button>,
                );
            }
        });

        if (browsingUnassignedOnly) {
            crumbs.push(
                <span key="crumb-sep-un" className={styles.finderCrumbSep}>
                    /
                </span>,
            );
            crumbs.push(
                <span key="crumb-un" className={styles.finderCrumbCurrent}>
                    Unassigned
                </span>,
            );
        }

        return (
            <nav className={styles.finderBreadcrumb} aria-label="Location in menu">
                {crumbs}
            </nav>
        );
    }, [finderCategoryId, sortedCategories, navPathOnly, browsingUnassignedOnly, finderRoots]);

    const scrollFinderIntoView = useCallback(() => {
        queueMicrotask(() => finderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
    }, []);

    const focusFinderOnItem = useCallback(
        (categoryId: string, itemId: string) => {
            const roots = layoutConfig?.subMenusByCategory[categoryId] ?? [];
            const assigned = layoutConfig?.itemSubMenuByItemId[itemId];
            setFinderCategoryId(categoryId);
            if (roots.length === 0) {
                setFinderSubMenuPath([]);
            } else {
                const validIds = collectAllNodeIds(roots);
                if (!assigned || !validIds.has(assigned)) {
                    setFinderSubMenuPath([UNASSIGNED_SUBMENU_ID]);
                } else {
                    const path = findPathToNode(roots, assigned);
                    setFinderSubMenuPath(path ?? []);
                }
            }
            setSelectedItemId(itemId);
            scrollFinderIntoView();
        },
        [layoutConfig, scrollFinderIntoView],
    );

    const focusFinderOnFolder = useCallback(
        (categoryId: string, folderPath: string[]) => {
            setFinderCategoryId(categoryId);
            setFinderSubMenuPath(folderPath);
            setSelectedItemId(null);
            scrollFinderIntoView();
        },
        [scrollFinderIntoView],
    );

    const catalogSearchHits = useMemo(
        () => buildBoxCatalogSearchHits(sortedCategories, menuItems, layoutConfig, box.vendorId),
        [sortedCategories, menuItems, layoutConfig, box.vendorId],
    );

    const catalogSearchResults = useMemo(
        () => filterBoxCatalogSearchHits(catalogSearchHits, catalogSearchQuery),
        [catalogSearchHits, catalogSearchQuery],
    );

    const applyCatalogSearchHit = useCallback(
        (hit: BoxCatalogSearchHit) => {
            setCatalogSearchQuery('');
            setCatalogSearchOpen(false);
            if (hit.type === 'category') {
                setFinderCategoryId(hit.categoryId);
                setFinderSubMenuPath([]);
                setSelectedItemId(null);
                scrollFinderIntoView();
                return;
            }
            if (hit.type === 'folder') {
                focusFinderOnFolder(hit.categoryId, hit.folderPath);
                return;
            }
            setFinderCategoryId(hit.categoryId);
            setFinderSubMenuPath(hit.folderPath);
            setSelectedItemId(hit.itemId);
            scrollFinderIntoView();
        },
        [focusFinderOnFolder, scrollFinderIntoView],
    );

    useEffect(() => {
        if (!catalogSearchOpen) return;
        const onDocPointer = (e: MouseEvent) => {
            if (!catalogSearchRef.current?.contains(e.target as Node)) {
                setCatalogSearchOpen(false);
            }
        };
        document.addEventListener('mousedown', onDocPointer);
        return () => document.removeEventListener('mousedown', onDocPointer);
    }, [catalogSearchOpen]);

    useEffect(() => {
        if (!selectedItemId) return;
        queueMicrotask(() => {
            document
                .querySelector(`[data-box-item-id="${selectedItemId}"][data-box-slot="${box.slotId}"]`)
                ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
    }, [selectedItemId, finderCategoryId, finderSubMenuPath, box.slotId]);

    const narrowActiveCategory = useMemo(
        () => (finderCategoryId ? sortedCategories.find((c) => c.id === finderCategoryId) ?? null : null),
        [sortedCategories, finderCategoryId],
    );

    useEffect(() => {
        if (showCategoryStrip) return;
        if (finderCategoryId) return;
        const first = sortedCategories[0];
        if (first) setFinderCategoryId(first.id);
    }, [showCategoryStrip, finderCategoryId, sortedCategories]);

    const renderCategoryCardButton = useCallback(
        (cat: ItemCategory) => {
            const isFoodBoxCategory = Boolean(foodBoxCategoryId && cat.id === foodBoxCategoryId);
            const req = getRequiredQuota(cat.id);
            const cur = categoryPoints(cat.id);
            const over = req !== null && isExceedingMaximum(cur, req);
            const atFull = req !== null && !over && isMeetingExactTarget(cur, req);
            const quotaTone =
                req === null ? '' : over ? styles.catMetaBad : atFull ? styles.catMetaOk : styles.catMetaPartial;
            const selEntries = Object.entries(box.items || {})
                .filter(([itemId]) => menuItems.find((m) => m.id === itemId)?.categoryId === cat.id)
                .map(([itemId, q]) => ({
                    itemId,
                    label: `${menuItems.find((m) => m.id === itemId)?.name ?? itemId}×${q}`,
                }));
            return (
                <button
                    type="button"
                    className={`${styles.catCard} ${finderCategoryId === cat.id ? styles.catCardActive : ''} ${req !== null && over ? styles.catCardWarn : ''}`}
                    onClick={() => {
                        setFinderCategoryId(cat.id);
                        setFinderSubMenuPath([]);
                        setSelectedItemId(null);
                        scrollFinderIntoView();
                    }}
                >
                    <div className={styles.catTitle}>
                        {cat.name}
                        {isFoodBoxCategory ? (
                            <span className={styles.foodBoxBadge} title="Exclusive food box category">
                                Food box
                            </span>
                        ) : null}
                    </div>
                    <div className={`${styles.catMeta} ${quotaTone}`}>
                        {req !== null ? (
                            <>
                                {Math.round(cur)}/{req}
                            </>
                        ) : (
                            <>
                                {Math.round(cur)} · no target
                            </>
                        )}
                    </div>
                    <div className={styles.pillRow}>
                        {selEntries.slice(0, 4).map(({ itemId, label }) => (
                            <button
                                key={itemId}
                                type="button"
                                className={styles.pill}
                                title="Open this item in the picker below"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    focusFinderOnItem(cat.id, itemId);
                                }}
                            >
                                {label}
                            </button>
                        ))}
                        {selEntries.length > 4 && (
                            <span className={styles.rowMuted}>+{selEntries.length - 4} more</span>
                        )}
                    </div>
                </button>
            );
        },
        [
            getRequiredQuota,
            categoryPoints,
            box.items,
            menuItems,
            finderCategoryId,
            scrollFinderIntoView,
            focusFinderOnItem,
            foodBoxCategoryId,
        ],
    );

    const renderMobileCategoryLink = useCallback(
        (cat: ItemCategory) => {
            const req = getRequiredQuota(cat.id);
            const cur = categoryPoints(cat.id);
            const selectedUnits = Object.entries(box.items || {}).reduce((total, [itemId, qty]) => {
                const item = menuItems.find((m) => m.id === itemId);
                return item?.categoryId === cat.id ? total + (qty || 0) : total;
            }, 0);
            const isActive = finderCategoryId === cat.id;
            const quotaLabel = req !== null ? `${Math.round(cur)}/${req}` : `${Math.round(cur)}`;

            return (
                <button
                    key={cat.id}
                    type="button"
                    className={`${styles.mobileCategoryLink} ${isActive ? styles.mobileCategoryLinkActive : ''}`}
                    onClick={() => {
                        setFinderCategoryId(cat.id);
                        setFinderSubMenuPath([]);
                        setSelectedItemId(null);
                        scrollFinderIntoView();
                    }}
                >
                    <span className={styles.mobileCategoryLinkName}>
                        {cat.name}
                        {foodBoxCategoryId && cat.id === foodBoxCategoryId ? (
                            <span className={styles.foodBoxBadgeInline}>Food box</span>
                        ) : null}
                    </span>
                    <span className={styles.mobileCategoryLinkMeta}>
                        {quotaLabel}
                        {selectedUnits > 0 ? ` · ${selectedUnits} selected` : ''}
                    </span>
                </button>
            );
        },
        [
            getRequiredQuota,
            categoryPoints,
            box.items,
            menuItems,
            finderCategoryId,
            scrollFinderIntoView,
            foodBoxCategoryId,
        ],
    );

    const handleVendorChange = (vendorId: string) => {
        const forVendor = boxTypes.filter((bt) => bt.isActive !== false && bt.vendorId === vendorId);
        const standard =
            forVendor.find((bt) => /standard\s*box/i.test((bt.name ?? '').trim())) ??
            forVendor.find((bt) => /\bstandard\b/i.test(bt.name ?? '')) ??
            forVendor[0];
        onPatchBox(box.slotId, {
            vendorId,
            boxTypeId: standard?.id ?? box.boxTypeId,
        });
    };

    const setItemQtyLocal = (itemId: string, qty: number) => {
        onSetItemQty(box.slotId, itemId, qty);
    };

    const orderSlice = box;

    const handleSimpleSubMenuAtDepth = useCallback(
        (depth: number, value: string) => {
            setSelectedItemId(null);
            if (value === '') {
                setFinderSubMenuPath(navPathOnly.slice(0, depth));
                return;
            }
            if (depth === 0 && value === '__unassigned__') {
                setFinderSubMenuPath([UNASSIGNED_SUBMENU_ID]);
                return;
            }
            setFinderSubMenuPath([...navPathOnly.slice(0, depth), value]);
        },
        [navPathOnly],
    );

    const renderBoxCatalogSearch = () => (
        <div ref={catalogSearchRef} className={styles.boxCatalogSearch}>
            <label className="sr-only" htmlFor={`box-catalog-search-${box.slotId}`}>
                Search items, folders, or IDs for box {boxIndex + 1}
            </label>
            <input
                id={`box-catalog-search-${box.slotId}`}
                type="search"
                className={styles.boxCatalogSearchInput}
                placeholder="Search by Item#, name, folder, or category…"
                value={catalogSearchQuery}
                autoComplete="off"
                onChange={(e) => {
                    setCatalogSearchQuery(e.target.value);
                    setCatalogSearchOpen(true);
                }}
                onFocus={() => {
                    if (catalogSearchQuery.trim()) setCatalogSearchOpen(true);
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                        setCatalogSearchOpen(false);
                        return;
                    }
                    if (e.key === 'Enter' && catalogSearchResults[0]) {
                        e.preventDefault();
                        applyCatalogSearchHit(catalogSearchResults[0]);
                    }
                }}
            />
            {catalogSearchOpen && catalogSearchQuery.trim() ? (
                <ul className={styles.boxCatalogSearchResults} role="listbox">
                    {catalogSearchResults.length === 0 ? (
                        <li className={styles.boxCatalogSearchEmpty} role="option">
                            No matches for this box
                        </li>
                    ) : (
                        catalogSearchResults.map((hit) => (
                            <li key={`${hit.type}-${hit.type === 'item' ? hit.itemId : hit.type === 'folder' ? hit.folderId : hit.categoryId}`}>
                                <button
                                    type="button"
                                    role="option"
                                    className={styles.boxCatalogSearchOption}
                                    onClick={() => applyCatalogSearchHit(hit)}
                                >
                                    <span className={styles.boxCatalogSearchOptionKind}>
                                        {hit.type === 'item' ? 'Item' : hit.type === 'folder' ? 'Folder' : 'Category'}
                                    </span>
                                    {renderCatalogSearchHitLabel(hit, styles.itemNumberEmphasis)}
                                </button>
                            </li>
                        ))
                    )}
                </ul>
            ) : null}
        </div>
    );

    const renderSimpleSubMenuDropdowns = () => {
        if (!finderCategoryId || finderRoots.length === 0) return null;
        if (browsingUnassignedOnly) {
            return (
                <div className={styles.field}>
                    <label htmlFor={`simple-sm-un-${box.slotId}`}>Where in this category?</label>
                    <select
                        id={`simple-sm-un-${box.slotId}`}
                        className={styles.select}
                        value="__unassigned__"
                        onChange={(e) => {
                            const v = e.target.value;
                            setSelectedItemId(null);
                            if (v === '' || v === '__unassigned__') {
                                setFinderSubMenuPath(v === '__unassigned__' ? [UNASSIGNED_SUBMENU_ID] : []);
                            } else {
                                setFinderSubMenuPath([v]);
                            }
                        }}
                    >
                        <option value="">Choose…</option>
                        <option value="__unassigned__">
                            Unassigned{unassignedCount > 0 ? ` (${unassignedCount} items)` : ''}
                        </option>
                        {finderRoots.map((n) => (
                            <option key={n.id} value={n.id}>
                                {n.name}
                            </option>
                        ))}
                    </select>
                </div>
            );
        }

        const rows: ReactNode[] = [];
        for (let depth = 0; depth < 48; depth++) {
            const opts = getSubMenuOptionsAtStep(finderRoots, navPathOnly.slice(0, depth));
            if (depth === 0) {
                if (!opts.length && unassignedCount === 0) break;
            } else {
                if (!navPathOnly[depth - 1]) break;
                if (!opts.length) break;
            }

            const label =
                depth === 0
                    ? unassignedCount > 0
                        ? 'Choose a group (or pick Unassigned)'
                        : 'Choose a group'
                    : 'Choose a subgroup';

            rows.push(
                <div key={`simple-sm-${depth}`} className={styles.field}>
                    <label htmlFor={`simple-sm-${box.slotId}-${depth}`}>{label}</label>
                    <select
                        id={`simple-sm-${box.slotId}-${depth}`}
                        className={styles.select}
                        value={navPathOnly[depth] ?? ''}
                        onChange={(e) => handleSimpleSubMenuAtDepth(depth, e.target.value)}
                    >
                        <option value="">Choose…</option>
                        {depth === 0 && unassignedCount > 0 && (
                            <option value="__unassigned__">Unassigned ({unassignedCount} items)</option>
                        )}
                        {opts.map((n) => (
                            <option key={n.id} value={n.id}>
                                {n.name}
                            </option>
                        ))}
                    </select>
                </div>,
            );
        }
        return <>{rows}</>;
    };

    const simpleModeItemRows =
        finderCategoryId && showPickItems ? (
            <div className={styles.simpleUiItems}>
                <div className={styles.colHead} style={{ marginBottom: '0.5rem' }}>
                    Items for this selection
                </div>
                {finderItems.map((item) => {
                    const active = selectedItemId === item.id;
                    const qty = box.items?.[item.id] ?? 0;
                    return (
                        <div
                            key={item.id}
                            data-box-item-id={item.id}
                            data-box-slot={box.slotId}
                            className={`${styles.row} ${styles.finderItemRow} ${active ? styles.rowActive : ''}`}
                            onClick={() => setSelectedItemId(item.id)}
                        >
                            <div className={styles.finderItemRowMain}>
                                <span>{item.name}</span>
                                <span className={styles.rowMuted}>
                                    {item.itemNumber != null ? (
                                        <>
                                            {renderItemNumberEmphasis(item.itemNumber, styles.itemNumberEmphasis)}
                                            {' · '}
                                        </>
                                    ) : null}
                                    {item.quotaValue ?? 1} pt
                                </span>
                            </div>
                            <div className={styles.stepper} onClick={(e) => e.stopPropagation()}>
                                <button
                                    type="button"
                                    className={styles.stepBtn}
                                    aria-label={`Decrease ${item.name}`}
                                    onClick={() => setItemQtyLocal(item.id, Math.max(0, qty - 1))}
                                >
                                    −
                                </button>
                                <span style={{ minWidth: 28, textAlign: 'center' }}>{qty}</span>
                                <button
                                    type="button"
                                    className={styles.stepBtn}
                                    aria-label={`Increase ${item.name}`}
                                    disabled={!canIncreaseItem(item)}
                                    onClick={() => setItemQtyLocal(item.id, qty + 1)}
                                >
                                    +
                                </button>
                            </div>
                        </div>
                    );
                })}
                {finderItems.length === 0 &&
                    (finderRoots.length === 0 ||
                        finderSubMenuPath.length > 0 ||
                        browsingUnassignedOnly) && (
                        <div className={styles.row}>
                            <span className={styles.rowMuted}>
                                {finderRoots.length > 0 ? 'No items for this selection' : 'No items for this vendor'}
                            </span>
                        </div>
                    )}
            </div>
        ) : null;

    return (
        <section className={styles.boxDialog} aria-labelledby={`box-dialog-title-${box.slotId}`}>
            <header className={styles.boxDialogTitleBar}>
                <h2 className={styles.boxDialogTitle} id={`box-dialog-title-${box.slotId}`}>
                    Box {boxIndex + 1}
                </h2>
                {canRemove ? (
                    <button
                        type="button"
                        className={styles.boxDialogClose}
                        onClick={() => onRemoveBox(box.slotId)}
                        aria-label={`Remove box ${boxIndex + 1}`}
                    >
                        ×
                    </button>
                ) : null}
            </header>
            <div className={styles.boxDialogBody}>
                {renderBoxCatalogSearch()}
                {showKitchenVendorPicker ? (
                    <div className={styles.toolbar} style={{ marginBottom: '1rem' }}>
                        <div className={styles.field}>
                            <label>Kitchen / vendor</label>
                            <select
                                className={styles.select}
                                value={box.vendorId ?? ''}
                                onChange={(e) => handleVendorChange(e.target.value)}
                            >
                                <option value="">Select…</option>
                                {vendors.map((v) => (
                                    <option key={v.id} value={v.id}>
                                        {v.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                ) : null}

                {/*
                Food box exclusive banner — restore when needed.
                {foodBoxCategoryId && foodBoxCategoryLabel ? (
                    <div className={styles.foodBoxExclusiveBanner} role="status">
                        <div className={styles.foodBoxExclusiveBannerStack}>
                            <p className={styles.foodBoxExclusiveBannerTitle}>
                                Food box option
                                <span className={styles.foodBoxExclusiveBannerCategory}>{foodBoxCategoryLabel}</span>
                            </p>
                            <p>
                                <strong>Two ways to fill this box.</strong> Our{' '}
                                <strong>food boxes</strong> are set up so you can choose from one curated category—for
                                example your <strong>protein</strong> (chicken, beef, fish, etc.) and the items that go
                                with that kind of meal—without walking every aisle. Pick what applies from that food-box
                                section (proteins, sides that belong with it, etc.).
                            </p>
                            <p>
                                <strong>Or</strong> skip the food-box category and build this box <strong>only</strong>{' '}
                                from the <strong>other</strong> categories (carbs, vegetables, fruits, dairy, snacks,
                                and everything else on the menu). Mix and match across those aisles however you like.
                            </p>
                            <p>
                                <strong>You can&apos;t combine both approaches in one box:</strong> either food-box
                                items <em>or</em> items from the other categories—not both. If you switch, we&apos;ll ask
                                you to clear the other selections first.
                            </p>
                        </div>
                    </div>
                ) : null}
                */}

                {simpleUi ? (
                    <div ref={finderRef} className={styles.simpleUiBody}>
                        <p className={styles.simpleUiHint}>
                            Pick a category, then use each menu below until you see items. Your amounts save automatically.
                        </p>
                        <div className={styles.field}>
                            <label htmlFor={`simple-cat-${box.slotId}`}>Pick a category</label>
                            <select
                                id={`simple-cat-${box.slotId}`}
                                className={styles.select}
                                value={finderCategoryId ?? ''}
                                onChange={(e) => {
                                    const id = e.target.value;
                                    setSelectedItemId(null);
                                    setFinderSubMenuPath([]);
                                    setFinderCategoryId(id || null);
                                }}
                            >
                                <option value="">Choose a category…</option>
                                {sortedCategories.map((cat) => {
                                    const foodLbl =
                                        foodBoxCategoryId && cat.id === foodBoxCategoryId ? ' (Food box)' : '';
                                    return (
                                        <option key={cat.id} value={cat.id}>
                                            {cat.name}
                                            {foodLbl}
                                        </option>
                                    );
                                })}
                            </select>
                        </div>

                        {renderSimpleSubMenuDropdowns()}

                        {finderCategoryId && finderRoots.length > 0 && !showPickItems && (
                            <p className={styles.simpleUiHint} role="status">
                                Choose a group above to see items for this category.
                            </p>
                        )}

                        {simpleModeItemRows}
                    </div>
                ) : (
                    <>
                        {narrowShelf && (
                            <div className={styles.mobileCategoryNav} aria-label="Box categories">
                                {sortedCategories.map((cat) => renderMobileCategoryLink(cat))}
                            </div>
                        )}

                        <div
                            ref={finderRef}
                            className={narrowShelf ? styles.finderMobileShelfOuter : undefined}
                        >
                    {narrowShelf && finderEasePrompt && !simpleUi ? (
                        <div className={styles.finderEaseBannerNarrow}>{finderEasePrompt}</div>
                    ) : null}
                    {!narrowShelf && showCategoryStrip ? (
                        <div className={styles.categoryStripSticky}>
                            <div className={styles.categoryStrip}>
                                {sortedCategories.map((cat) => (
                                    <Fragment key={cat.id}>{renderCategoryCardButton(cat)}</Fragment>
                                ))}
                            </div>
                        </div>
                    ) : finderCategoryId ? (
                        <>
                            {narrowActiveCategory && (
                                <div className={styles.shelfActiveStack}>
                                    <div className={styles.mobileActiveShelf}>
                                        <div className={styles.mobilePathBar}>
                                            {finderPathBreadcrumb}
                                        </div>
                                        <MobileShelfDrilldown
                                            styles={styles}
                                            finderCols={finderCols}
                                            finderRoots={finderRoots}
                                            navPathOnly={navPathOnly}
                                            finderSubMenuPath={finderSubMenuPath}
                                            browsingUnassignedOnly={browsingUnassignedOnly}
                                            showPickSubmenus={showPickSubmenus}
                                            showPickItems={showPickItems}
                                            finderItems={finderItems}
                                            unassignedCount={unassignedCount}
                                            selectedItemId={selectedItemId}
                                            activeBox={orderSlice}
                                            setItemQty={setItemQtyLocal}
                                            layoutConfig={layoutConfig}
                                            baseCategoryItems={baseCategoryItems}
                                            setFinderSubMenuPath={setFinderSubMenuPath}
                                            setSelectedItemId={setSelectedItemId}
                                            emptyItemsLabel={shelfEmptyItemsLabel}
                                            canIncreaseItem={canIncreaseItem}
                                        />
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className={styles.mobileEmptyState}>Choose a category above to start building this box.</div>
                    )}

                    {!narrowShelf && (
                        <div className={styles.finder}>
                            <div className={styles.finderFoldCol}>
                                <div className={styles.col}>
                                    <div className={styles.colHead}>Categories</div>
                                    <div className={styles.finderFoldScroll}>
                                        <div className={styles.colBody}>
                                            {sortedCategories.map((cat) => {
                                                const count = itemsForCategory(cat.id).length;
                                                const rowActive = finderCategoryId === cat.id;
                                                const showFoodLbl =
                                                    Boolean(foodBoxCategoryId && cat.id === foodBoxCategoryId);
                                                return (
                                                    <div key={cat.id}>
                                                        <div
                                                            className={`${styles.row} ${rowActive ? styles.rowActive : ''}`}
                                                            onClick={() => {
                                                                setFinderCategoryId(cat.id);
                                                                setFinderSubMenuPath([]);
                                                                setSelectedItemId(null);
                                                                scrollFinderIntoView();
                                                            }}
                                                        >
                                                            <span>
                                                                {cat.name}
                                                                {showFoodLbl ? (
                                                                    <span className={styles.foodBoxBadgeInline}>
                                                                        Food box
                                                                    </span>
                                                                ) : null}
                                                            </span>
                                                            <span className={styles.rowMuted}>{count}</span>
                                                        </div>
                                                        {rowActive &&
                                                        finderCategoryId &&
                                                        finderRoots.length > 0 &&
                                                        (navPathOnly.length > 0 || browsingUnassignedOnly) ? (
                                                            <>
                                                                <div className={styles.foldDivider} />
                                                                <div className={`${styles.foldStack} ${styles.foldStackEmbedded}`}>
                                                                    {navPathOnly.map((id, i) => {
                                                                        const isLatest =
                                                                            i === navPathOnly.length - 1 && !browsingUnassignedOnly;
                                                                        return (
                                                                            <div
                                                                                key={id}
                                                                                className={`${styles.foldRow} ${styles.foldRowEmbedded} ${isLatest ? styles.foldRowLatest : ''}`}
                                                                                style={{
                                                                                    paddingLeft:
                                                                                        FOLD_INDENT_BASE_PX +
                                                                                        i * FOLD_INDENT_PER_LEVEL_PX,
                                                                                }}
                                                                            >
                                                                                <button
                                                                                    type="button"
                                                                                    className={styles.foldTrailHit}
                                                                                    onClick={() => {
                                                                                        setFinderSubMenuPath(navPathOnly.slice(0, i + 1));
                                                                                        setSelectedItemId(null);
                                                                                    }}
                                                                                >
                                                                                    <span className={styles.foldRowButtonInner}>
                                                                                        <CategoryStackIcon
                                                                                            className={styles.subcategoryGlyph}
                                                                                        />
                                                                                        <span className={styles.foldTrailLabel}>
                                                                                            {findNode(finderRoots, id)?.name ??
                                                                                                id.slice(0, 8)}
                                                                                        </span>
                                                                                    </span>
                                                                                </button>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                    {browsingUnassignedOnly && (
                                                                        <div
                                                                            className={`${styles.foldRow} ${styles.foldRowEmbedded} ${styles.foldRowLatest}`}
                                                                            style={{
                                                                                paddingLeft:
                                                                                    FOLD_INDENT_BASE_PX +
                                                                                    navPathOnly.length *
                                                                                        FOLD_INDENT_PER_LEVEL_PX,
                                                                            }}
                                                                        >
                                                                            <span className={styles.foldRowButtonInner}>
                                                                                <CategoryStackIcon
                                                                                    className={`${styles.subcategoryGlyph} ${styles.subcategoryGlyphMuted}`}
                                                                                />
                                                                                <span className={styles.foldTrailLabel}>
                                                                                    Unassigned
                                                                                </span>
                                                                            </span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </>
                                                        ) : null}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className={styles.finderPickCol}>
                                <div className={styles.col}>
                                    <div className={`${styles.colHead} ${styles.finderPickColHead}`}>
                                        {!finderCategoryId ? (
                                            <span className={styles.finderCrumbPlaceholder}>Choose next</span>
                                        ) : (
                                            finderPathBreadcrumb
                                        )}
                                    </div>
                                    <div className={styles.colBody}>
                                        {finderEasePrompt && !simpleUi ? (
                                            <div className={styles.finderEaseInPickCol}>{finderEasePrompt}</div>
                                        ) : null}
                                        {!finderCategoryId && (
                                            <div className={styles.row}>
                                                <span className={styles.rowMuted}>Pick a category ←</span>
                                            </div>
                                        )}

                                        {finderCategoryId && showPickSubmenus && (
                                            <>
                                                {navPathOnly.length === 0 && unassignedCount > 0 && (
                                                    <div
                                                        className={`${styles.row} ${styles.pickGroupRow} ${finderSubMenuPath.length === 1 && finderSubMenuPath[0] === UNASSIGNED_SUBMENU_ID ? styles.rowActive : ''}`}
                                                        onClick={() => {
                                                            setFinderSubMenuPath([UNASSIGNED_SUBMENU_ID]);
                                                            setSelectedItemId(null);
                                                        }}
                                                    >
                                                        <span className={styles.pickGroupRowInner}>
                                                            <CategoryStackIcon
                                                                className={`${styles.subcategoryGlyph} ${styles.subcategoryGlyphMuted}`}
                                                            />
                                                            <span>Unassigned</span>
                                                        </span>
                                                        <span className={`${styles.rowMuted} ${styles.pickGroupMeta}`}>
                                                            {unassignedCount}
                                                        </span>
                                                    </div>
                                                )}
                                                {finderStripNodes.length === 0 && navPathOnly.length > 0 && (
                                                    <div className={styles.row}>
                                                        <span className={styles.rowMuted}>
                                                            No further groups — items appear here next.
                                                        </span>
                                                    </div>
                                                )}
                                                {finderStripNodes.map((node) => {
                                                    const assignedHere = countAssignedToNode(
                                                        node.id,
                                                        layoutConfig,
                                                        baseCategoryItems,
                                                    );
                                                    const childCount = node.children?.length ?? 0;
                                                    const isActive = navPathOnly[navPathOnly.length - 1] === node.id;
                                                    return (
                                                        <div
                                                            key={node.id}
                                                            className={`${styles.row} ${styles.pickGroupRow} ${isActive ? styles.rowActive : ''}`}
                                                            onClick={() => {
                                                                setFinderSubMenuPath([...navPathOnly, node.id]);
                                                                setSelectedItemId(null);
                                                            }}
                                                        >
                                                            <span className={styles.pickGroupRowInner}>
                                                                <CategoryStackIcon
                                                                    className={styles.subcategoryGlyph}
                                                                />
                                                                <span>{node.name}</span>
                                                            </span>
                                                            <span className={`${styles.rowMuted} ${styles.pickGroupMeta}`}>
                                                                {assignedHere > 0 ? `${assignedHere} items` : ''}
                                                                {assignedHere > 0 && childCount > 0 ? ' · ' : ''}
                                                                {childCount > 0 ? `${childCount} nested` : ''}
                                                                {!assignedHere && !childCount ? '—' : ''}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </>
                                        )}

                                        {finderCategoryId && showPickItems && (
                                            <div
                                                className={
                                                    showPickSubmenus ? styles.finderPickItemsAfterFolders : undefined
                                                }
                                            >
                                                {finderItems.map((item) => {
                                                    const active = selectedItemId === item.id;
                                                    const qty = box.items?.[item.id] ?? 0;
                                                    return (
                                                        <div
                                                            key={item.id}
                                                            data-box-item-id={item.id}
                                                            data-box-slot={box.slotId}
                                                            className={`${styles.row} ${styles.finderItemRow} ${active ? styles.rowActive : ''}`}
                                                            onClick={() => setSelectedItemId(item.id)}
                                                        >
                                                            <div className={styles.finderItemRowMain}>
                                                                <span>{item.name}</span>
                                                                <span className={styles.rowMuted}>
                                                                    {item.itemNumber != null ? (
                                                                        <>
                                                                            {renderItemNumberEmphasis(
                                                                                item.itemNumber,
                                                                                styles.itemNumberEmphasis,
                                                                            )}
                                                                            {' · '}
                                                                        </>
                                                                    ) : null}
                                                                    {item.quotaValue ?? 1} pt
                                                                </span>
                                                            </div>
                                                            <div
                                                                className={styles.stepper}
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                <button
                                                                    type="button"
                                                                    className={styles.stepBtn}
                                                                    aria-label={`Decrease ${item.name}`}
                                                                    onClick={() =>
                                                                        setItemQtyLocal(item.id, Math.max(0, qty - 1))
                                                                    }
                                                                >
                                                                    −
                                                                </button>
                                                                <span style={{ minWidth: 28, textAlign: 'center' }}>{qty}</span>
                                                                <button
                                                                    type="button"
                                                                    className={styles.stepBtn}
                                                                    aria-label={`Increase ${item.name}`}
                                                                    disabled={!canIncreaseItem(item)}
                                                                    onClick={() => setItemQtyLocal(item.id, qty + 1)}
                                                                >
                                                                    +
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                                {finderItems.length === 0 &&
                                                    (finderRoots.length === 0 ||
                                                        finderSubMenuPath.length > 0 ||
                                                        browsingUnassignedOnly) && (
                                                        <div className={styles.row}>
                                                            <span className={styles.rowMuted}>
                                                                {finderRoots.length > 0
                                                                    ? 'No items for this selection'
                                                                    : 'No items for this vendor'}
                                                            </span>
                                                        </div>
                                                    )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                        </div>
                    </>
                )}
            </div>
        </section>
    );
}

export function BoxSelectorDemoClient({
    menuItems,
    categories,
    boxTypes,
    vendors,
    quotasByBoxType,
    value,
    onChange,
    maxBoxes,
    embedded = false,
    showCategoryStrip = true,
    showRefreshButton = true,
    /** Hidden by default; staff pages pass true so the Kitchen / vendor row is shown. */
    showKitchenVendorPicker = false,
    simpleUi = false,
    embeddedFinderEasePrompt,
    foodBoxCategoryId,
}: Props) {
    const isControlled = value !== undefined;
    const [layoutTick, setLayoutTick] = useState(0);
    const [boxes, setBoxes] = useState<BoxRow[]>(() =>
        isControlled ? rowsFromValue(value, [], boxTypes) : [makeBoxRow(boxTypes)],
    );
    const [isNarrowShelfLayout, setIsNarrowShelfLayout] = useState(false);
    const [layoutConfig, setLayoutConfig] = useState<DemoBoxLayoutConfig | null>(null);
    const [foodBoxSwitchPrompt, setFoodBoxSwitchPrompt] = useState<FoodBoxSwitchPromptState | null>(null);

    const boxesRef = useRef<BoxRow[]>(boxes);
    boxesRef.current = boxes;

    const foodBoxCategoryDisplayName = useMemo(() => {
        if (!foodBoxCategoryId) return '';
        return categories.find((c) => c.id === foodBoxCategoryId)?.name?.trim() || 'Food box';
    }, [categories, foodBoxCategoryId]);

    useEffect(() => {
        const mq = window.matchMedia('(max-width: 900px)');
        const apply = () => setIsNarrowShelfLayout(mq.matches);
        apply();
        mq.addEventListener('change', apply);
        return () => mq.removeEventListener('change', apply);
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const remote = await getBoxMenuLayoutConfig();
                if (!cancelled) setLayoutConfig(remote);
            } catch (error) {
                console.error('[BoxSelectorDemoClient] Failed to load box menu layout config:', error);
                if (!cancelled) setLayoutConfig(null);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [layoutTick]);

    useEffect(() => {
        if (!isControlled) return;
        setBoxes((prev) => rowsFromValue(value, prev, boxTypes));
    }, [isControlled, value, boxTypes]);

    const sortedCategories = useMemo(() => {
        const order = layoutConfig?.orderedCategoryIds?.length ? layoutConfig.orderedCategoryIds : null;
        return sortCategoriesForUi(categories, order);
    }, [categories, layoutConfig]);

    const commitBoxes = useCallback((updater: (prev: BoxRow[]) => BoxRow[]) => {
        setBoxes((prev) => {
            const next = updater(prev);
            const ensured = next.length > 0 ? next : [makeBoxRow(boxTypes)];
            if (onChange) onChange(serializeRows(ensured));
            return ensured;
        });
    }, [boxTypes, onChange]);

    const patchBox = useCallback((slotId: string, patch: Partial<BoxOrderState>) => {
        commitBoxes((prev) => prev.map((b) => (b.slotId === slotId ? { ...b, ...patch } : b)));
    }, [commitBoxes]);

    const setItemQtyForSlot = useCallback(
        (slotId: string, itemId: string, qty: number) => {
            const slot = boxesRef.current.find((b) => b.slotId === slotId);
            if (!slot) return;

            const conflict = getFoodBoxExclusiveConflict(
                slot.items || {},
                menuItems,
                foodBoxCategoryId,
                itemId,
                qty,
            );

            if (qty > 0 && foodBoxCategoryId && conflict !== 'none') {
                setFoodBoxSwitchPrompt({
                    conflict,
                    slotId,
                    itemId,
                    qty,
                });
                return;
            }

            commitBoxes((prev) => {
                const next = prev.map((b) => {
                    if (b.slotId !== slotId) return b;
                    const applied = applyFoodBoxExclusiveItems(
                        b.items || {},
                        b.itemNotes || {},
                        menuItems,
                        foodBoxCategoryId,
                        itemId,
                        qty,
                    );
                    return { ...b, items: applied.items, itemNotes: applied.itemNotes };
                });
                const ensured = next.length > 0 ? next : [makeBoxRow(boxTypes)];
                return ensured;
            });
        },
        [commitBoxes, menuItems, foodBoxCategoryId, boxTypes],
    );

    const cancelFoodBoxSwitch = useCallback(() => {
        setFoodBoxSwitchPrompt(null);
    }, []);

    const confirmFoodBoxSwitch = useCallback(() => {
        setFoodBoxSwitchPrompt((prompt) => {
            if (!prompt) return null;
            const { slotId, itemId, qty } = prompt;
            queueMicrotask(() => {
                commitBoxes((prev) => {
                    const next = prev.map((b) => {
                        if (b.slotId !== slotId) return b;
                        const applied = applyFoodBoxExclusiveItems(
                            b.items || {},
                            b.itemNotes || {},
                            menuItems,
                            foodBoxCategoryId,
                            itemId,
                            qty,
                        );
                        return { ...b, items: applied.items, itemNotes: applied.itemNotes };
                    });
                    return next.length > 0 ? next : [makeBoxRow(boxTypes)];
                });
            });
            return null;
        });
    }, [commitBoxes, menuItems, foodBoxCategoryId, boxTypes]);

    useEffect(() => {
        if (!foodBoxSwitchPrompt) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setFoodBoxSwitchPrompt(null);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [foodBoxSwitchPrompt]);

    useEffect(() => {
        if (!foodBoxSwitchPrompt) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prev;
        };
    }, [foodBoxSwitchPrompt]);

    const addBox = () => {
        commitBoxes((prev) => {
            if (maxBoxes && prev.length >= maxBoxes) return prev;
            return [...prev, makeBoxRow(boxTypes)];
        });
    };

    const removeBox = (slotId: string) => {
        commitBoxes((prev) => {
            if (prev.length <= 1) return [makeBoxRow(boxTypes)];
            return prev.filter((b) => b.slotId !== slotId);
        });
    };

    const reachedMaxBoxes = Boolean(maxBoxes && boxes.length >= maxBoxes);

    const addBoxButton =
        (!maxBoxes || !reachedMaxBoxes) ? (
            <button type="button" className="btn btn-secondary" onClick={addBox}>
                + Add box
            </button>
        ) : null;

    const refreshButton = showRefreshButton ? (
        <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setLayoutTick((t) => t + 1)}
            title="Reload category order and sub-menus from database"
        >
            Refresh layout
        </button>
    ) : null;

    return (
        <div className={`${styles.wrap} ${embedded ? styles.wrapEmbedded : styles.selectDemoWrap}`}>
            <div className={styles.inner}>
                {embedded ? (
                    refreshButton ? (
                        <div className={styles.boxPickerToolbar}>{refreshButton}</div>
                    ) : null
                ) : (
                    <div className={styles.boxPickerToolbar}>
                        {addBoxButton}
                        {refreshButton}
                    </div>
                )}

                <div className={styles.boxDialogStack}>
                    {boxes.map((box, i) => (
                        <BoxPickerWindow
                            key={box.slotId}
                            box={box}
                            boxIndex={i}
                            narrowShelf={isNarrowShelfLayout}
                            menuItems={menuItems}
                            categories={categories}
                            boxTypes={boxTypes}
                            vendors={vendors}
                            quotasByBoxType={quotasByBoxType}
                            sortedCategories={sortedCategories}
                            layoutConfig={layoutConfig}
                            onPatchBox={patchBox}
                            onSetItemQty={setItemQtyForSlot}
                            onRemoveBox={removeBox}
                            canRemove={boxes.length > 1}
                            showCategoryStrip={showCategoryStrip}
                            showKitchenVendorPicker={showKitchenVendorPicker}
                            simpleUi={simpleUi}
                            finderEasePrompt={embeddedFinderEasePrompt}
                            foodBoxCategoryId={foodBoxCategoryId}
                        />
                    ))}
                </div>

                {embedded && addBoxButton ? (
                    <div className={`${styles.boxPickerToolbar} ${styles.boxPickerToolbarBottom}`}>{addBoxButton}</div>
                ) : null}
            </div>

            {foodBoxSwitchPrompt && foodBoxCategoryId ? (
                <div
                    className={styles.foodBoxModalBackdrop}
                    role="presentation"
                    onClick={cancelFoodBoxSwitch}
                >
                    <div
                        className={styles.foodBoxModal}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="food-box-switch-title"
                        aria-describedby="food-box-switch-desc"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2 id="food-box-switch-title" className={styles.foodBoxModalTitle}>
                            Change what&apos;s in this box?
                        </h2>
                        <div id="food-box-switch-desc" className={styles.foodBoxModalBody}>
                            <p className={styles.foodBoxModalLead}>
                                Each box can use <strong>either</strong> items from the food box category (
                                <strong>{foodBoxCategoryDisplayName}</strong>) <strong>or</strong> items from every
                                other category — <strong>never both</strong>.
                            </p>
                            {foodBoxSwitchPrompt.conflict === 'clearOthers' ? (
                                <p>
                                    You&apos;re adding an item from <strong>{foodBoxCategoryDisplayName}</strong>. To
                                    use food box selections, we need to <strong>clear everything</strong> you&apos;ve
                                    chosen from the other categories in this box.
                                </p>
                            ) : (
                                <p>
                                    You&apos;re adding an item from <strong>another category</strong>. Those items
                                    can&apos;t be combined with food box items — we&apos;ll{' '}
                                    <strong>clear every food box item</strong> in this box so you can continue.
                                </p>
                            )}
                        </div>
                        <div className={styles.foodBoxModalActions}>
                            <button
                                type="button"
                                className={styles.foodBoxModalBtnSecondary}
                                onClick={cancelFoodBoxSwitch}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className={styles.foodBoxModalBtnPrimary}
                                onClick={confirmFoodBoxSwitch}
                            >
                                Continue
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

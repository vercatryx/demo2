'use client';

import React, { useMemo, type Dispatch, type SetStateAction } from 'react';
import { Vendor, MenuItem, MealCategory, MealItem, ItemCategory, BoxQuota } from '@/lib/types';
import { getItemPoints } from '@/lib/utils';
import {
    getMenuItemDropdownGroups,
    splitDropdownInstanceNotes,
} from '@/lib/menu-item-dropdowns';
import { sortWeekdays } from '@/lib/order-dates';
import { getBoxAllowanceMultiplier, mergeBoxOrdersForPortal } from '@/lib/box-order-consolidation';
import { ShoppingCart, Minus } from 'lucide-react';
import { PortalFoodImagePlaceholder } from '@/components/clients/portal-v2/PortalFoodImagePlaceholder';
import styles from './ClientPortal.module.css';

type RemoveTarget =
    | { kind: 'food'; blockIndex: number; itemId: string; day?: string }
    | { kind: 'meal'; mealKey: string; itemId: string }
    | { kind: 'box'; itemId: string };

function decrementFoodVendorItem(prev: any, blockIndex: number, itemId: string, day?: string): any {
    if (!prev?.vendorSelections?.[blockIndex]) return prev;
    const newConfig = { ...prev };
    const updated = [...newConfig.vendorSelections];
    const block = { ...updated[blockIndex] };

    if (day && block.selectedDeliveryDays && block.selectedDeliveryDays.length > 0) {
        block.itemsByDay = block.itemsByDay ? { ...block.itemsByDay } : {};
        const dayItems = { ...(block.itemsByDay[day] || {}) };
        const cur = Number(dayItems[itemId]) || 0;
        const next = Math.max(0, cur - 1);
        if (next <= 0) {
            delete dayItems[itemId];
            block.itemNotesByDay = { ...(block.itemNotesByDay || {}) };
            if (block.itemNotesByDay[day]) {
                block.itemNotesByDay[day] = { ...block.itemNotesByDay[day] };
                delete block.itemNotesByDay[day][itemId];
            }
        } else {
            dayItems[itemId] = next;
        }
        block.itemsByDay[day] = dayItems;
    } else {
        const items = { ...(block.items || {}) };
        const itemNotes = { ...(block.itemNotes || {}) };
        const cur = Number(items[itemId]) || 0;
        const next = Math.max(0, cur - 1);
        if (next <= 0) {
            delete items[itemId];
            delete itemNotes[itemId];
        } else {
            items[itemId] = next;
        }
        block.items = items;
        block.itemNotes = itemNotes;
    }

    updated[blockIndex] = block;
    newConfig.vendorSelections = updated;
    return newConfig;
}

function decrementMealItem(prev: any, mealKey: string, itemId: string): any {
    const meal = prev?.mealSelections?.[mealKey];
    if (!meal?.items) return prev;
    const newConfig = { ...prev, mealSelections: { ...prev.mealSelections } };
    const items = { ...meal.items };
    const notes = { ...(meal.itemNotes || {}) };
    const cur = Number(items[itemId]) || 0;
    const next = Math.max(0, cur - 1);
    if (next <= 0) {
        delete items[itemId];
        delete notes[itemId];
    } else {
        items[itemId] = next;
    }
    newConfig.mealSelections[mealKey] = { ...meal, items, itemNotes: notes };
    return newConfig;
}

function decrementBoxItem(
    prev: any,
    itemId: string,
    approvedMealsPerWeek: number | null | undefined,
): any {
    const boxes = prev?.boxOrders;
    if (!Array.isArray(boxes) || boxes.length === 0) return prev;
    const multiplier = getBoxAllowanceMultiplier(approvedMealsPerWeek);
    const merged = mergeBoxOrdersForPortal(boxes, multiplier);
    const items = { ...(merged.items || {}) };
    const notes = { ...(merged.itemNotes || {}) };
    const cur = Number(items[itemId]) || 0;
    const next = Math.max(0, cur - 1);
    if (next <= 0) {
        delete items[itemId];
        delete notes[itemId];
    } else {
        items[itemId] = next;
    }
    return {
        ...prev,
        boxOrders: [
            {
                boxTypeId: merged.boxTypeId,
                vendorId: merged.vendorId,
                quantity: multiplier,
                items,
                itemNotes: notes,
            },
        ],
    };
}

function applyRemoveOne(
    prev: any,
    target: RemoveTarget,
    approvedMealsPerWeek: number | null | undefined,
): any {
    switch (target.kind) {
        case 'food':
            return decrementFoodVendorItem(prev, target.blockIndex, target.itemId, target.day);
        case 'meal':
            return decrementMealItem(prev, target.mealKey, target.itemId);
        case 'box':
            return decrementBoxItem(prev, target.itemId, approvedMealsPerWeek);
        default:
            return prev;
    }
}

function isItemActive(item: { isActive?: boolean; is_active?: boolean } | null | undefined): boolean {
    if (!item) return false;
    const v = (item as any).isActive ?? (item as any).is_active;
    return v === true;
}

function isVendorActive(v: { isActive?: boolean; is_active?: boolean } | null | undefined): boolean {
    if (!v) return false;
    const val = (v as any).isActive ?? (v as any).is_active;
    return val === true;
}

/** Same as center (ClientPortalInterface box section): item is available for this box if it matches vendor and is in an active category. */
function isMenuItemAvailableForBox(
    item: MenuItem,
    box: { vendorId?: string | null },
    activeCategoryIds: Set<string>
): boolean {
    if (!isItemActive(item)) return false;
    const catOk = item.categoryId != null && activeCategoryIds.has(item.categoryId);
    if (!catOk) return false;
    const vendorOk = !box.vendorId || (item.vendorId === box.vendorId) || (item.vendorId === null || item.vendorId === '');
    return vendorOk;
}

function sortActiveCategories(categories: ItemCategory[]): ItemCategory[] {
    return [...categories]
        .filter((c) => c.isActive !== false)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

function getBoxCategoryRequiredQuota(
    category: ItemCategory,
    boxTypeId: string | undefined,
    boxQuotas: BoxQuota[],
    multiplier: number,
): number | null {
    let base: number | null = null;
    if (category.setValue !== undefined && category.setValue !== null) {
        base = category.setValue;
    } else if (boxTypeId) {
        const q = boxQuotas.find((x) => x.boxTypeId === boxTypeId && x.categoryId === category.id);
        base = q ? q.targetValue : null;
    }
    if (base === null) return null;
    return base * multiplier;
}

function getBoxCategoryPointsUsed(
    categoryId: string,
    items: Record<string, number> | undefined,
    menuItems: MenuItem[],
    box: { vendorId?: string | null },
    activeCategoryIds: Set<string>,
): number {
    if (!items) return 0;
    let total = 0;
    for (const [itemId, qty] of Object.entries(items)) {
        const item = menuItems.find((i) => i.id === itemId);
        if (item && item.categoryId === categoryId && isMenuItemAvailableForBox(item, box, activeCategoryIds)) {
            total += (Number(qty) || 0) * (item.quotaValue ?? 1);
        }
    }
    return total;
}

function formatBoxCategorySectionTitle(
    categoryName: string,
    used: number,
    required: number | null,
): string {
    const usedRounded = Math.round(used);
    if (required !== null) {
        return `${categoryName} · ${usedRounded}/${required} pts used`;
    }
    return usedRounded > 0
        ? `${categoryName} · ${usedRounded} ${usedRounded === 1 ? 'pt' : 'pts'} used`
        : categoryName;
}

interface Props {
    orderConfig: any;
    vendors: Vendor[];
    menuItems: MenuItem[];
    mealCategories: MealCategory[];
    mealItems: MealItem[];
    categories?: ItemCategory[];
    hideVendorNames?: boolean;
    /** When set (e.g. client portal), summary rows show a minus control to decrement/remove items. */
    setOrderConfig?: Dispatch<SetStateAction<any>>;
    /** Client portal: authorized box count for combined allowance display. */
    approvedMealsPerWeek?: number | null;
    /** Per box-type category targets (for summary headers). */
    boxQuotas?: BoxQuota[];
    showItemThumbnails?: boolean;
    /** When set, clicking an item's name/image navigates to that menu item in the catalog. */
    onItemNavigate?: (itemId: string) => void;
}

export default function ClientPortalOrderSummary({
    orderConfig,
    vendors,
    menuItems,
    mealCategories,
    mealItems,
    categories = [],
    hideVendorNames = false,
    setOrderConfig,
    approvedMealsPerWeek,
    boxQuotas = [],
    showItemThumbnails = false,
    onItemNavigate,
}: Props) {
    const activeMenuItems = useMemo(() => menuItems.filter(i => isItemActive(i)), [menuItems]);
    const activeMealItems = useMemo(() => mealItems.filter(i => isItemActive(i)), [mealItems]);
    const activeVendors = useMemo(() => vendors.filter(v => isVendorActive(v)), [vendors]);
    const activeCategoryIds = useMemo(
        () => new Set((categories || []).filter(c => c.isActive !== false).map(c => c.id)),
        [categories]
    );

    type LineRow = {
        itemId: string;
        name: string;
        qty: number;
        note?: string;
        value: number;
        sortOrder: number;
        remove?: RemoveTarget;
        categoryName?: string;
        imageUrl?: string | null;
        /** Secondary line under item name (e.g. pts each / total for box items). */
        pointsLabel?: string;
    };

    const sections: {
        title: string;
        items: LineRow[];
        variant?: 'default' | 'box-intro' | 'box-category';
    }[] = [];

    let foodSectionCount = 0;
    if (orderConfig.vendorSelections) {
        orderConfig.vendorSelections.forEach((selection: any, blockIndex: number) => {
            if (!selection.vendorId) return;
            const vendor = activeVendors.find(v => v.id === selection.vendorId);
            if (!vendor) return;

            const vendorId = selection.vendorId;
            const itemsList: LineRow[] = [];

            const addItem = (itemId: string, qty: number, note?: string, day?: string) => {
                const item = activeMenuItems.find(i => i.id === itemId);
                const matchVendor = item && (item as any).vendorId === vendorId;
                const q = Number(qty) || 0;
                if (!item || !matchVendor || q <= 0) return;

                const remove: RemoveTarget | undefined =
                    setOrderConfig ?
                        day ?
                            { kind: 'food', blockIndex, itemId, day }
                        :   { kind: 'food', blockIndex, itemId }
                    :   undefined;
                const displayName = day ? `${item.name} (${day})` : item.name;
                const groups = getMenuItemDropdownGroups(item);
                if (groups.length > 0 && q > 1) {
                    splitDropdownInstanceNotes(note ?? '', q).forEach((instNote, i) => {
                        itemsList.push({
                            itemId,
                            name: `${displayName} #${i + 1}`,
                            qty: 1,
                            note: instNote || undefined,
                            value: getItemPoints(item),
                            sortOrder: item.sortOrder ?? 0,
                            remove,
                            imageUrl: item.imageUrl,
                        });
                    });
                    return;
                }
                itemsList.push({
                    itemId,
                    name: displayName,
                    qty: q,
                    note: note,
                    value: getItemPoints(item) * q,
                    sortOrder: item.sortOrder ?? 0,
                    remove,
                    imageUrl: item.imageUrl,
                });
            };

            if (selection.itemsByDay && selection.selectedDeliveryDays) {
                for (const day of sortWeekdays(selection.selectedDeliveryDays)) {
                    const dayItems = selection.itemsByDay[day] || {};
                    const dayNotes = selection.itemNotesByDay?.[day] || {};

                    Object.entries(dayItems).forEach(([itemId, qty]) => {
                        const note =
                            (typeof dayNotes[itemId] === 'string' && dayNotes[itemId].trim()
                                ? dayNotes[itemId]
                                : selection.itemNotes?.[itemId]) as string | undefined;
                        addItem(itemId, Number(qty), note, day);
                    });
                }
            } else if (selection.items) {
                const notes = selection.itemNotes || {};
                Object.entries(selection.items).forEach(([itemId, qty]) => {
                    addItem(itemId, Number(qty), notes[itemId]);
                });
            }

            if (itemsList.length === 0) return;

            foodSectionCount += 1;
            sections.push({
                title: hideVendorNames ? `Food Selection ${foodSectionCount}` : vendor.name,
                items: itemsList.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
            });
        });
    }

    if (orderConfig.mealSelections) {
        Object.entries(orderConfig.mealSelections).forEach(([mealKey, config]: [string, any]) => {
            const itemsList: LineRow[] = [];

            if (config.items) {
                const notes = config.itemNotes || {};
                Object.entries(config.items).forEach(([itemId, qty]) => {
                    const q = Number(qty) || 0;
                    const item = activeMealItems.find(i => i.id === itemId);
                    if (item && q > 0) {
                        const remove: RemoveTarget | undefined =
                            setOrderConfig ? { kind: 'meal', mealKey, itemId } : undefined;
                        itemsList.push({
                            itemId,
                            name: item.name,
                            qty: q,
                            note: notes[itemId],
                            value: getItemPoints(item) * q,
                            sortOrder: item.sortOrder ?? 0,
                            remove
                        });
                    }
                });
            }

            if (itemsList.length === 0) return;

            const mealLabel = config.mealType || mealKey;
            sections.push({
                title: `${mealLabel} Order`,
                items: itemsList.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
            });
        });
    }

    if (orderConfig.boxOrders && orderConfig.serviceType === 'Boxes') {
        const multiplier = getBoxAllowanceMultiplier(approvedMealsPerWeek);
        const mergedBox = mergeBoxOrdersForPortal(orderConfig.boxOrders, multiplier);
        const boxItems = mergedBox.items || {};
        const boxNotes = mergedBox.itemNotes || {};
        const sortedBoxCategories = sortActiveCategories(categories);

        sections.push({
            title: multiplier > 1 ? `Your box · ${multiplier} authorized` : 'Your box',
            items: [],
            variant: 'box-intro',
        });

        for (const cat of sortedBoxCategories) {
            const catName = cat.name?.replace(/^\[Preview\]\s*/i, '').trim() || 'Category';
            const used = getBoxCategoryPointsUsed(cat.id, boxItems, menuItems, mergedBox, activeCategoryIds);
            const required = getBoxCategoryRequiredQuota(
                cat,
                mergedBox.boxTypeId,
                boxQuotas,
                multiplier,
            );

            if (required === null && used <= 0) continue;

            const categoryItems: LineRow[] = [];
            Object.entries(boxItems).forEach(([itemId, qty]) => {
                const q = Number(qty) || 0;
                if (q <= 0) return;
                const item = menuItems.find((i) => i.id === itemId);
                if (!item || item.categoryId !== cat.id) return;
                if (!isMenuItemAvailableForBox(item, mergedBox, activeCategoryIds)) return;
                const remove: RemoveTarget | undefined =
                    setOrderConfig ? { kind: 'box', itemId } : undefined;
                const ptsEach = item.quotaValue ?? 1;
                const linePts = ptsEach * q;
                const pointsLabel =
                    q > 1
                        ? `${ptsEach} ${ptsEach === 1 ? 'pt' : 'pts'} each · ${linePts} pts total`
                        : `${ptsEach} ${ptsEach === 1 ? 'pt' : 'pts'} each`;
                categoryItems.push({
                    itemId,
                    name: item.name,
                    qty: q,
                    note: boxNotes[itemId],
                    value: getItemPoints(item) * q,
                    sortOrder: item.sortOrder ?? 0,
                    remove,
                    pointsLabel,
                    imageUrl: item.imageUrl,
                });
            });

            sections.push({
                title: formatBoxCategorySectionTitle(catName, used, required),
                items: categoryItems.sort(
                    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
                ),
                variant: 'box-category',
            });
        }
    }

    return (
        <div className={styles.summaryColumn}>
            <div className={styles.summaryHeader}>
                <ShoppingCart size={20} color="var(--color-primary)" />
                <h2 className={styles.summaryTitle}>Order Summary</h2>
            </div>

            <div className={styles.summarySections}>
                {sections.length === 0 ? (
                    <div style={{
                        textAlign: 'center',
                        color: 'var(--text-tertiary)',
                        fontStyle: 'italic',
                        padding: '24px 0'
                    }}>
                        Your cart is empty.
                    </div>
                ) : (
                    sections.map((section, idx) => (
                        <div key={idx} className="summary-section">
                            <h3
                                className={
                                    section.variant === 'box-intro'
                                        ? styles.summaryBoxIntro
                                        : section.variant === 'box-category'
                                          ? styles.summaryBoxCategoryHead
                                          : undefined
                                }
                                style={
                                    section.variant
                                        ? undefined
                                        : {
                                              fontSize: '0.9rem',
                                              fontWeight: 600,
                                              marginBottom: '12px',
                                              color: 'var(--text-primary)',
                                              backgroundColor: 'var(--bg-app)',
                                              padding: '6px 10px',
                                              borderRadius: '4px',
                                          }
                                }
                            >
                                {section.title}
                            </h3>
                            {section.items.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {section.items.map((item, i) => {
                                    const identityContent = (
                                        <>
                                            {showItemThumbnails && (
                                                item.imageUrl ? (
                                                    <img
                                                        src={item.imageUrl}
                                                        alt=""
                                                        style={{
                                                            width: 48,
                                                            height: 48,
                                                            borderRadius: 6,
                                                            objectFit: 'cover',
                                                            flexShrink: 0,
                                                        }}
                                                    />
                                                ) : (
                                                    <PortalFoodImagePlaceholder size="sm" />
                                                )
                                            )}
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                                                <span className={styles.summaryItemName}>
                                                    {item.name}
                                                </span>
                                                {item.pointsLabel ? (
                                                    <span className={styles.summaryItemMeta}>
                                                        {item.pointsLabel}
                                                    </span>
                                                ) : item.categoryName ? (
                                                    <span className={styles.summaryItemMeta}>
                                                        {item.categoryName} · {item.value}{' '}
                                                        {item.value === 1 ? 'pt' : 'pts'} used
                                                    </span>
                                                ) : null}
                                            </div>
                                        </>
                                    );
                                    return (
                                    <div key={i} style={{
                                        paddingLeft: '10px',
                                        borderLeft: '2px solid var(--border-color)'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                                            {onItemNavigate ? (
                                                <button
                                                    type="button"
                                                    className={styles.summaryItemNavigate}
                                                    onClick={() => onItemNavigate(item.itemId)}
                                                    aria-label={`View ${item.name} in menu`}
                                                >
                                                    {identityContent}
                                                </button>
                                            ) : (
                                                <div style={{ display: 'flex', gap: '10px', flex: 1, minWidth: 0 }}>
                                                    {identityContent}
                                                </div>
                                            )}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                                {setOrderConfig && item.remove && (
                                                    <button
                                                        type="button"
                                                        aria-label={`Decrease quantity of ${item.name}`}
                                                        onClick={() =>
                                                            setOrderConfig((prev: any) =>
                                                                applyRemoveOne(
                                                                    prev,
                                                                    item.remove!,
                                                                    approvedMealsPerWeek,
                                                                ),
                                                            )
                                                        }
                                                        style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            width: '28px',
                                                            height: '28px',
                                                            padding: 0,
                                                            borderRadius: '8px',
                                                            border: '1px solid var(--border-color)',
                                                            background: 'var(--bg-surface)',
                                                            color: 'var(--text-primary)',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        <Minus size={14} strokeWidth={2.5} aria-hidden />
                                                    </button>
                                                )}
                                                <span style={{
                                                    background: 'var(--bg-surface-active)',
                                                    fontSize: '0.8rem',
                                                    fontWeight: 600,
                                                    padding: '2px 6px',
                                                    borderRadius: '12px',
                                                    minWidth: '24px',
                                                    textAlign: 'center'
                                                }}>
                                                    {item.qty}
                                                </span>
                                            </div>
                                        </div>
                                        {item.note && (
                                            <div style={{
                                                fontSize: '0.8rem',
                                                color: 'var(--text-tertiary)',
                                                marginTop: '4px',
                                                fontStyle: 'italic'
                                            }}>
                                                Note: "{item.note}"
                                            </div>
                                        )}
                                    </div>
                                    );
                                })}
                            </div>
                            ) : null}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

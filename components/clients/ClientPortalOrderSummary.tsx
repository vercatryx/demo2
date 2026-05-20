'use client';

import React, { useMemo, type Dispatch, type SetStateAction } from 'react';
import { Vendor, MenuItem, MealCategory, MealItem, ItemCategory } from '@/lib/types';
import { getItemPoints } from '@/lib/utils';
import { ShoppingCart, Minus } from 'lucide-react';
import styles from './ClientPortal.module.css';

type RemoveTarget =
    | { kind: 'food'; blockIndex: number; itemId: string; day?: string }
    | { kind: 'meal'; mealKey: string; itemId: string }
    | { kind: 'box'; boxIndex: number; itemId: string };

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

function decrementBoxItem(prev: any, boxIndex: number, itemId: string): any {
    const boxes = prev?.boxOrders;
    if (!Array.isArray(boxes) || !boxes[boxIndex]) return prev;
    const newConfig = { ...prev, boxOrders: [...boxes] };
    const box = { ...newConfig.boxOrders[boxIndex] };
    const items = { ...(box.items || {}) };
    const notes = { ...(box.itemNotes || {}) };
    const cur = Number(items[itemId]) || 0;
    const next = Math.max(0, cur - 1);
    if (next <= 0) {
        delete items[itemId];
        delete notes[itemId];
    } else {
        items[itemId] = next;
    }
    box.items = items;
    box.itemNotes = notes;
    newConfig.boxOrders[boxIndex] = box;
    return newConfig;
}

function applyRemoveOne(prev: any, target: RemoveTarget): any {
    switch (target.kind) {
        case 'food':
            return decrementFoodVendorItem(prev, target.blockIndex, target.itemId, target.day);
        case 'meal':
            return decrementMealItem(prev, target.mealKey, target.itemId);
        case 'box':
            return decrementBoxItem(prev, target.boxIndex, target.itemId);
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
}

export default function ClientPortalOrderSummary({
    orderConfig,
    vendors,
    menuItems,
    mealCategories,
    mealItems,
    categories = [],
    hideVendorNames = false,
    setOrderConfig
}: Props) {
    const activeMenuItems = useMemo(() => menuItems.filter(i => isItemActive(i)), [menuItems]);
    const activeMealItems = useMemo(() => mealItems.filter(i => isItemActive(i)), [mealItems]);
    const activeVendors = useMemo(() => vendors.filter(v => isVendorActive(v)), [vendors]);
    const activeCategoryIds = useMemo(
        () => new Set((categories || []).filter(c => c.isActive !== false).map(c => c.id)),
        [categories]
    );

    type LineRow = {
        name: string;
        qty: number;
        note?: string;
        value: number;
        sortOrder: number;
        remove?: RemoveTarget;
    };

    const sections: {
        title: string;
        items: LineRow[];
    }[] = [];

    let foodSectionCount = 0;
    if (orderConfig.vendorSelections) {
        orderConfig.vendorSelections.forEach((selection: any, blockIndex: number) => {
            if (!selection.vendorId) return;
            const vendor = activeVendors.find(v => v.id === selection.vendorId);
            if (!vendor) return;
            foodSectionCount += 1;

            const vendorId = selection.vendorId;
            const itemsList: LineRow[] = [];

            const addItem = (itemId: string, qty: number, note?: string, day?: string) => {
                const item = activeMenuItems.find(i => i.id === itemId);
                const matchVendor = item && (item as any).vendorId === vendorId;
                const ok = !!item && matchVendor && qty > 0;
                if (ok && item) {
                    const remove: RemoveTarget | undefined =
                        setOrderConfig ?
                            day ?
                                { kind: 'food', blockIndex, itemId, day }
                            :   { kind: 'food', blockIndex, itemId }
                        :   undefined;
                    itemsList.push({
                        name: item.name,
                        qty: qty,
                        note: note,
                        value: getItemPoints(item) * qty,
                        sortOrder: item.sortOrder ?? 0,
                        remove
                    });
                }
            };

            if (selection.itemsByDay && selection.selectedDeliveryDays) {
                for (const day of selection.selectedDeliveryDays) {
                    const dayItems = selection.itemsByDay[day] || {};
                    const dayNotes = selection.itemNotesByDay?.[day] || {};

                    Object.entries(dayItems).forEach(([itemId, qty]) => {
                        const q = Number(qty) || 0;
                        if (q <= 0) return;
                        const note = dayNotes[itemId];
                        const item = activeMenuItems.find(i => i.id === itemId);
                        const matchVendor = item && (item as any).vendorId === vendorId;
                        if (item && matchVendor) {
                            const remove: RemoveTarget | undefined =
                                setOrderConfig ?
                                    { kind: 'food', blockIndex, itemId, day }
                                :   undefined;
                            itemsList.push({
                                name: `${item.name} (${day})`,
                                qty: q,
                                note: note as string,
                                value: getItemPoints(item) * q,
                                sortOrder: item.sortOrder ?? 0,
                                remove
                            });
                        }
                    });
                }
            } else if (selection.items) {
                const notes = selection.itemNotes || {};
                Object.entries(selection.items).forEach(([itemId, qty]) => {
                    addItem(itemId, Number(qty), notes[itemId]);
                });
            }

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

            const mealLabel = config.mealType || mealKey;
            sections.push({
                title: `${mealLabel} Order`,
                items: itemsList.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
            });
        });
    }

    if (orderConfig.boxOrders && orderConfig.serviceType === 'Boxes') {
        orderConfig.boxOrders.forEach((box: any, index: number) => {
            const itemsList: LineRow[] = [];

            if (box.items) {
                const notes = box.itemNotes || {};
                Object.entries(box.items).forEach(([itemId, qty]) => {
                    const q = Number(qty) || 0;
                    if (q <= 0) return;
                    const item = menuItems.find(i => i.id === itemId);
                    if (!item) return;
                    if (!isMenuItemAvailableForBox(item, box, activeCategoryIds)) return;
                    const remove: RemoveTarget | undefined =
                        setOrderConfig ? { kind: 'box', boxIndex: index, itemId } : undefined;
                    itemsList.push({
                        name: item.name,
                        qty: q,
                        note: notes[itemId],
                        value: getItemPoints(item) * q,
                        sortOrder: item.sortOrder ?? 0,
                        remove
                    });
                });
            }

            sections.push({
                title: `Box #${index + 1}`,
                items: itemsList.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
            });
        });
    }


    return (
        <div className={styles.summaryColumn}>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '24px',
                paddingBottom: '16px',
                borderBottom: '1px solid var(--border-color)'
            }}>
                <ShoppingCart size={20} color="var(--color-primary)" />
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Order Summary</h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
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
                            <h3 style={{
                                fontSize: '0.9rem',
                                fontWeight: 600,
                                marginBottom: '12px',
                                color: 'var(--text-primary)',
                                backgroundColor: 'var(--bg-app)',
                                padding: '6px 10px',
                                borderRadius: '4px'
                            }}>
                                {section.title}
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {section.items.map((item, i) => (
                                    <div key={i} style={{
                                        paddingLeft: '10px',
                                        borderLeft: '2px solid var(--border-color)'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                                            <span style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                                                {item.name}
                                            </span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                                {setOrderConfig && item.remove && (
                                                    <button
                                                        type="button"
                                                        aria-label={`Decrease quantity of ${item.name}`}
                                                        onClick={() =>
                                                            setOrderConfig((prev: any) => applyRemoveOne(prev, item.remove!))
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
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

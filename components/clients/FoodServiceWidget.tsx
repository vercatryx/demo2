'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { ClientProfile, Vendor, MenuItem, MealCategory, MealItem } from '@/lib/types';
import { isMeetingMinimum, isMeetingExactTarget, isExceedingMaximum, getItemPoints } from '@/lib/utils';
import { Plus, Trash2, Calendar, Check, AlertTriangle, MessageSquare, Info, ChevronRight } from 'lucide-react';
import { calculateVendorEffectiveDate, sortWeekdays } from '@/lib/order-dates';
import TextareaAutosize from 'react-textarea-autosize';
import {
    buildFoodCatalogSearchHits,
    filterFoodCatalogSearchHits,
    type FoodCatalogSearchHit,
} from '@/lib/food-catalog-search';
import {
    getItemQtyInVendorSelection,
    getSelectedFoodItemIdsFromOrderConfig,
    shouldShowFoodItemToViewer,
} from '@/lib/food-item-phaseout';
import styles from './ClientProfile.module.css';
import MenuItemCard, { PORTAL_INCREMENT_BLOCKED_MESSAGE } from './MenuItemCard';

function mergeDeliveryDayOrdersToVendorSelections(config: any): any[] {
    let existingSelections = config.vendorSelections ? [...config.vendorSelections] : [];
    if (existingSelections.length === 0 && config.deliveryDayOrders && typeof config.deliveryDayOrders === 'object') {
        const vendorMap = new Map<string, any>();
        for (const day of sortWeekdays(Object.keys(config.deliveryDayOrders))) {
            const dayOrder = config.deliveryDayOrders[day];
            const daySelections = dayOrder?.vendorSelections || [];
            for (const sel of daySelections) {
                if (!sel.vendorId) continue;
                if (!vendorMap.has(sel.vendorId)) {
                    vendorMap.set(sel.vendorId, {
                        vendorId: sel.vendorId,
                        selectedDeliveryDays: [],
                        itemsByDay: {},
                        itemNotesByDay: {},
                    });
                }
                const v = vendorMap.get(sel.vendorId)!;
                if (!v.selectedDeliveryDays.includes(day)) v.selectedDeliveryDays.push(day);
                v.itemsByDay[day] = sel.items || {};
                if (!v.itemNotesByDay) v.itemNotesByDay = {};
                v.itemNotesByDay[day] = sel.itemNotes || {};
            }
        }
        existingSelections = Array.from(vendorMap.values());
    }
    return existingSelections;
}

/** Flatten deliveryDayOrders into vendorSelections while preserving empty placeholder blocks. */
function normalizeConfigForVendorEditing(config: any): any {
    const newConfig = { ...config };
    let selections = (config.vendorSelections || []).map((s: any) => ({ ...s }));

    if (config.deliveryDayOrders && typeof config.deliveryDayOrders === 'object') {
        for (const day of sortWeekdays(Object.keys(config.deliveryDayOrders))) {
            const daySelections = config.deliveryDayOrders[day]?.vendorSelections || [];
            for (const sel of daySelections) {
                if (!sel?.vendorId) continue;
                let idx = selections.findIndex((s: any) => s.vendorId === sel.vendorId);
                if (idx < 0) {
                    selections.push({
                        vendorId: sel.vendorId,
                        selectedDeliveryDays: [day],
                        itemsByDay: { [day]: sel.items || {} },
                        itemNotesByDay: { [day]: sel.itemNotes || {} },
                        items: {},
                        itemNotes: {},
                    });
                } else {
                    const block = { ...selections[idx] };
                    const days = [...(block.selectedDeliveryDays || [])];
                    if (!days.includes(day)) days.push(day);
                    block.selectedDeliveryDays = days;
                    block.itemsByDay = { ...(block.itemsByDay || {}), [day]: sel.items || {} };
                    block.itemNotesByDay = { ...(block.itemNotesByDay || {}), [day]: sel.itemNotes || {} };
                    selections[idx] = block;
                }
            }
        }
        delete newConfig.deliveryDayOrders;
    }

    newConfig.vendorSelections = selections;
    return newConfig;
}

function createVendorSelectionPatch(vendors: Vendor[], vendorId: string, existing?: any): any {
    const vendor = vendors.find((v) => v.id === vendorId);
    const autoSelectDay = vendor?.deliveryDays?.length === 1 ? vendor.deliveryDays[0] : null;
    const vendorChanged = !existing?.vendorId || existing.vendorId !== vendorId;

    return {
        ...existing,
        vendorId,
        items: vendorChanged ? {} : (existing?.items || {}),
        itemsByDay: vendorChanged
            ? (autoSelectDay ? { [autoSelectDay]: {} } : {})
            : (existing?.itemsByDay || (autoSelectDay ? { [autoSelectDay]: existing?.items || {} } : {})),
        itemNotes: vendorChanged ? {} : (existing?.itemNotes || {}),
        itemNotesByDay: vendorChanged ? {} : (existing?.itemNotesByDay || {}),
        selectedDeliveryDays: vendorChanged
            ? (autoSelectDay ? [autoSelectDay] : [])
            : (existing?.selectedDeliveryDays || (autoSelectDay ? [autoSelectDay] : [])),
    };
}

function vendorBlockNeedsDeliveryDays(vendors: Vendor[], selection: any): boolean {
    const vendor = vendors.find((v) => v.id === selection?.vendorId);
    const hasMultipleDays = (vendor?.deliveryDays?.length ?? 0) > 1;
    const selectedDays = selection?.selectedDeliveryDays || [];
    return hasMultipleDays && selectedDays.length === 0;
}

/** Find or create a vendor block index; does not set vendorId (use handleVendorSelectionChange for that). */
function resolveVendorBlockForSearch(
    config: any,
    targetVendorId: string,
): { nextConfig: any; vendorIndex: number } {
    const normalized = normalizeConfigForVendorEditing(config);
    let selections = [...(normalized.vendorSelections || [])];

    let vendorIndex = selections.findIndex((s: any) => s.vendorId === targetVendorId);
    if (vendorIndex < 0) {
        const emptyIndex = selections.findIndex((s: any) => !s?.vendorId);
        if (emptyIndex >= 0) {
            vendorIndex = emptyIndex;
        } else {
            vendorIndex = selections.length;
            selections.push({ vendorId: '', items: {} });
        }
    }

    normalized.vendorSelections = selections;
    return { nextConfig: normalized, vendorIndex };
}

interface Props {
    orderConfig: any;
    setOrderConfig: (config: any) => void;
    client: ClientProfile;
    vendors: Vendor[];
    menuItems: MenuItem[];
    mealCategories: MealCategory[];
    mealItems: MealItem[];
    settings?: any; // AppSettings for take effect date
    isClientPortal?: boolean;
    /** When true, phaseout items are hidden unless already on the client's order. */
    hidePhaseoutUnlessOnOrder?: boolean;
    allowVendorSelection?: boolean;
    /** When provided (e.g. from client portal), use this instead of client.serviceType for UI. Order's type is source of truth. */
    serviceType?: string;
    validationStatus?: {
        isValid: boolean;
        totalValue: number;
        error: string | null;
    };
}

export default function FoodServiceWidget({
    orderConfig,
    setOrderConfig,
    client,
    vendors,
    menuItems,
    mealCategories,
    mealItems,
    settings,
    isClientPortal,
    hidePhaseoutUnlessOnOrder = isClientPortal === true,
    allowVendorSelection: allowVendorSelectionProp,
    serviceType: effectiveServiceType,
    validationStatus
}: Props) {
    /** Client portal must opt in per session (staff admin); default is locked when `isClientPortal` is true. */
    const allowVendorSelection =
        allowVendorSelectionProp !== undefined ? allowVendorSelectionProp : isClientPortal !== true;

    const serviceType = effectiveServiceType ?? client.serviceType;

    /** Client portal: user-facing copy says “kitchen facilities” instead of “vendor”. */
    const useKitchenFacilityTerms = isClientPortal === true;
    const facilityUi = useKitchenFacilityTerms
        ? {
              sectionLabel: 'Kitchen facilities',
              selectPlaceholder: 'Select kitchen facilities...',
              collapsedShelfHint: 'Select kitchen facilities...',
              mealAssignedLabel: 'Kitchen facilities',
          }
        : {
              sectionLabel: 'Vendor',
              selectPlaceholder: 'Select Vendor...',
              collapsedShelfHint: 'Select Vendor...',
              mealAssignedLabel: 'Vendor',
          };

    // --- EFFECTIVE DATE BANNER LOGIC ---
    const renderEffectiveDateBanner = () => {
        if (!orderConfig) return null;

        const uniqueVendorIds = new Set<string>();
        // Collect vendors from either format
        if (orderConfig.deliveryDayOrders) {
            Object.values(orderConfig.deliveryDayOrders).forEach((dayOrder: any) => {
                if (dayOrder.vendorSelections) {
                    dayOrder.vendorSelections.forEach((s: any) => s.vendorId && uniqueVendorIds.add(s.vendorId));
                }
            });
        } else if (orderConfig.vendorSelections) {
            orderConfig.vendorSelections.forEach((s: any) => s.vendorId && uniqueVendorIds.add(s.vendorId));
        }

        const messages: React.ReactNode[] = [];
        uniqueVendorIds.forEach(vId => {
            const v = vendors.find(vend => vend.id === vId);
            if (v) {
                const cutoff = v.cutoffDays || 0;
                const effectiveDate = calculateVendorEffectiveDate(cutoff);
                const dateString = effectiveDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
                messages.push(
                    <div key={v.id}>
                        Changes for {useKitchenFacilityTerms ? 'kitchen facility ' : ''}
                        <strong>{v.name}</strong> will take effect from <strong>{dateString}</strong>.
                    </div>
                );
            }
        });

        if (messages.length > 0) {
            return (
                <div className={styles.alert} style={{ marginBottom: '1rem', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                    <Info size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div style={{ fontSize: '0.9rem', lineHeight: '1.4' }}>
                        {messages}
                    </div>
                </div>
            );
        }
        return null;
    };

    // -- LOGIC HELPERS --

    /** Normalize item delivery days and check if item is allowed on the given day. Hide item when restricted to other days. */
    function isItemAllowedOnDay(item: MenuItem, day: string): boolean {
        const raw = item.deliveryDays;
        const days = Array.isArray(raw) ? raw : (raw ? [raw] : []);
        if (days.length === 0) return true;
        return days.includes(day);
    }

    /** Filter vendor items to only those allowed on the given day (or all if no day). */
    function getVendorMenuItemsForDay(
        vendorId: string,
        day: string | null,
        selection?: any,
    ): MenuItem[] {
        const list = menuItems
            .filter(i => {
                if (i.vendorId !== vendorId) return false;
                const qty = selection ? getItemQtyInVendorSelection(selection, i.id, day) : 0;
                return shouldShowFoodItemToViewer(i, {
                    hidePhaseoutUnlessOnOrder,
                    existingQty: qty,
                    itemKind: 'menu',
                });
            })
            .sort((a, b) => {
                const sortOrderA = a.sortOrder ?? 0;
                const sortOrderB = b.sortOrder ?? 0;
                if (sortOrderA !== sortOrderB) return sortOrderA - sortOrderB;
                return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
            });
        if (!day) return list;
        return list.filter(i => isItemAllowedOnDay(i, day));
    }

    function getVendorMenuItems(vendorId: string, selection?: any, day: string | null = null) {
        return getVendorMenuItemsForDay(vendorId, day, selection);
    }

    function getVendorSelectionsForDay(day: string | null): any[] {
        if (!orderConfig.deliveryDayOrders) {
            return orderConfig.vendorSelections || [];
        }
        if (day && orderConfig.deliveryDayOrders[day]) {
            return orderConfig.deliveryDayOrders[day].vendorSelections || [];
        }
        // If getting all (null) but in multi-day format, we need to flatten/combine.
        let allSelections: any[] = [];
        if (orderConfig.deliveryDayOrders) {
            Object.values(orderConfig.deliveryDayOrders).forEach((dayOrder: any) => {
                if (dayOrder.vendorSelections) {
                    allSelections = [...allSelections, ...dayOrder.vendorSelections];
                }
            });
        }
        return allSelections;
    }

    function getVendorMealCount(vendorId: string, selection: any): number {
        if (!selection) return 0;
        // Multi-day logic
        if (selection.itemsByDay && selection.selectedDeliveryDays) {
            let total = 0;
            for (const deliveryDay of selection.selectedDeliveryDays) {
                const dayItems = selection.itemsByDay[deliveryDay] || {};
                total += Object.entries(dayItems).reduce((sum: number, [itemId, qty]) => {
                    const item = menuItems.find(i => i.id === itemId);
                    const multiplier = getItemPoints(item);
                    const val = ((Number(qty) || 0) * multiplier);
                    return sum + val;
                }, 0);
            }
            return total;
        }

        // Normal items structure
        if (!selection.items) return 0;
        let total = 0;

        // Calculate Days Count for Flat Mode multiplier (matching ClientPortalInterface validation)
        const daysCount = (selection.selectedDeliveryDays && selection.selectedDeliveryDays.length > 0)
            ? selection.selectedDeliveryDays.length
            : ((client as any).delivery_days?.length || 1);

        for (const [itemId, qty] of Object.entries(selection.items)) {
            const item = menuItems.find(i => i.id === itemId);
            const multiplier = getItemPoints(item);
            const val = ((qty as number) || 0) * multiplier * daysCount;
            total += val;
        }
        return total;
    }

    function getVendorMealCountForDay(vendorId: string, selection: any, day: string): number {
        if (!selection || !selection.itemsByDay || !selection.itemsByDay[day]) return 0;

        const dayItems = selection.itemsByDay[day] || {};
        return Object.entries(dayItems).reduce((sum: number, [itemId, qty]) => {
            const item = menuItems.find(i => i.id === itemId);
            const multiplier = getItemPoints(item);
            return sum + ((Number(qty) || 0) * multiplier);
        }, 0);
    }

    function computeLiveMealTotal(): number {
        let total = 0;
        const countedItemIdsGlobally = new Set<string>();

        // If editing in 'vendorSelections' mode (transient state before save)
        if (orderConfig.vendorSelections) {
            for (const selection of orderConfig.vendorSelections) {
                const count = getVendorMealCount(selection.vendorId, selection);
                total += count;

                // Track IDs to prevent overlap with mealSelections
                if (selection.itemsByDay) {
                    Object.values(selection.itemsByDay).forEach((dayItems: any) => {
                        Object.keys(dayItems).forEach(id => countedItemIdsGlobally.add(id));
                    });
                } else if (selection.items) {
                    Object.keys(selection.items).forEach(id => countedItemIdsGlobally.add(id));
                }
            }
        } else if (orderConfig.deliveryDayOrders) {
            // If in saved/multi-day format
            for (const day of Object.keys(orderConfig.deliveryDayOrders)) {
                // simple summation of items in that day
                const daySelections = orderConfig.deliveryDayOrders[day].vendorSelections || [];
                for (const sel of daySelections) {
                    const items = sel.items || {};
                    total += Object.entries(items).reduce((sum: number, [itemId, qty]) => {
                        countedItemIdsGlobally.add(itemId);
                        const item = menuItems.find(i => i.id === itemId);
                        const multiplier = getItemPoints(item);
                        return sum + ((Number(qty) || 0) * multiplier);
                    }, 0);
                }
            }
        }

        // Include meal selections (Breakfast, Lunch, etc.)
        if (orderConfig.mealSelections) {
            for (const config of Object.values(orderConfig.mealSelections) as any[]) {
                if (config.items) {
                    for (const [itemId, qty] of Object.entries(config.items)) {
                        // OMIT if already counted in vendor selections
                        if (countedItemIdsGlobally.has(itemId)) continue;

                        const item = mealItems.find(i => i.id === itemId);
                        const multiplier = getItemPoints(item);
                        total += (Number(qty) || 0) * multiplier;
                    }
                }
            }
        }

        return total;
    }

    function getTotalMealCountAllDays(): number {
        // Limit checks must use live orderConfig — validationStatus can lag one render behind edits.
        return computeLiveMealTotal();
    }

    function getSingleIncrementPointCost(
        item: MenuItem | MealItem,
        selection?: any,
        day?: string,
    ): number {
        const points = getItemPoints(item);
        if (day && selection?.itemsByDay) {
            return points;
        }
        if (selection && selection.items !== undefined && !selection.itemsByDay) {
            const daysCount =
                selection.selectedDeliveryDays?.length > 0
                    ? selection.selectedDeliveryDays.length
                    : (client as any).delivery_days?.length || 1;
            return points * daysCount;
        }
        return points;
    }

    function wouldAddingPointsExceedLimit(additionalPoints: number): boolean {
        const limit = client.approvedMealsPerWeek || 0;
        if (limit <= 0) return false;
        if (serviceType !== 'Food' && serviceType !== 'Meal') return false;
        if (additionalPoints <= 0) return false;
        return isExceedingMaximum(getTotalMealCountAllDays() + additionalPoints, limit);
    }

    function canIncrementItem(item: MenuItem | MealItem, selection?: any, day?: string): boolean {
        return !wouldAddingPointsExceedLimit(getSingleIncrementPointCost(item, selection, day));
    }

    const [limitBlockedNoticeOpen, setLimitBlockedNoticeOpen] = useState(false);

    const notifyIncrementBlocked = useCallback(() => {
        setLimitBlockedNoticeOpen(true);
    }, []);

    // --- MEAL SELECTION HANDLERS ---

    function handleRemoveMeal(uniqueKey: string) {
        setOrderConfig((prev: any) => {
            const newConfig = { ...prev };
            if (newConfig.mealSelections) {
                delete newConfig.mealSelections[uniqueKey];
                if (Object.keys(newConfig.mealSelections).length === 0) {
                    newConfig.mealSelections = {};
                }
            }
            return newConfig;
        });
    }

    function handleMealVendorChange(uniqueKey: string, vendorId: string) {
        setOrderConfig((prev: any) => {
            const newConfig = { ...prev };
            if (newConfig.mealSelections && newConfig.mealSelections[uniqueKey]) {
                const newSelections = { ...newConfig.mealSelections };
                newSelections[uniqueKey] = {
                    ...newSelections[uniqueKey],
                    vendorId
                };
                newConfig.mealSelections = newSelections;
            }
            return newConfig;
        });
    }

    function handleMealItemChange(uniqueKey: string, itemId: string, qty: number, note?: string) {
        const currentQty = Number(orderConfig.mealSelections?.[uniqueKey]?.items?.[itemId] || 0);
        if (isClientPortal && qty > currentQty) {
            const item = mealItems.find((i) => i.id === itemId);
            if (item) {
                const addedUnits = qty - currentQty;
                const cost = getSingleIncrementPointCost(item) * addedUnits;
                if (wouldAddingPointsExceedLimit(cost)) return;
            }
        }
        setOrderConfig((prev: any) => {
            const newConfig = { ...prev };
            if (newConfig.mealSelections && newConfig.mealSelections[uniqueKey]) {
                const updatedItems = { ...newConfig.mealSelections[uniqueKey].items };
                const updatedNotes = { ...newConfig.mealSelections[uniqueKey].itemNotes };

                if (qty > 0) {
                    updatedItems[itemId] = qty;
                    if (note !== undefined) {
                        updatedNotes[itemId] = note;
                    }
                } else {
                    delete updatedItems[itemId];
                    delete updatedNotes[itemId];
                }

                const newSelections = { ...newConfig.mealSelections };
                newSelections[uniqueKey] = {
                    ...newSelections[uniqueKey],
                    items: updatedItems,
                    itemNotes: updatedNotes
                };
                newConfig.mealSelections = newSelections;
            }
            return newConfig;
        });
    }

    // --- VENDOR SELECTION HANDLERS (Generic/Lunch) ---

    function handleAddVendorBlock() {
        setOrderConfig((prev: any) => {
            const newConfig = { ...prev };
            const existingSelections = mergeDeliveryDayOrdersToVendorSelections(newConfig);
            newConfig.vendorSelections = [...existingSelections, { vendorId: '', items: {} }];
            delete newConfig.deliveryDayOrders;
            return newConfig;
        });
    }

    function handleRemoveVendorBlock(index: number) {
        setOrderConfig((prev: any) => {
            const newConfig = { ...prev };
            if (newConfig.vendorSelections) {
                const updated = [...newConfig.vendorSelections];
                updated.splice(index, 1);
                newConfig.vendorSelections = updated;
            }
            return newConfig;
        });
    }

    function handleVendorSelectionChange(index: number, vendorId: string) {
        setOrderConfig((prev: any) => {
            const newConfig = normalizeConfigForVendorEditing(prev);
            const updated = [...(newConfig.vendorSelections || [])];
            while (updated.length <= index) {
                updated.push({ vendorId: '', items: {} });
            }
            updated[index] = createVendorSelectionPatch(vendors, vendorId, updated[index]);
            newConfig.vendorSelections = updated;
            return newConfig;
        });
    }

    function handleVendorItemChange(blockIndex: number, itemId: string, qty: number, day?: string, note?: string) {
        const block = orderConfig.vendorSelections?.[blockIndex];
        const currentQty = (() => {
            if (!block) return 0;
            if (day && block.itemsByDay?.[day]) return block.itemsByDay[day][itemId] || 0;
            return block.items?.[itemId] || 0;
        })();
        if (isClientPortal && qty > currentQty) {
            const item = menuItems.find((i) => i.id === itemId);
            if (item) {
                const addedUnits = qty - currentQty;
                const cost = getSingleIncrementPointCost(item, block, day) * addedUnits;
                if (wouldAddingPointsExceedLimit(cost)) return;
            }
        }

        setOrderConfig((prev: any) => {
            const newConfig = { ...prev };
            if (newConfig.vendorSelections && newConfig.vendorSelections[blockIndex]) {
                const updated = [...newConfig.vendorSelections];
                const block = { ...updated[blockIndex] };

                // Handle multi-day format (itemsByDay) — mirror notes to flat map too
                // so refresh/read paths that prefer one map don't drop dropdown picks.
                if (day && block.selectedDeliveryDays && block.selectedDeliveryDays.length > 0) {
                    if (!block.itemsByDay) block.itemsByDay = {};
                    if (!block.itemsByDay[day]) block.itemsByDay[day] = {};

                    if (!block.itemNotesByDay) block.itemNotesByDay = {};
                    if (!block.itemNotesByDay[day]) block.itemNotesByDay[day] = {};
                    const itemNotes = { ...(block.itemNotes || {}) };

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
                    } else {
                        delete block.itemsByDay[day][itemId];
                        delete block.itemNotesByDay[day][itemId];
                        delete itemNotes[itemId];
                    }
                    block.itemNotes = itemNotes;
                } else {
                    // Handle single-day format (items)
                    const items = { ...block.items };
                    const itemNotes = { ...(block.itemNotes || {}) };

                    if (qty > 0) {
                        items[itemId] = qty;
                        if (note !== undefined) {
                            if (note.trim() === '') {
                                delete itemNotes[itemId];
                            } else {
                                itemNotes[itemId] = note;
                            }
                        }
                    } else {
                        delete items[itemId];
                        delete itemNotes[itemId];
                    }
                    block.items = items;
                    block.itemNotes = itemNotes;
                }

                updated[blockIndex] = block;
                newConfig.vendorSelections = updated;
            }
            return newConfig;
        });
    }

    function handleDeliveryDayToggle(blockIndex: number, day: string) {

        setOrderConfig((prev: any) => {
            const newConfig = { ...prev };
            if (newConfig.vendorSelections && newConfig.vendorSelections[blockIndex]) {
                const updated = [...newConfig.vendorSelections];
                const block = { ...updated[blockIndex] };

                // Deep copy selectedDeliveryDays to avoid mutation
                block.selectedDeliveryDays = block.selectedDeliveryDays ? [...block.selectedDeliveryDays] : [];

                const dayIndex = block.selectedDeliveryDays.indexOf(day);
                if (dayIndex > -1) {
                    // Remove day
                    block.selectedDeliveryDays.splice(dayIndex, 1);

                    // Clean up itemsByDay for this day
                    if (block.itemsByDay) {
                        // Deep copy itemsByDay to avoid mutation
                        block.itemsByDay = { ...block.itemsByDay };
                        if (block.itemsByDay[day]) {
                            delete block.itemsByDay[day];
                        }
                    }

                    // If no days selected, revert to simple items structure
                    if (block.selectedDeliveryDays.length === 0) {
                        delete block.selectedDeliveryDays;
                        delete block.itemsByDay;
                        if (!block.items) block.items = {};
                    }
                } else {
                    // Add day
                    block.selectedDeliveryDays.push(day);
                    block.selectedDeliveryDays = sortWeekdays(block.selectedDeliveryDays);

                    // Initialize itemsByDay structure
                    if (!block.itemsByDay) {
                        block.itemsByDay = {};
                    } else {
                        block.itemsByDay = { ...block.itemsByDay };
                    }

                    if (!block.itemsByDay[day]) {
                        block.itemsByDay[day] = {};
                    }

                    // Clear the single-day items structure when switching to multi-day
                    if (block.items) {
                        block.items = {};
                    }
                }

                updated[blockIndex] = block;
                newConfig.vendorSelections = updated;
            }
            return newConfig;
        });
    }

    // --- RENDER HELPERS ---

    // State to track active tab for each vendor block
    const [activeDays, setActiveDays] = React.useState<{ [key: number]: string }>({});
    
    // State to track which shelf is open (vendor index or meal uniqueKey)
    const [openShelf, setOpenShelf] = React.useState<string | null>(null);

    const [foodSearchQuery, setFoodSearchQuery] = useState('');
    const [foodSearchOpen, setFoodSearchOpen] = useState(false);
    const [foodSearchError, setFoodSearchError] = useState<string | null>(null);
    const [foodSearchWarning, setFoodSearchWarning] = useState<string | null>(null);
    const [pendingScrollItemId, setPendingScrollItemId] = useState<string | null>(null);
    const [pendingScrollDeliveryDay, setPendingScrollDeliveryDay] = useState<string | null>(null);
    const [highlightedFoodItemId, setHighlightedFoodItemId] = useState<string | null>(null);
    const foodSearchRef = useRef<HTMLDivElement>(null);
    
    // Helper to generate shelf ID
    const getVendorShelfId = (index: number) => `vendor-${index}`;
    const getMealShelfId = (uniqueKey: string) => `meal-${uniqueKey}`;
    
    // Helper to check if a shelf is open
    const isShelfOpen = (shelfId: string) => openShelf === shelfId;
    
    // Helper to toggle shelf
    const toggleShelf = (shelfId: string) => {
        setOpenShelf(openShelf === shelfId ? null : shelfId);
    };

    /** Resolved vendor list for display: prefer vendorSelections; fall back to deliveryDayOrders merge. */
    const getResolvedVendorSelections = (): any[] => {
        if (orderConfig.vendorSelections && orderConfig.vendorSelections.length > 0) {
            return orderConfig.vendorSelections;
        }
        const merged = mergeDeliveryDayOrdersToVendorSelections(orderConfig);
        if (merged.length > 0) return merged;
        return orderConfig.vendorSelections || [];
    };

    const showFoodCatalogSearch = serviceType === 'Food' || serviceType === 'Meal';

    const selectedFoodItemIds = useMemo(
        () => getSelectedFoodItemIdsFromOrderConfig(orderConfig),
        [orderConfig],
    );

    const foodCatalogSearchHits = useMemo(
        () => (
            showFoodCatalogSearch
                ? buildFoodCatalogSearchHits(menuItems, vendors, {
                    hidePhaseoutUnlessOnOrder,
                    selectedItemIds: selectedFoodItemIds,
                })
                : []
        ),
        [showFoodCatalogSearch, menuItems, vendors, hidePhaseoutUnlessOnOrder, selectedFoodItemIds],
    );

    const foodCatalogSearchResults = useMemo(
        () => filterFoodCatalogSearchHits(foodCatalogSearchHits, foodSearchQuery),
        [foodCatalogSearchHits, foodSearchQuery],
    );

    const navigateToSearchHit = useCallback(
        (hit: FoodCatalogSearchHit, vendorIndex: number, selection: any) => {
            setOpenShelf(getVendorShelfId(vendorIndex));
            const vendor = vendors.find((v) => v.id === hit.vendorId);
            const vendorName = vendor?.name ?? 'Kitchen facility';
            if (vendorBlockNeedsDeliveryDays(vendors, selection)) {
                setFoodSearchWarning(
                    `Select at least one delivery day for ${vendorName} to view this item.`,
                );
                setPendingScrollDeliveryDay(null);
                setPendingScrollItemId(hit.itemId);
                return;
            }
            setFoodSearchWarning(null);
            setPendingScrollItemId(hit.itemId);
        },
        [vendors],
    );

    const applyFoodSearchHit = (hit: FoodCatalogSearchHit) => {
        setFoodSearchQuery('');
        setFoodSearchOpen(false);
        setFoodSearchError(null);
        setFoodSearchWarning(null);
        setPendingScrollDeliveryDay(null);

        if (!allowVendorSelection) {
            const selections = getResolvedVendorSelections();
            const existingIndex = selections.findIndex((s: any) => s.vendorId === hit.vendorId);
            if (existingIndex < 0) {
                setFoodSearchError(`This item isn't in your order's menu sections.`);
                return;
            }
            navigateToSearchHit(hit, existingIndex, selections[existingIndex]);
            return;
        }

        const resolved = resolveVendorBlockForSearch(orderConfig, hit.vendorId);
        const existingSelection = resolved.nextConfig.vendorSelections?.[resolved.vendorIndex];
        const alreadyHadVendor = existingSelection?.vendorId === hit.vendorId;
        const vendor = vendors.find((v) => v.id === hit.vendorId);
        const vendorName = vendor?.name ?? 'Kitchen facility';

        let vendorIndex = resolved.vendorIndex;

        // Step 1: ensure block exists (reuse empty slot or existing vendor block).
        flushSync(() => {
            setOrderConfig(resolved.nextConfig);
        });

        // Step 2: same code path as picking from the <select> dropdown.
        flushSync(() => {
            handleVendorSelectionChange(vendorIndex, hit.vendorId);
        });

        const needsDeliveryDays = alreadyHadVendor
            ? vendorBlockNeedsDeliveryDays(vendors, existingSelection)
            : (vendor?.deliveryDays?.length ?? 0) > 1;

        setOpenShelf(getVendorShelfId(vendorIndex));
        if (needsDeliveryDays) {
            setFoodSearchWarning(
                `Select at least one delivery day for ${vendorName} to view this item.`,
            );
            setPendingScrollDeliveryDay(null);
            setPendingScrollItemId(hit.itemId);
            return;
        }
        setFoodSearchWarning(null);
        setPendingScrollItemId(hit.itemId);
    };

    useEffect(() => {
        if (!foodSearchOpen) return;
        const onDocPointer = (e: MouseEvent) => {
            if (!foodSearchRef.current?.contains(e.target as Node)) {
                setFoodSearchOpen(false);
            }
        };
        document.addEventListener('mousedown', onDocPointer);
        return () => document.removeEventListener('mousedown', onDocPointer);
    }, [foodSearchOpen]);

    useEffect(() => {
        if (!pendingScrollItemId || pendingScrollDeliveryDay) return;

        const item = menuItems.find((m) => m.id === pendingScrollItemId);
        if (!item?.vendorId) return;

        const selections = getResolvedVendorSelections();
        const selection = selections.find((s: any) => s.vendorId === item.vendorId);
        if (!selection) return;

        const vendor = vendors.find((v) => v.id === item.vendorId);
        const hasMultipleDays = (vendor?.deliveryDays?.length ?? 0) > 1;
        if (!hasMultipleDays) return;

        const selectedDays: string[] = selection.selectedDeliveryDays || [];
        if (selectedDays.length === 0) return;

        const visibleDays = selectedDays.filter((d) => isItemAllowedOnDay(item, d));
        if (visibleDays.length === 0) return;

        setPendingScrollDeliveryDay(visibleDays[visibleDays.length - 1]);
    }, [
        pendingScrollItemId,
        pendingScrollDeliveryDay,
        orderConfig.vendorSelections,
        orderConfig.deliveryDayOrders,
        menuItems,
        vendors,
    ]);

    useEffect(() => {
        if (!pendingScrollItemId) return;
        const timer = window.setTimeout(() => {
            const daySelector = pendingScrollDeliveryDay
                ? `[data-food-item-id="${pendingScrollItemId}"][data-delivery-day="${pendingScrollDeliveryDay}"]`
                : `[data-food-item-id="${pendingScrollItemId}"]`;
            let el = document.querySelector(daySelector);
            if (!el && pendingScrollDeliveryDay) {
                el = document.querySelector(`[data-food-item-id="${pendingScrollItemId}"]`);
            }
            if (!el) return;

            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            setHighlightedFoodItemId(pendingScrollItemId);
            setPendingScrollItemId(null);
            setPendingScrollDeliveryDay(null);
            setFoodSearchWarning(null);
        }, 200);
        return () => window.clearTimeout(timer);
    }, [
        pendingScrollItemId,
        pendingScrollDeliveryDay,
        openShelf,
        orderConfig.vendorSelections,
        orderConfig.deliveryDayOrders,
    ]);

    useEffect(() => {
        if (!highlightedFoodItemId) return;
        const timer = window.setTimeout(() => setHighlightedFoodItemId(null), 3000);
        return () => window.clearTimeout(timer);
    }, [highlightedFoodItemId]);

    const renderFoodSearchHitLabel = (hit: FoodCatalogSearchHit) => {
        if (hit.itemNumber == null) return hit.label;
        const prefix = `Item#${hit.itemNumber}`;
        if (!hit.label.startsWith(prefix)) return hit.label;
        const rest = hit.label.slice(prefix.length);
        return (
            <>
                <span className={styles.foodCatalogSearchItemNumber}>Item #{hit.itemNumber}</span>
                {rest}
            </>
        );
    };

    const renderFoodCatalogSearch = () => (
        <div ref={foodSearchRef} className={styles.foodCatalogSearch}>
            <label className="sr-only" htmlFor="food-catalog-search">
                Search food items by name or item number
            </label>
            <input
                id="food-catalog-search"
                type="search"
                className={styles.foodCatalogSearchInput}
                placeholder="Search by Item # or name…"
                value={foodSearchQuery}
                autoComplete="off"
                onChange={(e) => {
                    setFoodSearchQuery(e.target.value);
                    setFoodSearchOpen(true);
                    setFoodSearchError(null);
                    setFoodSearchWarning(null);
                }}
                onFocus={() => {
                    if (foodSearchQuery.trim()) setFoodSearchOpen(true);
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                        setFoodSearchOpen(false);
                        return;
                    }
                    if (e.key === 'Enter' && foodCatalogSearchResults[0]) {
                        e.preventDefault();
                        applyFoodSearchHit(foodCatalogSearchResults[0]);
                    }
                }}
            />
            {foodSearchOpen && foodSearchQuery.trim() ? (
                <ul className={styles.foodCatalogSearchResults} role="listbox">
                    {foodCatalogSearchResults.length === 0 ? (
                        <li className={styles.foodCatalogSearchEmpty} role="option">
                            No matching items
                        </li>
                    ) : (
                        foodCatalogSearchResults.map((hit) => (
                            <li key={hit.itemId}>
                                <button
                                    type="button"
                                    role="option"
                                    className={styles.foodCatalogSearchOption}
                                    onClick={() => applyFoodSearchHit(hit)}
                                >
                                    <span className={styles.foodCatalogSearchOptionKind}>Item</span>
                                    {renderFoodSearchHitLabel(hit)}
                                </button>
                            </li>
                        ))
                    )}
                </ul>
            ) : null}
            {foodSearchError ? (
                <p className={styles.foodCatalogSearchError} role="alert">
                    {foodSearchError}
                </p>
            ) : null}
            {foodSearchWarning ? (
                <p className={styles.foodCatalogSearchWarning} role="status">
                    <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden />
                    {foodSearchWarning}
                </p>
            ) : null}
        </div>
    );

    const renderVendorBlocks = () => {
        const selections = getResolvedVendorSelections();

        return (
            <>
                {/* banner moved to sticky header */}
                {selections.map((selection: any, index: number) => {
                    const vendorId = selection.vendorId;
                    const vendor = vendors.find(v => v.id === vendorId);
                    const vendorItems = vendorId ? getVendorMenuItems(vendorId, selection) : [];

                    // Calculate vendor meal count
                    const vendorMealCount = getVendorMealCount(vendorId, selection);
                    const vendorMinimum = vendor?.minimumMeals || 0;
                    const meetsMinimum = vendorMinimum === 0 || isMeetingMinimum(vendorMealCount, vendorMinimum);

                    // Get vendor's delivery days (always Monday → Sunday for display)
                    const vendorDeliveryDays = sortWeekdays(vendor?.deliveryDays || []);
                    const hasMultipleDays = vendorDeliveryDays.length > 1;

                    // Check if multi-day mode is active for this vendor
                    const selectedDays = sortWeekdays(selection.selectedDeliveryDays || []);
                    
                    // Calculate summary info and get selected items (hide items not allowed on any selected/implied day)
                    const selectedItemsForSummary = (() => {
                        const allowedDaysForSummary = selectedDays.length > 0
                            ? selectedDays
                            : (vendorDeliveryDays.length === 1
                                ? vendorDeliveryDays
                                : ((client as any).delivery_days && (client as any).delivery_days.length > 0)
                                    ? (client as any).delivery_days
                                    : []);
                        const isItemAllowedForSummary = (item: MenuItem) => {
                            const raw = item.deliveryDays;
                            const allowed = Array.isArray(raw) ? raw : (raw ? [raw] : []);
                            if (allowed.length === 0) return true;
                            if (allowedDaysForSummary.length === 0) return false;
                            return allowedDaysForSummary.some((d: string) => allowed.includes(d));
                        };
                        const items: Array<{ item: MenuItem; qty: number }> = [];
                        if (selection.itemsByDay && selectedDays.length > 0) {
                            const itemMap = new Map<string, { item: MenuItem; qty: number }>();
                            selectedDays.forEach((day: string) => {
                                const dayItems = selection.itemsByDay[day] || {};
                                Object.entries(dayItems).forEach(([itemId, qty]) => {
                                    const item = menuItems.find(i => i.id === itemId);
                                    if (item && isItemAllowedOnDay(item, day)) {
                                        const existing = itemMap.get(itemId);
                                        if (existing) {
                                            existing.qty += Number(qty);
                                        } else {
                                            itemMap.set(itemId, { item, qty: Number(qty) });
                                        }
                                    }
                                });
                            });
                            return Array.from(itemMap.values());
                        } else if (selection.items) {
                            Object.entries(selection.items).forEach(([itemId, qty]) => {
                                const item = menuItems.find(i => i.id === itemId);
                                if (item && Number(qty) > 0 && isItemAllowedForSummary(item)) {
                                    items.push({ item, qty: Number(qty) });
                                }
                            });
                        }
                        return items;
                    })();
                    
                    const selectedItemsCount = selectedItemsForSummary.length;
                    
                    const shelfId = getVendorShelfId(index);
                    const isOpen = isShelfOpen(shelfId);

                    return (
                        <div key={index} id={`vendor-block-${index}`} className={styles.vendorBlock} style={{
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            overflow: 'hidden',
                            transition: 'all 0.2s ease'
                        }}>
                            {/* Shelf Header - Always Visible */}
                            <div 
                                onClick={() => toggleShelf(shelfId)}
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '12px 16px',
                                    backgroundColor: isOpen ? 'var(--bg-surface-hover)' : 'var(--bg-surface)',
                                    cursor: 'pointer',
                                    borderBottom: isOpen ? '1px solid var(--border-color)' : 'none',
                                    transition: 'background-color 0.2s ease'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, flexWrap: 'wrap' }}>
                                    <span style={{ 
                                        fontWeight: 600, 
                                        color: 'var(--text-primary)',
                                        fontSize: '1rem'
                                    }}>
                                        {!allowVendorSelection
                                            ? `Menu Section ${index + 1}`
                                            : (vendor ? vendor.name : facilityUi.collapsedShelfHint)}
                                    </span>
                                    {vendor && vendorMealCount > 0 && (
                                        <span style={{ 
                                            fontSize: '0.85rem', 
                                            color: 'var(--text-secondary)',
                                            padding: '2px 8px',
                                            backgroundColor: 'var(--bg-surface-hover)',
                                            borderRadius: '4px'
                                        }}>
                                            {vendorMealCount} meals
                                        </span>
                                    )}
                                    {vendor && vendorMinimum > 0 && (
                                        <span style={{ 
                                            fontSize: '0.8rem', 
                                            color: meetsMinimum ? 'var(--color-success)' : 'var(--color-danger)',
                                            padding: '2px 8px',
                                            backgroundColor: meetsMinimum ? '#d1fae5' : '#fee2e2',
                                            borderRadius: '4px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}>
                                            {meetsMinimum ? <Check size={12} /> : <AlertTriangle size={12} />}
                                            {vendorMealCount} / {vendorMinimum} min
                                        </span>
                                    )}
                                    {/* Show selected items with names */}
                                    {vendor && selectedItemsForSummary.length > 0 && (
                                        <div style={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            gap: '4px',
                                            flexWrap: 'wrap',
                                            fontSize: '0.85rem',
                                            color: 'var(--text-secondary)'
                                        }}>
                                            {selectedItemsForSummary.map(({ item, qty }, idx) => (
                                                <span 
                                                    key={item.id}
                                                    style={{
                                                        padding: '2px 8px',
                                                        backgroundColor: 'var(--bg-surface-hover)',
                                                        borderRadius: '4px',
                                                        fontSize: '0.8rem'
                                                    }}
                                                >
                                                    {item.name} {qty > 1 && `(${qty})`}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    {vendor && selectedItemsForSummary.length === 0 && (
                                        <span style={{ 
                                            fontSize: '0.8rem', 
                                            color: 'var(--text-tertiary)',
                                            fontStyle: 'italic'
                                        }}>
                                            No items selected
                                        </span>
                                    )}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {allowVendorSelection && (
                                        <button 
                                            className={`${styles.iconBtn} ${styles.danger}`} 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleRemoveVendorBlock(index);
                                            }}
                                            style={{ padding: '4px 8px' }}
                                            aria-label="Remove kitchen facilities"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                    <div style={{ 
                                        transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                                        transition: 'transform 0.2s ease'
                                    }}>
                                        <ChevronRight size={20} />
                                    </div>
                                </div>
                            </div>
                            
                            {/* Shelf Content - Only visible when open */}
                            {isOpen && (
                                <div style={{ 
                                    padding: '16px',
                                    backgroundColor: 'var(--bg-surface)',
                                    animation: 'fadeIn 0.2s ease'
                                }}>
                                    {/* Kitchen facility / vendor selection */}
                                    {allowVendorSelection && (
                                        <div style={{ marginBottom: '16px' }}>
                                            <label className="label" style={{ marginBottom: '8px' }}>{facilityUi.sectionLabel}</label>
                                            <select
                                                key={`vendor-select-${index}-${vendorId || 'empty'}`}
                                                className="input"
                                                value={vendorId || ''}
                                                onChange={(e) => handleVendorSelectionChange(index, e.target.value)}
                                            >
                                                <option value="">{facilityUi.selectPlaceholder}</option>
                                                {vendors
                                                    .filter(v => {
                                                        if (v.id === vendorId) return true;
                                                        if (!v.serviceTypes.includes('Food') || !v.isActive) return false;

                                                        // Feature: Filter by Client Location (if assigned)
                                                        if (client.locationId) {
                                                            const vendorHasLocation = v.locations?.some(l => l.locationId === client.locationId);
                                                            if (!vendorHasLocation) return false;
                                                        }

                                                        // Feature: Filter out vendors already selected in OTHER blocks
                                                        return !selections.some((s: any, idx: number) => s.vendorId === v.id && idx !== index);
                                                    })
                                                    .map(v => (
                                                        <option key={v.id} value={v.id}>{v.name}</option>
                                                    ))}
                                            </select>
                                        </div>
                                    )}

                                {/* Multi-Day Selection - Toggle Buttons */}
                                {vendorId && hasMultipleDays && (
                                    <div style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '6px',
                                        padding: '8px',
                                        backgroundColor: 'var(--bg-surface-hover)',
                                        borderRadius: '6px',
                                        border: '1px solid var(--border-color)'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                            <Calendar size={14} />
                                            <span style={{ fontWeight: 600 }}>Select Delivery Days:</span>
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                            {vendorDeliveryDays.map(day => {
                                                const isSelected = selectedDays.includes(day);
                                                return (
                                                    <button
                                                        key={day}
                                                        type="button"
                                                        onClick={() => {
                                                            handleDeliveryDayToggle(index, day);
                                                        }}
                                                        style={{
                                                            padding: '6px 14px',
                                                            backgroundColor: isSelected ? 'var(--color-primary)' : 'var(--bg-surface)',
                                                            color: isSelected ? 'white' : 'var(--text-primary)',
                                                            borderRadius: '20px',
                                                            cursor: 'pointer',
                                                            fontSize: '0.85rem',
                                                            fontWeight: isSelected ? 600 : 400,
                                                            border: `2px solid ${isSelected ? 'var(--color-primary)' : 'var(--border-color)'}`,
                                                            transition: 'all 0.2s ease',
                                                            outline: 'none',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '6px'
                                                        }}
                                                    >
                                                        {day}
                                                        {isSelected && <Check size={12} />}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                    {/* Items Display */}
                                    {vendorId && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        {hasMultipleDays && selectedDays.length === 0 ? (
                                            <div className={styles.hint} style={{ textAlign: 'center', padding: '1rem', fontStyle: 'italic', color: 'var(--text-tertiary)' }}>
                                                Please select at least one delivery day to view the menu.
                                            </div>
                                        ) : selectedDays.length > 0 ? (
                                            // Multi-day view - show STACKED menu blocks for each selected day (hide items not allowed on that day)
                                            selectedDays.map((day: string) => {
                                                const visibleItems = getVendorMenuItemsForDay(vendorId, day, selection);

                                                return (
                                                    <div key={day} className="animate-in fade-in slide-in-from-top-1 duration-200" style={{
                                                        border: '1px solid var(--border-color)',
                                                        borderRadius: '8px',
                                                        padding: '16px',
                                                        backgroundColor: 'var(--bg-surface)'
                                                    }}>
                                                        <div style={{
                                                            marginBottom: '12px',
                                                            paddingBottom: '8px',
                                                            borderBottom: '1px solid var(--border-color)',
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            alignItems: 'center'
                                                        }}>
                                                            <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '1rem' }}>
                                                                {day} Menu
                                                            </span>
                                                            {vendorMinimum > 0 && (() => {
                                                                const dayCount = getVendorMealCountForDay(vendorId, selection, day);
                                                                const dayMet = isMeetingMinimum(dayCount, vendorMinimum);
                                                                return (
                                                                    <span style={{
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: '6px',
                                                                        padding: '4px 8px',
                                                                        borderRadius: '6px',
                                                                        backgroundColor: dayMet ? '#d1fae5' : '#fee2e2',
                                                                        color: dayMet ? '#065f46' : '#991b1b',
                                                                        fontSize: '0.85rem',
                                                                        fontWeight: 600
                                                                    }}>
                                                                        {dayMet ? <Check size={14} /> : <AlertTriangle size={14} />}
                                                                        {dayCount} / {vendorMinimum} meals
                                                                    </span>
                                                                );
                                                            })()}
                                                        </div>

                                                        <div className={styles.menuItemsGrid} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                                                            {visibleItems.map(item => {
                                                                const dayItems = selection.itemsByDay?.[day] || {};
                                                                const qty = dayItems[item.id] || 0;
                                                                const dayNotes = selection.itemNotesByDay?.[day] || {};
                                                                const note = dayNotes[item.id] || '';

                                                                return (
                                                                    <MenuItemCard
                                                                        key={item.id}
                                                                        item={item}
                                                                        quantity={qty}
                                                                        note={note}
                                                                        deliveryDay={day}
                                                                        searchHighlighted={highlightedFoodItemId === item.id}
                                                                        incrementDisabled={!canIncrementItem(item, selection, day)}
                                                                        onIncrementBlocked={isClientPortal ? notifyIncrementBlocked : undefined}
                                                                        hidePhaseoutUnlessOnOrder={hidePhaseoutUnlessOnOrder}
                                                                        onQuantityChange={(newQty) => handleVendorItemChange(index, item.id, newQty, day)}
                                                                        onNoteChange={(newNote) => handleVendorItemChange(index, item.id, qty, day, newNote)}
                                                                    />
                                                                );
                                                            })}
                                                            {visibleItems.length === 0 && <span className={styles.hint}>No items available for this day.</span>}
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            // Single-day / No-day view (fallback for vendors without multiple delivery days or no days selected)
                                            <>
                                                {vendorMinimum > 0 && (
                                                    <div style={{
                                                        marginBottom: '1rem',
                                                        padding: '8px 12px',
                                                        borderRadius: '6px',
                                                        backgroundColor: meetsMinimum ? '#d1fae5' : '#fee2e2',
                                                        color: meetsMinimum ? '#065f46' : '#991b1b',
                                                        border: `1px solid ${meetsMinimum ? '#10b981' : '#ef4444'}`,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '8px',
                                                        fontSize: '0.9rem',
                                                        fontWeight: 600
                                                    }}>
                                                        {meetsMinimum ? <Check size={16} /> : <AlertTriangle size={16} />}
                                                        <span>Minimum: {vendorMinimum} meals | Selected: {vendorMealCount} meals</span>
                                                    </div>
                                                )}
                                                <div className={styles.menuItemsGrid} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
                                                    {(() => {
                                                        // Filter for Flat View: hide items not allowed on the implied day(s)
                                                        let impliedDays: string[] = [];
                                                        if (vendorDeliveryDays.length === 1) {
                                                            impliedDays = vendorDeliveryDays;
                                                        } else if ((client as any).delivery_days && (client as any).delivery_days.length > 0) {
                                                            impliedDays = (client as any).delivery_days;
                                                        }

                                                        const visibleItems = vendorItems.filter(item => {
                                                            const raw = item.deliveryDays;
                                                            const allowedDays = Array.isArray(raw) ? raw : (raw ? [raw] : []);
                                                            if (allowedDays.length === 0) return true;
                                                            if (impliedDays.length === 0) return false; // hide restricted when day unknown
                                                            return impliedDays.every(day => allowedDays.includes(day));
                                                        });

                                                        if (visibleItems.length === 0) return <span className={styles.hint}>No items available.</span>;

                                                        return visibleItems.map(item => {
                                                            const qty = selection.items?.[item.id] || 0;
                                                            const note = selection.itemNotes?.[item.id] || '';
                                                            return (
                                                                <MenuItemCard
                                                                    key={item.id}
                                                                    item={item}
                                                                    quantity={qty}
                                                                    note={note}
                                                                    searchHighlighted={highlightedFoodItemId === item.id}
                                                                    incrementDisabled={!canIncrementItem(item, selection)}
                                                                    onIncrementBlocked={isClientPortal ? notifyIncrementBlocked : undefined}
                                                                    hidePhaseoutUnlessOnOrder={hidePhaseoutUnlessOnOrder}
                                                                    onQuantityChange={(newQty) => handleVendorItemChange(index, item.id, newQty)}
                                                                    onNoteChange={(newNote) => handleVendorItemChange(index, item.id, qty, undefined, newNote)}
                                                                />
                                                            );
                                                        });
                                                    })()}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </>
        );
    };

    const renderMealBlocks = () => {
        if (!orderConfig?.mealSelections) return null;
        return Object.entries(orderConfig.mealSelections).map(([uniqueKey, config]: [string, any]) => {
            const mealType = config.mealType || uniqueKey.split('_')[0];

            // Get categories for this meal type
            const subCategories = mealCategories
                .filter(c => {
                    if (c.mealType !== mealType) return false;
                    if (c.isActive !== false) return true;
                    if (!config.items) return false;
                    return mealItems.some(mi => mi.categoryId === c.id && Number(config.items[mi.id] || 0) > 0);
                })
                .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
            
            // Calculate summary info and get selected items
            const selectedItemsForSummary = (() => {
                const items: Array<{ item: MealItem; qty: number }> = [];
                if (config.items) {
                    Object.entries(config.items).forEach(([itemId, qty]) => {
                        const item = mealItems.find(i => i.id === itemId);
                        if (item && Number(qty) > 0) {
                            items.push({ item, qty: Number(qty) });
                        }
                    });
                }
                return items;
            })();
            
            const selectedItemsCount = selectedItemsForSummary.length;
            const selectedVendor = config.vendorId ? vendors.find(v => v.id === config.vendorId) : null;
            
            // Calculate total value for summary
            let totalSelectedValue = 0;
            if (config.items) {
                for (const [itemId, qty] of Object.entries(config.items)) {
                    const item = mealItems.find(i => i.id === itemId);
                    if (item) {
                        totalSelectedValue += (getItemPoints(item) * (qty as number));
                    }
                }
            }
            
            const shelfId = getMealShelfId(uniqueKey);
            const isOpen = isShelfOpen(shelfId);

            return (
                <div key={uniqueKey} id={`meal-block-${uniqueKey}`} className={styles.vendorBlock} style={{
                    borderLeft: '4px solid var(--color-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    transition: 'all 0.2s ease'
                }}>
                    {/* Shelf Header - Always Visible (Condensed Single Line) */}
                    <div 
                        onClick={() => toggleShelf(shelfId)}
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '12px 16px',
                            backgroundColor: isOpen ? 'var(--bg-surface-hover)' : 'var(--bg-surface)',
                            cursor: 'pointer',
                            borderBottom: isOpen ? '1px solid var(--border-color)' : 'none',
                            transition: 'background-color 0.2s ease'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, flexWrap: 'wrap' }}>
                            <span style={{ 
                                fontWeight: 600, 
                                color: 'var(--color-primary)',
                                fontSize: '1rem'
                            }}>
                                {mealType}
                            </span>
                            {totalSelectedValue > 0 && (
                                <span style={{ 
                                    fontSize: '0.85rem', 
                                    color: 'var(--text-secondary)',
                                    padding: '2px 8px',
                                    backgroundColor: 'var(--bg-surface-hover)',
                                    borderRadius: '4px'
                                }}>
                                    {totalSelectedValue} value
                                </span>
                            )}
                            {selectedVendor && allowVendorSelection && (
                                <span style={{ 
                                    fontSize: '0.85rem', 
                                    color: 'var(--text-secondary)',
                                    fontStyle: 'italic',
                                    padding: '2px 8px',
                                    backgroundColor: 'var(--bg-surface-hover)',
                                    borderRadius: '4px'
                                }}>
                                    {selectedVendor.name}
                                </span>
                            )}
                            {/* Show selected items with names */}
                            {selectedItemsForSummary.length > 0 && (
                                <div style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '4px',
                                    flexWrap: 'wrap',
                                    fontSize: '0.85rem',
                                    color: 'var(--text-secondary)'
                                }}>
                                    {selectedItemsForSummary.map(({ item, qty }, idx) => (
                                        <span 
                                            key={item.id}
                                            style={{
                                                padding: '2px 8px',
                                                backgroundColor: 'var(--bg-surface-hover)',
                                                borderRadius: '4px',
                                                fontSize: '0.8rem'
                                            }}
                                        >
                                            {item.name} {qty > 1 && `(${qty})`}
                                        </span>
                                    ))}
                                </div>
                            )}
                            {selectedItemsForSummary.length === 0 && subCategories.length > 0 && (
                                <span style={{ 
                                    fontSize: '0.8rem', 
                                    color: 'var(--text-tertiary)',
                                    fontStyle: 'italic'
                                }}>
                                    {subCategories.length} {subCategories.length === 1 ? 'category' : 'categories'} available
                                </span>
                            )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button 
                                className={`${styles.iconBtn} ${styles.danger}`} 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveMeal(uniqueKey);
                                }}
                                style={{ padding: '4px 8px' }}
                            >
                                <Trash2 size={16} />
                            </button>
                            <div style={{ 
                                transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                                transition: 'transform 0.2s ease'
                            }}>
                                <ChevronRight size={20} />
                            </div>
                        </div>
                    </div>
                    
                    {/* Shelf Content - Only visible when open */}
                    {isOpen && (
                        <div style={{ 
                            padding: '16px',
                            backgroundColor: 'var(--bg-surface)',
                            animation: 'fadeIn 0.2s ease'
                        }}>
                            {/* Vendor Selection */}
                            {!isClientPortal && (
                                <div style={{ marginBottom: '16px' }}>
                                    <label className="label" style={{ marginBottom: '8px' }}>Vendor (Optional)</label>
                                    <select
                                        className="input"
                                        value={config.vendorId || ''}
                                        onChange={(e) => handleMealVendorChange(uniqueKey, e.target.value)}
                                    >
                                        <option value="">Select Vendor (Optional)</option>
                                        {vendors
                                            .filter(v => v.serviceTypes.includes('Food') && v.isActive)
                                            .map(v => (
                                                <option key={v.id} value={v.id}>{v.name}</option>
                                            ))}
                                    </select>
                                </div>
                            )}
                            {isClientPortal && config.vendorId && allowVendorSelection && (
                                <div style={{ marginBottom: '16px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                                    {facilityUi.mealAssignedLabel}: {vendors.find(v => v.id === config.vendorId)?.name}
                                </div>
                            )}

                    {/* Items Grouped by Category */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        {subCategories.map(subCat => {
                            const catItems = mealItems
                                .filter(i => {
                                    if (i.categoryId !== subCat.id) return false;
                                    const qty = Number(config.items?.[i.id] || 0);
                                    return shouldShowFoodItemToViewer(i, {
                                        hidePhaseoutUnlessOnOrder,
                                        existingQty: qty,
                                        itemKind: 'meal',
                                    });
                                })
                                .sort((a, b) => {
                                    const sortOrderA = a.sortOrder ?? 0;
                                    const sortOrderB = b.sortOrder ?? 0;
                                    if (sortOrderA !== sortOrderB) return sortOrderA - sortOrderB;
                                    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
                                });

                            if (catItems.length === 0) return null;

                            // Calculate quota for this specific category
                            let categorySelectedValue = 0;
                            if (config.items) {
                                for (const [itemId, qty] of Object.entries(config.items)) {
                                    const item = catItems.find(i => i.id === itemId); // only check items in this cat
                                    if (item) {
                                        categorySelectedValue += (getItemPoints(item) * (qty as number));
                                    }
                                }
                            }
                            const requiredValue = subCat.setValue;
                            const isInvalid = requiredValue !== undefined && requiredValue !== null && !isMeetingExactTarget(categorySelectedValue, requiredValue);

                            return (
                                <div key={subCat.id} style={{
                                    border: isInvalid ? '1px solid #ef4444' : '1px solid transparent',
                                    padding: isInvalid ? '8px' : '0',
                                    borderRadius: '8px',
                                    backgroundColor: isInvalid ? '#fef2f2' : 'transparent'
                                }}>
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'baseline',
                                        marginBottom: '0.75rem',
                                        borderBottom: '1px solid var(--border-color)',
                                        paddingBottom: '0.25rem'
                                    }}>
                                        <h5 style={{
                                            fontSize: '0.9rem',
                                            fontWeight: 600,
                                            color: isInvalid ? '#ef4444' : 'var(--text-secondary)',
                                            margin: 0
                                        }}>
                                            {subCat.name}
                                        </h5>
                                        {requiredValue !== undefined && requiredValue !== null && (
                                            <span style={{ fontSize: '0.85em', color: isInvalid ? '#ef4444' : 'var(--text-secondary)' }}>
                                                Selected: {categorySelectedValue} / {requiredValue}
                                            </span>
                                        )}
                                    </div>
                                    <div className={styles.menuItemsGrid} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                                        {catItems.map(item => {
                                            const qty = config.items?.[item.id] || 0;
                                            return (
                                                <MenuItemCard
                                                    key={item.id}
                                                    item={item}
                                                    quantity={qty}
                                                    note={config.itemNotes?.[item.id] || ''}
                                                    incrementDisabled={!canIncrementItem(item)}
                                                    onIncrementBlocked={isClientPortal ? notifyIncrementBlocked : undefined}
                                                    hidePhaseoutUnlessOnOrder={hidePhaseoutUnlessOnOrder}
                                                    onQuantityChange={(newQty) => handleMealItemChange(uniqueKey, item.id, newQty)}
                                                    onNoteChange={(newNote) => handleMealItemChange(uniqueKey, item.id, qty, newNote)}
                                                    contextLabel={mealType}
                                                    checkboxMode={isClientPortal}
                                                />
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                            {mealItems.filter(i => {
                                const cat = mealCategories.find(c => c.id === i.categoryId);
                                if (!cat || cat.mealType !== mealType) return false;
                                const qty = Number(config.items?.[i.id] || 0);
                                if (cat.isActive === false && qty <= 0) return false;
                                return shouldShowFoodItemToViewer(i, {
                                    hidePhaseoutUnlessOnOrder,
                                    existingQty: qty,
                                    itemKind: 'meal',
                                });
                            }).length === 0 && (
                                <span className={styles.hint}>No items found for {mealType}.</span>
                            )}
                        </div>
                        </div>
                    )}
                </div>
            );
        });
    };

    // Main Render Logic — use same resolved list as renderVendorBlocks so deliveryDayOrders show when only that is stored
    const selectionsToRender = getResolvedVendorSelections();

    const totalMeals = getTotalMealCountAllDays();

    // Calculate take effect date
    const getTakeEffectDate = (): string | null => {
        if (!settings) return null;
        try {
            const now = new Date();
            const cutoffHour = settings.cutoffHour || 11;
            const cutoffMinute = settings.cutoffMinute || 0;
            const cutoffDay = settings.cutoffDay || 4; // Thursday = 4

            // Calculate the next Sunday (start of the delivery week)
            let nextSunday = new Date(now);
            nextSunday.setDate(now.getDate() + ((7 - now.getDay()) % 7 || 7));
            nextSunday.setHours(0, 0, 0, 0);

            // Check if we've passed the cutoff for this week
            const cutoffDate = new Date(nextSunday);
            cutoffDate.setDate(cutoffDate.getDate() - (7 - cutoffDay));
            cutoffDate.setHours(cutoffHour, cutoffMinute, 0, 0);

            if (now >= cutoffDate) {
                // Cutoff passed, move to next week
                nextSunday.setDate(nextSunday.getDate() + 7);
            }

            return nextSunday.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        } catch (error) {
            return null;
        }
    };

    const takeEffectDate = getTakeEffectDate();

    return (
        <div className={styles.vendorsList}>
            {/* Sticky Action Header - ADMIN ONLY (Portal has its own header) */}
            {!isClientPortal && (
                <div style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 40,
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    backdropFilter: 'blur(8px)',
                    borderBottom: '1px solid var(--border-color)',
                    padding: '12px 16px',
                    marginBottom: '16px',
                    boxShadow: '0 4px 20px -10px rgba(0, 0, 0, 0.05)',
                    margin: '-16px -16px 16px -16px', // Negative margin to stretch full width of container padding
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between', // Changed to space-between
                    flexWrap: 'wrap'
                }}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        {/* Add vendor block — client portal says “kitchen facilities”; staff UI keeps “vendor” */}
                        {(serviceType === 'Food' || serviceType === 'Meal') && (
                            <button
                                type="button"
                                onClick={handleAddVendorBlock}
                                className="btn btn-warning"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    backgroundColor: '#fbbf24',
                                    border: 'none',
                                    color: 'black',
                                    fontWeight: 600,
                                    padding: '8px 16px',
                                    borderRadius: '8px',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                    fontSize: '0.9rem'
                                }}
                            >
                                <Plus size={16} /> {isClientPortal ? 'Add Kitchen Facilities' : 'Add Vendor'}
                            </button>
                        )}
                    </div>


                    {/* Effective Date For Admin Header */}
                    {(serviceType === 'Food' || serviceType === 'Meal') && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>

                            {/* Meal Counter */}
                            {(() => {
                                const total = getTotalMealCountAllDays();
                                const limit = client.approvedMealsPerWeek || 0;
                                const isOver = limit > 0 && total > limit;

                                return (
                                    <div style={{
                                        padding: '6px 12px',
                                        borderRadius: '6px',
                                        backgroundColor: isOver ? '#fee2e2' : '#f3f4f6',
                                        color: isOver ? '#991b1b' : 'var(--text-secondary)',
                                        border: `1px solid ${isOver ? '#ef4444' : 'var(--border-color)'}`,
                                        fontSize: '0.9rem',
                                        fontWeight: 600,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}>
                                        {isOver ? <AlertTriangle size={16} /> : <Check size={16} />}
                                        <span>Items: {total} / {limit}</span>
                                    </div>
                                );
                            })()}

                            {/* Effective Date Banner */}
                            {(() => {
                                const banner = renderEffectiveDateBanner();
                                // We need to extract the content or re-render somewhat cleaner for header
                                // But re-using the logic is easiest.
                                // However, renderEffectiveDateBanner returns a div with margin/style.
                                // Let's just create a modified version right here inline or reuse the logic.
                                const uniqueVendorIds = new Set<string>();
                                if (orderConfig.deliveryDayOrders) {
                                    Object.values(orderConfig.deliveryDayOrders).forEach((dayOrder: any) => {
                                        if (dayOrder.vendorSelections) {
                                            dayOrder.vendorSelections.forEach((s: any) => s.vendorId && uniqueVendorIds.add(s.vendorId));
                                        }
                                    });
                                } else if (orderConfig.vendorSelections) {
                                    orderConfig.vendorSelections.forEach((s: any) => s.vendorId && uniqueVendorIds.add(s.vendorId));
                                }

                                const dates: React.ReactNode[] = [];
                                uniqueVendorIds.forEach(vId => {
                                    const v = vendors.find(vend => vend.id === vId);
                                    if (v) {
                                        const cutoff = v.cutoffDays || 0;
                                        // Pass delivery days to find the next actual delivery date
                                        const effectiveDate = calculateVendorEffectiveDate(cutoff, undefined, v.deliveryDays);
                                        const dateString = effectiveDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
                                        dates.push(
                                            <div key={v.id} style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                                Changes for <strong>{v.name}</strong>: <strong>{dateString}</strong>
                                            </div>
                                        );
                                    }
                                });

                                if (dates.length > 0) {
                                    return (
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                                            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: 600, marginBottom: '2px' }}>
                                                Changes Take Effect
                                            </div>
                                            {dates}
                                        </div>
                                    );
                                }
                                return null;
                            })()}
                        </div>
                    )}
                </div>
            )}

            {/* Generic Vendor Blocks (Main/Lunch) */}
            {showFoodCatalogSearch && renderFoodCatalogSearch()}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1rem' }}>
                {renderVendorBlocks()}
            </div>



            {/* Meal blocks are now the primary UI */}
            {renderMealBlocks()}

            {limitBlockedNoticeOpen && (
                <div
                    className={styles.modalOverlay}
                    style={{ zIndex: 1100 }}
                    onClick={() => setLimitBlockedNoticeOpen(false)}
                >
                    <div
                        className={styles.modalContent}
                        style={{
                            maxWidth: '420px',
                            height: 'auto',
                            padding: '24px',
                            textAlign: 'center',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <AlertTriangle
                            size={40}
                            style={{ color: 'var(--color-warning, #d97706)', marginBottom: '12px' }}
                            aria-hidden
                        />
                        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '8px' }}>
                            Weekly limit reached
                        </h2>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: 1.5 }}>
                            {PORTAL_INCREMENT_BLOCKED_MESSAGE}
                        </p>
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => setLimitBlockedNoticeOpen(false)}
                        >
                            OK
                        </button>
                    </div>
                </div>
            )}

        </div >
    );
}

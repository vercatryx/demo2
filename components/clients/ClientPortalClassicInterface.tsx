'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ClientProfile, ClientStatus, Navigator, Vendor, MenuItem, BoxType, ItemCategory, BoxQuota, MealCategory, MealItem, AppSettings } from '@/lib/types';
import { getBoxQuotas, updateClientUpcomingOrder } from '@/lib/actions';
import { getSettings } from '@/lib/cached-data';
import { getNextDeliveryDate as getNextDeliveryDateUtil, getTakeEffectDate, formatDeliveryDate, calculateVendorEffectiveDate } from '@/lib/order-dates';
import { isMeetingMinimum, isExceedingMaximum, isMeetingExactTarget, getItemPoints } from '@/lib/utils';
import { Info, AlertTriangle } from 'lucide-react';
import styles from './ClientProfile.module.css';
import FoodServiceWidget from './FoodServiceWidget';
import ClientPortalSidebar from './ClientPortalSidebar';
import ClientPortalHeader from './ClientPortalHeader';
import ClientPortalOrderSummary from './ClientPortalOrderSummary';
// Passover banner omitted in demo build
function PassoverWarningBanner() {
    return null;
}
import stylesClientPortal from './ClientPortal.module.css';
import { BoxSelectorDemoClient, type BoxSelectorBoxValue } from '@/components/admin/box-selector-demo/BoxSelectorDemoClient';

interface Props {
    client: ClientProfile;
    statuses: ClientStatus[];
    navigators: Navigator[];
    vendors: Vendor[];
    menuItems: MenuItem[];
    boxTypes: BoxType[];
    categories: ItemCategory[];
    upcomingOrder: any;
    activeOrder: any;
    mealCategories: MealCategory[];
    mealItems: MealItem[];
    foodOrder?: any;
    mealOrder?: any;
    boxOrders?: any[];
    /** Food/Meal: Add Kitchen Facilities, vendor selection, and summary vendor names (clients + admins). Never affects box Kitchen/vendor row. */
    canManageFoodKitchenVendor?: boolean;
}

function computeInitialOrderConfig(upcomingOrder: any, client: ClientProfile | null): any {
    if (!client) return {};
    let configToSet: any = {};
    if (upcomingOrder && typeof upcomingOrder === 'object') {
        const isMultiDayFormat = !upcomingOrder.serviceType &&
            !upcomingOrder.deliveryDayOrders &&
            Object.keys(upcomingOrder).some(key => {
                const val = (upcomingOrder as any)[key];
                return val && val.serviceType;
            });
        if (isMultiDayFormat) {
            const deliveryDayOrders: any = {};
            for (const day of Object.keys(upcomingOrder)) {
                const dayOrder = (upcomingOrder as any)[day];
                if (dayOrder && dayOrder.serviceType) {
                    deliveryDayOrders[day] = { vendorSelections: dayOrder.vendorSelections || [] };
                }
            }
            const firstDayKey = Object.keys(upcomingOrder)[0];
            const firstDayOrder = (upcomingOrder as any)[firstDayKey];
            configToSet = {
                serviceType: firstDayOrder?.serviceType || client.serviceType,
                caseId: firstDayOrder?.caseId,
                deliveryDayOrders
            };
        } else {
            configToSet = { ...upcomingOrder };
        }
        if (!configToSet.serviceType) configToSet.serviceType = client.serviceType;
    } else {
        const defaultOrder: any = { serviceType: client.serviceType };
        if (client.serviceType === 'Food') {
            defaultOrder.vendorSelections = [{ vendorId: '', items: {} }];
        }
        configToSet = defaultOrder;
    }
    return configToSet;
}

/** Same normalization as manual save; returns null when Food order cannot be persisted (missing case id). */
function buildClientPortalUpcomingPayload(orderConfig: any, client: ClientProfile): any | null {
    const effectiveType = orderConfig?.serviceType ?? client.serviceType;
    const resolvedCaseId =
        orderConfig?.caseId || (client as any).caseID || (client.upcomingOrder as any)?.caseId;

    if (effectiveType === 'Food' && !resolvedCaseId) {
        return null;
    }

    const cleanedOrderConfig = { ...orderConfig };
    cleanedOrderConfig.caseId = orderConfig.caseId;

    if (effectiveType === 'Food') {
        if (Array.isArray(cleanedOrderConfig.vendorSelections)) {
            cleanedOrderConfig.vendorSelections = cleanedOrderConfig.vendorSelections
                .filter((s: any) => s?.vendorId)
                .map((s: any) => ({
                    vendorId: s.vendorId,
                    items: s.items || {},
                    itemsByDay: s.itemsByDay && typeof s.itemsByDay === 'object' ? s.itemsByDay : {},
                    selectedDeliveryDays: Array.isArray(s.selectedDeliveryDays) ? s.selectedDeliveryDays : [],
                    itemNotes: s.itemNotes || {},
                    itemNotesByDay: s.itemNotesByDay && typeof s.itemNotesByDay === 'object' ? s.itemNotesByDay : {}
                }));
        }
        delete cleanedOrderConfig.deliveryDayOrders;
    } else if (effectiveType === 'Boxes') {
        cleanedOrderConfig.boxOrders = orderConfig.boxOrders || [];

        if (cleanedOrderConfig.boxOrders.length > 0) {
            const firstBox = cleanedOrderConfig.boxOrders[0];
            cleanedOrderConfig.vendorId = firstBox.vendorId;
            cleanedOrderConfig.boxTypeId = firstBox.boxTypeId;
            cleanedOrderConfig.boxQuantity = firstBox.quantity || 1;
            cleanedOrderConfig.items = firstBox.items || {};
        } else {
            cleanedOrderConfig.vendorId = orderConfig.vendorId;
            cleanedOrderConfig.boxTypeId = orderConfig.boxTypeId;
            cleanedOrderConfig.boxQuantity = orderConfig.boxQuantity || 1;
            cleanedOrderConfig.items = orderConfig.items || {};
        }

        cleanedOrderConfig.caseId = orderConfig.caseId;
        cleanedOrderConfig.itemPrices = orderConfig.itemPrices || {};
    }

    return {
        ...cleanedOrderConfig,
        serviceType: effectiveType,
        notes: cleanedOrderConfig.notes
    };
}

/** Short debounce; tab hide/pagehide also flush immediately so users do not lose edits when leaving quickly. */
const CLIENT_PORTAL_AUTOSAVE_DEBOUNCE_MS = 100;

/** Same headline as the header issue strip so top and bottom stay aligned. */
const PLEASE_UPDATE_ORDER_TITLE = 'Please update your order';

/** Detail text only (save bar prefixes with "Couldn't save: "). */
function formatClientPortalSaveError(error: unknown): string {
    const raw = error instanceof Error ? error.message : String(error);
    let m = raw.trim();
    if (m.startsWith('Error:')) m = m.slice(6).trim();
    const dup = /^couldn'?t save\s*:\s*/i;
    if (dup.test(m)) m = m.replace(dup, '').trim();
    return m || 'Could not save';
}

export function ClientPortalClassicInterface({
    client: initialClient,
    statuses,
    navigators,
    vendors,
    menuItems,
    boxTypes,
    categories,
    upcomingOrder,
    activeOrder,
    mealCategories,
    mealItems,
    foodOrder,
    mealOrder,
    boxOrders,
    canManageFoodKitchenVendor = false
}: Props) {
    const [client, setClient] = useState<ClientProfile>(initialClient);
    const [activeBoxQuotas, setActiveBoxQuotas] = useState<BoxQuota[]>([]);

    const [orderConfig, setOrderConfig] = useState<any>(() => computeInitialOrderConfig(upcomingOrder, initialClient));
    const [originalOrderConfig, setOriginalOrderConfig] = useState<any>(() => {
        const c = computeInitialOrderConfig(upcomingOrder, initialClient);
        return JSON.parse(JSON.stringify(c));
    });
    const orderConfigRef = useRef(orderConfig);
    orderConfigRef.current = orderConfig;
    const clientRef = useRef(client);
    clientRef.current = client;
    const originalOrderConfigRef = useRef(originalOrderConfig);
    originalOrderConfigRef.current = originalOrderConfig;

    // Profile State
    const [profileData, setProfileData] = useState({
        fullName: initialClient.fullName,
        email: initialClient.email || '',
        phoneNumber: initialClient.phoneNumber || '',
        secondaryPhoneNumber: initialClient.secondaryPhoneNumber || '',
        address: initialClient.address || ''
    });
    const [originalProfileData, setOriginalProfileData] = useState({
        fullName: initialClient.fullName,
        email: initialClient.email || '',
        phoneNumber: initialClient.phoneNumber || '',
        secondaryPhoneNumber: initialClient.secondaryPhoneNumber || '',
        address: initialClient.address || ''
    });

    // UI State
    const [saving, setSaving] = useState(false);
    const [savingProfile, setSavingProfile] = useState(false);
    /** Only set when a save actually fails (shown in the persistent top banner — no save toast). */
    const [saveError, setSaveError] = useState<string | null>(null);
    const [profileMessage, setProfileMessage] = useState<string | null>('');

    const [settings, setSettings] = useState<AppSettings | null>(null);
    /** Progressive dropdown UI for box ordering (default: step-by-step; toggle for folder/column builder). */
    const [boxSimpleUi, setBoxSimpleUi] = useState(true);
    useEffect(() => {
        getSettings().then(setSettings);
    }, []);

    // Collapsible sections state


    // Sync profile data when initialClient changes
    useEffect(() => {
        setProfileData({
            fullName: initialClient.fullName,
            email: initialClient.email || '',
            phoneNumber: initialClient.phoneNumber || '',
            secondaryPhoneNumber: initialClient.secondaryPhoneNumber || '',
            address: initialClient.address || ''
        });
        setOriginalProfileData({
            fullName: initialClient.fullName,
            email: initialClient.email || '',
            phoneNumber: initialClient.phoneNumber || '',
            secondaryPhoneNumber: initialClient.secondaryPhoneNumber || '',
            address: initialClient.address || ''
        });
        setClient(initialClient);
    }, [initialClient]);

    // Track if we've already initialized to prevent overwriting user changes
    const hasInitializedRef = useRef(false);
    const lastSavedTimestampRef = useRef<string | null>(null);
    const lastUpcomingOrderIdRef = useRef<string | null>(null);
    const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    /** True while a debounced save is scheduled but the timer has not fired yet. */
    const debouncePendingRef = useRef(false);
    /** Mirrors `saving` for synchronous leave guards (beforeunload). */
    const savingRef = useRef(false);
    /** Serializes overlapping flush requests (edits during in-flight save chain here). */
    const autosaveChainRef = useRef(Promise.resolve());
    /** Incremented on discard to drop stale results from autosave still in flight. */
    const persistGenerationRef = useRef(0);

    /** Snapshot taken whenever upcoming order is loaded from the server; Discard restores this (local + DB). */
    const [sessionBaselineOrder, setSessionBaselineOrder] = useState<any | null>(null);

    const orderDiffersFromSession = useMemo(() => {
        if (sessionBaselineOrder === null) return false;
        return JSON.stringify(orderConfig) !== JSON.stringify(sessionBaselineOrder);
    }, [orderConfig, sessionBaselineOrder]);

    useEffect(() => {
        savingRef.current = saving;
    }, [saving]);

    /** Persists until local order matches last saved snapshot; loops if the user edits mid-request. */
    const flushAutosaveToServer = useCallback(async () => {
        const c = clientRef.current;
        if (JSON.stringify(orderConfigRef.current) === JSON.stringify(originalOrderConfigRef.current)) {
            setSaving(false);
            savingRef.current = false;
            return;
        }

        const genAtStart = persistGenerationRef.current;

        setSaving(true);
        savingRef.current = true;

        try {
            while (JSON.stringify(orderConfigRef.current) !== JSON.stringify(originalOrderConfigRef.current)) {
                if (genAtStart !== persistGenerationRef.current) {
                    return;
                }
                const payload = buildClientPortalUpcomingPayload(orderConfigRef.current, c);
                if (!payload) {
                    return;
                }
                const snapJson = JSON.stringify(orderConfigRef.current);
                await updateClientUpcomingOrder(c.id, payload, {
                    skipOrderHistory: true,
                    skipRevalidation: true,
                });
                if (genAtStart !== persistGenerationRef.current) {
                    return;
                }
                const afterJson = JSON.stringify(orderConfigRef.current);
                if (afterJson === snapJson) {
                    const parsed = JSON.parse(snapJson);
                    setOriginalOrderConfig(parsed);
                    originalOrderConfigRef.current = parsed;
                    lastSavedTimestampRef.current = new Date().toISOString();
                }
            }
            if (genAtStart === persistGenerationRef.current) {
                setSaveError(null);
            }
        } catch (error: unknown) {
            console.error('[ClientPortal] Auto-save failed:', error);
            if (genAtStart === persistGenerationRef.current) {
                setSaveError(formatClientPortalSaveError(error));
            }
            throw error;
        } finally {
            setSaving(false);
            savingRef.current = false;
        }
    }, []);

    const enqueueAutosaveFlush = useCallback(() => {
        autosaveChainRef.current = autosaveChainRef.current
            .catch(() => {})
            .then(() => flushAutosaveToServer());
    }, [flushAutosaveToServer]);

    // Initialize order config from clients.upcoming_order only (current order — not activeOrder/old system).
    // Order Summary sidebar reads this same orderConfig; do not use activeOrder for the summary.
    useEffect(() => {
        if (!client) return;

        let configToSet: any = {};

        if (upcomingOrder && typeof upcomingOrder === 'object') {
                // ... (existing upcomingOrder logic) ...
                // Minimal copy of upcoming logic:
                const isMultiDayFormat = upcomingOrder && typeof upcomingOrder === 'object' &&
                    !upcomingOrder.serviceType &&
                    !upcomingOrder.deliveryDayOrders &&
                    Object.keys(upcomingOrder).some(key => {
                        const val = (upcomingOrder as any)[key];
                        return val && val.serviceType;
                    });

                if (isMultiDayFormat) {
                    const deliveryDayOrders: any = {};
                    for (const day of Object.keys(upcomingOrder)) {
                        const dayOrder = (upcomingOrder as any)[day];
                        if (dayOrder && dayOrder.serviceType) {
                            deliveryDayOrders[day] = { vendorSelections: dayOrder.vendorSelections || [] };
                        }
                    }
                    const firstDayKey = Object.keys(upcomingOrder)[0];
                    const firstDayOrder = (upcomingOrder as any)[firstDayKey];
                    configToSet = {
                        serviceType: firstDayOrder?.serviceType || client.serviceType,
                        caseId: firstDayOrder?.caseId,
                        deliveryDayOrders
                    };
                } else {
                    configToSet = { ...upcomingOrder };
                }
            if (!configToSet.serviceType) configToSet.serviceType = client.serviceType;
        } else {
            const defaultOrder: any = { serviceType: client.serviceType };
            if (client.serviceType === 'Food') {
                defaultOrder.vendorSelections = [{ vendorId: '', items: {} }];
            }
            configToSet = defaultOrder;
        }


        setOrderConfig(configToSet);
        const deepCopy = JSON.parse(JSON.stringify(configToSet));
        setOriginalOrderConfig(deepCopy);
        setSessionBaselineOrder(JSON.parse(JSON.stringify(configToSet)));
        hasInitializedRef.current = true;

        // Update ref for upcoming order
        const currentUpcomingOrderId = upcomingOrder ? (
            typeof upcomingOrder === 'object' && !(upcomingOrder as any).serviceType ?
                (upcomingOrder as any)['default']?.id :
                (upcomingOrder as any)?.id
        ) : null;
        lastUpcomingOrderIdRef.current = currentUpcomingOrderId;

    }, [upcomingOrder, activeOrder, client]);

    // Box Logic - Load quotas for all active box types to support multiple boxes with different types
    useEffect(() => {
        async function loadQuotas() {
            const effectiveType = orderConfig?.serviceType ?? client.serviceType;
            if (effectiveType !== 'Boxes' || boxTypes.length === 0) {
                // Optimization: only load if needed (though existing cached data makes it cheap)
                // But wait, if we switch tabs, we might want quotas ready? 
                // ClientProfile loads them on mount if boxTypes exist.
                // Let's stick to loading if serviceType is Boxes or just load them if boxTypes are present to be safe/ready.
                // Actually ClientProfile: if (boxTypes.length > 0) loadQuotas();
                // Here, let's load if boxTypes exist, regardless of current tab, so it's ready if they switch.
            }

            if (boxTypes.length === 0) return;

            const allQuotas: BoxQuota[] = [];
            for (const bt of boxTypes) {
                if (bt.isActive) {
                    try {
                        const quotas = await getBoxQuotas(bt.id);
                        allQuotas.push(...quotas);
                    } catch (e) {
                        console.error(`Error loading quotas for box type ${bt.id}`, e);
                    }
                }
            }
            setActiveBoxQuotas(allQuotas);
        }

        loadQuotas();
    }, [boxTypes, client.serviceType, orderConfig?.serviceType]);

    // Use order's service type when we have upcoming order data, so portal shows Boxes/Food based on actual order not client row
    const serviceType = orderConfig?.serviceType ?? client.serviceType;
    const quotasByBoxType = useMemo(() => {
        const grouped: Record<string, BoxQuota[]> = {};
        for (const bt of boxTypes) {
            grouped[bt.id] = activeBoxQuotas.filter((quota) => quota.boxTypeId === bt.id);
        }
        return grouped;
    }, [boxTypes, activeBoxQuotas]);
    const boxSelectorValue = useMemo<BoxSelectorBoxValue[]>(() => {
        if (Array.isArray(orderConfig.boxOrders) && orderConfig.boxOrders.length > 0) {
            return orderConfig.boxOrders;
        }
        const firstActiveBoxType = boxTypes.find((bt) => bt.isActive);
        return [{
            boxTypeId: firstActiveBoxType?.id || '',
            vendorId: firstActiveBoxType?.vendorId || '',
            quantity: 1,
            items: {},
            itemNotes: {},
        }];
    }, [orderConfig.boxOrders, boxTypes]);

    // --- Auto-Scroll Logic ---
    const prevVendorCountRef = useRef(0);
    const prevMealKeysRef = useRef<string[]>([]);
    const prevBoxCountRef = useRef(0);

    // Watch for Vendor Additions
    useEffect(() => {
        const currentVendorCount = orderConfig.vendorSelections ? orderConfig.vendorSelections.length : 0;


        if (currentVendorCount > prevVendorCountRef.current) {
            setTimeout(() => {
                const newIndex = currentVendorCount - 1;
                const elementId = `vendor-block-${newIndex}`;
                const element = document.getElementById(elementId);


                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                } else {
                    setTimeout(() => {
                        const elRetry = document.getElementById(elementId);

                        if (elRetry) elRetry.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 300);
                }
            }, 400);
        }
        prevVendorCountRef.current = currentVendorCount;
    }, [orderConfig.vendorSelections?.length]);

    // Watch for Meal Type Additions
    useEffect(() => {
        const currentKeys = Object.keys(orderConfig.mealSelections || {});
        const prevKeys = prevMealKeysRef.current;


        if (currentKeys.length > prevKeys.length) {
            const newKey = currentKeys.find(k => !prevKeys.includes(k));


            if (newKey) {
                setTimeout(() => {
                    const elementId = `meal-block-${newKey}`;
                    const element = document.getElementById(elementId);


                    if (element) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    } else {
                        setTimeout(() => {
                            const elRetry = document.getElementById(elementId);

                            if (elRetry) elRetry.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }, 300);
                    }
                }, 400);
            }
        }
        prevMealKeysRef.current = currentKeys;
    }, [orderConfig.mealSelections]);

    // Watch for Box Additions
    useEffect(() => {
        const currentBoxCount = orderConfig.boxOrders ? orderConfig.boxOrders.length : 0;


        if (currentBoxCount > prevBoxCountRef.current) {
            setTimeout(() => {
                const newIndex = currentBoxCount - 1;
                const elementId = `box-block-${newIndex}`;
                const element = document.getElementById(elementId);


                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                } else {
                    setTimeout(() => {
                        const elRetry = document.getElementById(elementId);

                        if (elRetry) elRetry.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 300);
                }
            }, 400);
        }
        prevBoxCountRef.current = currentBoxCount;
    }, [orderConfig.boxOrders?.length]);


    // Auto-Save Logic - matching ClientProfile exactly
    // State-based Validation
    const [validationStatus, setValidationStatus] = useState({
        isValid: true,
        totalValue: 0,
        error: null as string | null
    });

    // Calculate total meal count for header
    const totalMealCount = useMemo(() => {
        let total = 0;
        const countedItemIdsGlobally = new Set<string>();

        try {
            if (orderConfig.serviceType === 'Food') {
                // Vendors
                if (orderConfig.vendorSelections) {
                    orderConfig.vendorSelections.forEach((sel: any) => {
                        if (sel.itemsByDay && sel.selectedDeliveryDays) {
                            sel.selectedDeliveryDays.forEach((day: string) => {
                                const items = sel.itemsByDay[day] || {};
                                Object.entries(items).forEach(([id, qty]) => {
                                    countedItemIdsGlobally.add(id);
                                    const item = menuItems.find(i => i.id === id);
                                    total += (Number(qty) || 0) * getItemPoints(item);
                                });
                            });
                        } else if (sel.items) {
                            const multiplier = (sel.selectedDeliveryDays?.length || (client as any).delivery_days?.length || 1);
                            Object.entries(sel.items).forEach(([id, qty]) => {
                                countedItemIdsGlobally.add(id);
                                const item = menuItems.find(i => i.id === id);
                                total += (Number(qty) || 0) * getItemPoints(item) * multiplier;
                            });
                        }
                    });
                }
                // Meals
                if (orderConfig.mealSelections) {
                    Object.values(orderConfig.mealSelections).forEach((conf: any) => {
                        if (conf.items) {
                            Object.entries(conf.items).forEach(([id, qty]) => {
                                // De-duplicate if already in vendor loop
                                if (countedItemIdsGlobally.has(id)) return;

                                const item = mealItems.find(i => i.id === id);
                                total += (Number(qty) || 0) * getItemPoints(item);
                            });
                        }
                    });
                }
            } else if (orderConfig.serviceType === 'Meal') {
                if (orderConfig.mealSelections) {
                    Object.values(orderConfig.mealSelections).forEach((conf: any) => {
                        if (conf.items) {
                            Object.entries(conf.items).forEach(([id, qty]) => {
                                const item = mealItems.find(i => i.id === id);
                                total += (Number(qty) || 0) * getItemPoints(item);
                            });
                        }
                    });
                }
            }
        } catch (e) {
            console.error('[totalMealCount] Calculation Error:', e);
        }
        return total;
    }, [orderConfig, menuItems, mealItems, client]);

    // Real-time Validation Effect
    useEffect(() => {
        validateOrder();
    }, [orderConfig, orderConfig?.serviceType, client.approvedMealsPerWeek, client.serviceType, totalMealCount, menuItems, mealItems]);

    function validateOrder() {
        try {
            if (!client || !orderConfig) {

                return;
            }
            const effectiveType = orderConfig?.serviceType ?? client.serviceType;
            let isValid = true;
            let error: string | null = null;
            let totalValue = totalMealCount;



            // Detailed Trace to Console


            if (effectiveType === 'Food' && orderConfig.vendorSelections) {
                // Check Vendor Minimums
                for (const selection of orderConfig.vendorSelections) {
                    if (!selection.vendorId) continue;
                    const vendor = vendors.find(v => v.id === selection.vendorId);
                    if (!vendor) continue;
                    const minMeals = vendor.minimumMeals || 0;
                    if (minMeals === 0) continue;

                    if (selection.itemsByDay && Object.keys(selection.itemsByDay).length > 0) {
                        const activeDays = selection.selectedDeliveryDays || [];
                        for (const day of activeDays) {
                            const dayItems = selection.itemsByDay[day] || {};
                            let dayValue = 0;
                            for (const [itemId, qty] of Object.entries(dayItems)) {
                                const item = menuItems.find(i => i.id === itemId);
                                dayValue += getItemPoints(item) * (Number(qty) || 0);
                            }
                            // Only require minimum for days that have items; skip days with 0
                            if (dayValue > 0 && !isMeetingMinimum(dayValue, minMeals)) {
                                error = `${vendor.name} requires a minimum value of ${minMeals} for ${day}. You have selected ${dayValue}.`;
                                isValid = false;
                                break;
                            }
                        }
                    } else if (selection.items) {
                        let countValue = 0;
                        for (const [itemId, qty] of Object.entries(selection.items)) {
                            const item = menuItems.find(i => i.id === itemId);
                            countValue += getItemPoints(item) * (Number(qty) || 0);
                        }

                        if (!isMeetingMinimum(countValue, minMeals)) {
                            error = `${vendor.name} requires a minimum value of ${minMeals} per delivery. You have selected ${countValue}.`;
                            isValid = false;
                        }
                    }
                    if (!isValid) break;
                }
            }

            // Check Approved Limit
            const limit = client.approvedMealsPerWeek || 0;
            if (limit > 0 && isExceedingMaximum(totalValue, limit)) {
                error = `Total value selected (${totalValue.toFixed(2)}) exceeds approved value per week (${limit}). Please reduce your order.`;
                isValid = false;
            }

            // 2. Meal Service Validation (Exact Targets per Category)
            if (isValid && orderConfig.mealSelections) {
                for (const [uniqueKey, config] of Object.entries(orderConfig.mealSelections) as [string, any][]) {
                    const mealType = config.mealType || uniqueKey.split('_')[0];
                    const catsForThisType = mealCategories.filter(
                        (c) => c.mealType === mealType && (c as { isActive?: boolean }).isActive !== false
                    );

                    for (const cat of catsForThisType) {
                        if (cat.setValue !== undefined && cat.setValue !== null) {
                            let selectedValue = 0;
                            if (config.items) {
                                Object.entries(config.items).forEach(([itemId, qty]) => {
                                    const item = mealItems.find(i => i.id === itemId);
                                    if (item && item.categoryId === cat.id) {
                                        selectedValue += getItemPoints(item) * (Number(qty) || 0);
                                    }
                                });
                            }

                            if (!isMeetingExactTarget(selectedValue, cat.setValue)) {
                                isValid = false;
                                error = `Please select exactly ${cat.setValue} items for ${mealType} - ${cat.name}. (Current: ${selectedValue})`;
                                break;
                            }
                        }
                    }
                    if (!isValid) break;
                }
            }

            // 3. Box Service Validation
            if (isValid && effectiveType === 'Boxes' && orderConfig.boxOrders) {
                orderConfig.boxOrders.forEach((box: any, boxIdx: number) => {
                    if (!isValid) return;

                    categories.forEach(category => {
                        if (!isValid) return;

                        const selectedItems = box.items || {};
                        let categoryQuotaValue = 0;

                        Object.entries(selectedItems).forEach(([itemId, qty]) => {
                            const item = menuItems.find(i => i.id === itemId);
                            if (item && item.categoryId === category.id) {
                                const itemQuotaValue = item.quotaValue || 1;
                                categoryQuotaValue += (qty as number) * itemQuotaValue;
                            }
                        });

                        let requiredQuotaValue: number | null = null;
                        if (category.setValue !== undefined && category.setValue !== null) {
                            requiredQuotaValue = category.setValue;
                        } else if (box.boxTypeId) {
                            const quota = activeBoxQuotas.find(q => q.boxTypeId === box.boxTypeId && q.categoryId === category.id);
                            if (quota) {
                                requiredQuotaValue = quota.targetValue;
                            }
                        }

                        if (requiredQuotaValue !== null && isExceedingMaximum(categoryQuotaValue, requiredQuotaValue)) {
                            error = `Box #${boxIdx + 1} - ${category.name}: Selected ${categoryQuotaValue} pts, but maximum is ${requiredQuotaValue} pts.`;
                            isValid = false;
                        }
                    });
                });
            }

            setValidationStatus({ isValid, totalValue, error });
        } catch (err) {
            console.error("[validateOrder] CRASHED:", err);
            setValidationStatus(prev => ({ ...prev, isValid: false, error: "Validation system crashed. Check console." }));
        }
    }

    const handleDiscard = async () => {
        if (!client || sessionBaselineOrder === null || !orderDiffersFromSession) return;

        persistGenerationRef.current += 1;
        const gen = persistGenerationRef.current;

        if (autosaveTimerRef.current) {
            clearTimeout(autosaveTimerRef.current);
            autosaveTimerRef.current = null;
        }
        debouncePendingRef.current = false;

        const reset = JSON.parse(JSON.stringify(sessionBaselineOrder));
        setOrderConfig(reset);
        const resetCopy = JSON.parse(JSON.stringify(reset));
        setOriginalOrderConfig(resetCopy);
        originalOrderConfigRef.current = resetCopy;
        setSaveError(null);

        const payload = buildClientPortalUpcomingPayload(reset, client);
        if (!payload) {
            return;
        }

        setSaving(true);
        savingRef.current = true;
        try {
            await updateClientUpcomingOrder(client.id, payload, {
                skipOrderHistory: true,
                skipRevalidation: true,
            });
            if (gen !== persistGenerationRef.current) return;
            lastSavedTimestampRef.current = new Date().toISOString();
            setSaveError(null);
        } catch (error: unknown) {
            if (gen !== persistGenerationRef.current) return;
            setSaveError(formatClientPortalSaveError(error));
        } finally {
            setSaving(false);
            savingRef.current = false;
        }
    };

    // Auto-Save Profile Logic - DISABLED: Profile editing is not allowed in client portal
    // useEffect(() => {
    //     if (!client) return;

    //     const profileChanged =
    //         profileData.fullName !== originalProfileData.fullName ||
    //         profileData.email !== originalProfileData.email ||
    //         profileData.phoneNumber !== originalProfileData.phoneNumber ||
    //         profileData.secondaryPhoneNumber !== originalProfileData.secondaryPhoneNumber ||
    //         profileData.address !== originalProfileData.address;

    //     if (!profileChanged) return;

    //     const timeoutId = setTimeout(async () => {
    //         try {
    //             setSavingProfile(true);
    //             setProfileMessage('Saving...');

    //             await updateClient(client.id, {
    //                 fullName: profileData.fullName,
    //                 email: profileData.email || null,
    //                 phoneNumber: profileData.phoneNumber || '',
    //                 secondaryPhoneNumber: profileData.secondaryPhoneNumber || null,
    //                 address: profileData.address || ''
    //             });

    //             setOriginalProfileData({ ...profileData });
    //             setSavingProfile(false);
    //             setProfileMessage('Saved');
    //             setTimeout(() => setProfileMessage(null), 2000);
    //         } catch (error) {
    //             console.error('Error saving profile:', error);
    //             setSavingProfile(false);
    //             setProfileMessage('Error saving');
    //         }
    //     }, 1000);

    //     return () => clearTimeout(timeoutId);
    // }, [profileData, originalProfileData, client]);


    function handleBoxItemChange(itemId: string, qty: number) {
        // Legacy/Fallback for flat items if needed, but we are moving to multi-box
        const currentItems = { ...(orderConfig.items || {}) };
        if (qty > 0) {
            currentItems[itemId] = qty;
        } else {
            delete currentItems[itemId];
        }
        setOrderConfig({ ...orderConfig, items: currentItems });
    }

    // --- Box Order Helpers (Multi-Box Support) ---

    function getNextDeliveryDateForVendor(vendorId: string): string | null {
        const deliveryDate = getNextDeliveryDateUtil(vendorId, vendors);
        if (!deliveryDate) return null;
        return formatDeliveryDate(deliveryDate);
    }

    const configChanged = JSON.stringify(orderConfig) !== JSON.stringify(originalOrderConfig);



    // Handlers needed for Header
    const handleAddVendorBlock = () => {
        setOrderConfig((prev: any) => {
            const newConfig = { ...prev };
            newConfig.vendorSelections = newConfig.vendorSelections ? [...newConfig.vendorSelections] : [];
            newConfig.vendorSelections.push({
                vendorId: '',
                items: {}
            });
            return newConfig;
        });
    };

    const handleAddMeal = (mealType: string) => {
        setOrderConfig((prev: any) => {
            const newConfig = { ...prev };
            // Shallow copy mealSelections to allow change detection
            newConfig.mealSelections = { ...(newConfig.mealSelections || {}) };

            const uniqueKey = `${mealType}_${Date.now()}`;
            newConfig.mealSelections[uniqueKey] = {
                mealType,
                vendorId: '',
                items: {}
            };
            return newConfig;
        });
    };

    // Calculate take effect date
    const takingEffectDate = useMemo(() => {
        // --- EFFECTIVE DATE CALCULATION FOR HEADER ---
        let headerEffectiveDate: React.ReactNode = null;

        if (serviceType === 'Food') {
            // Food: no vendor-specific "Changes take effect from" — only the Tuesday 11:59 PM note in the alert below.
            headerEffectiveDate = null;
        } else if (settings && serviceType !== 'Boxes') {
            // const nextDate = getNextDeliveryDateUtil(client, settings); // Broken signature
            const takeEffect = getTakeEffectDate(settings, new Date());
            if (takeEffect) {
                headerEffectiveDate = takeEffect.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
            }
        }

        return headerEffectiveDate;
    }, [settings, client, serviceType, orderConfig.deliveryDayOrders, orderConfig.vendorSelections, vendors]);

    // Debounced schedule → chained flush (no validation gate: drafts save). Timer + in-flight saves block accidental navigation.
    useEffect(() => {
        if (!client || !orderConfig) return;

        const effectiveType = orderConfig?.serviceType ?? client.serviceType;
        if (effectiveType !== 'Food' && effectiveType !== 'Boxes' && effectiveType !== 'Meal') return;

        const dirty = JSON.stringify(orderConfig) !== JSON.stringify(originalOrderConfig);
        if (!dirty) return;

        if (!buildClientPortalUpcomingPayload(orderConfig, client)) return;

        debouncePendingRef.current = true;
        if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);

        autosaveTimerRef.current = setTimeout(() => {
            autosaveTimerRef.current = null;
            debouncePendingRef.current = false;
            savingRef.current = true;
            setSaving(true);
            enqueueAutosaveFlush();
        }, CLIENT_PORTAL_AUTOSAVE_DEBOUNCE_MS);

        return () => {
            if (autosaveTimerRef.current) {
                clearTimeout(autosaveTimerRef.current);
                autosaveTimerRef.current = null;
            }
            debouncePendingRef.current = false;
        };
    }, [client, orderConfig, originalOrderConfig, enqueueAutosaveFlush]);

    /** Flush ASAP when the tab hides so short debounces do not lose edits on fast navigation away. */
    useEffect(() => {
        const flushOnHidden = () => {
            if (autosaveTimerRef.current) {
                clearTimeout(autosaveTimerRef.current);
                autosaveTimerRef.current = null;
                debouncePendingRef.current = false;
            }
            const dirty =
                JSON.stringify(orderConfigRef.current) !== JSON.stringify(originalOrderConfigRef.current);
            if (!dirty) return;
            if (!buildClientPortalUpcomingPayload(orderConfigRef.current, clientRef.current)) return;
            enqueueAutosaveFlush();
        };

        const onVisibility = () => {
            if (document.visibilityState === 'hidden') flushOnHidden();
        };

        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('pagehide', flushOnHidden);

        return () => {
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('pagehide', flushOnHidden);
        };
    }, [enqueueAutosaveFlush]);

    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            const pendingTimer = autosaveTimerRef.current !== null;
            if (savingRef.current || debouncePendingRef.current || pendingTimer) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, []);

    const hasOrderIssue = !validationStatus.isValid && !!validationStatus.error;
    const saveBarShowsIssue = hasOrderIssue && !saving;

    let bottomBarBg = '#f8fafc';
    let bottomBarBorder = '#e2e8f0';
    let bottomBarShadow = '0 -4px 20px -8px rgba(15, 23, 42, 0.08)';
    let bottomBarTextColor = '#475569';
    if (saving) {
        bottomBarBg = '#d1fae5';
        bottomBarBorder = '#10b981';
        bottomBarShadow = '0 -10px 30px -5px rgba(16, 185, 129, 0.35)';
        bottomBarTextColor = '#065f46';
    } else if (saveError) {
        bottomBarBg = '#fef2f2';
        bottomBarBorder = '#dc2626';
        bottomBarShadow = '0 -6px 24px -8px rgba(220, 38, 38, 0.2)';
        bottomBarTextColor = '#991b1b';
    } else if (saveBarShowsIssue) {
        bottomBarBg = '#fff1f2';
        bottomBarBorder = '#e11d48';
        bottomBarShadow = '0 -10px 30px -5px rgba(225, 29, 72, 0.25)';
        bottomBarTextColor = '#9f1239';
    } else if (configChanged) {
        bottomBarBg = '#f1f5f9';
        bottomBarBorder = '#94a3b8';
        bottomBarShadow = '0 -6px 24px -8px rgba(51, 65, 85, 0.12)';
        bottomBarTextColor = '#334155';
    }

    const bottomBarPrimaryText = saving
        ? 'Saving'
        : saveError
            ? `Couldn’t save: ${saveError}`
            : saveBarShowsIssue
                ? `${PLEASE_UPDATE_ORDER_TITLE} — details below.`
                : configChanged
                    ? 'Saving automatically…'
                    : 'Saved';

    return (
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
            <PassoverWarningBanner />
            <div
                className={`${stylesClientPortal.portalContainer} ${stylesClientPortal.saveBarVisible}`}
                style={{ flex: 1, minHeight: 0, height: '100%' }}
            >
            {/* Left Sidebar */}
            <ClientPortalSidebar client={client} serviceType={serviceType} />

            {/* Main Content Area */}
            <div className={stylesClientPortal.mainColumn}>

                {/* Sticky Header */}
                <ClientPortalHeader
                    client={client}
                    serviceType={serviceType}
                    totalMealCount={totalMealCount}
                    approvedLimit={client.approvedMealsPerWeek}
                    validationTitle={PLEASE_UPDATE_ORDER_TITLE}
                    validationError={validationStatus.error}
                    takingEffectDate={takingEffectDate}
                    onAddVendor={canManageFoodKitchenVendor ? handleAddVendorBlock : undefined}
                    onAddMeal={handleAddMeal}
                    mealCategories={mealCategories}
                    orderConfig={orderConfig}
                />

                {/* Scrollable Content */}
                <div className={stylesClientPortal.scrollableContent}>

                    <div className={styles.alert} style={{ marginBottom: '1rem', alignItems: 'flex-start' }}>
                        <Info size={16} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden />
                        <div style={{ fontWeight: 500 }}>
                            PLEASE NOTE: ANY CHANGES TO AN ORDER NEED TO BE SUBMITTED BY TUESDAY 11:59 PM TO TAKE EFFECT FOR THE FOLLOWING WEEK
                        </div>
                    </div>

                    {(serviceType === 'Food' || serviceType === 'Meal') && (
                        <FoodServiceWidget
                            orderConfig={orderConfig}
                            setOrderConfig={setOrderConfig}
                            client={client}
                            vendors={vendors}
                            menuItems={menuItems}
                            mealCategories={mealCategories}
                            mealItems={mealItems}
                            isClientPortal={true}
                            allowVendorSelection={canManageFoodKitchenVendor}
                            serviceType={serviceType}
                            validationStatus={validationStatus}
                        />
                    )}

                    {serviceType === 'Boxes' && (
                        <div>
                            <div className={stylesClientPortal.boxPortalEaseRow}>
                                <p className={stylesClientPortal.boxPortalEaseHelp}>
                                    {boxSimpleUi ? (
                                        <>
                                            You’re using the step-by-step menus.{' '}
                                            <button
                                                type="button"
                                                className={stylesClientPortal.boxPortalEaseLink}
                                                onClick={() => setBoxSimpleUi(false)}
                                            >
                                                Switch to the standard box builder
                                            </button>
                                            .
                                        </>
                                    ) : (
                                        <>
                                            Not sure what to do?{' '}
                                            <button
                                                type="button"
                                                className={stylesClientPortal.boxPortalEaseLink}
                                                onClick={() => setBoxSimpleUi(true)}
                                            >
                                                Click here for an easier step-by-step interface
                                            </button>
                                            .
                                        </>
                                    )}
                                </p>
                            </div>
                            <BoxSelectorDemoClient
                                menuItems={menuItems}
                                categories={categories}
                                boxTypes={boxTypes}
                                vendors={vendors}
                                quotasByBoxType={quotasByBoxType}
                                value={boxSelectorValue}
                                onChange={(nextBoxes) =>
                                    setOrderConfig((prev: any) => ({
                                        ...prev,
                                        serviceType: 'Boxes',
                                        boxOrders: nextBoxes,
                                    }))
                                }
                                maxBoxes={client.approvedMealsPerWeek ?? undefined}
                                embedded
                                showRefreshButton={false}
                                showKitchenVendorPicker={false}
                                simpleUi={boxSimpleUi}
                                foodBoxCategoryId={(settings as { foodBoxCategoryId?: string | null })?.foodBoxCategoryId ?? null}
                                embeddedFinderEasePrompt={
                                    !boxSimpleUi ? (
                                        <>
                                            Not sure what to do?{' '}
                                            <button
                                                type="button"
                                                className={stylesClientPortal.boxPortalEaseLink}
                                                onClick={() => setBoxSimpleUi(true)}
                                            >
                                                Click here for an easier step-by-step interface
                                            </button>
                                            .
                                        </>
                                    ) : undefined
                                }
                            />
                        </div>
                    )}


                </div>
            </div>

            {/* Right Sidebar - Summary */}
            <ClientPortalOrderSummary
                orderConfig={orderConfig}
                setOrderConfig={setOrderConfig}
                vendors={vendors}
                menuItems={menuItems}
                mealCategories={mealCategories}
                mealItems={mealItems}
                categories={categories}
                hideVendorNames={!canManageFoodKitchenVendor}
            />

            <>
                <style>{`
                    @media (max-width: 768px) {
                        .save-bar-container { padding: 0.75rem 1rem !important; }
                        .save-bar-content { flex-direction: column !important; gap: 0.75rem !important; }
                    }
                `}</style>
                <div
                    className="save-bar-container"
                    style={{
                        position: 'fixed',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        backgroundColor: bottomBarBg,
                        borderTop: `4px solid ${bottomBarBorder}`,
                        boxShadow: bottomBarShadow,
                        zIndex: 1000,
                        backdropFilter: 'blur(10px)',
                        display: 'flex',
                        flexDirection: 'column',
                    }}
                >
                    <div className="save-bar-content" style={{ maxWidth: '1200px', width: '100%', margin: '0 auto', display: 'flex', alignItems: 'center', padding: '12px 24px' }}>
                        <div style={{
                            flex: 1,
                            fontWeight: 600,
                            color: bottomBarTextColor,
                        }}>
                            {bottomBarPrimaryText}
                        </div>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button
                                type="button"
                                onClick={handleDiscard}
                                className="btn btn-secondary"
                                disabled={saving || !orderDiffersFromSession}
                                style={{ padding: '8px 16px', borderRadius: '6px' }}
                            >
                                Discard
                            </button>
                        </div>
                    </div>

                    {saveBarShowsIssue && validationStatus.error && (
                        <div
                            role="alert"
                            style={{
                                backgroundColor: '#ffe4e6',
                                borderTop: '1px solid #fecdd3',
                                padding: '12px 24px',
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '12px',
                            }}
                        >
                            <AlertTriangle size={16} strokeWidth={2.25} style={{ flexShrink: 0, marginTop: 2, color: '#e11d48' }} aria-hidden />
                            <div className={stylesClientPortal.headerOrderIssueBody} style={{ minWidth: 0 }}>
                                <div className={stylesClientPortal.headerOrderIssueTitle}>{PLEASE_UPDATE_ORDER_TITLE}</div>
                                <p className={stylesClientPortal.headerOrderIssueDetail}>{validationStatus.error}</p>
                            </div>
                        </div>
                    )}
                </div>
            </>
        </div>
        </div>
    );
};

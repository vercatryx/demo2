'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ClientProfile, ClientStatus, Navigator, Vendor, MenuItem, BoxType, ItemCategory, BoxQuota, MealCategory, MealItem, AppSettings } from '@/lib/types';
import { getBoxQuotas, updateClientUpcomingOrder } from '@/lib/actions';
import { getPortalSaveProbe, syncOrderHistoryIfStale } from '@/lib/portal-v2-server-actions';
import { getSettings } from '@/lib/cached-data';
import { getNextDeliveryDate as getNextDeliveryDateUtil, getTakeEffectDate, formatDeliveryDate, calculateVendorEffectiveDate } from '@/lib/order-dates';
import { isMeetingMinimum, isExceedingMaximum, isMeetingExactTarget, getItemPoints } from '@/lib/utils';
import { Info, AlertTriangle } from 'lucide-react';
import styles from './ClientProfile.module.css';
import FoodServiceWidget from './FoodServiceWidget';
import ClientPortalSidebar from './ClientPortalSidebar';
import ClientPortalHeader from './ClientPortalHeader';
import ClientPortalOrderSummary from './ClientPortalOrderSummary';
import { PassoverWarningBanner } from '@/components/PassoverWarningBanner';
import { AppVersionWatcher } from '@/components/AppVersionWatcher';
import { ClientPortalV2 } from '@/components/clients/portal-v2/ClientPortalV2';
import stylesClientPortal from './ClientPortal.module.css';
import { BoxSelectorDemoClient, type BoxSelectorBoxValue } from '@/components/admin/box-selector-demo/BoxSelectorDemoClient';
import {
    consolidateBoxOrdersOnSave,
    getBoxAllowanceMultiplier,
    mergeBoxOrdersForPortal,
} from '@/lib/box-order-consolidation';
import { cleanUpcomingOrderJson } from '@/lib/clean-inactive-upcoming-order';
import { normalizeUpcomingOrderJson } from '@/lib/upcoming-order-converter';
import type { SwitchableClientAccount } from '@/lib/client-portal-account-switch';
import { switchClientPortalAccount } from '@/lib/auth-actions';
import type { ClientFacingOrderHistoryEntry } from '@/lib/client-facing-order-history';
import { shouldUsePortalV2, applyPortalVersionFromUrl } from '@/lib/portal-v2-access';
import { PortalV2SwitchBanner } from '@/components/clients/PortalV2SwitchBanner';
import { PortalLinkedAccounts } from '@/components/clients/portal-v2/PortalLinkedAccounts';
import {
    computeHouseholdMemberAllocations,
    getHouseholdPooledMealLimit,
    isHouseholdFoodPoolingEligible,
    mergeFoodOrderConfigs,
    sortHouseholdOrderMembers,
    splitFoodOrderWaterfall,
    type HouseholdOrderMember,
} from '@/lib/household-food-order-pool';
import {
    clearPortalCartDraft,
    readPortalCartDraft,
    writePortalCartDraft,
} from '@/lib/portal-cart-draft';
import { escalatePortalCartToTeam } from '@/lib/portal-save-escalation';
import { getPortalSaveSeq, nextPortalSaveSeq, withPortalSaveSeq } from '@/lib/portal-save-seq';

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
    /** Food/Meal: Add Kitchen Facilities, vendor selection, and summary vendor names for portal viewers. Never affects box Kitchen/vendor row. */
    canManageFoodKitchenVendor?: boolean;
    /** When true, phaseout items are hidden unless already on the client's order. */
    hidePhaseoutUnlessOnOrder?: boolean;
    switchableAccounts?: SwitchableClientAccount[];
    /** Linked Food/Meal accounts for pooled portal ordering (2+ members). */
    householdOrderMembers?: HouseholdOrderMember[];
    /** True when the viewer is logged in as the client (not staff preview). */
    isClientPortalSession?: boolean;
    /** When true (from server allowlist), show portal v2 without global admin setting. */
    portalV2Allowlisted?: boolean;
    /** Past orders for the client-facing recent orders section. */
    recentOrders?: ClientFacingOrderHistoryEntry[];
}

function computeInitialOrderConfig(
    upcomingOrder: any,
    client: ClientProfile | null,
    householdOrderMembers?: HouseholdOrderMember[],
): any {
    if (!client) return {};

    if (
        householdOrderMembers &&
        householdOrderMembers.length >= 2 &&
        isHouseholdFoodPoolingEligible(client.serviceType)
    ) {
        const configs = householdOrderMembers.map((member) => member.upcomingOrder ?? { serviceType: client.serviceType });
        const merged = mergeFoodOrderConfigs(configs, client.serviceType);
        if (!merged.caseId) {
            merged.caseId =
                (upcomingOrder as any)?.caseId ||
                (client.upcomingOrder as any)?.caseId ||
                (client as any).caseID;
        }
        return merged;
    }

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
        configToSet = { serviceType: client.serviceType };
    }
    return normalizeUpcomingOrderJson(configToSet) ?? configToSet;
}

function stripInactiveCatalogFromOrderConfig(
    orderConfig: any,
    menuItems: MenuItem[],
    mealItems: MealItem[],
): any {
    if (!orderConfig || typeof orderConfig !== 'object') return orderConfig;
    const inactiveMenu = new Set(menuItems.filter((m) => m.isActive === false).map((m) => m.id));
    const inactiveMeal = new Set(mealItems.filter((m) => m.isActive === false).map((m) => m.id));
    const { cleaned } = cleanUpcomingOrderJson(orderConfig, inactiveMenu, inactiveMeal);
    return cleaned;
}

/** Same normalization as manual save; returns null when Food order cannot be persisted (missing case id). */
function buildClientPortalUpcomingPayload(
    orderConfig: any,
    client: ClientProfile,
    menuItems: MenuItem[],
    mealItems: MealItem[],
): any | null {
    const effectiveType = orderConfig?.serviceType ?? client.serviceType;
    const resolvedCaseId =
        orderConfig?.caseId || (client as any).caseID || (client.upcomingOrder as any)?.caseId;

    if (effectiveType === 'Food' && !resolvedCaseId) {
        return null;
    }

    const cleanedOrderConfig = { ...orderConfig };
    // Persist the resolved case id (order ∪ client ∪ upcoming), not only orderConfig.caseId.
    cleanedOrderConfig.caseId = resolvedCaseId;

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
        const boxMultiplier = getBoxAllowanceMultiplier(client.approvedMealsPerWeek);
        const rawBoxOrders = orderConfig.boxOrders || [];
        cleanedOrderConfig.boxOrders =
            rawBoxOrders.length > 0
                ? consolidateBoxOrdersOnSave(
                      mergeBoxOrdersForPortal(rawBoxOrders, boxMultiplier),
                      boxMultiplier,
                  )
                : [];

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

        cleanedOrderConfig.itemPrices = orderConfig.itemPrices || {};
    }

    const stripped = stripInactiveCatalogFromOrderConfig(cleanedOrderConfig, menuItems, mealItems);

    return normalizeUpcomingOrderJson({
        ...stripped,
        serviceType: effectiveType,
        notes: stripped.notes,
    }) ?? { ...stripped, serviceType: effectiveType, notes: stripped.notes };
}

/** Short debounce; tab hide/pagehide also flush immediately so users do not lose edits when leaving quickly. */
const CLIENT_PORTAL_AUTOSAVE_DEBOUNCE_MS = 500;
/** Cap mid-edit retry loops so a non-converging strip/normalize cannot hold "Saving…" forever. */
const CLIENT_PORTAL_AUTOSAVE_MAX_LOOPS = 6;
/**
 * Per-attempt abort. Kept short on purpose: a stalled request is dealt with by
 * probing + resending a fresh request, not by waiting longer on a dead socket.
 */
const CLIENT_PORTAL_AUTOSAVE_TIMEOUT_MS = 15_000;

async function withAutosaveTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<T>((_, reject) => {
                timer = setTimeout(() => {
                    reject(
                        new Error(
                            `${label} is taking too long. Check your connection and try again.`,
                        ),
                    );
                }, CLIENT_PORTAL_AUTOSAVE_TIMEOUT_MS);
            }),
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

/**
 * After a save attempt fails client-side (timeout / dropped response), the
 * write may still have committed on the server — the HTTP request is not
 * cancelled by our timeout. Each save carries a unique _portalSaveSeq token,
 * so a lean probe tells us definitively whether our exact write landed.
 * Returns the server timestamp when every attempted write is confirmed.
 */
async function verifyPortalSaveLanded(
    saves: Array<{ id: string; seqs: number[] }>,
): Promise<string | null> {
    // The failed request may still be committing — slow saves have been observed
    // landing well after the client timeout, so keep polling for a while.
    for (let attempt = 0; attempt < 7; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 3000));
        try {
            const probes = await Promise.all(saves.map((s) => getPortalSaveProbe(s.id)));
            // Every retry attempt of one logical save wrote the same payload, so a row
            // holding ANY of the attempted tokens means our data landed.
            if (probes.every((p: { saveSeq: number; updatedAt: string | null }, i: number) => saves[i].seqs.includes(p.saveSeq))) {
                return probes[0]?.updatedAt ?? new Date().toISOString();
            }
            // A strictly newer token on any row means another save won — not ours.
            if (probes.some((p: { saveSeq: number }, i: number) => p.saveSeq > Math.max(...saves[i].seqs))) return null;
        } catch {
            // Probe itself failed (e.g. offline) — retry on the next loop.
        }
    }
    return null;
}

/** Deterministic rejections (validation / business rules) that resending cannot fix. */
function isRetryablePortalSaveError(error: unknown): boolean {
    const m = error instanceof Error ? error.message : String(error);
    // "unexpected response" is Next's message when the action POST dies at the
    // proxy layer (502/504/HTML error page) — transport-level, resend usually works.
    return /taking too long|did not stick|did not complete|failed to fetch|fetch failed|network|load failed|unexpected response/i.test(
        m,
    );
}

/**
 * One logical save = up to 3 physical attempts. A stalled request is abandoned
 * after the per-attempt timeout, checked against the server (it may have landed
 * anyway), and otherwise resent fresh — observed stalls are one-off request
 * hangs where an immediate resend succeeds. Clients should never see a failure
 * for a save that a silent retry could complete.
 */
async function savePortalOrderWithRetry(params: {
    clientId: string;
    payload: Record<string, unknown>;
    nextSeq: () => number;
    options: Parameters<typeof updateClientUpcomingOrder>[2];
    onAttempt: (seq: number) => void;
}): Promise<{ confirmedAt: string }> {
    const MAX_ATTEMPTS = 3;
    const attemptedSeqs: number[] = [];
    let lastError: unknown = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const seq = params.nextSeq();
        attemptedSeqs.push(seq);
        params.onAttempt(seq);
        try {
            const saved = await withAutosaveTimeout(
                updateClientUpcomingOrder(
                    params.clientId,
                    withPortalSaveSeq(params.payload, seq),
                    params.options,
                ),
                'Saving your order',
            );
            const confirmedAt = assertServerSaveConfirmed(saved);
            const echoed = getPortalSaveSeq(saved?.upcomingOrder);
            if (echoed > 0 && echoed !== seq) {
                throw new Error('Save did not stick. Please click Save Order again.');
            }
            return { confirmedAt };
        } catch (error) {
            lastError = error;
            if (!isRetryablePortalSaveError(error)) throw error;
            console.warn(
                `[ClientPortal] Save attempt ${attempt + 1}/${MAX_ATTEMPTS} failed, checking server`,
                error,
            );
            // A stalled request (this attempt OR an earlier one landing late) may
            // still have committed — every attempt carries the same payload, so a
            // row holding any attempted token means our data is saved.
            try {
                const probe = await getPortalSaveProbe(params.clientId);
                if (attemptedSeqs.includes(probe.saveSeq)) {
                    return { confirmedAt: probe.updatedAt ?? new Date().toISOString() };
                }
            } catch {
                // Probe unreachable — fall through to a fresh resend.
            }
            if (attempt < MAX_ATTEMPTS - 1) {
                await new Promise((r) => setTimeout(r, 1000));
            }
        }
    }
    throw lastError;
}

/** Same headline as the header issue strip so top and bottom stay aligned. */
const PLEASE_UPDATE_ORDER_TITLE = 'Please update your order';

/** Detail text only (save bar prefixes with "Couldn't save: "). */
function formatClientPortalSaveError(error: unknown): string {
    const raw = error instanceof Error ? error.message : String(error);
    let m = raw.trim();
    // Stale bundle after a deploy: the browser calls a server action id the new
    // build no longer exposes. Only a refresh fixes this.
    if (/failed to find server action|server action.*not found|unexpected response.*server action/i.test(m)) {
        return 'This page is out of date after a site update. Please refresh the page and try again — your cart is kept as a draft.';
    }
    if (m.startsWith('Error:')) m = m.slice(6).trim();
    const dup = /^couldn'?t save\s*:\s*/i;
    if (dup.test(m)) m = m.replace(dup, '').trim();
    return m || 'Could not save';
}

/** Require a server row timestamp before treating a portal save as confirmed. */
function assertServerSaveConfirmed(saved: ClientProfile | null | undefined): string {
    const at = saved?.updatedAt?.trim();
    if (!at) {
        throw new Error('Save did not complete. Please try again.');
    }
    return at;
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
    canManageFoodKitchenVendor = false,
    hidePhaseoutUnlessOnOrder = true,
    switchableAccounts,
    householdOrderMembers = [],
    isClientPortalSession = false,
    portalV2Allowlisted = false,
    recentOrders = [],
}: Props) {
    const [client, setClient] = useState<ClientProfile>(initialClient);
    const [activeBoxQuotas, setActiveBoxQuotas] = useState<BoxQuota[]>([]);

    const [orderConfig, setOrderConfig] = useState<any>(() =>
        computeInitialOrderConfig(upcomingOrder, initialClient, householdOrderMembers),
    );
    const [originalOrderConfig, setOriginalOrderConfig] = useState<any>(() => {
        const c = computeInitialOrderConfig(upcomingOrder, initialClient, householdOrderMembers);
        return JSON.parse(JSON.stringify(c));
    });
    const orderConfigRef = useRef(orderConfig);
    orderConfigRef.current = orderConfig;
    const menuItemsRef = useRef(menuItems);
    menuItemsRef.current = menuItems;
    const mealItemsRef = useRef(mealItems);
    mealItemsRef.current = mealItems;
    const clientRef = useRef(client);
    clientRef.current = client;
    const originalOrderConfigRef = useRef(originalOrderConfig);
    originalOrderConfigRef.current = originalOrderConfig;

    const pooledFoodMembers = useMemo(() => {
        if (householdOrderMembers.length < 2) return [];
        if (!isHouseholdFoodPoolingEligible(client.serviceType)) return [];
        return sortHouseholdOrderMembers(householdOrderMembers, client.id);
    }, [householdOrderMembers, client.id, client.serviceType]);

    const pooledMealLimit = useMemo(
        () =>
            pooledFoodMembers.length > 1
                ? getHouseholdPooledMealLimit(pooledFoodMembers)
                : client.approvedMealsPerWeek || 0,
        [pooledFoodMembers, client.approvedMealsPerWeek],
    );

    const pooledFoodMembersRef = useRef(pooledFoodMembers);
    pooledFoodMembersRef.current = pooledFoodMembers;

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
    /** True while debounce timer is waiting before the server save starts. */
    const [autosaveScheduled, setAutosaveScheduled] = useState(false);
    /** Set from server `updated_at` after a confirmed save (including initial page load). */
    const [serverConfirmedAt, setServerConfirmedAt] = useState<string | null>(
        initialClient.updatedAt?.trim() || null,
    );
    /** Only set when a save actually fails (shown in the persistent top banner — no save toast). */
    const [saveError, setSaveError] = useState<string | null>(null);
    /** autosave until a save is slow/fails; then require explicit Save Order for the rest of the session. */
    const [saveMode, setSaveMode] = useState<'auto' | 'manual'>('auto');
    /** Blocking modal until the user acknowledges autosave is off (shown once per session). */
    const [autosaveOffModalOpen, setAutosaveOffModalOpen] = useState(false);
    const [autosaveOffReason, setAutosaveOffReason] = useState<'slow' | 'error'>('slow');
    /** Red bar after the user acknowledges the modal. */
    const [autosaveDisabledBanner, setAutosaveDisabledBanner] = useState(false);
    /** True only after the user clicks Save Order and that attempt fails — unlocks escalate. */
    const [manualSaveFailed, setManualSaveFailed] = useState(false);
    const [escalating, setEscalating] = useState(false);
    const [escalateMessage, setEscalateMessage] = useState<string | null>(null);
    const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
    const [profileMessage, setProfileMessage] = useState<string | null>('');
    const saveModeRef = useRef<'auto' | 'manual'>('auto');
    const manualSaveInFlightRef = useRef(false);
    /** Invalidates stale in-flight server writes that race past abandon / a newer save. */
    const portalSaveSeqRef = useRef(0);
    /** Only show the blocking "autosave off" modal once; later failures use the status line. */
    const autosaveOffAnnouncedRef = useRef(false);
    useEffect(() => {
        saveModeRef.current = saveMode;
    }, [saveMode]);

    const [settings, setSettings] = useState<AppSettings | null>(null);
    /** Progressive dropdown UI for box ordering (default: step-by-step; toggle for folder/column builder). */
    const [boxSimpleUi, setBoxSimpleUi] = useState(true);
    useEffect(() => {
        getSettings().then(setSettings);
    }, []);

    useEffect(() => {
        applyPortalVersionFromUrl(new URLSearchParams(window.location.search));
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
        if (initialClient.updatedAt?.trim()) {
            setServerConfirmedAt(initialClient.updatedAt.trim());
        }
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
    /** JSON snapshot of orderConfig when the last autosave failure was recorded — blocks auto-retry until the user edits. */
    const failedAutosaveSnapRef = useRef<string | null>(null);
    /** Incremented on discard to drop stale results from autosave still in flight. */
    const persistGenerationRef = useRef(0);

    /** Snapshot taken whenever upcoming order is loaded from the server; Discard restores this (local + DB). */
    const [sessionBaselineOrder, setSessionBaselineOrder] = useState<any | null>(null);
    const sessionBaselineOrderRef = useRef<any | null>(null);
    sessionBaselineOrderRef.current = sessionBaselineOrder;

    const orderDiffersFromSession = useMemo(() => {
        if (sessionBaselineOrder === null) return false;
        return JSON.stringify(orderConfig) !== JSON.stringify(sessionBaselineOrder);
    }, [orderConfig, sessionBaselineOrder]);

    useEffect(() => {
        savingRef.current = saving;
    }, [saving]);

    /** Persists until local order matches last saved snapshot; loops if the user edits mid-request. */
    const flushAutosaveToServer = useCallback(async (opts?: { portalSessionHistory?: boolean }) => {
        const c = clientRef.current;
        const alreadySynced =
            JSON.stringify(orderConfigRef.current) === JSON.stringify(originalOrderConfigRef.current);

        if (alreadySynced) {
            if (opts?.portalSessionHistory && c) {
                const members = pooledFoodMembersRef.current;
                const effectiveType = orderConfigRef.current?.serviceType ?? c.serviceType;
                const resolvedCaseId =
                    orderConfigRef.current?.caseId ||
                    (c.upcomingOrder as { caseId?: string } | undefined)?.caseId ||
                    (c as { caseID?: string }).caseID;

                if (members.length > 1 && isHouseholdFoodPoolingEligible(effectiveType)) {
                    const split = splitFoodOrderWaterfall(
                        orderConfigRef.current,
                        members,
                        menuItemsRef.current,
                        mealItemsRef.current,
                        effectiveType,
                    );
                    for (const member of members) {
                        const memberConfig = split.get(member.id) || { serviceType: effectiveType };
                        if (!memberConfig.caseId && resolvedCaseId) {
                            memberConfig.caseId = resolvedCaseId;
                        }
                        const memberClient: ClientProfile =
                            member.id === c.id
                                ? c
                                : {
                                      ...c,
                                      id: member.id,
                                      fullName: member.name,
                                      serviceType: (member.serviceType ||
                                          c.serviceType) as ClientProfile['serviceType'],
                                      approvedMealsPerWeek: member.approvedMealsPerWeek,
                                      upcomingOrder:
                                          (member.upcomingOrder as ClientProfile['upcomingOrder']) ??
                                          c.upcomingOrder,
                                  };
                        const memberPayload = buildClientPortalUpcomingPayload(
                            memberConfig,
                            memberClient,
                            menuItemsRef.current,
                            mealItemsRef.current,
                        );
                        if (!memberPayload) continue;
                        await syncOrderHistoryIfStale(member.id, memberPayload, {
                            portalSession: true,
                            savedFrom: 'portal',
                        });
                    }
                } else {
                    const payload = buildClientPortalUpcomingPayload(
                        orderConfigRef.current,
                        c,
                        menuItemsRef.current,
                        mealItemsRef.current,
                    );
                    if (payload) {
                        await syncOrderHistoryIfStale(c.id, payload, {
                            portalSession: true,
                            savedFrom: 'portal',
                        });
                    }
                }
            }
            if (manualSaveInFlightRef.current) {
                failedAutosaveSnapRef.current = null;
                setSaveError(null);
                setEscalateMessage(null);
                setManualSaveFailed(false);
                setSaveSuccessMessage('Saved successfully. Your order is on the server.');
                setAutosaveOffModalOpen(false);
                manualSaveInFlightRef.current = false;
            }
            setSaving(false);
            savingRef.current = false;
            return;
        }

        const genAtStart = persistGenerationRef.current;
        const isManualAttempt = manualSaveInFlightRef.current;

        setSaving(true);
        savingRef.current = true;

        // Tracks the writes of the current loop iteration so the catch block can
        // probe the server and recover saves that landed despite a client-side error.
        let lastAttempt: {
            snapJson: string;
            expected: number;
            saves: Array<{ id: string; seqs: number[] }>;
        } | null = null;

        try {
            let softFailure = false;
            let loopCount = 0;
            while (JSON.stringify(orderConfigRef.current) !== JSON.stringify(originalOrderConfigRef.current)) {
                if (genAtStart !== persistGenerationRef.current) {
                    return;
                }
                if (++loopCount > CLIENT_PORTAL_AUTOSAVE_MAX_LOOPS) {
                    // The user kept editing while each iteration saved fine (seen with slow
                    // connections). Everything up to the last snapshot IS saved — exit quietly
                    // and let the debounced autosave pick up the remainder. Never surface an
                    // error for saves that are succeeding.
                    break;
                }
                const strippedConfig = stripInactiveCatalogFromOrderConfig(
                    orderConfigRef.current,
                    menuItemsRef.current,
                    mealItemsRef.current,
                );
                if (JSON.stringify(strippedConfig) !== JSON.stringify(orderConfigRef.current)) {
                    setOrderConfig(strippedConfig);
                    orderConfigRef.current = strippedConfig;
                }
                const payload = buildClientPortalUpcomingPayload(
                    orderConfigRef.current,
                    c,
                    menuItemsRef.current,
                    mealItemsRef.current,
                );
                if (!payload) {
                    softFailure = true;
                    if (genAtStart === persistGenerationRef.current) {
                        failedAutosaveSnapRef.current = JSON.stringify(orderConfigRef.current);
                        setSaveError('Could not save: missing case ID for this order.');
                    }
                    break;
                }
                const snapJson = JSON.stringify(orderConfigRef.current);
                const members = pooledFoodMembersRef.current;
                const effectiveType = orderConfigRef.current?.serviceType ?? c.serviceType;
                const resolvedCaseId =
                    orderConfigRef.current?.caseId ||
                    (c.upcomingOrder as { caseId?: string } | undefined)?.caseId ||
                    (c as { caseID?: string }).caseID;

                if (members.length > 1 && isHouseholdFoodPoolingEligible(effectiveType)) {
                    const split = splitFoodOrderWaterfall(
                        orderConfigRef.current,
                        members,
                        menuItemsRef.current,
                        mealItemsRef.current,
                        effectiveType,
                    );
                    let confirmedAt = '';
                    let householdSaveFailed = false;
                    lastAttempt = { snapJson, expected: members.length, saves: [] };
                    for (const member of members) {
                        const memberConfig = split.get(member.id) || { serviceType: effectiveType };
                        if (!memberConfig.caseId && resolvedCaseId) {
                            memberConfig.caseId = resolvedCaseId;
                        }
                        const memberClient: ClientProfile =
                            member.id === c.id
                                ? c
                                : {
                                      ...c,
                                      id: member.id,
                                      fullName: member.name,
                                      serviceType: (member.serviceType || c.serviceType) as ClientProfile['serviceType'],
                                      approvedMealsPerWeek: member.approvedMealsPerWeek,
                                      upcomingOrder: (member.upcomingOrder as ClientProfile['upcomingOrder']) ?? c.upcomingOrder,
                                  };
                        const memberPayload = buildClientPortalUpcomingPayload(
                            memberConfig,
                            memberClient,
                            menuItemsRef.current,
                            mealItemsRef.current,
                        );
                        if (!memberPayload) {
                            householdSaveFailed = true;
                            softFailure = true;
                            if (genAtStart === persistGenerationRef.current) {
                                failedAutosaveSnapRef.current = JSON.stringify(orderConfigRef.current);
                                setSaveError(`Could not save order for ${member.name}: missing case ID.`);
                            }
                            break;
                        }
                        const memberAttempt = { id: member.id, seqs: [] as number[] };
                        lastAttempt.saves.push(memberAttempt);
                        const { confirmedAt: memberConfirmedAt } = await savePortalOrderWithRetry({
                            clientId: member.id,
                            payload: memberPayload as Record<string, unknown>,
                            nextSeq: () =>
                                (portalSaveSeqRef.current = nextPortalSaveSeq(portalSaveSeqRef.current)),
                            options: {
                                skipOrderHistory: true,
                                // Only write order_history on tab close / session end — not every autosave tick.
                                syncHistoryIfChanged: opts?.portalSessionHistory === true,
                                portalSessionHistory: opts?.portalSessionHistory,
                                skipRevalidation: true,
                                skipServerCatalogPreflight: true,
                                savedFrom: 'portal',
                            },
                            onAttempt: (seq) => {
                                memberAttempt.seqs.push(seq);
                            },
                        });
                        // Abandoned flushes must ignore results (stale race with a newer save).
                        if (genAtStart !== persistGenerationRef.current) {
                            return;
                        }
                        confirmedAt = memberConfirmedAt;
                    }
                    if (householdSaveFailed) {
                        break;
                    }
                    if (genAtStart !== persistGenerationRef.current) {
                        return;
                    }
                    // Always advance the saved baseline to what we just wrote. If the user
                    // edited mid-flight, the while-loop continues with the newer cart.
                    const parsed = JSON.parse(snapJson);
                    setOriginalOrderConfig(parsed);
                    originalOrderConfigRef.current = parsed;
                    lastSavedTimestampRef.current = confirmedAt;
                    setServerConfirmedAt(confirmedAt);
                    setClient((prev) => ({ ...prev, updatedAt: confirmedAt }));
                } else {
                    const singleAttempt = { id: c.id, seqs: [] as number[] };
                    lastAttempt = { snapJson, expected: 1, saves: [singleAttempt] };
                    const { confirmedAt } = await savePortalOrderWithRetry({
                        clientId: c.id,
                        payload: payload as Record<string, unknown>,
                        nextSeq: () =>
                            (portalSaveSeqRef.current = nextPortalSaveSeq(portalSaveSeqRef.current)),
                        options: {
                            skipOrderHistory: true,
                            // Only write order_history on tab close / session end — not every autosave tick.
                            syncHistoryIfChanged: opts?.portalSessionHistory === true,
                            portalSessionHistory: opts?.portalSessionHistory,
                            skipRevalidation: true,
                            skipServerCatalogPreflight: true,
                            savedFrom: 'portal',
                        },
                        onAttempt: (seq) => {
                            singleAttempt.seqs.push(seq);
                        },
                    });
                    // Abandoned flushes must ignore results (stale race with a newer save).
                    if (genAtStart !== persistGenerationRef.current) {
                        return;
                    }
                    const parsed = JSON.parse(snapJson);
                    setOriginalOrderConfig(parsed);
                    originalOrderConfigRef.current = parsed;
                    lastSavedTimestampRef.current = confirmedAt;
                    setServerConfirmedAt(confirmedAt);
                    setClient((prev) => ({ ...prev, updatedAt: confirmedAt }));
                }
            }
            // Only clear errors after a successful convergence — soft failures must stay visible.
            if (!softFailure && genAtStart === persistGenerationRef.current) {
                failedAutosaveSnapRef.current = null;
                setSaveError(null);
                setEscalateMessage(null);
                setManualSaveFailed(false);
                // Always resume autosave after a successful write — do not leave the
                // session stuck in manual mode from an earlier false alarm.
                saveModeRef.current = 'auto';
                setSaveMode('auto');
                setAutosaveDisabledBanner(false);
                setAutosaveOffModalOpen(false);
                autosaveOffAnnouncedRef.current = false;
                setSaveSuccessMessage(
                    isManualAttempt
                        ? 'Saved successfully. Your order is on the server.'
                        : 'Saved',
                );
                // Keep the local draft while any edits remain unsaved (max-loops exit).
                if (
                    c?.id &&
                    JSON.stringify(orderConfigRef.current) ===
                        JSON.stringify(originalOrderConfigRef.current)
                ) {
                    clearPortalCartDraft(c.id);
                }
            } else if (softFailure && genAtStart === persistGenerationRef.current) {
                setSaveSuccessMessage(null);
                const wasAuto = saveModeRef.current === 'auto';
                saveModeRef.current = 'manual';
                setSaveMode('manual');
                if (wasAuto && !autosaveOffAnnouncedRef.current) {
                    autosaveOffAnnouncedRef.current = true;
                    setAutosaveOffReason('error');
                    setAutosaveOffModalOpen(true);
                }
                if (isManualAttempt) {
                    setManualSaveFailed(true);
                }
            }
        } catch (error: unknown) {
            console.error('[ClientPortal] Auto-save failed:', error);
            // Before declaring failure, check whether the write actually landed —
            // a timed-out request still commits server-side ("saved but not registered").
            if (
                genAtStart === persistGenerationRef.current &&
                lastAttempt &&
                lastAttempt.saves.length === lastAttempt.expected
            ) {
                const recoveredAt = await verifyPortalSaveLanded(lastAttempt.saves);
                if (recoveredAt && genAtStart === persistGenerationRef.current) {
                    console.warn('[ClientPortal] Save reported failure but landed on server — recovered.');
                    const parsed = JSON.parse(lastAttempt.snapJson);
                    setOriginalOrderConfig(parsed);
                    originalOrderConfigRef.current = parsed;
                    lastSavedTimestampRef.current = recoveredAt;
                    setServerConfirmedAt(recoveredAt);
                    setClient((prev) => ({ ...prev, updatedAt: recoveredAt }));
                    failedAutosaveSnapRef.current = null;
                    setSaveError(null);
                    setEscalateMessage(null);
                    setManualSaveFailed(false);
                    saveModeRef.current = 'auto';
                    setSaveMode('auto');
                    setAutosaveDisabledBanner(false);
                    setAutosaveOffModalOpen(false);
                    autosaveOffAnnouncedRef.current = false;
                    setSaveSuccessMessage(
                        isManualAttempt ? 'Saved successfully. Your order is on the server.' : 'Saved',
                    );
                    if (c?.id) clearPortalCartDraft(c.id);
                    return;
                }
            }
            if (genAtStart === persistGenerationRef.current) {
                failedAutosaveSnapRef.current = JSON.stringify(orderConfigRef.current);
                const message = formatClientPortalSaveError(error);
                setSaveError(message);
                setSaveSuccessMessage(null);
                // Stay in autosave for soft/transient failures so a single blip doesn't
                // force every shopper into manual mode. Hard timeouts / sticky failures escalate.
                const hardFailure =
                    /taking too long|did not stick|did not complete|missing case/i.test(message);
                if (isManualAttempt || hardFailure) {
                    const wasAuto = saveModeRef.current === 'auto';
                    saveModeRef.current = 'manual';
                    setSaveMode('manual');
                    if (wasAuto && !autosaveOffAnnouncedRef.current) {
                        autosaveOffAnnouncedRef.current = true;
                        setAutosaveOffReason('error');
                        setAutosaveOffModalOpen(true);
                    }
                    if (isManualAttempt) {
                        setManualSaveFailed(true);
                    }
                }
            }
            throw error;
        } finally {
            setSaving(false);
            savingRef.current = false;
            if (isManualAttempt) {
                manualSaveInFlightRef.current = false;
            }
        }
    }, []);

    const acknowledgeAutosaveOff = useCallback(() => {
        setAutosaveOffModalOpen(false);
        setAutosaveDisabledBanner(true);
    }, []);

    const enqueueAutosaveFlush = useCallback(
        (opts?: { portalSessionHistory?: boolean }) => {
            // Never start another autosave once we've switched to manual.
            if (saveModeRef.current === 'manual') return;
            autosaveChainRef.current = autosaveChainRef.current
                .catch(() => {})
                .then(() => {
                    if (saveModeRef.current === 'manual') return;
                    return flushAutosaveToServer(opts);
                })
                // Keep the chain healthy; errors are already surfaced via saveError state.
                .catch(() => {});
        },
        [flushAutosaveToServer],
    );

    const flushBeforeAccountSwitch = useCallback(async () => {
        if (autosaveTimerRef.current) {
            clearTimeout(autosaveTimerRef.current);
            autosaveTimerRef.current = null;
            debouncePendingRef.current = false;
            setAutosaveScheduled(false);
        }
        const dirty =
            JSON.stringify(orderConfigRef.current) !== JSON.stringify(originalOrderConfigRef.current);
        if (dirty) {
            const proceed = window.confirm(
                'You have unsaved changes for this account. Save them and switch to another account?',
            );
            if (!proceed) {
                throw new Error('ACCOUNT_SWITCH_CANCELLED');
            }
            autosaveChainRef.current = autosaveChainRef.current.catch(() => {}).then(() => flushAutosaveToServer());
            await autosaveChainRef.current;
        }
    }, [flushAutosaveToServer]);

    const handlePortalAccountSwitch = useCallback(
        async (targetClientId: string) => {
            if (!isClientPortalSession) {
                window.location.assign(`/client-portal/${targetClientId}`);
                return { success: true as const };
            }
            await flushBeforeAccountSwitch();
            return switchClientPortalAccount(targetClientId);
        },
        [flushBeforeAccountSwitch, isClientPortalSession],
    );

    // Initialize order config from clients.upcoming_order only (current order — not activeOrder/old system).
    // Order Summary sidebar reads this same orderConfig; do not use activeOrder for the summary.
    useEffect(() => {
        if (!client) return;
        // Only hydrate from server once — avoid resetting local edits when `client` reference updates.
        if (hasInitializedRef.current) return;

        let configToSet = computeInitialOrderConfig(upcomingOrder, client, householdOrderMembers);

        const effectiveInitType = configToSet.serviceType ?? client.serviceType;
        if (
            effectiveInitType === 'Boxes' &&
            Array.isArray(configToSet.boxOrders) &&
            configToSet.boxOrders.length > 0
        ) {
            const boxMultiplier = getBoxAllowanceMultiplier(client.approvedMealsPerWeek);
            configToSet.boxOrders = consolidateBoxOrdersOnSave(
                mergeBoxOrdersForPortal(configToSet.boxOrders, boxMultiplier),
                boxMultiplier,
            );
        }

        const strippedConfig = stripInactiveCatalogFromOrderConfig(configToSet, menuItems, mealItems);
        const baseline = JSON.parse(JSON.stringify(strippedConfig));

        // If the browser holds an unsaved draft newer than the server row, restore it
        // as the working cart (keeping the server state as the saved baseline so the
        // draft is dirty and autosave pushes it). Without this, a failed save followed
        // by a reload silently discards everything the client added — observed losing
        // real items for CLIENT-6412 and CLIENT-8084 on 7/14.
        let workingConfig = strippedConfig;
        try {
            const draft = readPortalCartDraft(client.id);
            const draftAt = draft ? Date.parse(draft.savedAt) : NaN;
            const serverAt = Date.parse(client.updatedAt || '') || 0;
            const draftCfg = draft?.orderConfig as Record<string, unknown> | undefined;
            const draftType = String(draftCfg?.serviceType ?? draft?.serviceType ?? '');
            if (
                draftCfg &&
                Number.isFinite(draftAt) &&
                draftAt > serverAt &&
                (!draftType || draftType === String(effectiveInitType ?? ''))
            ) {
                const restored = stripInactiveCatalogFromOrderConfig(draftCfg, menuItems, mealItems);
                if (JSON.stringify(restored) !== JSON.stringify(strippedConfig)) {
                    workingConfig = restored;
                    console.warn('[ClientPortal] Restored unsaved local draft from', draft?.savedAt);
                }
            }
        } catch {
            // Unreadable draft — server state wins.
        }

        setOrderConfig(workingConfig);
        setOriginalOrderConfig(baseline);
        originalOrderConfigRef.current = baseline;
        setSessionBaselineOrder(JSON.parse(JSON.stringify(strippedConfig)));
        hasInitializedRef.current = true;

        // Update ref for upcoming order
        const currentUpcomingOrderId = upcomingOrder ? (
            typeof upcomingOrder === 'object' && !(upcomingOrder as any).serviceType ?
                (upcomingOrder as any)['default']?.id :
                (upcomingOrder as any)?.id
        ) : null;
        lastUpcomingOrderIdRef.current = currentUpcomingOrderId;

    }, [upcomingOrder, activeOrder, client, menuItems, mealItems, householdOrderMembers]);

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

    // Order JSON serviceType drives portal UI; client row is fallback only — see SERVICE_TYPE_SOURCE_OF_TRUTH.md
    const serviceType = orderConfig?.serviceType ?? client.serviceType;
    const showFoodKitchenFacilities = serviceType === 'Food' || serviceType === 'Meal';
    const quotasByBoxType = useMemo(() => {
        const grouped: Record<string, BoxQuota[]> = {};
        for (const bt of boxTypes) {
            grouped[bt.id] = activeBoxQuotas.filter((quota) => quota.boxTypeId === bt.id);
        }
        return grouped;
    }, [boxTypes, activeBoxQuotas]);
    const boxAllowanceMultiplier = getBoxAllowanceMultiplier(client.approvedMealsPerWeek);
    const boxSelectorValue = useMemo<BoxSelectorBoxValue[]>(() => {
        if (Array.isArray(orderConfig.boxOrders) && orderConfig.boxOrders.length > 0) {
            return [mergeBoxOrdersForPortal(orderConfig.boxOrders, boxAllowanceMultiplier)];
        }
        const firstActiveBoxType = boxTypes.find((bt) => bt.isActive);
        return [{
            boxTypeId: firstActiveBoxType?.id || '',
            vendorId: firstActiveBoxType?.vendorId || '',
            quantity: boxAllowanceMultiplier,
            items: {},
            itemNotes: {},
        }];
    }, [orderConfig.boxOrders, boxTypes, boxAllowanceMultiplier]);

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
            const isFoodOrMeal =
                orderConfig.serviceType === 'Food' || orderConfig.serviceType === 'Meal';
            if (isFoodOrMeal) {
                // Vendors (Food clients and Meal clients with vendor-based food orders)
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
                // Meal selections (Breakfast, Lunch, etc.)
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
            }
        } catch (e) {
            console.error('[totalMealCount] Calculation Error:', e);
        }
        return total;
    }, [orderConfig, menuItems, mealItems, client]);

    // Real-time Validation Effect
    useEffect(() => {
        validateOrder();
    }, [orderConfig, orderConfig?.serviceType, client.approvedMealsPerWeek, client.serviceType, totalMealCount, menuItems, mealItems, pooledMealLimit, pooledFoodMembers.length]);

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


            if ((effectiveType === 'Food' || effectiveType === 'Meal') && orderConfig.vendorSelections) {
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

                        if (countValue > 0 && !isMeetingMinimum(countValue, minMeals)) {
                            error = `${vendor.name} requires a minimum value of ${minMeals} per delivery. You have selected ${countValue}.`;
                            isValid = false;
                        }
                    }
                    if (!isValid) break;
                }
            }

            // Check Approved Limit (pooled across linked Food accounts when applicable)
            const limit = pooledFoodMembers.length > 1 ? pooledMealLimit : client.approvedMealsPerWeek || 0;
            if (limit > 0 && isExceedingMaximum(totalValue, limit)) {
                error = pooledFoodMembers.length > 1
                    ? `Total value selected (${totalValue.toFixed(2)}) exceeds the combined weekly allowance (${limit}) for linked accounts. Please reduce your order.`
                    : `Total value selected (${totalValue.toFixed(2)}) exceeds approved value per week (${limit}). Please reduce your order.`;
                isValid = false;
            }

            // 2. Meal Service Validation (Exact Targets per Category)
            if (isValid && orderConfig.mealSelections) {
                for (const [uniqueKey, config] of Object.entries(orderConfig.mealSelections) as [string, any][]) {
                    const mealType = config.mealType || uniqueKey.split('_')[0];
                    const catsForThisType = mealCategories.filter(c => c.mealType === mealType && c.isActive !== false);

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

            // 3. Box Service Validation (combined allowance across authorized boxes)
            if (isValid && effectiveType === 'Boxes' && orderConfig.boxOrders) {
                const multiplier = getBoxAllowanceMultiplier(client.approvedMealsPerWeek);
                const merged = mergeBoxOrdersForPortal(orderConfig.boxOrders, multiplier);
                const selectedItems = merged.items || {};

                categories.forEach(category => {
                    if (!isValid) return;

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
                    } else if (merged.boxTypeId) {
                        const quota = activeBoxQuotas.find(
                            q => q.boxTypeId === merged.boxTypeId && q.categoryId === category.id,
                        );
                        if (quota) {
                            requiredQuotaValue = quota.targetValue;
                        }
                    }

                    if (requiredQuotaValue !== null) {
                        requiredQuotaValue = requiredQuotaValue * multiplier;
                    }

                    if (requiredQuotaValue !== null && isExceedingMaximum(categoryQuotaValue, requiredQuotaValue)) {
                        const limitHint =
                            multiplier > 1
                                ? ` (combined limit for ${multiplier} authorized boxes)`
                                : '';
                        error = `${category.name}: Selected ${categoryQuotaValue} pts, but maximum is ${requiredQuotaValue} pts${limitHint}.`;
                        isValid = false;
                    }
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
        setServerConfirmedAt(null);

        const payload = buildClientPortalUpcomingPayload(reset, client, menuItems, mealItems);
        if (!payload) {
            return;
        }

        setSaving(true);
        savingRef.current = true;
        try {
            // Carry a fresh save token: without it the discard write erases the row's
            // seq guard, letting a stalled pre-discard autosave land afterwards and
            // silently resurrect the cart the user just discarded.
            const discardSeq = (portalSaveSeqRef.current = nextPortalSaveSeq(portalSaveSeqRef.current));
            const savedClient = await updateClientUpcomingOrder(
                client.id,
                withPortalSaveSeq(payload as Record<string, unknown>, discardSeq),
                {
                    skipOrderHistory: true,
                    syncHistoryIfChanged: false,
                    skipRevalidation: true,
                    skipServerCatalogPreflight: true,
                    savedFrom: 'portal',
                },
            );
            const confirmedAt = assertServerSaveConfirmed(savedClient);
            if (gen !== persistGenerationRef.current) return;
            lastSavedTimestampRef.current = confirmedAt;
            setServerConfirmedAt(confirmedAt);
            setClient((prev) => ({ ...prev, updatedAt: confirmedAt }));
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
    const savePending = saving || autosaveScheduled || configChanged;

    // Handlers needed for Header
    const handleAddVendorBlock = () => {
        setOrderConfig((prev: any) => {
            const newConfig = { ...prev };
            let selections = newConfig.vendorSelections ? [...newConfig.vendorSelections] : [];
            if (
                selections.length === 0 &&
                newConfig.deliveryDayOrders &&
                typeof newConfig.deliveryDayOrders === 'object'
            ) {
                const vendorMap = new Map<string, any>();
                for (const day of Object.keys(newConfig.deliveryDayOrders).sort()) {
                    const daySelections = newConfig.deliveryDayOrders[day]?.vendorSelections || [];
                    for (const sel of daySelections) {
                        if (!sel?.vendorId) continue;
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
                selections = Array.from(vendorMap.values());
            }
            selections.push({ vendorId: '', items: {} });
            newConfig.vendorSelections = selections;
            delete newConfig.deliveryDayOrders;
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

    // Keep a local draft so we can email the office if save keeps failing.
    useEffect(() => {
        if (!client?.id || !orderConfig) return;
        writePortalCartDraft({
            clientId: client.id,
            fullName: client.fullName,
            serviceType: String(orderConfig.serviceType ?? client.serviceType ?? ''),
            savedAt: new Date().toISOString(),
            orderConfig,
        });
    }, [client?.id, client?.fullName, client?.serviceType, orderConfig]);

    // Clear "Saved" once the user edits again.
    useEffect(() => {
        if (!saveSuccessMessage) return;
        if (JSON.stringify(orderConfig) !== JSON.stringify(originalOrderConfig)) {
            setSaveSuccessMessage(null);
        }
    }, [orderConfig, originalOrderConfig, saveSuccessMessage]);

    // Auto-dismiss the brief "Saved" chip so the status line returns to normal.
    useEffect(() => {
        if (!saveSuccessMessage || saveSuccessMessage === 'Saved successfully. Your order is on the server.') {
            return;
        }
        const t = setTimeout(() => setSaveSuccessMessage(null), 2500);
        return () => clearTimeout(t);
    }, [saveSuccessMessage]);

    const handleManualSave = useCallback(async () => {
        if (autosaveTimerRef.current) {
            clearTimeout(autosaveTimerRef.current);
            autosaveTimerRef.current = null;
            debouncePendingRef.current = false;
            setAutosaveScheduled(false);
        }
        setEscalateMessage(null);
        setSaveError(null);
        setSaveSuccessMessage(null);
        setManualSaveFailed(false);
        failedAutosaveSnapRef.current = null;
        manualSaveInFlightRef.current = true;
        savingRef.current = true;
        setSaving(true);
        try {
            // Drop any abandoned autosave chain, then run an explicit save.
            await autosaveChainRef.current.catch(() => {});
            await flushAutosaveToServer();
        } catch {
            // saveError / manualSaveFailed are set inside flushAutosaveToServer
        }
    }, [flushAutosaveToServer]);

    const handleEscalateToTeam = useCallback(async () => {
        if (!client?.id) return;
        setEscalating(true);
        setEscalateMessage(null);
        try {
            const draft = readPortalCartDraft(client.id);
            const orderToSend = orderConfigRef.current ?? draft?.orderConfig;
            const diagnostics: Record<string, unknown> = {
                url: window.location.href,
                userAgent: navigator.userAgent,
                online: navigator.onLine,
                browserTime: new Date().toISOString(),
                browserBuildId: window.__appBuildId ?? null,
                saveMode: saveModeRef.current,
                lastSaveSeq: portalSaveSeqRef.current,
                lastSavedAt: lastSavedTimestampRef.current,
                serverConfirmedAt,
                cartDirty:
                    JSON.stringify(orderConfigRef.current) !==
                    JSON.stringify(originalOrderConfigRef.current),
                draftSavedAt: draft?.savedAt ?? null,
                saveErrorShown: saveError,
            };
            const result = await escalatePortalCartToTeam({
                clientId: client.id,
                orderConfig: orderToSend,
                saveError,
                draftSavedAt: draft?.savedAt ?? null,
                diagnostics,
            });
            if (result.success) {
                setEscalateMessage(
                    'We emailed your cart to the office. They will enter your order for you — you can close this page.',
                );
            } else {
                setSaveError(result.error || 'Could not email the office. Please call us for help.');
            }
        } catch (error: unknown) {
            setSaveError(formatClientPortalSaveError(error));
        } finally {
            setEscalating(false);
        }
    }, [client?.id, saveError, serverConfirmedAt]);

    // Debounced schedule → chained flush (no validation gate: drafts save).
    // Depend only on cart dirty state — NOT menuItems/client identity (those churn and
    // were cancelling the debounce timer before it could fire).
    useEffect(() => {
        if (saveMode === 'manual') return;
        const c = clientRef.current;
        if (!c || !orderConfig) return;

        const effectiveType = orderConfig?.serviceType ?? c.serviceType;
        if (effectiveType !== 'Food' && effectiveType !== 'Boxes' && effectiveType !== 'Meal') return;

        const dirty = JSON.stringify(orderConfig) !== JSON.stringify(originalOrderConfig);
        if (!dirty) return;

        // Don't hammer a failed save of the same snapshot (e.g. timeout / max-loop).
        // The next user edit changes orderConfig and re-enables autosave.
        if (
            saveError &&
            failedAutosaveSnapRef.current &&
            JSON.stringify(orderConfig) === failedAutosaveSnapRef.current
        ) {
            return;
        }

        if (
            !buildClientPortalUpcomingPayload(
                orderConfig,
                c,
                menuItemsRef.current,
                mealItemsRef.current,
            )
        ) {
            return;
        }

        debouncePendingRef.current = true;
        setAutosaveScheduled(true);
        if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);

        autosaveTimerRef.current = setTimeout(() => {
            autosaveTimerRef.current = null;
            debouncePendingRef.current = false;
            setAutosaveScheduled(false);
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
            setAutosaveScheduled(false);
        };
    }, [orderConfig, originalOrderConfig, enqueueAutosaveFlush, saveError, saveMode]);

    // In auto mode, a new edit after failure clears the error so autosave can retry.
    // In manual mode, keep the error (and escalate offer) until Save Order succeeds or is clicked again.
    useEffect(() => {
        if (saveMode === 'manual') return;
        if (!saveError || !failedAutosaveSnapRef.current) return;
        if (JSON.stringify(orderConfig) !== failedAutosaveSnapRef.current) {
            failedAutosaveSnapRef.current = null;
            setSaveError(null);
        }
    }, [orderConfig, saveError, saveMode]);

    /** Flush ASAP when the tab hides so short debounces do not lose edits on fast navigation away. */
    useEffect(() => {
        const flushOnHidden = () => {
            if (autosaveTimerRef.current) {
                clearTimeout(autosaveTimerRef.current);
                autosaveTimerRef.current = null;
                debouncePendingRef.current = false;
                setAutosaveScheduled(false);
            }
            const dirty =
                JSON.stringify(orderConfigRef.current) !== JSON.stringify(originalOrderConfigRef.current);
            const sessionChanged =
                sessionBaselineOrderRef.current !== null &&
                JSON.stringify(orderConfigRef.current) !== JSON.stringify(sessionBaselineOrderRef.current);
            if (!dirty && !sessionChanged) return;
            // In manual mode, only flush session history on tab close if already synced;
            // dirty carts wait for Save Order so we don't keep failing autosaves in the background.
            if (saveModeRef.current === 'manual' && dirty) return;
            if (
                failedAutosaveSnapRef.current &&
                JSON.stringify(orderConfigRef.current) === failedAutosaveSnapRef.current
            ) {
                return;
            }
            if (!buildClientPortalUpcomingPayload(orderConfigRef.current, clientRef.current, menuItemsRef.current, mealItemsRef.current)) return;
            savingRef.current = true;
            setSaving(true);
            enqueueAutosaveFlush({ portalSessionHistory: sessionChanged });
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
    const saveConfirmedOnServer =
        !savePending && !saveError && !saveBarShowsIssue && !!serverConfirmedAt;

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
    } else if (savePending && !saving) {
        bottomBarBg = '#f1f5f9';
        bottomBarBorder = '#94a3b8';
        bottomBarShadow = '0 -6px 24px -8px rgba(51, 65, 85, 0.12)';
        bottomBarTextColor = '#334155';
    } else if (saveConfirmedOnServer) {
        bottomBarBg = '#d1fae5';
        bottomBarBorder = '#10b981';
        bottomBarShadow = '0 -10px 30px -5px rgba(16, 185, 129, 0.35)';
        bottomBarTextColor = '#065f46';
    }

    // Always offer email-to-office whenever Save Order is shown (not only after a failed click).
    const escalateAvailable = saveMode === 'manual' && !escalateMessage;
    const bottomBarPrimaryText = escalateMessage
        ? escalateMessage
        : saveSuccessMessage
            ? saveSuccessMessage
            : saving
                ? 'Saving…'
                : saveError
                    ? `Couldn’t save: ${saveError}`
                    : saveMode === 'manual'
                        ? configChanged
                            ? 'AUTOSAVE OFF — click Save Order when you are done editing.'
                            : 'AUTOSAVE OFF — use Save Order after your next changes.'
                        : saveBarShowsIssue
                            ? `${PLEASE_UPDATE_ORDER_TITLE} — details below.`
                            : savePending
                                ? 'Saving automatically…'
                                : saveConfirmedOnServer
                                    ? 'Saved'
                                    : 'Saving…';

    const orderSummaryProps = {
        orderConfig,
        setOrderConfig,
        vendors,
        menuItems,
        mealCategories,
        mealItems,
        categories,
        hideVendorNames: !canManageFoodKitchenVendor,
        approvedMealsPerWeek: client.approvedMealsPerWeek,
        boxQuotas: activeBoxQuotas,
    } as const;

    const hasLinkedAccounts = (switchableAccounts?.length ?? 0) > 1;

    const sidebarProps = {
        client,
        serviceType,
        switchableAccounts,
        showAccountSwitcher: hasLinkedAccounts,
        onSwitchAccount: handlePortalAccountSwitch,
    } as const;

    const saveBarElement = (
        <>
            <style>{`
                @media (max-width: 960px) {
                    .save-bar-container { padding: 0 !important; }
                    .save-bar-content {
                        flex-direction: row !important;
                        gap: 0.5rem !important;
                        padding: 8px 12px !important;
                        align-items: center !important;
                    }
                    .save-bar-content > div:first-child {
                        font-size: 0.8rem !important;
                        line-height: 1.3 !important;
                    }
                    .save-bar-content button {
                        padding: 6px 10px !important;
                        font-size: 0.8rem !important;
                    }
                    .save-bar-issue {
                        padding: 8px 12px !important;
                        font-size: 0.8rem !important;
                    }
                    .save-bar-issue .headerOrderIssueTitle {
                        font-size: 0.65rem !important;
                        margin-bottom: 2px !important;
                    }
                    .save-bar-issue .headerOrderIssueDetail {
                        font-size: 0.8rem !important;
                    }
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
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {saveMode === 'manual' && (
                            <button
                                type="button"
                                onClick={() => void handleManualSave()}
                                className="btn btn-primary"
                                disabled={saving || !configChanged}
                                style={{ padding: '8px 16px', borderRadius: '6px' }}
                            >
                                {saving ? 'Saving…' : 'Save Order'}
                            </button>
                        )}
                        {escalateAvailable && (
                            <button
                                type="button"
                                onClick={() => void handleEscalateToTeam()}
                                className="btn btn-secondary"
                                disabled={escalating || saving}
                                style={{ padding: '8px 16px', borderRadius: '6px' }}
                            >
                                {escalating ? 'Sending…' : 'Email my cart to the office'}
                            </button>
                        )}
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
                        className="save-bar-issue"
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
    );

    const usePortalV2 = shouldUsePortalV2(client.id, serviceType, settings?.portalV2Enabled);

    if (usePortalV2) {
        return (
            <div className={stylesClientPortal.portalShell}>
                <AppVersionWatcher />
                <PassoverWarningBanner />
                <ClientPortalV2
                    client={client}
                    serviceType={serviceType}
                    orderConfig={orderConfig}
                    setOrderConfig={setOrderConfig}
                    vendors={vendors}
                    menuItems={menuItems}
                    categories={categories}
                    boxTypes={boxTypes}
                    mealCategories={mealCategories}
                    mealItems={mealItems}
                    settings={settings}
                    quotasByBoxType={quotasByBoxType}
                    activeBoxQuotas={activeBoxQuotas}
                    hideVendorNames={!canManageFoodKitchenVendor}
                    hidePhaseoutUnlessOnOrder={hidePhaseoutUnlessOnOrder}
                    switchableAccounts={switchableAccounts}
                    onSwitchAccount={handlePortalAccountSwitch}
                    householdOrderMembers={pooledFoodMembers}
                    pooledMealLimit={pooledMealLimit}
                    totalMealCount={totalMealCount}
                    validationError={validationStatus.isValid ? null : validationStatus.error}
                    saving={saving || autosaveScheduled}
                    saveError={saveError}
                    recentOrders={recentOrders}
                    saveMode={saveMode}
                    dirty={configChanged}
                    autosaveDisabledBanner={autosaveDisabledBanner}
                    autosaveOffModalOpen={autosaveOffModalOpen}
                    autosaveOffReason={autosaveOffReason}
                    onAcknowledgeAutosaveOff={acknowledgeAutosaveOff}
                    escalateAvailable={escalateAvailable}
                    escalating={escalating}
                    escalateMessage={escalateMessage}
                    saveSuccessMessage={saveSuccessMessage}
                    onManualSave={() => void handleManualSave()}
                    onEscalateToTeam={() => void handleEscalateToTeam()}
                />
            </div>
        );
    }

    return (
        <div className={stylesClientPortal.portalShell}>
            <AppVersionWatcher />
            <PassoverWarningBanner />
            {autosaveOffModalOpen && (
                <div
                    role="alertdialog"
                    aria-modal="true"
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 500,
                        background: 'rgba(127, 29, 29, 0.72)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 20,
                    }}
                >
                    <div
                        style={{
                            width: 'min(440px, 100%)',
                            background: '#fff',
                            border: '3px solid #7f1d1d',
                            borderRadius: 12,
                            padding: '22px 24px',
                        }}
                    >
                        <h2 style={{ margin: '0 0 12px', color: '#7f1d1d', fontSize: '1.15rem' }}>
                            Autosave turned off
                        </h2>
                        <p style={{ margin: '0 0 10px', fontWeight: 600, lineHeight: 1.5 }}>
                            {autosaveOffReason === 'error'
                                ? 'Automatic saving hit a problem, so we stopped autosave for this session. Your latest change may not be on the server yet.'
                                : 'Saving was taking too long, so we stopped autosave. Your changes are not being saved automatically anymore.'}
                        </p>
                        <p style={{ margin: '0 0 18px', fontWeight: 600, lineHeight: 1.5 }}>
                            Click Save Order when you are done — you will see if that save worked. If it
                            fails, use Email cart to office.
                        </p>
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={acknowledgeAutosaveOff}
                            style={{
                                width: '100%',
                                padding: '14px 16px',
                                background: '#7f1d1d',
                                border: 'none',
                                fontWeight: 800,
                            }}
                        >
                            I understand — I will click Save Order
                        </button>
                    </div>
                </div>
            )}
            {autosaveDisabledBanner && (
                <div
                    role="alert"
                    style={{
                        background: '#7f1d1d',
                        color: '#fff7f7',
                        padding: '14px 16px',
                        fontWeight: 700,
                        borderBottom: '3px solid #fecaca',
                        lineHeight: 1.4,
                    }}
                >
                    <div style={{ marginBottom: 4 }}>AUTOSAVE TURNED OFF</div>
                    <div style={{ fontWeight: 600 }}>
                        Click Save Order when you are done. If Save Order fails, use Email cart to office.
                    </div>
                </div>
            )}
            <div
                className={`${stylesClientPortal.portalContainer} ${stylesClientPortal.saveBarVisible}`}
            >
            <div className={stylesClientPortal.portalDesktopSidebar}>
                <ClientPortalSidebar {...sidebarProps} />
            </div>

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
                    onAddVendor={showFoodKitchenFacilities && canManageFoodKitchenVendor ? handleAddVendorBlock : undefined}
                    orderConfig={orderConfig}
                />

                {/* Scrollable Content */}
                <div className={stylesClientPortal.scrollableContent}>

                    {hasLinkedAccounts && (
                        <PortalLinkedAccounts
                            client={client}
                            switchableAccounts={switchableAccounts}
                            onSwitchAccount={handlePortalAccountSwitch}
                            householdOrderMembers={pooledFoodMembers}
                        />
                    )}

                    <div className={`${styles.alert} ${stylesClientPortal.portalDeadlineNotice}`}>
                        <Info size={16} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden />
                        <div style={{ fontWeight: 500 }}>
                            PLEASE NOTE: ANY CHANGES TO AN ORDER NEED TO BE SUBMITTED BY TUESDAY 11:59 PM TO TAKE EFFECT FOR THE FOLLOWING WEEK
                        </div>
                    </div>

                    {(serviceType === 'Food' || serviceType === 'Boxes') && <PortalV2SwitchBanner />}

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
                            hidePhaseoutUnlessOnOrder={hidePhaseoutUnlessOnOrder}
                            allowVendorSelection={showFoodKitchenFacilities && canManageFoodKitchenVendor}
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
                                boxAllowanceMultiplier={client.approvedMealsPerWeek}
                                embedded
                                showRefreshButton={false}
                                showKitchenVendorPicker={false}
                                simpleUi={boxSimpleUi}
                                foodBoxCategoryId={settings?.foodBoxCategoryId ?? null}
                                hidePhaseoutUnlessOnOrder
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

                <div className={stylesClientPortal.portalMobileBottom}>
                    <ClientPortalOrderSummary {...orderSummaryProps} />
                    <ClientPortalSidebar {...sidebarProps} />
                </div>
            </div>

            <div className={stylesClientPortal.portalDesktopSummary}>
                <ClientPortalOrderSummary {...orderSummaryProps} />
            </div>

            {saveBarElement}
        </div>
        </div>
    );
};

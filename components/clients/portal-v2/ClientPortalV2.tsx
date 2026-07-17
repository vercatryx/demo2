'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { ShoppingCart, User } from 'lucide-react';
import type {
    AppSettings,
    BoxQuota,
    BoxType,
    ClientProfile,
    ItemCategory,
    MealCategory,
    MealItem,
    MenuItem,
    Vendor,
} from '@/lib/types';
import type { FoodMenuLayoutConfig } from '@/lib/food/food-menu-layout';
import type { BoxMenuLayoutConfig } from '@/lib/boxes/box-catalog-order';
import { getFoodMenuLayoutConfig } from '@/lib/portal-v2-server-actions';
import { getBoxMenuLayoutConfig } from '@/lib/merge-triangle-actions';
import { sortBoxCategoriesForCatalog } from '@/lib/boxes/box-catalog-order';
import { getBoxCategoryHeroImageUrl } from '@/lib/boxes/box-category-images';
import { findPathToNode } from '@/components/admin/box-selector-demo/subMenuTree';
import { buildPortalFeaturedSections } from '@/lib/portal-featured-items';
import { buildPortalHomeContentRows } from '@/lib/portal-home-layout';
import { type PortalHomeBlock, type PortalHomePromoLinkTarget } from '@/lib/portal-home-blocks';
import { ALL_CATALOG_ITEMS_ID, canonicalFolderPath, folderNodeHasChildren } from '@/lib/portal-catalog-finder';
import {
    mergeDeliveryDayOrdersToVendorSelections,
    ensureVendorBlockIndex,
    getItemQtyFromVendorBlock,
    getItemNoteFromVendorBlock,
} from '@/lib/portal-vendor-selection';
import {
    applyVendorItemQtyChange,
    canIncrementFoodItem,
    wouldAddingPointsExceedLimit,
    getSingleIncrementPointCost,
} from '@/lib/portal-food-order-actions';
import {
    canIncreaseBoxItem,
    getBoxItemQty,
    setBoxItemQty,
    getActiveBoxFromConfig,
    resolveEffectiveBoxVendorId,
} from '@/lib/portal-box-order-actions';
import { getBoxAllowanceMultiplier } from '@/lib/box-order-consolidation';
import { PortalSearchBar } from './PortalSearchBar';
import { PortalHome } from './PortalHome';
import { PortalDepartments } from './PortalDepartments';
import { PortalSections } from './PortalSections';
import { PortalProductGrid } from './PortalProductGrid';
import { PortalCartSidebar } from './PortalCartSidebar';
import { PortalMobileNav } from './PortalMobileNav';
import { PortalAccountDrawer } from './PortalAccountDrawer';
import { PortalLinkedAccounts } from './PortalLinkedAccounts';
import { PortalVendorSidebar } from './PortalVendorSidebar';
import { PortalVendorPickerOverlay } from './PortalVendorPickerOverlay';
import { PortalShoppingActions } from './PortalShoppingActions';
import { PortalSwitchDepartmentBar } from './PortalSwitchDepartmentBar';
import { usePortalBrowse } from './usePortalBrowse';
import type { FoodCatalogSearchHit } from '@/lib/food-catalog-search';
import type { BoxCatalogSearchHit } from '@/components/admin/box-selector-demo/boxCatalogSearch';
import { PORTAL_INCREMENT_BLOCKED_MESSAGE } from '@/components/clients/MenuItemCard';
import { buildEmptyPortalOrderConfig } from '@/lib/portal-order-reset';
import { getVendorMinimumTips, getVendorMealCountForDay } from '@/lib/portal-vendor-status';
import { ensureVendorShoppingDay } from '@/lib/portal-food-catalog';
import { sortWeekdays } from '@/lib/order-dates';
import { PortalFoodDayPicker } from './PortalFoodDayPicker';
import { PortalBoxCategoryBanner } from './PortalBoxCategoryBanner';
import { PortalFoodBoxSwitchModal } from './PortalFoodBoxSwitchModal';
import { PortalAutosaveOffModal } from './PortalAutosaveOffModal';
import { getBoxCategoryQuotaStatus, getBoxCategoryTips } from '@/lib/portal-box-status';
import {
    formatBoxCategoryIncrementBlockedMessage,
    getFoodBoxMixConflictTip,
    resolveFoodBoxCategoryLabel,
} from '@/lib/portal-food-box-messages';
import { isPortalHomeDepartment } from '@/lib/portal-home-department';
import type { ClientFacingOrderHistoryEntry } from '@/lib/client-facing-order-history';
import { getPortalReorderConfigFromOrder } from '@/lib/actions-read';
import { cleanUpcomingOrderJson } from '@/lib/clean-inactive-upcoming-order';
import { parsePortalBrowseUrl, type ParsedPortalBrowseUrl } from '@/lib/portal-browse-url';
import {
    computeHouseholdMemberAllocations,
    filterFoodOrderConfigForMember,
    type HouseholdOrderMember,
} from '@/lib/household-food-order-pool';
import styles from './portal-v2.module.css';

const EMPTY_FOOD_LAYOUT: FoodMenuLayoutConfig = {
    orderedVendorIds: [],
    subMenusByVendor: {},
    itemSubMenuByItemId: {},
    sectionHeroImages: {},
};

const EMPTY_BOX_LAYOUT: BoxMenuLayoutConfig = {
    orderedCategoryIds: [],
    subMenusByCategory: {},
    itemSubMenuByItemId: {},
};

export type ClientPortalV2Props = {
    client: ClientProfile;
    serviceType: string;
    orderConfig: any;
    setOrderConfig: React.Dispatch<React.SetStateAction<any>>;
    vendors: Vendor[];
    menuItems: MenuItem[];
    categories: ItemCategory[];
    boxTypes: BoxType[];
    mealCategories: MealCategory[];
    mealItems: MealItem[];
    settings: AppSettings | null;
    quotasByBoxType: Record<string, BoxQuota[]>;
    activeBoxQuotas: BoxQuota[];
    hideVendorNames: boolean;
    hidePhaseoutUnlessOnOrder?: boolean;
    switchableAccounts?: import('@/lib/client-portal-account-switch').SwitchableClientAccount[];
    onSwitchAccount?: (targetClientId: string) => Promise<{ success: boolean; message?: string } | void>;
    householdOrderMembers?: HouseholdOrderMember[];
    pooledMealLimit?: number;
    totalMealCount: number;
    validationError?: string | null;
    saving?: boolean;
    saveError?: string | null;
    recentOrders?: ClientFacingOrderHistoryEntry[];
    saveMode?: 'auto' | 'manual';
    dirty?: boolean;
    autosaveDisabledBanner?: boolean;
    autosaveOffModalOpen?: boolean;
    autosaveOffReason?: 'slow' | 'error';
    onAcknowledgeAutosaveOff?: () => void;
    escalateAvailable?: boolean;
    escalating?: boolean;
    escalateMessage?: string | null;
    saveSuccessMessage?: string | null;
    onManualSave?: () => void;
    onEscalateToTeam?: () => void;
};

function ClientPortalV2Inner({
    client,
    serviceType,
    orderConfig,
    setOrderConfig,
    vendors,
    menuItems,
    categories,
    boxTypes,
    quotasByBoxType,
    activeBoxQuotas,
    hideVendorNames,
    hidePhaseoutUnlessOnOrder,
    switchableAccounts,
    onSwitchAccount,
    householdOrderMembers = [],
    pooledMealLimit = 0,
    settings,
    mealCategories,
    mealItems,
    totalMealCount,
    validationError,
    saving = false,
    saveError = null,
    recentOrders = [],
    saveMode = 'auto',
    dirty = false,
    autosaveDisabledBanner = false,
    autosaveOffModalOpen = false,
    autosaveOffReason = 'slow',
    onAcknowledgeAutosaveOff,
    escalateAvailable = false,
    escalating = false,
    escalateMessage = null,
    saveSuccessMessage = null,
    onManualSave,
    onEscalateToTeam,
}: ClientPortalV2Props) {
    const [activeDeliveryDay, setActiveDeliveryDay] = useState<string | undefined>();

    const browse = usePortalBrowse({
        deliveryDay: activeDeliveryDay,
        onNavigateFromUrl: useCallback((parsed: ParsedPortalBrowseUrl) => {
            if (parsed.deliveryDay) {
                setActiveDeliveryDay(parsed.deliveryDay);
            } else if (parsed.browse.view === 'home' || parsed.browse.view === 'departments') {
                setActiveDeliveryDay(undefined);
            }
        }, []),
    });
    const mode = serviceType === 'Boxes' ? 'boxes' : 'food';
    const boxMultiplier = getBoxAllowanceMultiplier(client.approvedMealsPerWeek);

    const [foodLayout, setFoodLayout] = useState<FoodMenuLayoutConfig | null>(null);
    const [boxLayout, setBoxLayout] = useState<BoxMenuLayoutConfig | null>(null);
    const [accountOpen, setAccountOpen] = useState(false);
    const [mobileCartOpen, setMobileCartOpen] = useState(false);
    const [vendorPickerOpen, setVendorPickerOpen] = useState(false);
    const [foodBoxPrompt, setFoodBoxPrompt] = useState<'clearOthers' | 'clearFood' | null>(null);
    const [pendingBoxQty, setPendingBoxQty] = useState<{ itemId: string; qty: number } | null>(null);
    const [focusedHouseholdMemberId, setFocusedHouseholdMemberId] = useState<string | null>(null);
    const [reorderingOrderId, setReorderingOrderId] = useState<string | null>(null);
    const [reorderError, setReorderError] = useState<string | null>(null);

    const linkedAccountCount = switchableAccounts?.length ?? 0;
    const hasLinkedAccounts = linkedAccountCount > 1;

    const householdPoolingEnabled = householdOrderMembers.length > 1 && mode === 'food';
    const effectiveMealLimit =
        householdPoolingEnabled && pooledMealLimit > 0
            ? pooledMealLimit
            : client.approvedMealsPerWeek || 0;

    const householdMemberAllocations = useMemo(() => {
        if (!householdPoolingEnabled) return [];
        return computeHouseholdMemberAllocations(
            orderConfig,
            householdOrderMembers,
            menuItems,
            mealItems,
            serviceType,
        );
    }, [householdPoolingEnabled, orderConfig, householdOrderMembers, menuItems, mealItems, serviceType]);

    const cartOrderConfig = useMemo(() => {
        if (!householdPoolingEnabled || !focusedHouseholdMemberId) return orderConfig;
        return filterFoodOrderConfigForMember(
            orderConfig,
            focusedHouseholdMemberId,
            householdOrderMembers,
            menuItems,
            mealItems,
            serviceType,
        );
    }, [
        householdPoolingEnabled,
        focusedHouseholdMemberId,
        orderConfig,
        householdOrderMembers,
        menuItems,
        mealItems,
        serviceType,
    ]);

    const cartMealLimit = useMemo(() => {
        if (!householdPoolingEnabled || !focusedHouseholdMemberId) return effectiveMealLimit;
        const member = householdOrderMembers.find((m) => m.id === focusedHouseholdMemberId);
        return member?.approvedMealsPerWeek || 0;
    }, [householdPoolingEnabled, focusedHouseholdMemberId, effectiveMealLimit, householdOrderMembers]);

    useEffect(() => {
        void getFoodMenuLayoutConfig().then((cfg: FoodMenuLayoutConfig | null) =>
            setFoodLayout(cfg ?? EMPTY_FOOD_LAYOUT),
        );
        void getBoxMenuLayoutConfig().then((cfg: BoxMenuLayoutConfig | null) =>
            setBoxLayout(cfg ?? EMPTY_BOX_LAYOUT),
        );
    }, []);

    const layoutLoaded = mode === 'food' ? foodLayout !== null : boxLayout !== null;

    const effectiveBoxVendorId = useMemo(
        () => resolveEffectiveBoxVendorId(orderConfig, boxMultiplier, boxTypes),
        [orderConfig, boxMultiplier, boxTypes],
    );

    useEffect(() => {
        if (!layoutLoaded) return;
        const deptId = browse.state.departmentId;
        if (!deptId || isPortalHomeDepartment(deptId)) return;

        const deptRoots =
            mode === 'food'
                ? foodLayout?.subMenusByVendor[deptId] ?? []
                : boxLayout?.subMenusByCategory[deptId] ?? [];

        if (browse.state.view === 'sections' && deptRoots.length === 0) {
            browse.goProducts(deptId, [ALL_CATALOG_ITEMS_ID]);
            return;
        }
        // Food vendors with section trees skip the category picker — the product grid
        // sidebar and grouped headers are the section UI.
        if (mode === 'food' && browse.state.view === 'sections' && deptRoots.length > 0) {
            browse.goProducts(deptId, [ALL_CATALOG_ITEMS_ID]);
            return;
        }
        if (
            mode === 'boxes' &&
            browse.state.view === 'products' &&
            browse.state.folderPath.length === 0 &&
            deptRoots.length > 0
        ) {
            browse.goSections(deptId, []);
            return;
        }
        if (browse.state.view === 'products' && browse.state.folderPath.length > 0 && deptRoots.length > 0) {
            const resolved = canonicalFolderPath(deptRoots, browse.state.folderPath);
            if (resolved.join('/') !== browse.state.folderPath.join('/')) {
                browse.goProducts(deptId, resolved, browse.state.highlightItemId);
            }
        }
    }, [
        layoutLoaded,
        mode,
        foodLayout,
        boxLayout,
        browse.state.view,
        browse.state.departmentId,
        browse.state.folderPath,
        browse.state.highlightItemId,
        browse.goSections,
        browse.goProducts,
    ]);

    useEffect(() => {
        if (process.env.NODE_ENV !== 'development') return;
        const active = menuItems.filter((m) => m.isActive !== false).length;
        console.log('[ClientPortalV2] catalog loaded:', {
            menuItemsTotal: menuItems.length,
            menuItemsActive: active,
            foodVendorsWithSubmenus: Object.keys(foodLayout?.subMenusByVendor ?? {}).length,
            boxCategoriesWithSubmenus: Object.keys(boxLayout?.subMenusByCategory ?? {}).length,
        });
    }, [menuItems, foodLayout, boxLayout]);

    const featuredSections = useMemo(() => {
        const featured = settings?.portalFeaturedItems ?? { food: {}, box: {} };
        return buildPortalFeaturedSections(
            menuItems,
            featured,
            mode,
            settings?.portalFeaturedSectionNames,
        );
    }, [mode, settings, menuItems]);

    const homeContentRows = useMemo(() => {
        const sectionNames =
            mode === 'food'
                ? (settings?.portalFeaturedSectionNames?.food ?? [])
                : (settings?.portalFeaturedSectionNames?.box ?? []);
        return buildPortalHomeContentRows(
            settings?.portalHomeBlocks ?? [],
            featuredSections,
            settings?.portalHomeLayoutOrder,
            mode,
            sectionNames,
        );
    }, [mode, settings, featuredSections]);

    const cartCount = useMemo((): number => {
        if (mode === 'boxes') {
            const box = getActiveBoxFromConfig(orderConfig, boxMultiplier);
            return Object.values(box.items || {}).reduce<number>((s, q) => s + (Number(q) || 0), 0);
        }
        let n = 0;
        for (const sel of mergeDeliveryDayOrdersToVendorSelections(orderConfig)) {
            if (sel.itemsByDay) {
                for (const day of Object.keys(sel.itemsByDay)) {
                    n += Object.values(sel.itemsByDay[day] || {}).reduce<number>(
                        (s, q) => s + (Number(q) || 0),
                        0,
                    );
                }
            } else if (sel.items) {
                n += Object.values(sel.items as Record<string, number>).reduce<number>(
                    (s, q) => s + (Number(q) || 0),
                    0,
                );
            }
        }
        return n;
    }, [orderConfig, mode, boxMultiplier]);

    const hasOrderItems = useMemo(() => {
        if (cartCount > 0) return true;
        const meals = orderConfig?.mealSelections;
        if (!meals || typeof meals !== 'object') return false;
        return Object.values(meals).some(
            (m: any) => m?.items && Object.values(m.items as Record<string, number>).some((q) => Number(q) > 0),
        );
    }, [cartCount, orderConfig?.mealSelections]);

    const departmentName = useMemo(() => {
        const id = browse.state.departmentId;
        if (!id) return '';
        if (mode === 'food') return vendors.find((v) => v.id === id)?.name ?? '';
        return categories.find((c) => c.id === id)?.name ?? '';
    }, [browse.state.departmentId, mode, vendors, categories]);

    const deliveryDaysForVendor = useMemo(() => {
        const vid = browse.state.departmentId;
        if (!vid) return [];
        const v = vendors.find((x) => x.id === vid);
        return sortWeekdays(v?.deliveryDays ?? []);
    }, [browse.state.departmentId, vendors]);

    const roots = useMemo(() => {
        const id = browse.state.departmentId;
        if (!id) return [];
        if (mode === 'food') return foodLayout?.subMenusByVendor[id] ?? [];
        return boxLayout?.subMenusByCategory[id] ?? [];
    }, [browse.state.departmentId, mode, foodLayout, boxLayout]);

    const itemSubMenuMap = useMemo(() => {
        if (mode === 'food') return foodLayout?.itemSubMenuByItemId ?? {};
        return boxLayout?.itemSubMenuByItemId ?? {};
    }, [mode, foodLayout, boxLayout]);

    const heroImage = useMemo(() => {
        if (!browse.state.departmentId) return null;
        if (mode === 'food') {
            return vendors.find((v) => v.id === browse.state.departmentId)?.portalHeroImageUrl ?? null;
        }
        const category = categories.find((c) => c.id === browse.state.departmentId);
        return (
            getBoxCategoryHeroImageUrl(category?.name, {
                categoryId: category?.id,
                foodBoxCategoryId: settings?.foodBoxCategoryId,
            }) ?? null
        );
    }, [mode, browse.state.departmentId, vendors, categories, settings?.foodBoxCategoryId]);

    const getFoodBlock = useCallback(
        (vendorId: string) => {
            const selections = mergeDeliveryDayOrdersToVendorSelections(orderConfig);
            return selections.find((s: any) => s.vendorId === vendorId);
        },
        [orderConfig],
    );

    const getFoodBlockIndex = useCallback(
        (vendorId: string) => {
            const selections = mergeDeliveryDayOrdersToVendorSelections(orderConfig);
            return selections.findIndex((s: any) => s.vendorId === vendorId);
        },
        [orderConfig],
    );

    const foodDayMealCounts = useMemo(() => {
        const vendorId = browse.state.departmentId;
        if (!vendorId) return {} as Record<string, number>;
        const block = getFoodBlock(vendorId);
        const counts: Record<string, number> = {};
        for (const day of deliveryDaysForVendor) {
            counts[day] = getVendorMealCountForDay(block, day, menuItems);
        }
        return counts;
    }, [browse.state.departmentId, deliveryDaysForVendor, getFoodBlock, menuItems]);

    const activeVendorMinimum = useMemo(() => {
        const vendorId = browse.state.departmentId;
        if (!vendorId) return 0;
        return vendors.find((v) => v.id === vendorId)?.minimumMeals ?? 0;
    }, [browse.state.departmentId, vendors]);

    const vendorTips = useMemo(
        () =>
            mode === 'food'
                ? getVendorMinimumTips(orderConfig, vendors, menuItems, client, hideVendorNames)
                : [],
        [mode, orderConfig, vendors, menuItems, client, hideVendorNames],
    );

    const boxTips = useMemo(() => {
        if (mode !== 'boxes') return [];
        const tips = getBoxCategoryTips(orderConfig, categories, menuItems, quotasByBoxType, boxMultiplier);
        const mixTip = getFoodBoxMixConflictTip(
            orderConfig,
            menuItems,
            settings?.foodBoxCategoryId,
            boxMultiplier,
            categories,
        );
        return mixTip ? [mixTip, ...tips] : tips;
    }, [mode, orderConfig, categories, menuItems, quotasByBoxType, boxMultiplier, settings?.foodBoxCategoryId]);

    const foodBoxCategoryLabel = useMemo(
        () => resolveFoodBoxCategoryLabel(categories, settings?.foodBoxCategoryId),
        [categories, settings?.foodBoxCategoryId],
    );

    const departmentItemCount = useMemo(() => {
        const deptId = browse.state.departmentId;
        if (!deptId) return 0;
        if (mode === 'food') {
            return menuItems.filter((i) => i.vendorId === deptId && i.isActive !== false).length;
        }
        return menuItems.filter((i) => i.categoryId === deptId && i.isActive !== false).length;
    }, [browse.state.departmentId, mode, menuItems]);

    const activeCategoryQuota = useMemo(() => {
        if (mode !== 'boxes' || !browse.state.departmentId) return null;
        return getBoxCategoryQuotaStatus(
            browse.state.departmentId,
            orderConfig,
            menuItems,
            categories,
            quotasByBoxType,
            boxMultiplier,
        );
    }, [
        mode,
        browse.state.departmentId,
        orderConfig,
        menuItems,
        categories,
        quotasByBoxType,
        boxMultiplier,
    ]);

    const handleSelectFolder = useCallback(
        (path: string[]) => {
            const deptId = browse.state.departmentId;
            if (!deptId) return;
            if (path.length === 0) {
                if (mode === 'food') {
                    browse.goProducts(deptId, [ALL_CATALOG_ITEMS_ID]);
                } else {
                    browse.goSections(deptId, []);
                }
                return;
            }
            const resolved = canonicalFolderPath(roots, path);
            const leafId = resolved[resolved.length - 1];
            if (leafId === ALL_CATALOG_ITEMS_ID) {
                browse.goProducts(deptId, resolved);
                return;
            }
            if (mode === 'food' || !folderNodeHasChildren(roots, leafId)) {
                browse.goProducts(deptId, resolved);
            } else {
                browse.goSections(deptId, resolved);
            }
        },
        [browse, roots, mode],
    );

    const handleViewFolderItems = useCallback(
        (path: string[]) => {
            const deptId = browse.state.departmentId;
            if (!deptId) return;
            browse.goProducts(deptId, canonicalFolderPath(roots, path));
        },
        [browse, roots],
    );

    const handleSelectDepartment = useCallback(
        (departmentId: string) => {
            if (isPortalHomeDepartment(departmentId)) {
                browse.goHome();
                return;
            }
            if (mode === 'food') {
                setOrderConfig((prev: any) =>
                    ensureVendorBlockIndex(prev, vendors, departmentId).nextConfig,
                );
            }
            if (!layoutLoaded) {
                if (mode === 'food') {
                    browse.goProducts(departmentId, [ALL_CATALOG_ITEMS_ID]);
                } else {
                    browse.goSections(departmentId, []);
                }
                return;
            }
            const deptRoots =
                mode === 'food'
                    ? foodLayout?.subMenusByVendor[departmentId] ?? []
                    : boxLayout?.subMenusByCategory[departmentId] ?? [];
            if (deptRoots.length === 0 || mode === 'food') {
                browse.goProducts(departmentId, [ALL_CATALOG_ITEMS_ID]);
            } else {
                browse.goSections(departmentId);
            }
        },
        [mode, vendors, foodLayout, boxLayout, layoutLoaded, setOrderConfig, browse],
    );

    const getIncrementBlockedMessage = useCallback(
        (item: MenuItem) => {
            if (mode === 'boxes') {
                if (
                    canIncreaseBoxItem(
                        item,
                        orderConfig,
                        menuItems,
                        categories,
                        quotasByBoxType,
                        boxMultiplier,
                    )
                ) {
                    return undefined;
                }
                return formatBoxCategoryIncrementBlockedMessage(
                    item,
                    orderConfig,
                    menuItems,
                    categories,
                    quotasByBoxType,
                    boxMultiplier,
                );
            }
            if (!browse.state.departmentId) {
                return 'Select a kitchen facility before adding items.';
            }
            if (deliveryDaysForVendor.length > 1 && !activeDeliveryDay) {
                return 'Select a delivery day before adding items.';
            }
            if (
                canIncrementFoodItem(
                    orderConfig,
                    menuItems,
                    mealItems,
                    client,
                    serviceType,
                    item,
                    getFoodBlock(browse.state.departmentId),
                    (() => {
                        const days = deliveryDaysForVendor;
                        return days.length <= 1 ? days[0] : activeDeliveryDay;
                    })(),
                    householdPoolingEnabled ? effectiveMealLimit : undefined,
                )
            ) {
                return undefined;
            }
            return PORTAL_INCREMENT_BLOCKED_MESSAGE;
        },
        [
            mode,
            orderConfig,
            menuItems,
            mealItems,
            client,
            serviceType,
            categories,
            quotasByBoxType,
            boxMultiplier,
            browse.state.departmentId,
            getFoodBlock,
            activeDeliveryDay,
            deliveryDaysForVendor,
            householdPoolingEnabled,
            effectiveMealLimit,
        ],
    );

    const handleFoodQty = useCallback(
        (vendorId: string, itemId: string, qty: number) => {
            const vendorDays = vendors.find((v) => v.id === vendorId)?.deliveryDays ?? [];
            const shoppingDay =
                vendorDays.length <= 1 ? vendorDays[0] : activeDeliveryDay || undefined;
            if (vendorDays.length > 1 && !shoppingDay) return;

            // Always derive block index from `prev` inside the updater — never from a
            // stale orderConfig closure (that was wiping carts / dropping notes).
            setOrderConfig((prev: any) => {
                let { nextConfig, blockIndex: bi } = ensureVendorBlockIndex(prev, vendors, vendorId);
                if (shoppingDay) {
                    nextConfig = ensureVendorShoppingDay(nextConfig, bi, shoppingDay);
                }
                const block = nextConfig.vendorSelections?.[bi];
                const currentQty = getItemQtyFromVendorBlock(block, itemId, shoppingDay);
                if (qty > currentQty) {
                    const item = menuItems.find((i) => i.id === itemId);
                    if (item) {
                        const cost =
                            getSingleIncrementPointCost(item, block, shoppingDay, client) *
                            (qty - currentQty);
                        if (
                            wouldAddingPointsExceedLimit(
                                nextConfig,
                                menuItems,
                                mealItems,
                                client,
                                serviceType,
                                cost,
                                householdPoolingEnabled ? effectiveMealLimit : undefined,
                            )
                        ) {
                            return prev;
                        }
                    }
                }
                return applyVendorItemQtyChange(nextConfig, bi, itemId, qty, shoppingDay);
            });
        },
        [
            vendors,
            menuItems,
            mealItems,
            client,
            serviceType,
            activeDeliveryDay,
            setOrderConfig,
            householdPoolingEnabled,
            effectiveMealLimit,
        ],
    );

    const handleBoxQty = useCallback(
        (itemId: string, qty: number) => {
            const item = menuItems.find((i) => i.id === itemId);
            if (!item) return;
            setOrderConfig((prev: any) =>
                setBoxItemQty(
                    prev,
                    itemId,
                    qty,
                    menuItems,
                    settings?.foodBoxCategoryId,
                    boxMultiplier,
                    (conflict) => {
                        setFoodBoxPrompt(conflict);
                        setPendingBoxQty({ itemId, qty });
                    },
                ),
            );
        },
        [menuItems, settings?.foodBoxCategoryId, boxMultiplier, setOrderConfig],
    );

    const confirmFoodBoxSwitch = () => {
        if (!pendingBoxQty) return;
        const { itemId, qty } = pendingBoxQty;
        setOrderConfig((prev: any) => {
            const box = getActiveBoxFromConfig(prev, boxMultiplier);
            const cleared: Record<string, number> = {};
            const clearedNotes = { ...(box.itemNotes || {}) };
            for (const [id, q] of Object.entries(box.items || {})) {
                if (!q || Number(q) <= 0) continue;
                const cat = menuItems.find((m) => m.id === id)?.categoryId ?? '';
                const isFood = settings?.foodBoxCategoryId && cat === settings.foodBoxCategoryId;
                if (foodBoxPrompt === 'clearOthers' && !isFood) continue;
                if (foodBoxPrompt === 'clearFood' && isFood) continue;
                cleared[id] = Number(q);
            }
            const interim = { ...prev, boxOrders: [{ ...box, items: cleared, itemNotes: clearedNotes }] };
            return setBoxItemQty(interim, itemId, qty, menuItems, settings?.foodBoxCategoryId, boxMultiplier);
        });
        setFoodBoxPrompt(null);
        setPendingBoxQty(null);
    };

    const handleFoodSearchHit = (hit: FoodCatalogSearchHit) => {
        const folderId = foodLayout?.itemSubMenuByItemId[hit.itemId];
        const vendorRoots = foodLayout?.subMenusByVendor[hit.vendorId] ?? [];
        let path: string[] = [];
        if (folderId && vendorRoots.length > 0) {
            const p = findPathToNode(vendorRoots, folderId);
            if (p) path = p;
        }
        if (path.length === 0 && vendorRoots.length > 0) {
            path = [ALL_CATALOG_ITEMS_ID];
        }
        setOrderConfig((prev: any) => ensureVendorBlockIndex(prev, vendors, hit.vendorId).nextConfig);
        browse.goProducts(hit.vendorId, path, hit.itemId);
    };

    const handleBoxSearchHit = (hit: BoxCatalogSearchHit) => {
        if (hit.type === 'category') {
            handleSelectDepartment(hit.categoryId);
            return;
        }
        if (hit.type === 'folder') {
            browse.goProducts(hit.categoryId, hit.folderPath);
            return;
        }
        browse.goProducts(hit.categoryId, hit.folderPath, hit.itemId);
    };

    /** Open a box item all the way to its subcategory folder and highlight it (mirrors food). */
    const handleBoxItemOpen = (item: MenuItem) => {
        const categoryId = item.categoryId;
        if (!categoryId) return;
        const catRoots = boxLayout?.subMenusByCategory[categoryId] ?? [];
        const folderId = boxLayout?.itemSubMenuByItemId[item.id];
        let path: string[] = [];
        if (folderId && catRoots.length > 0) {
            const p = findPathToNode(catRoots, folderId);
            if (p) path = p;
        }
        if (path.length === 0 && catRoots.length > 0) path = [ALL_CATALOG_ITEMS_ID];
        browse.goProducts(categoryId, path, item.id);
    };

    /** Cart line → same browse destination as search / home product clicks. */
    const handleCartItemNavigate = useCallback(
        (itemId: string) => {
            const item = menuItems.find((m) => m.id === itemId);
            if (!item) return;
            setMobileCartOpen(false);
            setAccountOpen(false);
            setVendorPickerOpen(false);
            if (mode === 'food' && item.vendorId) {
                handleFoodSearchHit({
                    itemId: item.id,
                    vendorId: item.vendorId,
                    vendorName: vendors.find((v) => v.id === item.vendorId)?.name ?? '',
                    itemNumber: item.itemNumber ?? null,
                    label: item.name,
                    tokens: item.name,
                });
            } else if (mode === 'boxes' && item.categoryId) {
                handleBoxItemOpen(item);
            }
        },
        [menuItems, mode, vendors, handleFoodSearchHit, handleBoxItemOpen],
    );

    const vendorForBox = effectiveBoxVendorId;

    const resolveFoodDay = useCallback(
        (vendorId: string) => {
            if (deliveryDaysForVendor.length <= 1) return deliveryDaysForVendor[0];
            return activeDeliveryDay;
        },
        [deliveryDaysForVendor, activeDeliveryDay],
    );

    useEffect(() => {
        const vid = browse.state.departmentId;
        if (!vid || isPortalHomeDepartment(vid)) {
            setActiveDeliveryDay(undefined);
            return;
        }
        if (mode === 'food') {
            setOrderConfig((prev: any) => ensureVendorBlockIndex(prev, vendors, vid).nextConfig);
        }
        const days = vendors.find((x) => x.id === vid)?.deliveryDays ?? [];
        if (days.length === 1) {
            const day = days[0];
            setActiveDeliveryDay(day);
            setOrderConfig((prev: any) => {
                const { nextConfig, blockIndex } = ensureVendorBlockIndex(prev, vendors, vid);
                return ensureVendorShoppingDay(nextConfig, blockIndex, day);
            });
        } else if (days.length > 1) {
            const urlDay = parsePortalBrowseUrl(new URLSearchParams(window.location.search)).deliveryDay;
            setActiveDeliveryDay((prev) => {
                if (urlDay && days.includes(urlDay)) return urlDay;
                return prev && days.includes(prev) ? prev : undefined;
            });
            if (urlDay && days.includes(urlDay)) {
                setOrderConfig((prev: any) => {
                    const { nextConfig, blockIndex } = ensureVendorBlockIndex(prev, vendors, vid);
                    return ensureVendorShoppingDay(nextConfig, blockIndex, urlDay);
                });
            }
        }
    }, [browse.state.departmentId, mode, vendors, setOrderConfig]);

    const handleFoodShoppingDaySelect = useCallback(
        (day: string) => {
            const vendorId = browse.state.departmentId;
            if (!vendorId) return;
            setOrderConfig((prev: any) => {
                const { nextConfig, blockIndex } = ensureVendorBlockIndex(prev, vendors, vendorId);
                return ensureVendorShoppingDay(nextConfig, blockIndex, day);
            });
            setActiveDeliveryDay(day);
        },
        [browse.state.departmentId, vendors, setOrderConfig],
    );

    const getFoodItemNote = useCallback(
        (itemId: string) => {
            const vendorId = browse.state.departmentId;
            if (!vendorId) return '';
            const block = getFoodBlock(vendorId);
            const day = resolveFoodDay(vendorId);
            return getItemNoteFromVendorBlock(block, itemId, day);
        },
        [browse.state.departmentId, getFoodBlock, resolveFoodDay],
    );

    const handleFoodNoteChange = useCallback(
        (vendorId: string, itemId: string, note: string) => {
            const day = resolveFoodDay(vendorId);
            setOrderConfig((prev: any) => {
                const { nextConfig, blockIndex } = ensureVendorBlockIndex(prev, vendors, vendorId);
                if (blockIndex < 0) return prev;
                const block = nextConfig.vendorSelections?.[blockIndex];
                const qty = getItemQtyFromVendorBlock(block, itemId, day);
                // Stale closures used to pass qty=0 here, which deleted the line instead
                // of saving the dropdown note. Never remove an item from a note-only update.
                if (qty <= 0) return prev;
                return applyVendorItemQtyChange(nextConfig, blockIndex, itemId, qty, day, note);
            });
        },
        [vendors, resolveFoodDay, setOrderConfig],
    );

    const wrapFoodBrowse = (content: React.ReactNode) => {
        if (mode !== 'food' || !browse.state.departmentId) return content;
        if (deliveryDaysForVendor.length <= 1) return content;
        if (!activeDeliveryDay) {
            return (
                <PortalFoodDayPicker
                    days={deliveryDaysForVendor}
                    selectedDay={activeDeliveryDay}
                    onSelectDay={handleFoodShoppingDaySelect}
                    dayMealCounts={foodDayMealCounts}
                    vendorMinimum={activeVendorMinimum}
                />
            );
        }
        return (
            <>
                <PortalFoodDayPicker
                    days={deliveryDaysForVendor}
                    selectedDay={activeDeliveryDay}
                    onSelectDay={handleFoodShoppingDaySelect}
                    dayMealCounts={foodDayMealCounts}
                    vendorMinimum={activeVendorMinimum}
                    compact
                />
                {content}
            </>
        );
    };

    const wrapBoxBrowse = (content: React.ReactNode) => {
        if (mode !== 'boxes' || browse.state.view !== 'products' || !browse.state.departmentId) return content;
        return (
            <>
                <PortalBoxCategoryBanner
                    categoryName={departmentName}
                    used={activeCategoryQuota?.used ?? 0}
                    required={activeCategoryQuota?.required ?? null}
                    boxMultiplier={boxMultiplier}
                />
                {content}
            </>
        );
    };

    const wrapBrowse = (content: React.ReactNode) => {
        if (mode === 'food') return wrapFoodBrowse(content);
        if (mode === 'boxes') return wrapBoxBrowse(content);
        return content;
    };

    const mobileTab =
        mobileCartOpen ? 'cart' : accountOpen ? 'account' : vendorPickerOpen ? 'departments' : browse.state.view === 'home' ? 'home' : 'departments';

    const allowanceOver = totalMealCount > effectiveMealLimit;

    const handleClearAndStartFresh = useCallback(() => {
        setOrderConfig((prev: any) => buildEmptyPortalOrderConfig(prev, serviceType));
        setActiveDeliveryDay(undefined);
        browse.goHome();
    }, [browse, serviceType, setOrderConfig]);

    const handleReorderOrder = useCallback(
        async (order: ClientFacingOrderHistoryEntry) => {
            if (focusedHouseholdMemberId || reorderingOrderId) return;
            setReorderError(null);
            setReorderingOrderId(order.id);
            try {
                const result = await getPortalReorderConfigFromOrder(client.id, order.id);
                if (!result.ok) {
                    setReorderError(result.error);
                    return;
                }

                const inactiveMenu = new Set(
                    menuItems.filter((m) => m.isActive === false).map((m) => m.id),
                );
                const inactiveMeal = new Set(
                    mealItems.filter((m) => m.isActive === false).map((m) => m.id),
                );
                const { cleaned, menuRemoved, mealRemoved } = cleanUpcomingOrderJson(
                    result.config,
                    inactiveMenu,
                    inactiveMeal,
                );
                const cleanedConfig =
                    cleaned && typeof cleaned === 'object'
                        ? (cleaned as Record<string, any>)
                        : ({} as Record<string, any>);
                const nextConfig: Record<string, any> = {
                    ...cleanedConfig,
                    caseId:
                        cleanedConfig.caseId ??
                        orderConfig?.caseId ??
                        (client as any).caseID,
                };

                const stillHasItems =
                    (Array.isArray(nextConfig.vendorSelections) &&
                        nextConfig.vendorSelections.some(
                            (sel: any) =>
                                sel?.items &&
                                Object.values(sel.items as Record<string, number>).some(
                                    (q) => Number(q) > 0,
                                ),
                        )) ||
                    (nextConfig.mealSelections &&
                        typeof nextConfig.mealSelections === 'object' &&
                        Object.values(nextConfig.mealSelections as Record<string, any>).some(
                            (m) =>
                                m?.items &&
                                Object.values(m.items as Record<string, number>).some(
                                    (q) => Number(q) > 0,
                                ),
                        )) ||
                    (Array.isArray(nextConfig.boxOrders) &&
                        nextConfig.boxOrders.some(
                            (box: any) =>
                                box?.items &&
                                Object.values(box.items as Record<string, number>).some(
                                    (q) => Number(q) > 0,
                                ),
                        ));

                if (!stillHasItems) {
                    setReorderError(
                        menuRemoved.length + mealRemoved.length > 0
                            ? 'Those items are no longer available on the menu.'
                            : 'This order has no items to restore.',
                    );
                    return;
                }

                setOrderConfig(nextConfig);
                setActiveDeliveryDay(undefined);
                browse.goHome();
                setMobileCartOpen(true);
                setAccountOpen(false);
                setVendorPickerOpen(false);
            } catch (e: any) {
                setReorderError(e?.message || 'Could not restore that order.');
            } finally {
                setReorderingOrderId(null);
            }
        },
        [
            focusedHouseholdMemberId,
            reorderingOrderId,
            client,
            menuItems,
            mealItems,
            orderConfig?.caseId,
            setOrderConfig,
            browse,
        ],
    );

    const openVendorPicker = useCallback(() => {
        setVendorPickerOpen(true);
        setMobileCartOpen(false);
        setAccountOpen(false);
    }, []);

    const continueEditingDepartmentId = useMemo((): string | null => {
        if (mode === 'food') {
            for (const sel of mergeDeliveryDayOrdersToVendorSelections(orderConfig)) {
                if (!sel?.vendorId) continue;
                const hasDayItems =
                    sel.itemsByDay &&
                    Object.values(sel.itemsByDay).some((dayItems) =>
                        Object.values(dayItems || {}).some((q) => Number(q) > 0),
                    );
                const hasFlatItems =
                    sel.items && Object.values(sel.items as Record<string, number>).some((q) => Number(q) > 0);
                if (hasDayItems || hasFlatItems) return sel.vendorId;
            }
            return null;
        }
        const box = getActiveBoxFromConfig(orderConfig, boxMultiplier);
        const categoryIds = new Set<string>();
        for (const [itemId, qty] of Object.entries(box.items || {})) {
            if (!qty || Number(qty) <= 0) continue;
            const catId = menuItems.find((m) => m.id === itemId)?.categoryId;
            if (catId) categoryIds.add(catId);
        }
        return categoryIds.values().next().value ?? null;
    }, [mode, orderConfig, boxMultiplier, menuItems]);

    const firstShoppingDepartmentId = useMemo((): string | null => {
        if (mode === 'food') {
            const active = vendors.filter((v) => v.isActive && v.serviceTypes.includes('Food'));
            const order = foodLayout?.orderedVendorIds ?? [];
            const sorted = [...active].sort((a, b) => {
                const ia = order.indexOf(a.id);
                const ib = order.indexOf(b.id);
                if (ia >= 0 && ib >= 0) return ia - ib;
                if (ia >= 0) return -1;
                if (ib >= 0) return 1;
                return (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name);
            });
            return sorted[0]?.id ?? null;
        }
        const sorted = sortBoxCategoriesForCatalog(
            categories.filter((c) => c.isActive !== false),
            boxLayout?.orderedCategoryIds,
        );
        return sorted[0]?.id ?? null;
    }, [mode, vendors, categories, foodLayout, boxLayout]);

    const handleStartShopping = useCallback(() => {
        if (typeof window !== 'undefined' && window.matchMedia('(max-width: 960px)').matches) {
            openVendorPicker();
            return;
        }
        if (firstShoppingDepartmentId) {
            handleSelectDepartment(firstShoppingDepartmentId);
        } else {
            browse.goDepartments();
        }
    }, [openVendorPicker, firstShoppingDepartmentId, handleSelectDepartment, browse]);

    const handleContinueEditing = useCallback(() => {
        if (continueEditingDepartmentId) {
            handleSelectDepartment(continueEditingDepartmentId);
            return;
        }
        handleStartShopping();
    }, [continueEditingDepartmentId, handleSelectDepartment, handleStartShopping]);

    const handlePortalHomeBlockClick = useCallback(
        (block: PortalHomeBlock, link: PortalHomePromoLinkTarget) => {
            switch (link.linkType) {
                case 'vendor':
                    if (link.linkVendorId) handleSelectDepartment(link.linkVendorId);
                    break;
                case 'category':
                    if (link.linkCategoryId) handleSelectDepartment(link.linkCategoryId);
                    break;
                case 'product': {
                    const item = menuItems.find((m) => m.id === link.linkMenuItemId);
                    if (!item) break;
                    if (mode === 'food' && item.vendorId) {
                        handleFoodSearchHit({
                            itemId: item.id,
                            vendorId: item.vendorId,
                            vendorName: vendors.find((v) => v.id === item.vendorId)?.name ?? '',
                            itemNumber: item.itemNumber ?? null,
                            label: item.name,
                            tokens: item.name,
                        });
                    } else if (mode === 'boxes' && item.categoryId) {
                        handleBoxItemOpen(item);
                    }
                    break;
                }
                case 'url': {
                    const url = link.linkUrl?.trim();
                    if (!url) break;
                    if (link.linkOpenInNewTab) {
                        window.open(url, '_blank', 'noopener,noreferrer');
                    } else {
                        window.location.href = url;
                    }
                    break;
                }
                default:
                    break;
            }
        },
        [mode, menuItems, vendors, handleSelectDepartment, handleFoodSearchHit, handleBoxItemOpen],
    );

    const mainContent = () => {
        const browseNeedsLayout =
            !layoutLoaded &&
            browse.state.departmentId &&
            !isPortalHomeDepartment(browse.state.departmentId) &&
            (browse.state.view === 'sections' || browse.state.view === 'products');

        if (browseNeedsLayout) {
            return (
                <div className={styles.portalV2PickPrompt}>
                    <p className={styles.portalV2PickPromptSub}>Loading catalog…</p>
                </div>
            );
        }

        switch (browse.state.view) {
            case 'home':
                return (
                    <>
                        {hasLinkedAccounts && (
                            <PortalLinkedAccounts
                                client={client}
                                switchableAccounts={switchableAccounts}
                                onSwitchAccount={onSwitchAccount}
                                householdOrderMembers={householdOrderMembers}
                                householdMemberAllocations={householdMemberAllocations}
                                focusedMemberId={focusedHouseholdMemberId}
                                onFocusMember={setFocusedHouseholdMemberId}
                            />
                        )}
                        <PortalHome
                            homeContentRows={homeContentRows}
                            mode={mode}
                            vendors={vendors}
                            categories={categories}
                            recentOrders={recentOrders}
                            hasCurrentOrderItems={hasOrderItems}
                            reorderDisabled={Boolean(focusedHouseholdMemberId)}
                            reorderingOrderId={reorderingOrderId}
                            onReorderOrder={handleReorderOrder}
                            onHomeBlockClick={handlePortalHomeBlockClick}
                            onItemClick={(item) => {
                                if (mode === 'food' && item.vendorId) {
                                    handleFoodSearchHit({
                                        itemId: item.id,
                                        vendorId: item.vendorId,
                                        vendorName: vendors.find((v) => v.id === item.vendorId)?.name ?? '',
                                        itemNumber: item.itemNumber ?? null,
                                        label: item.name,
                                        tokens: item.name,
                                    });
                                } else if (mode === 'boxes' && item.categoryId) {
                                    handleBoxItemOpen(item);
                                }
                            }}
                        />
                        {reorderError ? (
                            <p className={styles.portalV2ReorderError} role="alert">
                                {reorderError}
                            </p>
                        ) : null}
                    </>
                );
            case 'departments':
                return wrapBoxBrowse(
                    <PortalDepartments
                        mode={mode}
                        vendors={vendors}
                        categories={categories}
                        foodLayout={foodLayout}
                        boxLayout={boxLayout}
                        selectedDepartmentId={browse.state.departmentId}
                        foodBoxCategoryId={settings?.foodBoxCategoryId}
                        onSelectDepartment={handleSelectDepartment}
                    />,
                );
            case 'sections':
                if (!browse.state.departmentId) return null;
                return wrapBrowse(
                    <PortalSections
                        mode={mode}
                        departmentId={browse.state.departmentId}
                        departmentName={departmentName}
                        heroImageUrl={heroImage}
                        roots={roots}
                        folderPath={browse.state.folderPath}
                        browseAllCount={departmentItemCount}
                        onBrowseAll={() =>
                            browse.goProducts(browse.state.departmentId!, [ALL_CATALOG_ITEMS_ID])
                        }
                        onSelectFolder={handleSelectFolder}
                        onViewFolderItems={handleViewFolderItems}
                    />,
                );
            case 'products':
                if (!browse.state.departmentId) return null;
                return wrapBrowse(
                    <PortalProductGrid
                        mode={mode}
                        departmentId={browse.state.departmentId}
                        departmentName={departmentName}
                        folderPath={browse.state.folderPath}
                        menuItems={menuItems}
                        roots={roots}
                        itemSubMenuByItemId={itemSubMenuMap}
                        orderConfig={orderConfig}
                        client={client}
                        vendors={vendors}
                        vendorId={vendorForBox}
                        hidePhaseoutUnlessOnOrder={hidePhaseoutUnlessOnOrder}
                        activeDeliveryDay={resolveFoodDay(browse.state.departmentId)}
                        getItemQty={(itemId) =>
                            mode === 'boxes'
                                ? getBoxItemQty(orderConfig, itemId, boxMultiplier)
                                : getItemQtyFromVendorBlock(
                                      getFoodBlock(browse.state.departmentId!),
                                      itemId,
                                      resolveFoodDay(browse.state.departmentId!),
                                  )
                        }
                        getItemNote={
                            mode === 'food' ? (itemId) => getFoodItemNote(itemId) : undefined
                        }
                        onItemQtyChange={(itemId, qty) =>
                            mode === 'boxes'
                                ? handleBoxQty(itemId, qty)
                                : handleFoodQty(browse.state.departmentId!, itemId, qty)
                        }
                        onItemNoteChange={
                            mode === 'food'
                                ? (itemId, note) =>
                                      handleFoodNoteChange(browse.state.departmentId!, itemId, note)
                                : undefined
                        }
                        canIncrement={(item) =>
                            mode === 'boxes'
                                ? canIncreaseBoxItem(
                                      item,
                                      orderConfig,
                                      menuItems,
                                      categories,
                                      quotasByBoxType,
                                      boxMultiplier,
                                  )
                                : !!browse.state.departmentId &&
                                  (deliveryDaysForVendor.length <= 1 || !!activeDeliveryDay) &&
                                  canIncrementFoodItem(
                                      orderConfig,
                                      menuItems,
                                      mealItems,
                                      client,
                                      serviceType,
                                      item,
                                      getFoodBlock(browse.state.departmentId!),
                                      resolveFoodDay(browse.state.departmentId!),
                                      householdPoolingEnabled ? effectiveMealLimit : undefined,
                                  )
                        }
                        getIncrementBlockedMessage={getIncrementBlockedMessage}
                        onIncrementBlocked={() => {}}
                        highlightItemId={browse.state.highlightItemId}
                        onSelectSubfolder={(path) =>
                            browse.goProducts(
                                browse.state.departmentId!,
                                canonicalFolderPath(roots, path),
                            )
                        }
                        onBrowseAllInDepartment={() =>
                            browse.goProducts(browse.state.departmentId!, [ALL_CATALOG_ITEMS_ID])
                        }
                    />,
                );
            default:
                return null;
        }
    };

    return (
        <div className={styles.portalV2Shell}>
            <PortalAutosaveOffModal
                open={autosaveOffModalOpen}
                reason={autosaveOffReason}
                onAcknowledge={onAcknowledgeAutosaveOff ?? (() => {})}
            />
            {autosaveDisabledBanner && (
                <div className={styles.portalV2AutosaveOffBanner} role="alert">
                    <div>
                        <strong>AUTOSAVE TURNED OFF</strong>
                        <p>
                            Your changes are NOT being saved automatically — click <u>Save Order</u>{' '}
                            in the cart when you are done. If Save Order fails, use{' '}
                            <u>Email my cart to the office</u>.
                        </p>
                    </div>
                </div>
            )}
            <header className={styles.portalV2TopBar}>
                <div className={styles.portalV2TopBarMain}>
                    <div className={styles.portalV2TopBarStart}>
                        <button
                            type="button"
                            className={styles.portalV2BrandLogoBtn}
                            onClick={browse.goHome}
                            aria-label="Home"
                        >
                            <Image
                                src="/mainLogo.jpg"
                                alt="Triangle Square"
                                width={60}
                                height={60}
                                className={styles.portalV2BrandLogo}
                                priority
                            />
                        </button>
                        <button
                            type="button"
                            className={`${styles.portalV2InfoBtn} ${hasLinkedAccounts ? styles.portalV2InfoBtnLinked : ''}`}
                            onClick={() => setAccountOpen(true)}
                        >
                            <User size={18} aria-hidden />
                            <span>
                                {hasLinkedAccounts
                                    ? `Accounts (${linkedAccountCount})`
                                    : 'My info'}
                            </span>
                        </button>
                        <span className={styles.portalV2Logo}>My Order</span>
                    </div>
                    <PortalSearchBar
                        serviceType={serviceType}
                        menuItems={menuItems}
                        vendors={vendors}
                        categories={categories}
                        boxLayout={boxLayout}
                        boxVendorId={effectiveBoxVendorId}
                        orderConfig={orderConfig}
                        approvedMealsPerWeek={client.approvedMealsPerWeek}
                        hidePhaseoutUnlessOnOrder={hidePhaseoutUnlessOnOrder}
                        onFoodHit={handleFoodSearchHit}
                        onBoxHit={handleBoxSearchHit}
                    />
                    <div className={styles.portalV2TopActions}>
                        <span
                            className={`${styles.portalV2AllowanceBadge} ${allowanceOver ? styles.portalV2AllowanceOver : ''}`}
                        >
                            {mode === 'boxes'
                                ? `${client.approvedMealsPerWeek} boxes`
                                : householdPoolingEnabled
                                    ? `${totalMealCount}/${effectiveMealLimit} meals (linked)`
                                    : `${totalMealCount}/${client.approvedMealsPerWeek} meals`}
                        </span>
                        <button
                            type="button"
                            className={styles.portalV2IconBtn}
                            onClick={() => setMobileCartOpen((o) => !o)}
                            aria-label="Cart"
                        >
                            <ShoppingCart size={22} />
                            {cartCount > 0 && (
                                <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>{cartCount}</span>
                            )}
                        </button>
                    </div>
                </div>
                <div className={styles.portalV2TopBarBelowSearch}>
                    {browse.state.view === 'home' ? (
                        <PortalShoppingActions
                            hasOrderItems={hasOrderItems}
                            mode={mode}
                            layout="header"
                            onStartShopping={handleStartShopping}
                            onContinueEditing={handleContinueEditing}
                            onClearAndStartFresh={handleClearAndStartFresh}
                        />
                    ) : (
                        <PortalSwitchDepartmentBar
                            mode={mode}
                            currentDepartmentName={departmentName || undefined}
                            onOpenPicker={openVendorPicker}
                        />
                    )}
                </div>
            </header>

            <div className={`${styles.portalV2Body} ${styles.portalV2BodyWithVendorRail}`}>
                <PortalVendorSidebar
                    mode={mode}
                    vendors={vendors}
                    categories={categories}
                    foodLayout={foodLayout}
                    boxLayout={boxLayout}
                    selectedDepartmentId={browse.state.departmentId}
                    orderConfig={orderConfig}
                    menuItems={menuItems}
                    client={client}
                    hideVendorNames={hideVendorNames}
                    boxMultiplier={boxMultiplier}
                    quotasByBoxType={quotasByBoxType}
                    foodBoxCategoryId={settings?.foodBoxCategoryId}
                    onSelectDepartment={handleSelectDepartment}
                />
                <main
                    className={`${styles.portalV2Main} ${browse.state.view === 'products' ? styles.portalV2MainProduct : ''}`}
                >
                    <div className={styles.portalV2MainScroll}>{mainContent()}</div>
                </main>
                <PortalCartSidebar
                    client={client}
                    serviceType={serviceType}
                    orderConfig={cartOrderConfig}
                    setOrderConfig={focusedHouseholdMemberId ? undefined : setOrderConfig}
                    vendors={vendors}
                    menuItems={menuItems}
                    mealCategories={mealCategories}
                    mealItems={mealItems}
                    categories={categories}
                    hideVendorNames={hideVendorNames}
                    approvedMealsPerWeek={cartMealLimit}
                    boxQuotas={activeBoxQuotas}
                    className={mobileCartOpen ? styles.portalV2CartColumnOpen : undefined}
                    saving={saving}
                    saveError={saveError ?? null}
                    validationError={validationError ?? null}
                    vendorTips={vendorTips}
                    boxTips={boxTips}
                    hasOrderItems={hasOrderItems}
                    onClearAndStartFresh={handleClearAndStartFresh}
                    onStartShopping={handleStartShopping}
                    onContinueEditing={handleContinueEditing}
                    onItemNavigate={handleCartItemNavigate}
                    saveMode={saveMode}
                    dirty={dirty}
                    escalateAvailable={escalateAvailable}
                    escalating={escalating}
                    escalateMessage={escalateMessage}
                    saveSuccessMessage={saveSuccessMessage}
                    onManualSave={onManualSave}
                    onEscalateToTeam={onEscalateToTeam}
                />
            </div>

            <PortalMobileNav
                active={mobileTab}
                cartCount={cartCount}
                onHome={browse.goHome}
                onDepartments={openVendorPicker}
                onCart={() => setMobileCartOpen((o) => !o)}
                onAccount={() => setAccountOpen(true)}
            />

            <PortalVendorPickerOverlay
                open={vendorPickerOpen}
                onClose={() => setVendorPickerOpen(false)}
                mode={mode}
                vendors={vendors}
                categories={categories}
                foodLayout={foodLayout}
                boxLayout={boxLayout}
                selectedDepartmentId={browse.state.departmentId}
                orderConfig={orderConfig}
                menuItems={menuItems}
                client={client}
                hideVendorNames={hideVendorNames}
                boxMultiplier={boxMultiplier}
                quotasByBoxType={quotasByBoxType}
                foodBoxCategoryId={settings?.foodBoxCategoryId}
                onSelectDepartment={handleSelectDepartment}
            />

            <PortalAccountDrawer
                open={accountOpen}
                onClose={() => setAccountOpen(false)}
                client={client}
                serviceType={serviceType}
                switchableAccounts={switchableAccounts}
                onSwitchAccount={onSwitchAccount}
                householdOrderMembers={householdOrderMembers}
                householdMemberAllocations={householdMemberAllocations}
                focusedMemberId={focusedHouseholdMemberId}
                onFocusMember={setFocusedHouseholdMemberId}
            />

            {foodBoxPrompt && settings?.foodBoxCategoryId && (
                <PortalFoodBoxSwitchModal
                    conflict={foodBoxPrompt}
                    categoryName={foodBoxCategoryLabel}
                    onCancel={() => {
                        setFoodBoxPrompt(null);
                        setPendingBoxQty(null);
                    }}
                    onConfirm={confirmFoodBoxSwitch}
                />
            )}

        </div>
    );
}

export function ClientPortalV2(props: ClientPortalV2Props) {
    return (
        <Suspense
            fallback={
                <div className={styles.portalV2Shell}>
                    <div className={styles.portalV2PickPrompt}>
                        <p className={styles.portalV2PickPromptSub}>Loading…</p>
                    </div>
                </div>
            }
        >
            <ClientPortalV2Inner {...props} />
        </Suspense>
    );
}

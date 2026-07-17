'use client';

import React, { useMemo } from 'react';
import { AlertTriangle, Check, Store } from 'lucide-react';
import { isPortalHomeDepartment, PORTAL_HOME_DEPARTMENT_ID } from '@/lib/portal-home-department';
import type { BoxQuota, ClientProfile, ItemCategory, MenuItem, Vendor } from '@/lib/types';
import type { FoodMenuLayoutConfig } from '@/lib/food/food-menu-layout';
import type { BoxMenuLayoutConfig } from '@/lib/boxes/box-catalog-order';
import { sortBoxCategoriesForCatalog } from '@/lib/boxes/box-catalog-order';
import { getBoxCategoryImageUrl } from '@/lib/boxes/box-category-images';
import { mergeDeliveryDayOrdersToVendorSelections } from '@/lib/portal-vendor-selection';
import { getBoxCategorySidebarStatus } from '@/lib/portal-box-status';
import { getVendorSidebarStatus } from '@/lib/portal-vendor-status';
import styles from './portal-v2.module.css';

type Dept = { id: string; name: string; imageUrl: string | null };

type Props = {
    mode: 'food' | 'boxes';
    vendors: Vendor[];
    categories: ItemCategory[];
    foodLayout: FoodMenuLayoutConfig | null;
    boxLayout: BoxMenuLayoutConfig | null;
    selectedDepartmentId: string | null;
    orderConfig: unknown;
    menuItems: MenuItem[];
    client: ClientProfile;
    hideVendorNames: boolean;
    boxMultiplier?: number;
    quotasByBoxType?: Record<string, BoxQuota[]>;
    foodBoxCategoryId?: string | null;
    onSelectDepartment: (id: string) => void;
    /** Full labels for mobile overlay picker (not icon-only rail). */
    fullScreen?: boolean;
};

export function PortalVendorSidebar({
    mode,
    vendors,
    categories,
    foodLayout,
    boxLayout,
    selectedDepartmentId,
    orderConfig,
    menuItems,
    client,
    hideVendorNames,
    boxMultiplier = 1,
    quotasByBoxType = {},
    foodBoxCategoryId,
    onSelectDepartment,
    fullScreen = false,
}: Props) {
    const selections = useMemo(
        () => mergeDeliveryDayOrdersToVendorSelections(orderConfig),
        [orderConfig],
    );

    const departments: Dept[] = useMemo(() => {
        if (mode === 'food') {
            const active = vendors.filter((v) => v.isActive && v.serviceTypes.includes('Food'));
            const order = foodLayout?.orderedVendorIds ?? [];
            return [...active]
                .sort((a, b) => {
                    const ia = order.indexOf(a.id);
                    const ib = order.indexOf(b.id);
                    if (ia >= 0 && ib >= 0) return ia - ib;
                    if (ia >= 0) return -1;
                    if (ib >= 0) return 1;
                    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name);
                })
                .map((v, index) => ({
                    id: v.id,
                    name: hideVendorNames ? `Kitchen ${index + 1}` : v.name,
                    imageUrl: v.portalImageUrl ?? null,
                }));
        }
        return sortBoxCategoriesForCatalog(
            categories.filter((c) => c.isActive !== false),
            boxLayout?.orderedCategoryIds,
        ).map((c) => {
            const name = c.name?.replace(/^\[Preview\]\s*/i, '').trim() || c.name;
            return {
                id: c.id,
                name,
                imageUrl: getBoxCategoryImageUrl(name, {
                    categoryId: c.id,
                    foodBoxCategoryId,
                }),
            };
        });
    }, [mode, vendors, categories, foodLayout, boxLayout, hideVendorNames, foodBoxCategoryId]);

    const departmentsWithHome: Dept[] = useMemo(
        () => [
            { id: PORTAL_HOME_DEPARTMENT_ID, name: 'Home', imageUrl: '/mainLogo.jpg' },
            ...departments,
        ],
        [departments],
    );

    const selectionByVendor = useMemo(() => {
        const map = new Map<string, (typeof selections)[number]>();
        for (const sel of selections) {
            if (sel?.vendorId) map.set(sel.vendorId, sel);
        }
        return map;
    }, [selections]);

    const label = mode === 'food' ? 'Kitchen facilities' : 'Categories';

    return (
        <aside
            className={`${styles.portalV2VendorSidebar} ${fullScreen ? styles.portalV2VendorSidebarFull : ''}`}
            aria-label={label}
        >
            {!fullScreen ? <div className={styles.portalV2VendorSidebarHead}>{label}</div> : null}
            <div className={styles.portalV2VendorSidebarList}>
                {departmentsWithHome.map((dept) => {
                    const isHome = isPortalHomeDepartment(dept.id);
                    const vendor = !isHome && mode === 'food' ? vendors.find((v) => v.id === dept.id) : null;
                    const category = !isHome && mode === 'boxes' ? categories.find((c) => c.id === dept.id) : null;
                    const selection = selectionByVendor.get(dept.id);

                    let hint: string | null = null;
                    let hintOk = true;
                    let showCheck = false;

                    if (mode === 'food' && vendor) {
                        const foodStatus = getVendorSidebarStatus(vendor, selection, menuItems, client);
                        hint = foodStatus.hint;
                        hintOk = foodStatus.meetsMin;
                        showCheck = !!hint?.includes('✓');
                    } else if (mode === 'boxes' && category) {
                        const boxStatus = getBoxCategorySidebarStatus(
                            category,
                            orderConfig,
                            menuItems,
                            categories,
                            quotasByBoxType,
                            boxMultiplier,
                        );
                        hint = boxStatus.hint;
                        hintOk = !boxStatus.atOrOverLimit;
                        showCheck = !!hint && hintOk && hint.includes('/');
                    }

                    const active = selectedDepartmentId === dept.id;
                    const isFoodBoxCategory = Boolean(
                        mode === 'boxes' && foodBoxCategoryId && dept.id === foodBoxCategoryId,
                    );

                    return (
                        <button
                            key={dept.id}
                            type="button"
                            className={`${styles.portalV2VendorSidebarBtn} ${active ? styles.portalV2VendorSidebarBtnActive : ''}`}
                            onClick={() => onSelectDepartment(dept.id)}
                            title={dept.name}
                        >
                            {dept.imageUrl ? (
                                <img
                                    src={dept.imageUrl}
                                    alt=""
                                    className={`${styles.portalV2VendorSidebarIcon}${
                                        mode === 'boxes' && !isHome ? ` ${styles.portalV2VendorSidebarIconCover}` : ''
                                    }`}
                                />
                            ) : (
                                <span className={styles.portalV2VendorSidebarIconPlaceholder}>
                                    <Store size={28} />
                                </span>
                            )}
                            <span className={styles.portalV2VendorSidebarLabel}>
                                <span className={styles.portalV2VendorSidebarName}>
                                    {dept.name}
                                    {isFoodBoxCategory ? (
                                        <span className={styles.portalV2FoodBoxBadge} title="Exclusive food box category">
                                            Food box
                                        </span>
                                    ) : null}
                                </span>
                                {hint && (
                                    <span
                                        className={`${styles.portalV2VendorSidebarHint} ${
                                            hintOk ? styles.portalV2VendorSidebarHintOk : styles.portalV2VendorSidebarHintWarn
                                        }`}
                                    >
                                        {!hintOk && <AlertTriangle size={11} aria-hidden />}
                                        {showCheck && <Check size={11} aria-hidden />}
                                        {hint}
                                    </span>
                                )}
                            </span>
                        </button>
                    );
                })}
            </div>
        </aside>
    );
}

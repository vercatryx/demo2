'use client';

import React from 'react';
import { ChevronRight, Store } from 'lucide-react';
import type { ItemCategory, Vendor } from '@/lib/types';
import { sortBoxCategoriesForCatalog } from '@/lib/boxes/box-catalog-order';
import type { BoxMenuLayoutConfig } from '@/lib/boxes/box-catalog-order';
import { getBoxCategoryImageUrl } from '@/lib/boxes/box-category-images';
import type { FoodMenuLayoutConfig } from '@/lib/food/food-menu-layout';
import styles from './portal-v2.module.css';

type Props = {
    mode: 'food' | 'boxes';
    vendors: Vendor[];
    categories: ItemCategory[];
    foodLayout: FoodMenuLayoutConfig | null;
    boxLayout: BoxMenuLayoutConfig | null;
    onSelectDepartment: (id: string) => void;
    selectedDepartmentId?: string | null;
    foodBoxCategoryId?: string | null;
};

function DeptIcon({ name, imageUrl }: { name: string; imageUrl?: string | null }) {
    if (imageUrl) {
        return <img src={imageUrl} alt="" className={styles.portalV2DeptIcon} />;
    }
    return (
        <div className={`${styles.portalV2DeptIcon} ${styles.portalV2DeptIconPlaceholder}`}>
            {name.charAt(0).toUpperCase()}
        </div>
    );
}

export function PortalDepartments({
    mode,
    vendors,
    categories,
    foodLayout,
    boxLayout,
    onSelectDepartment,
    selectedDepartmentId,
    foodBoxCategoryId,
}: Props) {
    const foodVendors = React.useMemo(() => {
        const active = vendors.filter((v) => v.isActive && v.serviceTypes.includes('Food'));
        const order = foodLayout?.orderedVendorIds ?? [];
        return [...active].sort((a, b) => {
            const ia = order.indexOf(a.id);
            const ib = order.indexOf(b.id);
            if (ia >= 0 && ib >= 0) return ia - ib;
            if (ia >= 0) return -1;
            if (ib >= 0) return 1;
            return (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name);
        });
    }, [vendors, foodLayout]);

    const boxCategories = React.useMemo(
        () => sortBoxCategoriesForCatalog(categories.filter((c) => c.isActive !== false), boxLayout?.orderedCategoryIds),
        [categories, boxLayout],
    );

    const departments =
        mode === 'food'
            ? foodVendors.map((v) => ({ id: v.id, name: v.name, imageUrl: v.portalImageUrl }))
            : boxCategories.map((c) => ({
                  id: c.id,
                  name: c.name,
                  imageUrl: getBoxCategoryImageUrl(c.name, {
                      categoryId: c.id,
                      foodBoxCategoryId,
                  }),
              }));

    if (departments.length === 0) {
        return (
            <p style={{ padding: 24, color: 'var(--text-secondary)' }}>
                {mode === 'food' ? 'No kitchen facilities are available to browse.' : 'No box categories are available.'}
            </p>
        );
    }

    const list = departments.map((dept) => (
        <button
            key={dept.id}
            type="button"
            className={styles.portalV2DeptRow}
            onClick={() => onSelectDepartment(dept.id)}
        >
            <DeptIcon name={dept.name} imageUrl={dept.imageUrl} />
            <span className={styles.portalV2DeptName}>{dept.name}</span>
            <ChevronRight size={18} color="var(--text-tertiary)" />
        </button>
    ));

    return (
        <>
            {/* Desktop: full-width department list */}
            <div className={`${styles.portalV2DeptList} ${styles.portalV2DeptListDesktop}`}>{list}</div>

            {/* Mobile: icon rail + list */}
            <div className={styles.portalV2MobileSplit}>
                <div className={styles.portalV2MobileRail}>
                    {departments.map((dept) => (
                        <button
                            key={dept.id}
                            type="button"
                            className={`${styles.portalV2MobileRailBtn} ${selectedDepartmentId === dept.id ? styles.portalV2MobileRailBtnActive : ''}`}
                            onClick={() => onSelectDepartment(dept.id)}
                            title={dept.name}
                        >
                            {dept.imageUrl ? (
                                <img src={dept.imageUrl} alt="" className={styles.portalV2MobileRailIcon} />
                            ) : (
                                <Store size={22} />
                            )}
                        </button>
                    ))}
                </div>
                <div className={styles.portalV2DeptList}>{list}</div>
            </div>
        </>
    );
}

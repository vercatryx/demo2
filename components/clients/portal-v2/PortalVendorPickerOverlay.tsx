'use client';

import React from 'react';
import { X } from 'lucide-react';
import type { BoxQuota, ClientProfile, ItemCategory, MenuItem, Vendor } from '@/lib/types';
import type { FoodMenuLayoutConfig } from '@/lib/food/food-menu-layout';
import type { BoxMenuLayoutConfig } from '@/lib/boxes/box-catalog-order';
import { PortalVendorSidebar } from './PortalVendorSidebar';
import styles from './portal-v2.module.css';

type Props = {
    open: boolean;
    onClose: () => void;
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
};

export function PortalVendorPickerOverlay({
    open,
    onClose,
    onSelectDepartment,
    ...sidebarProps
}: Props) {
    if (!open) return null;

    const handleSelect = (id: string) => {
        onSelectDepartment(id);
        onClose();
    };

    const title = sidebarProps.mode === 'food' ? 'Choose a kitchen' : 'Choose a category';

    return (
        <div className={styles.portalV2VendorOverlayBackdrop} onClick={onClose}>
            <div
                className={styles.portalV2VendorOverlayPanel}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                onClick={(e) => e.stopPropagation()}
            >
                <header className={styles.portalV2VendorOverlayHeader}>
                    <h2 className={styles.portalV2VendorOverlayTitle}>{title}</h2>
                    <button
                        type="button"
                        className={styles.portalV2VendorOverlayClose}
                        onClick={onClose}
                        aria-label="Close"
                    >
                        <X size={22} />
                    </button>
                </header>
                <PortalVendorSidebar
                    {...sidebarProps}
                    fullScreen
                    onSelectDepartment={handleSelect}
                />
            </div>
        </div>
    );
}

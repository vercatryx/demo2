'use client';

import React from 'react';
import ClientPortalOrderSummary from '@/components/clients/ClientPortalOrderSummary';
import type { ItemCategory, MealCategory, MealItem, MenuItem, Vendor } from '@/lib/types';
import type { BoxQuota } from '@/lib/types';
import type { BoxCategoryTip } from '@/lib/portal-box-status';
import type { VendorMinimumTip } from '@/lib/portal-vendor-status';
import { PortalStatusBar, type PortalSaveMode } from './PortalStatusBar';
import { PortalContactHelp } from './PortalContactHelp';
import { PortalShoppingActions } from './PortalShoppingActions';
import type { ClientProfile } from '@/lib/types';
import styles from './portal-v2.module.css';

type Props = {
    client: ClientProfile;
    serviceType: string;
    orderConfig: any;
    setOrderConfig?: React.Dispatch<React.SetStateAction<any>>;
    vendors: Vendor[];
    menuItems: MenuItem[];
    mealCategories: MealCategory[];
    mealItems: MealItem[];
    categories: ItemCategory[];
    hideVendorNames: boolean;
    approvedMealsPerWeek: number;
    boxQuotas: BoxQuota[];
    className?: string;
    saving: boolean;
    saveError: string | null;
    validationError: string | null;
    vendorTips: VendorMinimumTip[];
    boxTips: BoxCategoryTip[];
    hasOrderItems: boolean;
    onClearAndStartFresh: () => void;
    onStartShopping: () => void;
    onContinueEditing: () => void;
    onItemNavigate?: (itemId: string) => void;
    saveMode?: PortalSaveMode;
    dirty?: boolean;
    escalateAvailable?: boolean;
    escalating?: boolean;
    escalateMessage?: string | null;
    saveSuccessMessage?: string | null;
    onManualSave?: () => void;
    onEscalateToTeam?: () => void;
};

export function PortalCartSidebar({
    client,
    serviceType,
    orderConfig,
    setOrderConfig,
    vendors,
    menuItems,
    mealCategories,
    mealItems,
    categories,
    hideVendorNames,
    approvedMealsPerWeek,
    boxQuotas,
    className,
    saving,
    saveError,
    validationError,
    vendorTips,
    boxTips,
    hasOrderItems,
    onClearAndStartFresh,
    onStartShopping,
    onContinueEditing,
    onItemNavigate,
    saveMode,
    dirty,
    escalateAvailable,
    escalating,
    escalateMessage,
    saveSuccessMessage,
    onManualSave,
    onEscalateToTeam,
}: Props) {
    return (
        <div className={`${styles.portalV2CartColumn} ${className ?? ''}`}>
            <div className={styles.portalV2CartScroll}>
                <ClientPortalOrderSummary
                    orderConfig={orderConfig}
                    setOrderConfig={setOrderConfig}
                    vendors={vendors}
                    menuItems={menuItems}
                    mealCategories={mealCategories}
                    mealItems={mealItems}
                    categories={categories}
                    hideVendorNames={hideVendorNames}
                    approvedMealsPerWeek={approvedMealsPerWeek}
                    boxQuotas={boxQuotas}
                    showItemThumbnails
                    onItemNavigate={onItemNavigate}
                />
                <PortalShoppingActions
                    hasOrderItems={hasOrderItems}
                    mode={serviceType === 'Boxes' ? 'boxes' : 'food'}
                    layout="cart"
                    onStartShopping={onStartShopping}
                    onContinueEditing={onContinueEditing}
                    onClearAndStartFresh={onClearAndStartFresh}
                />
            </div>
            <PortalStatusBar
                saving={saving}
                saveError={saveError}
                validationError={validationError}
                vendorTips={vendorTips}
                boxTips={boxTips}
                saveMode={saveMode}
                dirty={dirty}
                escalateAvailable={escalateAvailable}
                escalating={escalating}
                escalateMessage={escalateMessage}
                saveSuccessMessage={saveSuccessMessage}
                onManualSave={onManualSave}
                onEscalateToTeam={onEscalateToTeam}
            />
            <PortalContactHelp client={client} serviceType={serviceType} />
        </div>
    );
}

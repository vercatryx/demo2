'use client';

import React from 'react';
import { ClientProfile } from '@/lib/types';
import { Plus, AlertTriangle, Calendar, ArrowLeft } from 'lucide-react';
import styles from './ClientPortal.module.css';

interface Props {
    // Basic Data
    client: ClientProfile;
    /** Effective service type for current order (orderConfig.serviceType ?? client.serviceType). Use this for UI, not client.serviceType. */
    serviceType?: string;

    totalMealCount: number;
    approvedLimit?: number | null;
    /** Headline above validation detail (same copy as bottom save strip). */
    validationTitle?: string;
    validationError?: string | null;
    takingEffectDate?: React.ReactNode;

    // Actions
    onAddVendor?: () => void;

    // UI State
    isCompact?: boolean;
    orderConfig?: any;
}

export default function ClientPortalHeader({
    client,
    serviceType: effectiveServiceType,
    totalMealCount,
    approvedLimit,
    validationTitle = 'Please update your order',
    validationError,
    takingEffectDate,
    onAddVendor,
    orderConfig = {},
}: Props) {
    const serviceType = effectiveServiceType ?? client.serviceType;
    // Show whenever the Food Service (Food/Meal) widget is on screen — no separate client check.
    const showAddKitchenFacilities =
        (serviceType === 'Food' || serviceType === 'Meal') && !!onAddVendor;
    const isOverLimit = approvedLimit && totalMealCount > approvedLimit;
    const isUnderLimit = approvedLimit && totalMealCount < (approvedLimit * 0.5); // Just a heuristic

    const countColor = isOverLimit ? 'var(--color-danger)' : 'var(--color-primary)';

    return (
        <div className={styles.headerContainer}>
            {/* Top Row: Meta & order issues */}
            <div className={styles.headerTopRow}>
                <div className={styles.headerMeta}>
                    {/* Meal Count - Only show for Food Service */}
                    {serviceType === 'Food' && (
                        <div className={styles.headerCount}>
                            <span className={styles.headerCountLabel}>
                                Current Order
                            </span>
                            <div className={styles.headerCountValue} style={{ color: countColor }}>
                                {totalMealCount}
                                {approvedLimit && <span className={styles.headerCountLimit}> / {approvedLimit}</span>}
                            </div>
                        </div>
                    )}

                    {/* Effect Date */}
                    {takingEffectDate && (
                        <div className={styles.headerEffectDate}>
                            <span className={styles.headerEffectLabel}>
                                Changes take effect from
                            </span>
                            <div className={styles.headerEffectValue}>
                                <Calendar size={16} />
                                {takingEffectDate}
                            </div>
                        </div>
                    )}
                </div>

                {validationError && (
                    <div className={styles.headerOrderIssue} role="alert">
                        <div className={styles.headerOrderIssueIcon} aria-hidden>
                            <AlertTriangle size={18} strokeWidth={2.25} />
                        </div>
                        <div className={styles.headerOrderIssueBody}>
                            <div className={styles.headerOrderIssueTitle}>{validationTitle}</div>
                            <p className={styles.headerOrderIssueDetail}>{validationError}</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom Row: Actions */}
            <div className={styles.headerBottomRow}>
                {/* Add kitchen facilities — any Food-program client on Food/Meal order UI */}
                {showAddKitchenFacilities && (
                    <button
                        onClick={onAddVendor}
                        className="btn btn-warning"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            backgroundColor: '#fbbf24',
                            border: 'none',
                            color: 'black',
                            fontWeight: 600,
                            padding: '10px 24px',
                            borderRadius: '8px',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                        }}
                    >
                        <Plus size={16} /> Add Kitchen Facilities
                    </button>
                )}

                {/* Meal packages: direct add hidden — use kitchen facilities below */}
                {(serviceType === 'Food' || serviceType === 'Meal') && (
                    <p className={styles.kitchenFacilitiesMealHint}>
                        <ArrowLeft size={18} className={styles.kitchenFacilitiesMealHintArrow} aria-hidden />
                        <span>
                            All options can be selected through{' '}
                            <strong>kitchen facilities</strong>
                        </span>
                    </p>
                )}
            </div>
        </div>
    );
}

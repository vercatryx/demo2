'use client';

import React from 'react';
import { ClientProfile } from '@/lib/types';
import { Plus, AlertTriangle, Calendar } from 'lucide-react';
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
    onAddMeal?: (mealType: string) => void;

    // UI State
    isCompact?: boolean;
    mealCategories?: { id: string, name: string, mealType: string }[];
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
    onAddMeal,
    mealCategories = [],
    orderConfig = {},
}: Props) {
    const serviceType = effectiveServiceType ?? client.serviceType;
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
                            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: 600 }}>
                                Current Order
                            </span>
                            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: countColor, lineHeight: 1 }}>
                                {totalMealCount}
                                {approvedLimit && <span style={{ fontSize: '1rem', color: 'var(--text-tertiary)', fontWeight: 500 }}> / {approvedLimit}</span>}
                            </div>
                        </div>
                    )}

                    {/* Effect Date */}
                    {takingEffectDate && (
                        <div className={styles.headerEffectDate}>
                            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: 600 }}>
                                Changes take effect from
                            </span>
                            <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
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
                {/* Add kitchen facilities button — Food only (client-facing label) */}
                {serviceType === 'Food' && onAddVendor && (
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

                {/* Add Meal Buttons - Food OR Meal */}
                {(serviceType === 'Food' || serviceType === 'Meal') && onAddMeal && (
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                        {mealCategories
                            .map(c => c.mealType)
                            .filter((val, idx, arr) => arr.indexOf(val) === idx)
                            .map(type => (
                                <button
                                    key={type}
                                    type="button"
                                    onClick={() => onAddMeal(type)}
                                    className="btn"
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
                                        fontSize: '0.92rem'
                                    }}
                                >
                                    <Plus size={16} /> Add {type}
                                </button>
                            ))
                        }
                    </div>
                )}
            </div>
        </div>
    );
}

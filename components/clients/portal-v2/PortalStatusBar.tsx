'use client';

import React from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import type { BoxCategoryTip } from '@/lib/portal-box-status';
import type { VendorMinimumTip } from '@/lib/portal-vendor-status';
import styles from './portal-v2.module.css';

export type PortalSaveMode = 'auto' | 'manual';

type Props = {
    saving: boolean;
    saveError: string | null;
    validationError: string | null;
    vendorTips: VendorMinimumTip[];
    boxTips: BoxCategoryTip[];
    saveMode?: PortalSaveMode;
    dirty?: boolean;
    escalateAvailable?: boolean;
    escalating?: boolean;
    escalateMessage?: string | null;
    saveSuccessMessage?: string | null;
    onManualSave?: () => void;
    onEscalateToTeam?: () => void;
};

export function PortalStatusBar({
    saving,
    saveError,
    validationError,
    vendorTips,
    boxTips,
    saveMode = 'auto',
    dirty = false,
    escalateAvailable = false,
    escalating = false,
    escalateMessage = null,
    saveSuccessMessage = null,
    onManualSave,
    onEscalateToTeam,
}: Props) {
    const hasOrderTips = vendorTips.length > 0 || boxTips.length > 0;
    const manual = saveMode === 'manual';

    let statusLine: React.ReactNode = null;
    if (escalateMessage) {
        statusLine = (
            <span className={styles.portalV2StatusOk}>
                <CheckCircle2 size={14} aria-hidden />
                {escalateMessage}
            </span>
        );
    } else if (saveSuccessMessage) {
        statusLine = (
            <span className={styles.portalV2StatusOk}>
                <CheckCircle2 size={14} aria-hidden />
                {saveSuccessMessage}
            </span>
        );
    } else if (saveError) {
        statusLine = (
            <span className={styles.portalV2StatusError}>
                {manual ? 'Save failed — ' : 'Couldn’t save — '}
                {saveError}
                {manual ? ' Try Save Order again, or email your cart to the office.' : ''}
            </span>
        );
    } else if (validationError) {
        statusLine = (
            <span className={styles.portalV2StatusWarn}>
                <AlertTriangle size={14} aria-hidden />
                {validationError}
            </span>
        );
    } else if (vendorTips.length > 0) {
        statusLine = (
            <span className={styles.portalV2StatusWarn}>
                <AlertTriangle size={14} aria-hidden />
                Some kitchens are below their minimum — see details below.
            </span>
        );
    } else if (boxTips.length > 0) {
        const hasFoodBoxMix = boxTips.some((tip) => tip.categoryId === '__food_box_mix__');
        statusLine = (
            <span className={styles.portalV2StatusWarn}>
                <AlertTriangle size={14} aria-hidden />
                {hasFoodBoxMix
                    ? 'Your box mixes Food Box and Build your own items — see details below.'
                    : 'Some categories are over their point limit — see details below.'}
            </span>
        );
    } else if (saving) {
        statusLine = (
            <span className={styles.portalV2StatusSaving}>
                <Loader2 size={14} className="spin" aria-hidden />
                Saving your order…
            </span>
        );
    } else if (manual) {
        statusLine = (
            <span className={styles.portalV2StatusWarn}>
                <AlertTriangle size={14} aria-hidden />
                {dirty
                    ? 'Autosave is off. Click Save Order when you are ready.'
                    : 'Autosave is off. After you make changes, click Save Order.'}
            </span>
        );
    } else if (dirty) {
        statusLine = (
            <span className={styles.portalV2StatusSaving}>
                <Loader2 size={14} className="spin" aria-hidden />
                Saving your order…
            </span>
        );
    } else {
        statusLine = (
            <span className={styles.portalV2StatusOk}>
                <CheckCircle2 size={14} aria-hidden />
                Your order looks good — we save changes automatically.
            </span>
        );
    }

    const showSaveButton = manual && !!onManualSave;
    const showEscalate = escalateAvailable && !!onEscalateToTeam && !escalateMessage;

    return (
        <div className={styles.portalV2CartStatus} role="status" aria-live="polite">
            <div className={styles.portalV2CartStatusMain}>{statusLine}</div>
            {(showSaveButton || showEscalate) && (
                <div className={styles.portalV2CartStatusActions}>
                    {showSaveButton && (
                        <button
                            type="button"
                            className={styles.portalV2SaveBtn}
                            onClick={onManualSave}
                            disabled={saving || !dirty}
                        >
                            {saving ? 'Saving…' : 'Save Order'}
                        </button>
                    )}
                    {showEscalate && (
                        <button
                            type="button"
                            className={styles.portalV2EscalateBtn}
                            onClick={onEscalateToTeam}
                            disabled={escalating || saving}
                        >
                            {escalating ? 'Sending to office…' : 'Email my cart to the office'}
                        </button>
                    )}
                </div>
            )}
            {hasOrderTips && (
                <div className={styles.portalV2CartStatusTips}>
                    {vendorTips.map((tip) => (
                        <span key={`${tip.vendorId}-${tip.message}`} className={styles.portalV2StatusTipWarn}>
                            <AlertTriangle size={12} aria-hidden />
                            {tip.message}
                        </span>
                    ))}
                    {boxTips.map((tip) => (
                        <span key={`${tip.categoryId}-${tip.message}`} className={styles.portalV2StatusTipWarn}>
                            <AlertTriangle size={12} aria-hidden />
                            {tip.message}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

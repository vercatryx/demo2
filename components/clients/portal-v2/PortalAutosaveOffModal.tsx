'use client';

import React from 'react';
import styles from './portal-v2.module.css';

export type AutosaveOffReason = 'slow' | 'error';

type Props = {
    open: boolean;
    reason?: AutosaveOffReason;
    onAcknowledge: () => void;
};

export function PortalAutosaveOffModal({ open, reason = 'slow', onAcknowledge }: Props) {
    if (!open) return null;

    const body =
        reason === 'error' ? (
            <>
                <p>
                    Automatic saving hit a problem, so we <strong>stopped autosave</strong> for
                    this session. Your latest change may not be on the server yet.
                </p>
                <p>
                    Click <strong>Save Order</strong> in the cart to try again. You will see a
                    clear success or failure message for that save. If Save Order fails, use{' '}
                    <strong>Email my cart to the office</strong>.
                </p>
            </>
        ) : (
            <>
                <p>
                    Saving was taking too long, so we <strong>stopped autosave</strong>. Your
                    changes are <strong>not</strong> being saved automatically anymore.
                </p>
                <p>
                    When you are done editing, click <strong>Save Order</strong> in the cart.
                    You will see whether that save worked. If it fails, use{' '}
                    <strong>Email my cart to the office</strong>.
                </p>
            </>
        );

    return (
        <div className={styles.portalV2AutosaveOffModalBackdrop} role="presentation">
            <div
                className={styles.portalV2AutosaveOffModal}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="portal-autosave-off-title"
                aria-describedby="portal-autosave-off-desc"
            >
                <h2 id="portal-autosave-off-title" className={styles.portalV2AutosaveOffModalTitle}>
                    Autosave turned off
                </h2>
                <div id="portal-autosave-off-desc" className={styles.portalV2AutosaveOffModalBody}>
                    {body}
                </div>
                <div className={styles.portalV2AutosaveOffModalActions}>
                    <button
                        type="button"
                        className={styles.portalV2AutosaveOffModalBtn}
                        onClick={onAcknowledge}
                    >
                        I understand — I will click Save Order
                    </button>
                </div>
            </div>
        </div>
    );
}

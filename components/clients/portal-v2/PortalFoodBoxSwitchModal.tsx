'use client';

import React from 'react';
import type { FoodBoxExclusiveConflict } from '@/lib/box-food-exclusive';
import { getFoodBoxSwitchModalCopy } from '@/lib/portal-food-box-messages';
import styles from './portal-v2.module.css';

type Props = {
    conflict: Exclude<FoodBoxExclusiveConflict, 'none'>;
    categoryName: string;
    onCancel: () => void;
    onConfirm: () => void;
};

export function PortalFoodBoxSwitchModal({ conflict, categoryName, onCancel, onConfirm }: Props) {
    const copy = getFoodBoxSwitchModalCopy(conflict, categoryName);

    return (
        <div className={styles.portalV2FoodBoxModalBackdrop} role="presentation" onClick={onCancel}>
            <div
                className={styles.portalV2FoodBoxModal}
                role="dialog"
                aria-modal="true"
                aria-labelledby="portal-food-box-switch-title"
                aria-describedby="portal-food-box-switch-desc"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 id="portal-food-box-switch-title" className={styles.portalV2FoodBoxModalTitle}>
                    {copy.title}
                </h2>
                <div id="portal-food-box-switch-desc" className={styles.portalV2FoodBoxModalBody}>
                    <p className={styles.portalV2FoodBoxModalLead}>{copy.lead}</p>
                    <p>{copy.body}</p>
                </div>
                <div className={styles.portalV2FoodBoxModalActions}>
                    <button type="button" className={styles.portalV2FoodBoxModalBtnSecondary} onClick={onCancel}>
                        Cancel
                    </button>
                    <button type="button" className={styles.portalV2FoodBoxModalBtnPrimary} onClick={onConfirm}>
                        Continue
                    </button>
                </div>
            </div>
        </div>
    );
}

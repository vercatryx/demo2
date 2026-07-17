'use client';

import React from 'react';
import { getFoodBoxExclusiveBannerCopy } from '@/lib/portal-food-box-messages';
import styles from './portal-v2.module.css';

type Props = {
    categoryLabel: string;
};

export function PortalFoodBoxExclusiveBanner({ categoryLabel }: Props) {
    const copy = getFoodBoxExclusiveBannerCopy();

    return (
        <div className={styles.portalV2FoodBoxBanner} role="status">
            <div className={styles.portalV2FoodBoxBannerStack}>
                <p className={styles.portalV2FoodBoxBannerTitle}>
                    {copy.title}
                    <span className={styles.portalV2FoodBoxBannerCategory}>{categoryLabel}</span>
                </p>
                <p>
                    <strong>{copy.heading}</strong>
                </p>
                <ol className={styles.portalV2FoodBoxBannerList}>
                    <li>
                        <strong>{copy.foodBoxLabel}</strong> — {copy.foodBoxDetail}
                    </li>
                    <li>
                        <strong>{copy.buildYourOwnLabel}</strong> — {copy.buildYourOwnDetail}
                    </li>
                </ol>
                <p>{copy.combineNote}</p>
            </div>
        </div>
    );
}

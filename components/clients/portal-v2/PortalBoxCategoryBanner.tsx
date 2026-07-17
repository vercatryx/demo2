'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import type { ItemCategory } from '@/lib/types';
import { formatBoxCategoryBannerMessage } from '@/lib/portal-box-status';
import styles from './portal-v2.module.css';

type Props = {
    categoryName: string;
    used: number;
    required: number | null;
    boxMultiplier: number;
};

export function PortalBoxCategoryBanner({ categoryName, used, required, boxMultiplier }: Props) {
    const { title, detail, warn } = formatBoxCategoryBannerMessage(
        categoryName,
        used,
        required,
        boxMultiplier,
    );

    return (
        <div
            className={`${styles.portalV2BoxCategoryBanner} ${warn ? styles.portalV2BoxCategoryBannerWarn : ''}`}
            role="region"
            aria-label="Category points"
        >
            <p className={styles.portalV2BoxCategoryBannerTitle}>{title}</p>
            {detail && (
                <p className={styles.portalV2BoxCategoryBannerDetail} role={warn ? 'alert' : undefined}>
                    {warn && <AlertTriangle size={14} aria-hidden />}
                    <span>{detail}</span>
                </p>
            )}
        </div>
    );
}

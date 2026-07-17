'use client';

import React from 'react';
import { UtensilsCrossed } from 'lucide-react';
import styles from './portal-v2.module.css';

type Props = {
    className?: string;
    /** `fill` stretches to the parent image box; fixed sizes for cart thumbnails. */
    size?: 'sm' | 'md' | 'lg' | 'fill';
};

const ICON_SIZES = { sm: 18, md: 22, lg: 32, fill: 48 } as const;
const BOX_SIZES = { sm: 40, md: 48, lg: 72 } as const;

/** Catering-style placeholder when a menu item has no photo. */
export function PortalFoodImagePlaceholder({ className, size = 'md' }: Props) {
    const iconSize = ICON_SIZES[size];
    const fillParent = size === 'fill';

    return (
        <div
            className={`${styles.portalV2FoodPlaceholder} ${fillParent ? styles.portalV2FoodPlaceholderFill : ''} ${className ?? ''}`}
            style={fillParent ? undefined : { width: BOX_SIZES[size], height: BOX_SIZES[size] }}
            aria-hidden
        >
            <UtensilsCrossed size={iconSize} strokeWidth={1.5} />
        </div>
    );
}

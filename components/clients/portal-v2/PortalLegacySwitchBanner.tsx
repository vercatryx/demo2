'use client';

import React from 'react';
import { setPortalLegacyOptOut } from '@/lib/portal-v2-access';
import styles from './portal-v2.module.css';

export function PortalLegacySwitchBanner() {
    const handleSwitch = () => {
        setPortalLegacyOptOut(true);
        window.location.reload();
    };

    return (
        <aside className={styles.portalV2LegacySwitch} aria-label="Portal layout preference">
            <p className={styles.portalV2LegacySwitchText}>
                Used to the previous portal design?{' '}
                <button type="button" className={styles.portalV2LegacySwitchLink} onClick={handleSwitch}>
                    Switch back to the classic layout
                </button>
                .
            </p>
        </aside>
    );
}

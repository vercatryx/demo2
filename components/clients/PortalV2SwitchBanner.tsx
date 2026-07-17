'use client';

import React from 'react';
import { setPortalLegacyOptOut } from '@/lib/portal-v2-access';
import styles from './ClientPortal.module.css';

export function PortalV2SwitchBanner() {
    const handleSwitch = () => {
        setPortalLegacyOptOut(false);
        window.location.reload();
    };

    return (
        <aside className={styles.portalVersionSwitch} aria-label="Portal layout preference">
            <p className={styles.portalVersionSwitchText}>
                Want to try the updated portal?{' '}
                <button type="button" className={styles.boxPortalEaseLink} onClick={handleSwitch}>
                    Switch to the new layout
                </button>
                .
            </p>
        </aside>
    );
}

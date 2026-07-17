'use client';

import React from 'react';
import { ArrowLeftRight } from 'lucide-react';
import styles from './portal-v2.module.css';

type Props = {
    mode: 'food' | 'boxes';
    currentDepartmentName?: string;
    onOpenPicker: () => void;
};

export function PortalSwitchDepartmentBar({ mode, currentDepartmentName, onOpenPicker }: Props) {
    const switchLabel =
        mode === 'food' ? 'Pick another kitchen facility' : 'Pick another category';

    return (
        <div className={styles.portalV2SwitchDeptBar}>
            {currentDepartmentName ? (
                <p className={styles.portalV2SwitchDeptCurrent}>
                    {mode === 'food' ? 'Kitchen' : 'Category'}:{' '}
                    <strong>{currentDepartmentName}</strong>
                </p>
            ) : null}
            <button type="button" className={styles.portalV2SwitchDeptBtn} onClick={onOpenPicker}>
                <ArrowLeftRight size={17} aria-hidden />
                {switchLabel}
            </button>
        </div>
    );
}

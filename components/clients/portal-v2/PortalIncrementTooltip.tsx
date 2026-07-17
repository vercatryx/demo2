'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import styles from './portal-v2.module.css';

export function PortalIncrementTooltip({
    message,
    children,
}: {
    message?: string;
    children: React.ReactNode;
}) {
    const [visible, setVisible] = React.useState(false);
    const anchorRef = React.useRef<HTMLSpanElement>(null);
    const [coords, setCoords] = React.useState({ top: 0, left: 0 });

    const show = React.useCallback(() => {
        const el = anchorRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        setCoords({
            top: rect.top,
            left: rect.left + rect.width / 2,
        });
        setVisible(true);
    }, []);

    const hide = React.useCallback(() => setVisible(false), []);

    if (!message) {
        return <>{children}</>;
    }

    return (
        <>
            <span
                ref={anchorRef}
                className={styles.portalV2TooltipAnchor}
                onMouseEnter={show}
                onMouseLeave={hide}
                onFocus={show}
                onBlur={hide}
            >
                {children}
            </span>
            {visible &&
                typeof document !== 'undefined' &&
                createPortal(
                    <div
                        className={styles.portalV2IncrementTooltip}
                        style={{ top: coords.top, left: coords.left }}
                        role="tooltip"
                    >
                        {message}
                    </div>,
                    document.body,
                )}
        </>
    );
}

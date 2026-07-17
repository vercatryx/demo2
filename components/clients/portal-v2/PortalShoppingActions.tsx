'use client';

import React, { useState } from 'react';
import { RotateCcw, ShoppingBag } from 'lucide-react';
import styles from './portal-v2.module.css';

type Props = {
    hasOrderItems: boolean;
    mode: 'food' | 'boxes';
    layout: 'header' | 'cart';
    onStartShopping: () => void;
    onContinueEditing: () => void;
    onClearAndStartFresh: () => void;
};

export function PortalShoppingActions({
    hasOrderItems,
    mode,
    layout,
    onStartShopping,
    onContinueEditing,
    onClearAndStartFresh,
}: Props) {
    const [confirmOpen, setConfirmOpen] = useState(false);

    const handlePrimary = () => {
        if (hasOrderItems) onContinueEditing();
        else onStartShopping();
    };

    const handleConfirmClear = () => {
        setConfirmOpen(false);
        onClearAndStartFresh();
    };

    const shopLabel = hasOrderItems ? 'Continue editing your order' : 'Start shopping';
    const shopHint =
        mode === 'food'
            ? hasOrderItems
                ? 'Pick up where you left off in a kitchen menu.'
                : 'Browse kitchen facilities and add meals to your order.'
            : hasOrderItems
              ? 'Pick up where you left off in a box category.'
              : 'Browse categories and add items to your box.';

    const shellClass = [
        layout === 'header' ? styles.portalV2ShoppingHeader : styles.portalV2CartShoppingActions,
        layout === 'cart' && hasOrderItems ? styles.portalV2CartShoppingActionsHasItems : '',
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <>
            <div className={shellClass}>
                <button type="button" className={styles.portalV2ShoppingPrimaryBtn} onClick={handlePrimary}>
                    <ShoppingBag size={18} aria-hidden />
                    {shopLabel}
                </button>
                <p className={styles.portalV2ShoppingHint}>{shopHint}</p>
                <button
                    type="button"
                    className={styles.portalV2ShoppingClearBtn}
                    onClick={() => setConfirmOpen(true)}
                    disabled={!hasOrderItems}
                >
                    <RotateCcw size={16} aria-hidden />
                    Reset cart from scratch
                </button>
            </div>

            {confirmOpen ? (
                <div
                    className={styles.portalV2WelcomeModalBackdrop}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="portal-clear-order-title"
                    onClick={() => setConfirmOpen(false)}
                >
                    <div className={styles.portalV2WelcomeModal} onClick={(e) => e.stopPropagation()}>
                        <h2 id="portal-clear-order-title" className={styles.portalV2WelcomeModalTitle}>
                            Clear your order?
                        </h2>
                        <p className={styles.portalV2WelcomeModalBody}>
                            This removes all items from your cart and saves an empty order. You can add items again
                            immediately.
                        </p>
                        <div className={styles.portalV2WelcomeModalActions}>
                            <button
                                type="button"
                                className={styles.portalV2WelcomeBtnSecondary}
                                onClick={() => setConfirmOpen(false)}
                            >
                                Keep my order
                            </button>
                            <button
                                type="button"
                                className={styles.portalV2WelcomeBtnDanger}
                                onClick={handleConfirmClear}
                            >
                                Clear everything
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    );
}

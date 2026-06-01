'use client';

import { useCallback, useEffect, useState } from 'react';
import { getOrderById } from '@/lib/actions-orders-billing';
import type { OrderDetail } from '@/lib/types-orders-billing';
import { OrderDetailView } from './OrderDetailView';
import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import styles from './OrderDetailShelf.module.css';

interface OrderDetailShelfProps {
    orderId: string;
    showDelete?: boolean;
    onClose: () => void;
    onDeleted?: () => void;
}

export function OrderDetailShelf({ orderId, showDelete = true, onClose, onDeleted }: OrderDetailShelfProps) {
    const [order, setOrder] = useState<OrderDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setNotFound(false);
        setOrder(null);

        getOrderById(orderId)
            .then((data) => {
                if (cancelled) return;
                if (!data) {
                    setNotFound(true);
                    setOrder(null);
                } else {
                    setOrder(data);
                    setNotFound(false);
                }
            })
            .catch(() => {
                if (!cancelled) setNotFound(true);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [orderId]);

    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        },
        [onClose]
    );

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    return (
        <>
            <div className={styles.shelfOverlay} onClick={onClose} aria-hidden />
            <aside className={styles.shelf} role="dialog" aria-modal="true" aria-label="Order details">
                <div className={styles.shelfBody}>
                    {loading && (
                        <div className={styles.loadingWrap}>
                            <LoadingIndicator message="Loading order..." />
                        </div>
                    )}
                    {!loading && notFound && (
                        <p className={styles.error}>Order not found or you do not have access.</p>
                    )}
                    {!loading && order && (
                        <OrderDetailView
                            order={order}
                            variant="shelf"
                            showDelete={showDelete}
                            onClose={onClose}
                            onDeleted={onDeleted}
                        />
                    )}
                </div>
            </aside>
        </>
    );
}

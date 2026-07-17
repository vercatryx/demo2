'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Package, ChevronDown, ChevronUp, X, RotateCcw } from 'lucide-react';
import type {
    ClientFacingOrderHistoryEntry,
    ClientFacingOrderHistoryItem,
} from '@/lib/client-facing-order-history';
import styles from './portal-v2.module.css';

type Props = {
    orders: ClientFacingOrderHistoryEntry[];
    mode: 'food' | 'boxes';
    hasCurrentOrderItems?: boolean;
    reorderDisabled?: boolean;
    reorderingOrderId?: string | null;
    onReorderOrder?: (order: ClientFacingOrderHistoryEntry) => void | Promise<void>;
};

const DETAIL_COLLAPSE_LINES = 3;
const DETAIL_COLLAPSE_CHARS = 140;
const PAST_ORDERS_PAGE_SIZE = 10;

function todayUtcYmd(): string {
    return new Date().toISOString().split('T')[0];
}

function orderDeliveryYmd(order: ClientFacingOrderHistoryEntry): string | null {
    return order.delivered_at ?? order.scheduled_delivery_date;
}

function partitionOrders(orders: ClientFacingOrderHistoryEntry[]) {
    const today = todayUtcYmd();
    const upcoming: ClientFacingOrderHistoryEntry[] = [];
    const past: ClientFacingOrderHistoryEntry[] = [];

    for (const order of orders) {
        const deliveryDate = orderDeliveryYmd(order);
        if (deliveryDate && deliveryDate >= today) {
            upcoming.push(order);
        } else {
            past.push(order);
        }
    }

    upcoming.sort((a, b) =>
        (orderDeliveryYmd(a) ?? '').localeCompare(orderDeliveryYmd(b) ?? ''),
    );
    past.sort((a, b) =>
        (orderDeliveryYmd(b) ?? '').localeCompare(orderDeliveryYmd(a) ?? ''),
    );

    return { upcoming, past };
}

function formatDeliveryDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
    });
}

function orderCardKey(order: ClientFacingOrderHistoryEntry): string {
    return `${order.id}-${order.order_number}-${order.scheduled_delivery_date ?? 'na'}`;
}

function orderMatchesPortalMode(
    order: ClientFacingOrderHistoryEntry,
    mode: 'food' | 'boxes',
): boolean {
    const st = (order.service_type || '').trim();
    if (mode === 'boxes') return st === 'Boxes';
    return st === 'Food' || st === 'Meal';
}

function DetailLineText({ line }: { line: string }) {
    const colonIndex = line.indexOf(':');
    if (colonIndex <= 0) {
        return <>{line}</>;
    }

    const label = line.slice(0, colonIndex + 1);
    const value = line.slice(colonIndex + 1).trimStart();
    if (!value) {
        return <span className={styles.portalV2RecentOrderDetailLabel}>{label}</span>;
    }

    return (
        <>
            <span className={styles.portalV2RecentOrderDetailLabel}>{label}</span>
            {' '}
            {value}
        </>
    );
}

function ExpandableDetailLines({ lines }: { lines: string[] }) {
    const [expanded, setExpanded] = useState(false);
    if (lines.length === 0) return null;

    const totalChars = lines.join(' ').length;
    const shouldCollapse =
        lines.length > DETAIL_COLLAPSE_LINES || totalChars > DETAIL_COLLAPSE_CHARS;
    const visibleLines =
        shouldCollapse && !expanded ? lines.slice(0, DETAIL_COLLAPSE_LINES) : lines;
    const hiddenCount = lines.length - visibleLines.length;

    return (
        <div className={styles.portalV2RecentOrderDetails}>
            <ul className={styles.portalV2RecentOrderDetailList}>
                {visibleLines.map((line, index) => (
                    <li key={`${index}-${line.slice(0, 24)}`} className={styles.portalV2RecentOrderDetailLine}>
                        <DetailLineText line={line} />
                    </li>
                ))}
            </ul>
            {shouldCollapse && (
                <button
                    type="button"
                    className={styles.portalV2RecentOrderDetailToggle}
                    onClick={() => setExpanded((v) => !v)}
                    aria-expanded={expanded}
                >
                    {expanded ? (
                        <>
                            Show less
                            <ChevronUp size={14} aria-hidden />
                        </>
                    ) : (
                        <>
                            {hiddenCount > 0
                                ? `Show ${hiddenCount} more detail${hiddenCount === 1 ? '' : 's'}`
                                : 'Show full details'}
                            <ChevronDown size={14} aria-hidden />
                        </>
                    )}
                </button>
            )}
        </div>
    );
}

function DeliveryPhotoThumb({ photoUrl }: { photoUrl: string }) {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [open]);

    return (
        <>
            <button
                type="button"
                className={styles.portalV2RecentOrderPhotoButton}
                onClick={() => setOpen(true)}
                aria-label="View delivery photo"
            >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={photoUrl}
                    alt="Your delivery"
                    className={styles.portalV2RecentOrderPhoto}
                />
            </button>

            {open && (
                <div
                    className={styles.portalV2DeliveryPhotoBackdrop}
                    role="presentation"
                    onClick={() => setOpen(false)}
                >
                    <div
                        className={styles.portalV2DeliveryPhotoDialog}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Delivery photo"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <button
                            type="button"
                            className={styles.portalV2DeliveryPhotoClose}
                            onClick={() => setOpen(false)}
                            aria-label="Close photo"
                        >
                            <X size={22} aria-hidden />
                        </button>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={photoUrl}
                            alt="Your delivery"
                            className={styles.portalV2DeliveryPhotoFull}
                        />
                    </div>
                </div>
            )}
        </>
    );
}

function OrderItemRow({ item }: { item: ClientFacingOrderHistoryItem }) {
    const detailLines =
        item.detail_lines.length > 0
            ? item.detail_lines
            : item.note?.trim()
              ? [item.note.trim()]
              : [];

    return (
        <li className={styles.portalV2RecentOrderItem}>
            <div className={styles.portalV2RecentOrderItemMain}>
                <span className={styles.portalV2RecentOrderItemName}>{item.name}</span>
                <span className={styles.portalV2RecentOrderQty}>× {item.quantity}</span>
            </div>
            <ExpandableDetailLines lines={detailLines} />
        </li>
    );
}

function OrderCard({
    order,
    showVendor,
    canReorder,
    reorderBusy,
    reorderDisabled,
    onRequestReorder,
}: {
    order: ClientFacingOrderHistoryEntry;
    showVendor: boolean;
    canReorder: boolean;
    reorderBusy: boolean;
    reorderDisabled: boolean;
    onRequestReorder?: (order: ClientFacingOrderHistoryEntry) => void;
}) {
    const displayDate = order.delivered_at ?? order.scheduled_delivery_date;

    return (
        <article className={styles.portalV2RecentOrderCard}>
            <div className={styles.portalV2RecentOrderTop}>
                <div className={styles.portalV2RecentOrderTopMeta}>
                    {displayDate ? (
                        <p className={styles.portalV2RecentOrderDate}>{formatDeliveryDate(displayDate)}</p>
                    ) : null}

                    {showVendor && order.vendor_label ? (
                        <p className={styles.portalV2RecentOrderVendor}>{order.vendor_label}</p>
                    ) : null}
                </div>

                {order.delivery_photo_url && (
                    <DeliveryPhotoThumb photoUrl={order.delivery_photo_url} />
                )}
            </div>

            {order.items.length > 0 ? (
                <ul className={styles.portalV2RecentOrderItems}>
                    {order.items.map((item, index) => (
                        <OrderItemRow
                            key={`${item.name}-${item.quantity}-${index}`}
                            item={item}
                        />
                    ))}
                </ul>
            ) : (
                <p className={styles.portalV2RecentOrderEmpty}>No items on record for this order.</p>
            )}

            {canReorder && onRequestReorder ? (
                <div className={styles.portalV2RecentOrderActions}>
                    <button
                        type="button"
                        className={styles.portalV2RecentOrderReorderBtn}
                        disabled={reorderDisabled || reorderBusy}
                        onClick={() => onRequestReorder(order)}
                    >
                        <RotateCcw size={15} aria-hidden />
                        {reorderBusy ? 'Restoring…' : 'Get this order again'}
                    </button>
                </div>
            ) : null}
        </article>
    );
}

function OrderList({
    orders,
    expandAll = false,
    pageSize = PAST_ORDERS_PAGE_SIZE,
    showVendor,
    mode,
    reorderDisabled,
    reorderingOrderId,
    onRequestReorder,
}: {
    orders: ClientFacingOrderHistoryEntry[];
    expandAll?: boolean;
    pageSize?: number;
    showVendor: boolean;
    mode: 'food' | 'boxes';
    reorderDisabled: boolean;
    reorderingOrderId: string | null;
    onRequestReorder?: (order: ClientFacingOrderHistoryEntry) => void;
}) {
    const [visibleCount, setVisibleCount] = useState(() =>
        expandAll ? orders.length : Math.min(pageSize, orders.length),
    );

    useEffect(() => {
        setVisibleCount(expandAll ? orders.length : Math.min(pageSize, orders.length));
    }, [orders, expandAll, pageSize]);

    if (orders.length === 0) return null;

    const renderCard = (order: ClientFacingOrderHistoryEntry) => (
        <OrderCard
            key={orderCardKey(order)}
            order={order}
            showVendor={showVendor}
            canReorder={
                Boolean(onRequestReorder) &&
                order.items.length > 0 &&
                orderMatchesPortalMode(order, mode)
            }
            reorderBusy={reorderingOrderId === order.id}
            reorderDisabled={reorderDisabled || (reorderingOrderId != null && reorderingOrderId !== order.id)}
            onRequestReorder={onRequestReorder}
        />
    );

    if (expandAll) {
        return (
            <div className={styles.portalV2RecentOrdersList}>
                {orders.map((order) => renderCard(order))}
            </div>
        );
    }

    const visibleOrders = orders.slice(0, visibleCount);
    const remaining = orders.length - visibleCount;
    const hasMore = remaining > 0;
    const canShowLess = visibleCount > pageSize;

    return (
        <>
            <div className={styles.portalV2RecentOrdersList}>
                {visibleOrders.map((order) => renderCard(order))}
            </div>

            {(hasMore || canShowLess) && (
                <div className={styles.portalV2RecentOrdersFooter}>
                    {hasMore && (
                        <button
                            type="button"
                            className={styles.portalV2RecentOrdersShowMore}
                            onClick={() =>
                                setVisibleCount((count) =>
                                    Math.min(count + pageSize, orders.length),
                                )
                            }
                            aria-expanded={visibleCount >= orders.length}
                        >
                            Show more ({Math.min(remaining, pageSize)})
                            <ChevronDown size={16} aria-hidden />
                        </button>
                    )}
                    {canShowLess && (
                        <button
                            type="button"
                            className={styles.portalV2RecentOrdersShowMore}
                            onClick={() => setVisibleCount(Math.min(pageSize, orders.length))}
                            aria-expanded={false}
                        >
                            Show less
                            <ChevronUp size={16} aria-hidden />
                        </button>
                    )}
                </div>
            )}
        </>
    );
}

export function PortalRecentOrders({
    orders,
    mode,
    hasCurrentOrderItems = false,
    reorderDisabled = false,
    reorderingOrderId = null,
    onReorderOrder,
}: Props) {
    const [showPast, setShowPast] = useState(false);
    const [pendingReorder, setPendingReorder] = useState<ClientFacingOrderHistoryEntry | null>(null);
    const { upcoming, past } = useMemo(() => partitionOrders(orders), [orders]);
    const showVendor = mode === 'food';

    if (orders.length === 0) return null;

    const hasUpcoming = upcoming.length > 0;
    const primaryOrders = hasUpcoming ? upcoming : past;
    const showPastToggle = hasUpcoming && past.length > 0;

    const handleRequestReorder = (order: ClientFacingOrderHistoryEntry) => {
        if (!onReorderOrder || reorderDisabled || reorderingOrderId) return;
        if (hasCurrentOrderItems) {
            setPendingReorder(order);
            return;
        }
        void onReorderOrder(order);
    };

    const confirmReplace = () => {
        if (!pendingReorder || !onReorderOrder) return;
        const order = pendingReorder;
        setPendingReorder(null);
        void onReorderOrder(order);
    };

    return (
        <section className={styles.portalV2RecentOrdersShell} aria-label="Recent orders">
            <div className={styles.portalV2RecentOrdersPanel}>
                <header className={styles.portalV2RecentOrdersHeader}>
                    <span className={styles.portalV2RecentOrdersIconWrap} aria-hidden>
                        <Package size={20} />
                    </span>
                    <h2 className={styles.portalV2RecentOrdersTitle}>
                        {hasUpcoming ? 'Upcoming Orders' : 'Recent Orders'}
                    </h2>
                </header>

                <OrderList
                    orders={primaryOrders}
                    expandAll={hasUpcoming}
                    showVendor={showVendor}
                    mode={mode}
                    reorderDisabled={reorderDisabled}
                    reorderingOrderId={reorderingOrderId}
                    onRequestReorder={onReorderOrder ? handleRequestReorder : undefined}
                />

                {showPastToggle && (
                    <div className={styles.portalV2RecentOrdersPastToggleWrap}>
                        <button
                            type="button"
                            className={styles.portalV2RecentOrdersShowMore}
                            onClick={() => setShowPast((v) => !v)}
                            aria-expanded={showPast}
                        >
                            {showPast ? (
                                <>
                                    Hide past orders
                                    <ChevronUp size={16} aria-hidden />
                                </>
                            ) : (
                                <>
                                    Show past orders ({past.length})
                                    <ChevronDown size={16} aria-hidden />
                                </>
                            )}
                        </button>
                    </div>
                )}

                {showPast && showPastToggle && (
                    <div className={styles.portalV2RecentOrdersPastSection}>
                        <h3 className={styles.portalV2RecentOrdersPastTitle}>Past Orders</h3>
                        <OrderList
                            orders={past}
                            showVendor={showVendor}
                            mode={mode}
                            reorderDisabled={reorderDisabled}
                            reorderingOrderId={reorderingOrderId}
                            onRequestReorder={onReorderOrder ? handleRequestReorder : undefined}
                        />
                    </div>
                )}
            </div>

            {pendingReorder ? (
                <div
                    className={styles.portalV2WelcomeModalBackdrop}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="portal-reorder-order-title"
                    onClick={() => setPendingReorder(null)}
                >
                    <div className={styles.portalV2WelcomeModal} onClick={(e) => e.stopPropagation()}>
                        <h2 id="portal-reorder-order-title" className={styles.portalV2WelcomeModalTitle}>
                            Replace your current order?
                        </h2>
                        <p className={styles.portalV2WelcomeModalBody}>
                            This clears what’s in your cart and restores the items from this past order. Changes
                            save automatically.
                        </p>
                        <div className={styles.portalV2WelcomeModalActions}>
                            <button
                                type="button"
                                className={styles.portalV2WelcomeBtnSecondary}
                                onClick={() => setPendingReorder(null)}
                            >
                                Keep my order
                            </button>
                            <button
                                type="button"
                                className={styles.portalV2WelcomeBtnPrimary}
                                onClick={confirmReplace}
                            >
                                Get this order again
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </section>
    );
}

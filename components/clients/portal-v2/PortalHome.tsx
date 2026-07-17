'use client';

import React from 'react';
import Image from 'next/image';
import type { PortalHomeBlock, PortalHomePromoLinkTarget } from '@/lib/portal-home-blocks';
import type { PortalHomeContentRow } from '@/lib/portal-home-layout';
import { getInfoBlockBodyForMode } from '@/lib/portal-home-blocks';
import type { ItemCategory, MenuItem, Vendor } from '@/lib/types';
import { PortalProductCard } from './PortalProductCard';
import { PortalHomeBlocks } from './PortalHomeBlocks';
import { PortalInfoInstructions } from './PortalInfoInstructions';
import { PortalLegacySwitchBanner } from './PortalLegacySwitchBanner';
import { PortalRecentOrders } from './PortalRecentOrders';
import type { ClientFacingOrderHistoryEntry } from '@/lib/client-facing-order-history';
import styles from './portal-v2.module.css';

type Props = {
    homeContentRows: PortalHomeContentRow[];
    mode: 'food' | 'boxes';
    vendors: Vendor[];
    categories: ItemCategory[];
    recentOrders?: ClientFacingOrderHistoryEntry[];
    hasCurrentOrderItems?: boolean;
    reorderDisabled?: boolean;
    reorderingOrderId?: string | null;
    onReorderOrder?: (order: ClientFacingOrderHistoryEntry) => void | Promise<void>;
    onItemClick?: (item: MenuItem) => void;
    onHomeBlockClick?: (block: PortalHomeBlock, link: PortalHomePromoLinkTarget) => void;
};

function PortalInfoBlock({ block, mode }: { block: PortalHomeBlock; mode: 'food' | 'boxes' }) {
    const body = getInfoBlockBodyForMode(block, mode);
    if (!body.trim()) return null;

    if (block.infoShowLogo) {
        return (
            <div className={styles.portalV2HomeInfoHeroShell}>
                <section className={styles.portalV2HomeInfoCard}>
                    <div className={styles.portalV2HomeInfoLogoWrap}>
                        <Image
                            src="/mainLogo.jpg"
                            alt="Triangle Square"
                            width={160}
                            height={160}
                            className={styles.portalV2HomeInfoLogo}
                            priority
                        />
                    </div>
                    <PortalInfoInstructions body={body} />
                </section>
            </div>
        );
    }

    return (
        <div className={styles.portalV2HomeInfoShell}>
            <PortalInfoInstructions body={body} />
        </div>
    );
}

function PortalRecentOrdersLayoutBlock({
    orders,
    mode,
    hasCurrentOrderItems,
    reorderDisabled,
    reorderingOrderId,
    onReorderOrder,
}: {
    orders: ClientFacingOrderHistoryEntry[];
    mode: 'food' | 'boxes';
    hasCurrentOrderItems?: boolean;
    reorderDisabled?: boolean;
    reorderingOrderId?: string | null;
    onReorderOrder?: (order: ClientFacingOrderHistoryEntry) => void | Promise<void>;
}) {
    return (
        <div className={styles.portalV2RecentOrdersLayoutShell}>
            <PortalLegacySwitchBanner />
            <PortalRecentOrders
                orders={orders}
                mode={mode}
                hasCurrentOrderItems={hasCurrentOrderItems}
                reorderDisabled={reorderDisabled}
                reorderingOrderId={reorderingOrderId}
                onReorderOrder={onReorderOrder}
            />
        </div>
    );
}

export function PortalHome({
    homeContentRows,
    mode,
    vendors,
    categories,
    recentOrders = [],
    hasCurrentOrderItems,
    reorderDisabled,
    reorderingOrderId,
    onReorderOrder,
    onItemClick,
    onHomeBlockClick,
}: Props) {
    const browseHintFor = (item: MenuItem) => {
        if (mode === 'food' && item.vendorId) {
            const name = vendors.find((v) => v.id === item.vendorId)?.name;
            return name ? `Opens in ${name}` : 'Opens in kitchen menu';
        }
        if (mode === 'boxes' && item.categoryId) {
            const name = categories.find((c) => c.id === item.categoryId)?.name;
            return name ? `Opens in ${name}` : 'Opens in box category';
        }
        return 'View in menu';
    };

    if (homeContentRows.length === 0) {
        return (
            <div className={styles.portalV2HomePage}>
                <p className={styles.portalV2HomeEmptyHint}>
                    Use the buttons above to choose a {mode === 'food' ? 'kitchen' : 'category'} and start shopping.
                </p>
                <PortalRecentOrdersLayoutBlock
                    orders={recentOrders}
                    mode={mode}
                    hasCurrentOrderItems={hasCurrentOrderItems}
                    reorderDisabled={reorderDisabled}
                    reorderingOrderId={reorderingOrderId}
                    onReorderOrder={onReorderOrder}
                />
            </div>
        );
    }

    return (
        <div className={styles.portalV2HomePage}>
            {homeContentRows.map((row, rowIndex) => {
                if (row.kind === 'info') {
                    return <PortalInfoBlock key={`info-${row.block.id}`} block={row.block} mode={mode} />;
                }

                if (row.kind === 'promo') {
                    return (
                        <div
                            key={`promo-${row.block.id}`}
                            className={styles.portalV2HomeBlocksShell}
                        >
                            <PortalHomeBlocks blocks={[row.block]} onBlockClick={onHomeBlockClick} />
                        </div>
                    );
                }

                if (row.kind === 'recent_orders') {
                    return (
                        <PortalRecentOrdersLayoutBlock
                            key="recent-orders"
                            orders={recentOrders}
                            mode={mode}
                            hasCurrentOrderItems={hasCurrentOrderItems}
                            reorderDisabled={reorderDisabled}
                            reorderingOrderId={reorderingOrderId}
                            onReorderOrder={onReorderOrder}
                        />
                    );
                }

                const section = row.section;
                return (
                    <section
                        key={`${section.title}-${rowIndex}`}
                        className={styles.portalV2FeaturedCentered}
                    >
                        <h2 className={styles.portalV2FeaturedTitle}>{section.title}</h2>
                        <div className={styles.portalV2FeaturedRow}>
                            {section.items.map((item) => (
                                <PortalProductCard
                                    key={item.id}
                                    item={item}
                                    quantity={0}
                                    layout="grid"
                                    browseMode
                                    browseHint={browseHintFor(item)}
                                    onBrowse={() => onItemClick?.(item)}
                                />
                            ))}
                        </div>
                    </section>
                );
            })}
        </div>
    );
}

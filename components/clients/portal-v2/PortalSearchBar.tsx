'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { buildFoodCatalogSearchHits, filterFoodCatalogSearchHits } from '@/lib/food-catalog-search';
import {
    buildBoxCatalogSearchHits,
    filterBoxCatalogSearchHits,
    type BoxCatalogSearchHit,
} from '@/components/admin/box-selector-demo/boxCatalogSearch';
import type { FoodCatalogSearchHit } from '@/lib/food-catalog-search';
import type { ItemCategory, MenuItem, Vendor } from '@/lib/types';
import type { BoxMenuLayoutConfig } from '@/lib/boxes/box-catalog-order';
import { sortBoxCategoriesForCatalog } from '@/lib/boxes/box-catalog-order';
import { getSelectedFoodItemIdsFromOrderConfig } from '@/lib/food-item-phaseout';
import { getActiveBoxFromConfig } from '@/lib/portal-box-order-actions';
import { getBoxAllowanceMultiplier } from '@/lib/box-order-consolidation';
import { PortalFoodImagePlaceholder } from './PortalFoodImagePlaceholder';
import styles from './portal-v2.module.css';

function SearchHitThumbnail({ imageUrl }: { imageUrl?: string | null }) {
    return (
        <span className={styles.portalV2SearchHitThumb}>
            {imageUrl ? (
                <img src={imageUrl} alt="" className={styles.portalV2SearchHitImg} />
            ) : (
                <PortalFoodImagePlaceholder size="sm" className={styles.portalV2SearchHitPlaceholder} />
            )}
        </span>
    );
}

type Props = {
    serviceType: string;
    menuItems: MenuItem[];
    vendors: Vendor[];
    categories: ItemCategory[];
    boxLayout: BoxMenuLayoutConfig | null;
    boxVendorId?: string;
    orderConfig: any;
    approvedMealsPerWeek?: number | null;
    hidePhaseoutUnlessOnOrder?: boolean;
    onFoodHit: (hit: FoodCatalogSearchHit) => void;
    onBoxHit: (hit: BoxCatalogSearchHit) => void;
};

export function PortalSearchBar({
    serviceType,
    menuItems,
    vendors,
    categories,
    boxLayout,
    boxVendorId,
    orderConfig,
    approvedMealsPerWeek,
    hidePhaseoutUnlessOnOrder,
    onFoodHit,
    onBoxHit,
}: Props) {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);

    const selectedIds = useMemo(
        () => getSelectedFoodItemIdsFromOrderConfig(orderConfig),
        [orderConfig],
    );

    const foodHits = useMemo(
        () => buildFoodCatalogSearchHits(menuItems, vendors, { hidePhaseoutUnlessOnOrder, selectedItemIds: selectedIds }),
        [menuItems, vendors, hidePhaseoutUnlessOnOrder, selectedIds],
    );

    const boxHits = useMemo(() => {
        if (serviceType !== 'Boxes') return [];
        const sorted = sortBoxCategoriesForCatalog(categories, boxLayout?.orderedCategoryIds);
        const multiplier = getBoxAllowanceMultiplier(approvedMealsPerWeek);
        const box = getActiveBoxFromConfig(orderConfig, multiplier);
        const vendorId = boxVendorId ?? box.vendorId;
        return buildBoxCatalogSearchHits(sorted, menuItems, boxLayout, vendorId, {
            hidePhaseoutUnlessOnOrder,
            boxItems: box.items,
        });
    }, [serviceType, categories, boxLayout, boxVendorId, menuItems, orderConfig, approvedMealsPerWeek, hidePhaseoutUnlessOnOrder]);

    const filteredFood = useMemo(
        () => (serviceType === 'Food' || serviceType === 'Meal' ? filterFoodCatalogSearchHits(foodHits, query) : []),
        [serviceType, foodHits, query],
    );

    const filteredBox = useMemo(
        () => (serviceType === 'Boxes' ? filterBoxCatalogSearchHits(boxHits, query) : []),
        [serviceType, boxHits, query],
    );

    const hasResults = filteredFood.length > 0 || filteredBox.length > 0;

    const menuItemById = useMemo(() => {
        const map = new Map<string, MenuItem>();
        for (const item of menuItems) map.set(item.id, item);
        return map;
    }, [menuItems]);

    useEffect(() => {
        const onDoc = (e: MouseEvent) => {
            if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, []);

    return (
        <div className={styles.portalV2SearchWrap} ref={wrapRef}>
            <Search size={18} className={styles.portalV2SearchIcon} aria-hidden />
            <input
                type="search"
                className={styles.portalV2SearchInput}
                placeholder={serviceType === 'Boxes' ? 'Search by Item # or name…' : 'Search by Item # or name…'}
                value={query}
                onChange={(e) => {
                    setQuery(e.target.value);
                    setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                aria-label="Search catalog"
            />
            {open && query.trim() && hasResults && (
                <div className={styles.portalV2SearchResults} role="listbox">
                    {filteredFood.map((hit) => (
                        <button
                            key={hit.itemId}
                            type="button"
                            className={styles.portalV2SearchHit}
                            onClick={() => {
                                onFoodHit(hit);
                                setOpen(false);
                                setQuery('');
                            }}
                        >
                            <SearchHitThumbnail imageUrl={menuItemById.get(hit.itemId)?.imageUrl} />
                            <span className={styles.portalV2SearchHitLabel}>{hit.label}</span>
                        </button>
                    ))}
                    {filteredBox.map((hit) => (
                        <button
                            key={
                                hit.type === 'item'
                                    ? `item-${hit.itemId}`
                                    : hit.type === 'folder'
                                      ? `folder-${hit.folderId}`
                                      : `cat-${hit.categoryId}`
                            }
                            type="button"
                            className={styles.portalV2SearchHit}
                            onClick={() => {
                                onBoxHit(hit);
                                setOpen(false);
                                setQuery('');
                            }}
                        >
                            <SearchHitThumbnail
                                imageUrl={
                                    hit.type === 'item'
                                        ? menuItemById.get(hit.itemId)?.imageUrl
                                        : null
                                }
                            />
                            <span className={styles.portalV2SearchHitLabel}>{hit.label}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

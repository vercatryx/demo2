'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { ClientProfile, MenuItem, Vendor } from '@/lib/types';
import { shouldShowFoodItemToViewer } from '@/lib/food-item-phaseout';
import { isFoodItemAllowedOnDay } from '@/lib/portal-food-catalog';
import {
    ALL_CATALOG_ITEMS_ID,
    UNASSIGNED_SUBMENU_ID,
    buildSubcategoryFilterTree,
    canonicalFolderPath,
    folderTrailLabel,
    groupItemsBySubcategory,
    itemsAssignedUnderSection,
    itemsForFolderPath,
    sectionNodesAtPath,
} from '@/lib/portal-catalog-finder';
import type { BoxSubMenuNode } from '@/lib/boxes/box-catalog-order';
import { findPathToNode } from '@/components/admin/box-selector-demo/subMenuTree';
import { PortalProductCard } from './PortalProductCard';
import { PORTAL_INCREMENT_BLOCKED_MESSAGE } from '@/components/clients/MenuItemCard';
import styles from './portal-v2.module.css';

type Props = {
    mode: 'food' | 'boxes';
    departmentId: string;
    departmentName: string;
    folderPath: string[];
    menuItems: MenuItem[];
    roots: BoxSubMenuNode[];
    itemSubMenuByItemId: Record<string, string>;
    orderConfig: any;
    client: ClientProfile;
    vendors: Vendor[];
    vendorId?: string;
    hidePhaseoutUnlessOnOrder?: boolean;
    activeDeliveryDay?: string;
    getItemQty: (itemId: string) => number;
    getItemNote?: (itemId: string) => string;
    onItemQtyChange: (itemId: string, qty: number) => void;
    onItemNoteChange?: (itemId: string, note: string) => void;
    canIncrement: (item: MenuItem) => boolean;
    getIncrementBlockedMessage?: (item: MenuItem) => string | undefined;
    onIncrementBlocked: () => void;
    highlightItemId?: string | null;
    onSelectSubfolder?: (path: string[]) => void;
    onBrowseAllInDepartment?: () => void;
};

export function PortalProductGrid({
    mode,
    departmentId,
    departmentName,
    folderPath,
    menuItems,
    roots,
    itemSubMenuByItemId,
    hidePhaseoutUnlessOnOrder,
    vendorId,
    activeDeliveryDay,
    getItemQty,
    getItemNote,
    onItemQtyChange,
    onItemNoteChange,
    canIncrement,
    getIncrementBlockedMessage,
    onIncrementBlocked,
    highlightItemId,
    onSelectSubfolder,
    onBrowseAllInDepartment,
}: Props) {
    const [brandFilter, setBrandFilter] = useState<string | null>(null);
    const [typeFolderId, setTypeFolderId] = useState<string | null>(null);

    const baseItems = useMemo(() => {
        return menuItems.filter((item) => {
            if (item.isActive === false) return false;
            if (mode === 'food') {
                if (item.vendorId !== departmentId) return false;
                if (activeDeliveryDay && !isFoodItemAllowedOnDay(item, activeDeliveryDay)) return false;
            } else {
                if (item.categoryId !== departmentId) return false;
                const vid = vendorId;
                if (!((item.vendorId == null || item.vendorId === '') || item.vendorId === vid)) return false;
            }
            const qty = getItemQty(item.id);
            return shouldShowFoodItemToViewer(item, {
                hidePhaseoutUnlessOnOrder: hidePhaseoutUnlessOnOrder === true,
                existingQty: qty,
                itemKind: 'menu',
            });
        });
    }, [menuItems, mode, departmentId, vendorId, hidePhaseoutUnlessOnOrder, getItemQty, activeDeliveryDay]);

    useEffect(() => {
        setBrandFilter(null);
        setTypeFolderId(null);
    }, [departmentId, folderPath]);

    const browseLeafId = folderPath[folderPath.length - 1];
    const browsingAllItems =
        roots.length === 0 ||
        folderPath.length === 0 ||
        browseLeafId === ALL_CATALOG_ITEMS_ID;

    const visibleItems = useMemo(() => {
        let items: MenuItem[];
        if (typeFolderId) {
            // Section filter spans the whole department — include every item under that folder.
            items = itemsAssignedUnderSection(roots, typeFolderId, itemSubMenuByItemId, baseItems);
        } else if (browsingAllItems) {
            items = baseItems;
        } else if (folderPath.length === 0) {
            items = [];
        } else {
            items = itemsForFolderPath(roots, folderPath, itemSubMenuByItemId, baseItems);
        }

        if (brandFilter) items = items.filter((i) => (i.brand || '').trim() === brandFilter);

        return items.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
    }, [baseItems, roots, folderPath, itemSubMenuByItemId, brandFilter, typeFolderId, browsingAllItems]);

    /** Number of real folder levels in the current path (0 for "All"/Unassigned). */
    const baseDepth = useMemo(() => {
        if (typeFolderId) {
            // When filtering by a section, anchor group labels at that folder's
            // depth so headers read relative to the chosen branch.
            const path = findPathToNode(roots, typeFolderId);
            return path ? path.length - 1 : 0;
        }
        if (roots.length === 0 || folderPath.length === 0) return 0;
        const leaf = folderPath[folderPath.length - 1];
        if (leaf === ALL_CATALOG_ITEMS_ID || leaf === UNASSIGNED_SUBMENU_ID) return 0;
        return canonicalFolderPath(roots, folderPath).length;
    }, [roots, folderPath, typeFolderId]);

    /** Items split into the original subcategory structure for the list display. */
    const itemGroups = useMemo(
        () => groupItemsBySubcategory(roots, itemSubMenuByItemId, visibleItems, baseDepth),
        [roots, itemSubMenuByItemId, visibleItems, baseDepth],
    );
    const showGroupHeaders = itemGroups.length > 1;

    const childFolders = useMemo(() => {
        if (roots.length === 0 || folderPath.length === 0) return [];
        const leaf = folderPath[folderPath.length - 1];
        if (leaf === ALL_CATALOG_ITEMS_ID) return [];
        return sectionNodesAtPath(roots, folderPath);
    }, [roots, folderPath]);

    const folderLabel = useMemo(() => {
        if (folderPath.length === 0) return null;
        const leaf = folderPath[folderPath.length - 1];
        if (leaf === ALL_CATALOG_ITEMS_ID) return 'All items';
        return folderTrailLabel(roots, folderPath, { [departmentId]: roots }, departmentId);
    }, [roots, folderPath, departmentId]);

    useEffect(() => {
        if (process.env.NODE_ENV !== 'development') return;
        const leaf = folderPath[folderPath.length - 1];
        const assignedInBase = baseItems.filter((i) => itemSubMenuByItemId[i.id]).length;
        console.log('[PortalProductGrid]', {
            departmentId,
            folderPath,
            leaf,
            roots: roots.length,
            baseItems: baseItems.length,
            assignedInBase,
            itemSubMenuKeys: Object.keys(itemSubMenuByItemId).length,
            visibleItems: visibleItems.length,
        });
    }, [departmentId, folderPath, roots.length, baseItems.length, visibleItems.length, itemSubMenuByItemId]);

    const brands = useMemo(() => {
        const set = new Set<string>();
        for (const item of baseItems) {
            const b = (item.brand || '').trim();
            if (b) set.add(b);
        }
        return [...set].sort();
    }, [baseItems]);

    const typeTree = useMemo(
        () => buildSubcategoryFilterTree(roots, itemSubMenuByItemId, baseItems),
        [baseItems, roots, itemSubMenuByItemId],
    );

    useEffect(() => {
        if (!highlightItemId) return;
        const scrollToHighlight = () => {
            const el =
                document.querySelector(`[data-food-item-id="${highlightItemId}"]`) ||
                document.querySelector(`[data-item-id="${highlightItemId}"]`);
            if (!el) return false;
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return true;
        };
        if (scrollToHighlight()) return;
        const frame = requestAnimationFrame(() => {
            scrollToHighlight();
        });
        return () => cancelAnimationFrame(frame);
    }, [highlightItemId, visibleItems.length]);

    const [blockedMessage, setBlockedMessage] = useState(PORTAL_INCREMENT_BLOCKED_MESSAGE);

    const notifyBlocked = (item: MenuItem) => {
        setBlockedMessage(getIncrementBlockedMessage?.(item) ?? PORTAL_INCREMENT_BLOCKED_MESSAGE);
        onIncrementBlocked();
        setBlockedOpen(true);
    };

    const [blockedOpen, setBlockedOpen] = useState(false);

    const showFilters = roots.length > 0;

    const renderProductCard = (item: MenuItem, layout: 'grid' | 'list') => (
        <PortalProductCard
            key={item.id}
            item={item}
            quantity={getItemQty(item.id)}
            note={getItemNote?.(item.id) ?? ''}
            layout={layout}
            deliveryDay={mode === 'food' ? activeDeliveryDay : undefined}
            searchHighlighted={highlightItemId === item.id}
            onQuantityChange={(q) => onItemQtyChange(item.id, q)}
            onNoteChange={mode === 'food' ? (n) => onItemNoteChange?.(item.id, n) : undefined}
            incrementDisabled={!canIncrement(item)}
            incrementBlockedMessage={getIncrementBlockedMessage?.(item)}
            onIncrementBlocked={() => notifyBlocked(item)}
            hidePhaseoutUnlessOnOrder={hidePhaseoutUnlessOnOrder}
        />
    );

    const renderItemList = (list: MenuItem[]) => (
        <>
            <div className={styles.portalV2ProductGrid}>
                {list.map((item) => renderProductCard(item, 'grid'))}
            </div>
            <div className={styles.portalV2ProductListMobile}>
                {list.map((item) => renderProductCard(item, 'list'))}
            </div>
        </>
    );

    return (
        <>
            <div className={styles.portalV2ProductBrowse}>
                <div className={styles.portalV2ProductBrowseHeader}>
                    <div className={styles.portalV2Breadcrumb}>
                        <span>{departmentName}</span>
                        {activeDeliveryDay && mode === 'food' && <span> · {activeDeliveryDay}</span>}
                        {folderLabel && <span> › {folderLabel}</span>}
                    </div>

                    {childFolders.length > 0 && onSelectSubfolder && (
                        <div className={styles.portalV2ProductSubfolderRow}>
                            {childFolders.map((node) => (
                                <button
                                    key={node.id}
                                    type="button"
                                    className={styles.portalV2FilterChip}
                                    onClick={() => onSelectSubfolder([...folderPath, node.id])}
                                >
                                    {node.name}
                                    {(node.children?.length ?? 0) > 0 ? ' ›' : ''}
                                </button>
                            ))}
                        </div>
                    )}

                    {folderPath.length > 0 &&
                        folderPath[folderPath.length - 1] !== ALL_CATALOG_ITEMS_ID &&
                        onBrowseAllInDepartment && (
                            <div className={styles.portalV2ProductBrowseAllRow}>
                                <button
                                    type="button"
                                    className={styles.portalV2SectionLink}
                                    onClick={onBrowseAllInDepartment}
                                >
                                    Browse all in {departmentName}
                                </button>
                            </div>
                        )}
                </div>

                <div
                    className={`${styles.portalV2ProductLayout} ${!showFilters ? styles.portalV2ProductLayoutNoFilters : ''}`}
                >
                    {showFilters && (
                        <aside className={styles.portalV2Filters}>
                        {typeTree.length > 0 && (
                            <div className={styles.portalV2FilterGroup}>
                                <h4>Sections</h4>
                                <button
                                    type="button"
                                    className={`${styles.portalV2FilterChip} ${!typeFolderId ? styles.portalV2FilterChipActive : ''}`}
                                    onClick={() => {
                                        setTypeFolderId(null);
                                        setBrandFilter(null);
                                        onBrowseAllInDepartment?.();
                                    }}
                                >
                                    All <span>({baseItems.length})</span>
                                </button>
                                {typeTree.map((node) => (
                                    <button
                                        key={node.id}
                                        type="button"
                                        className={`${styles.portalV2FilterChip} ${node.hasChildren ? styles.portalV2FilterChipParent : ''} ${typeFolderId === node.id ? styles.portalV2FilterChipActive : ''}`}
                                        style={{ paddingLeft: 10 + node.depth * 14 }}
                                        onClick={() => {
                                            setBrandFilter(null);
                                            setTypeFolderId(node.id);
                                        }}
                                    >
                                        {node.name} <span>({node.count})</span>
                                    </button>
                                ))}
                            </div>
                        )}
                        {brands.length > 0 && (
                            <div className={styles.portalV2FilterGroup}>
                                <h4>Brand</h4>
                                <button
                                    type="button"
                                    className={`${styles.portalV2FilterChip} ${!brandFilter ? styles.portalV2FilterChipActive : ''}`}
                                    onClick={() => setBrandFilter(null)}
                                >
                                    All
                                </button>
                                {brands.map((b) => (
                                    <button
                                        key={b}
                                        type="button"
                                        className={`${styles.portalV2FilterChip} ${brandFilter === b ? styles.portalV2FilterChipActive : ''}`}
                                        onClick={() => setBrandFilter(b)}
                                    >
                                        {b}
                                    </button>
                                ))}
                            </div>
                        )}
                        </aside>
                    )}

                    <div className={styles.portalV2ProductScroll}>
                        {showGroupHeaders
                            ? itemGroups.map((group) => (
                                  <section key={group.folderId} className={styles.portalV2GroupSection}>
                                      <h3 className={styles.portalV2GroupHeader}>{group.label}</h3>
                                      {renderItemList(group.items)}
                                  </section>
                              ))
                            : renderItemList(visibleItems)}
                        {visibleItems.length === 0 && (
                            <p style={{ padding: 24, color: 'var(--text-tertiary)' }}>
                                {roots.length > 0 && folderPath.length === 0
                                    ? 'Loading section…'
                                    : 'No items in this section.'}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {blockedOpen && (
                <div
                    role="dialog"
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.4)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 300,
                        padding: 20,
                    }}
                    onClick={() => setBlockedOpen(false)}
                >
                    <div
                        style={{
                            background: 'var(--bg-surface)',
                            padding: 24,
                            borderRadius: 12,
                            maxWidth: 400,
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <p>{blockedMessage}</p>
                        <button
                            type="button"
                            className="btn btn-primary"
                            style={{ marginTop: 16 }}
                            onClick={() => setBlockedOpen(false)}
                        >
                            OK
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}

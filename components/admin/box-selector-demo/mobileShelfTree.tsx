'use client';

import { CategoryStackIcon } from './CategoryStackIcon';
import type { MenuItem } from '@/lib/types';
import type { DemoBoxLayoutConfig, DemoSubMenuNode } from './constants';
import { UNASSIGNED_SUBMENU_ID } from './layoutStorage';

type BoxOrderSlice = {
    items?: Record<string, number>;
};

function countAssignedToNode(nodeId: string, layout: DemoBoxLayoutConfig | null, baseItems: MenuItem[]): number {
    return baseItems.filter((item) => layout?.itemSubMenuByItemId[item.id] === nodeId).length;
}

type ShelfCss = {
    readonly [key: string]: string;
};

function MobileItemRows({
    items,
    selectedItemId,
    activeBox,
    setItemQty,
    setSelectedItemId,
    canIncreaseItem,
    styles,
    emptyLabel = 'No items for this selection',
}: {
    items: MenuItem[];
    selectedItemId: string | null;
    activeBox: BoxOrderSlice | undefined;
    setItemQty: (itemId: string, qty: number) => void;
    setSelectedItemId: (id: string | null) => void;
    canIncreaseItem: (item: MenuItem) => boolean;
    styles: ShelfCss;
    emptyLabel?: string;
}) {
    if (items.length === 0) {
        return (
            <div className={styles.row}>
                <span className={styles.rowMuted}>{emptyLabel}</span>
            </div>
        );
    }
    return (
        <>
            {items.map((item) => {
                const active = selectedItemId === item.id;
                const qty = activeBox?.items?.[item.id] ?? 0;
                const canIncrease = canIncreaseItem(item);
                return (
                    <div
                        key={item.id}
                        className={`${styles.row} ${styles.mobileItemRow} ${active ? styles.rowActive : ''}`}
                        onClick={() => setSelectedItemId(item.id)}
                    >
                        <span className={styles.mobileItemRowMain}>
                            <span>{item.name}</span>
                            <span className={styles.rowMuted}>{item.quotaValue ?? 1} pt</span>
                            <span className={`${styles.stepper} ${styles.mobileItemStepper}`} onClick={(e) => e.stopPropagation()}>
                                <button
                                    type="button"
                                    className={styles.stepBtn}
                                    aria-label={`Decrease ${item.name}`}
                                    onClick={() => setItemQty(item.id, Math.max(0, qty - 1))}
                                >
                                    −
                                </button>
                                <span className={styles.mobileQtyValue}>{qty}</span>
                                <button
                                    type="button"
                                    className={styles.stepBtn}
                                    aria-label={`Increase ${item.name}`}
                                    disabled={!canIncrease}
                                    onClick={() => setItemQty(item.id, qty + 1)}
                                >
                                    +
                                </button>
                            </span>
                        </span>
                    </div>
                );
            })}
        </>
    );
}

function MobileShelfNode({
    node,
    depth,
    finderCols,
    navPathOnly,
    showPickItems,
    showPickSubmenus,
    finderItems,
    selectedItemId,
    activeBox,
    setItemQty,
    layoutConfig,
    baseCategoryItems,
    setFinderSubMenuPath,
    setSelectedItemId,
    canIncreaseItem,
    styles,
    emptyItemsLabel,
}: {
    node: DemoSubMenuNode;
    depth: number;
    finderCols: DemoSubMenuNode[][];
    navPathOnly: string[];
    showPickItems: boolean;
    showPickSubmenus: boolean;
    finderItems: MenuItem[];
    selectedItemId: string | null;
    activeBox: BoxOrderSlice | undefined;
    setItemQty: (itemId: string, qty: number) => void;
    layoutConfig: DemoBoxLayoutConfig | null;
    baseCategoryItems: MenuItem[];
    setFinderSubMenuPath: (path: string[]) => void;
    setSelectedItemId: (id: string | null) => void;
    canIncreaseItem: (item: MenuItem) => boolean;
    styles: ShelfCss;
    emptyItemsLabel: string;
}) {
    const isOnPath = navPathOnly[depth] === node.id;
    const nextNodes = finderCols[depth + 1] ?? [];
    const assignedHere = countAssignedToNode(node.id, layoutConfig, baseCategoryItems);
    const childCount = node.children?.length ?? 0;

    const itemsHere =
        showPickItems && navPathOnly.length === depth + 1 && navPathOnly[depth] === node.id;

    const showDeadEnd =
        isOnPath &&
        showPickSubmenus &&
        navPathOnly.length > depth &&
        nextNodes.length === 0 &&
        !itemsHere;

    return (
        <div className={styles.mobileShelfNode}>
            <div
                className={`${styles.row} ${styles.pickGroupRow} ${isOnPath ? styles.rowActive : ''}`}
                onClick={() => {
                    setFinderSubMenuPath([...navPathOnly.slice(0, depth), node.id]);
                    setSelectedItemId(null);
                }}
            >
                <span className={styles.pickGroupRowInner}>
                    <CategoryStackIcon className={styles.subcategoryGlyph} />
                    <span>{node.name}</span>
                </span>
                <span className={`${styles.rowMuted} ${styles.pickGroupMeta}`}>
                    {assignedHere > 0 ? `${assignedHere} items` : ''}
                    {assignedHere > 0 && childCount > 0 ? ' · ' : ''}
                    {childCount > 0 ? `${childCount} nested` : ''}
                    {!assignedHere && !childCount ? '—' : ''}
                </span>
            </div>
            {isOnPath && (
                <div className={styles.mobileShelfInset}>
                    {itemsHere ? (
                        <MobileItemRows
                            items={finderItems}
                            selectedItemId={selectedItemId}
                            activeBox={activeBox}
                            setItemQty={setItemQty}
                            setSelectedItemId={setSelectedItemId}
                            canIncreaseItem={canIncreaseItem}
                            styles={styles}
                            emptyLabel={emptyItemsLabel}
                        />
                    ) : null}
                    {nextNodes.length > 0
                        ? nextNodes.map((child) => (
                              <MobileShelfNode
                                  key={child.id}
                                  node={child}
                                  depth={depth + 1}
                                  finderCols={finderCols}
                                  navPathOnly={navPathOnly}
                                  showPickItems={showPickItems}
                                  showPickSubmenus={showPickSubmenus}
                                  finderItems={finderItems}
                                  selectedItemId={selectedItemId}
                                  activeBox={activeBox}
                                  setItemQty={setItemQty}
                                  layoutConfig={layoutConfig}
                                  baseCategoryItems={baseCategoryItems}
                                  setFinderSubMenuPath={setFinderSubMenuPath}
                                  setSelectedItemId={setSelectedItemId}
                                  canIncreaseItem={canIncreaseItem}
                                  styles={styles}
                                  emptyItemsLabel={emptyItemsLabel}
                              />
                          ))
                        : null}
                    {showDeadEnd ? (
                        <div className={styles.row}>
                            <span className={styles.rowMuted}>No further groups — items appear next.</span>
                        </div>
                    ) : null}
                </div>
            )}
        </div>
    );
}

export type MobileShelfDrilldownProps = {
    styles: ShelfCss;
    finderCols: DemoSubMenuNode[][];
    finderRoots: DemoSubMenuNode[];
    navPathOnly: string[];
    finderSubMenuPath: string[];
    browsingUnassignedOnly: boolean;
    showPickSubmenus: boolean;
    showPickItems: boolean;
    finderItems: MenuItem[];
    unassignedCount: number;
    selectedItemId: string | null;
    activeBox: BoxOrderSlice | undefined;
    setItemQty: (itemId: string, qty: number) => void;
    layoutConfig: DemoBoxLayoutConfig | null;
    baseCategoryItems: MenuItem[];
    setFinderSubMenuPath: (path: string[]) => void;
    setSelectedItemId: (id: string | null) => void;
    emptyItemsLabel: string;
    canIncreaseItem: (item: MenuItem) => boolean;
};

export function MobileShelfDrilldown({
    styles,
    finderCols,
    finderRoots,
    navPathOnly,
    finderSubMenuPath,
    browsingUnassignedOnly,
    showPickSubmenus,
    showPickItems,
    finderItems,
    unassignedCount,
    selectedItemId,
    activeBox,
    setItemQty,
    layoutConfig,
    baseCategoryItems,
    setFinderSubMenuPath,
    setSelectedItemId,
    emptyItemsLabel,
    canIncreaseItem,
}: MobileShelfDrilldownProps) {
    if (browsingUnassignedOnly) {
        return (
            <div className={styles.mobileShelfPanel}>
                <div className={`${styles.row} ${styles.pickGroupRow} ${styles.rowActive}`}>
                    <span className={styles.pickGroupRowInner}>
                        <CategoryStackIcon className={`${styles.subcategoryGlyph} ${styles.subcategoryGlyphMuted}`} />
                        <span>Unassigned</span>
                    </span>
                    <span className={`${styles.rowMuted} ${styles.pickGroupMeta}`}>{unassignedCount}</span>
                </div>
                <div className={styles.mobileShelfInset}>
                    <MobileItemRows
                        items={finderItems}
                        selectedItemId={selectedItemId}
                        activeBox={activeBox}
                        setItemQty={setItemQty}
                        setSelectedItemId={setSelectedItemId}
                        canIncreaseItem={canIncreaseItem}
                        styles={styles}
                        emptyLabel={emptyItemsLabel}
                    />
                </div>
            </div>
        );
    }

    if (finderRoots.length === 0) {
        return (
            <div className={styles.mobileShelfPanel}>
                <MobileItemRows
                    items={finderItems}
                    selectedItemId={selectedItemId}
                    activeBox={activeBox}
                    setItemQty={setItemQty}
                    setSelectedItemId={setSelectedItemId}
                    canIncreaseItem={canIncreaseItem}
                    styles={styles}
                    emptyLabel={emptyItemsLabel}
                />
            </div>
        );
    }

    const roots = finderCols[0] ?? [];

    return (
        <div className={styles.mobileShelfPanel}>
            {navPathOnly.length === 0 && unassignedCount > 0 && (
                <div className={styles.mobileShelfNode}>
                    <div
                        className={`${styles.row} ${styles.pickGroupRow} ${
                            finderSubMenuPath.length === 1 && finderSubMenuPath[0] === UNASSIGNED_SUBMENU_ID
                                ? styles.rowActive
                                : ''
                        }`}
                        onClick={() => {
                            setFinderSubMenuPath([UNASSIGNED_SUBMENU_ID]);
                            setSelectedItemId(null);
                        }}
                    >
                        <span className={styles.pickGroupRowInner}>
                            <CategoryStackIcon className={`${styles.subcategoryGlyph} ${styles.subcategoryGlyphMuted}`} />
                            <span>Unassigned</span>
                        </span>
                        <span className={`${styles.rowMuted} ${styles.pickGroupMeta}`}>{unassignedCount}</span>
                    </div>
                    {finderSubMenuPath.length === 1 && finderSubMenuPath[0] === UNASSIGNED_SUBMENU_ID && (
                        <div className={styles.mobileShelfInset}>
                            <MobileItemRows
                                items={finderItems}
                                selectedItemId={selectedItemId}
                                activeBox={activeBox}
                                setItemQty={setItemQty}
                                setSelectedItemId={setSelectedItemId}
                                canIncreaseItem={canIncreaseItem}
                                styles={styles}
                                emptyLabel={emptyItemsLabel}
                            />
                        </div>
                    )}
                </div>
            )}
            {roots.map((node) => (
                <MobileShelfNode
                    key={node.id}
                    node={node}
                    depth={0}
                    finderCols={finderCols}
                    navPathOnly={navPathOnly}
                    showPickItems={showPickItems}
                    showPickSubmenus={showPickSubmenus}
                    finderItems={finderItems}
                    selectedItemId={selectedItemId}
                    activeBox={activeBox}
                    setItemQty={setItemQty}
                    layoutConfig={layoutConfig}
                    baseCategoryItems={baseCategoryItems}
                    setFinderSubMenuPath={setFinderSubMenuPath}
                    setSelectedItemId={setSelectedItemId}
                    canIncreaseItem={canIncreaseItem}
                    styles={styles}
                    emptyItemsLabel={emptyItemsLabel}
                />
            ))}
        </div>
    );
}

export function MobileQuantityPanel({
    styles,
    selectedItemId,
    menuItems,
    activeBox,
    setItemQty,
}: {
    styles: ShelfCss;
    selectedItemId: string | null;
    menuItems: MenuItem[];
    activeBox: BoxOrderSlice | undefined;
    setItemQty: (itemId: string, qty: number) => void;
}) {
    return (
        <div className={styles.finderQtyCol}>
            <div className={styles.col}>
                <div className={styles.colHead}>Quantity</div>
                <div className={styles.colBody}>
                    {!selectedItemId && (
                        <div className={styles.row}>
                            <span className={styles.rowMuted}>Select an item ←</span>
                        </div>
                    )}
                    {selectedItemId &&
                        (() => {
                            const item = menuItems.find((i) => i.id === selectedItemId);
                            if (!item) return null;
                            const qty = activeBox?.items?.[item.id] ?? 0;
                            return (
                                <div className={styles.row} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                                    <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>{item.name}</div>
                                    <div className={styles.stepper}>
                                        <button
                                            type="button"
                                            className={styles.stepBtn}
                                            onClick={() => setItemQty(item.id, Math.max(0, qty - 1))}
                                        >
                                            −
                                        </button>
                                        <span style={{ minWidth: 28, textAlign: 'center' }}>{qty}</span>
                                        <button type="button" className={styles.stepBtn} onClick={() => setItemQty(item.id, qty + 1)}>
                                            +
                                        </button>
                                    </div>
                                </div>
                            );
                        })()}
                </div>
            </div>
        </div>
    );
}

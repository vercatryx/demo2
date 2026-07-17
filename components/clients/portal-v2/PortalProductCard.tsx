'use client';

import React from 'react';
import { Minus, Plus } from 'lucide-react';
import type { MenuItem } from '@/lib/types';
import { getItemPoints } from '@/lib/utils';
import { getMenuItemDropdownGroups } from '@/lib/menu-item-dropdowns';
import { PortalIncrementTooltip } from './PortalIncrementTooltip';
import { PortalFoodImagePlaceholder } from './PortalFoodImagePlaceholder';
import { PortalItemDropdownFields } from './PortalItemDropdownFields';
import styles from './portal-v2.module.css';

type Props = {
    item: MenuItem;
    quantity: number;
    note?: string;
    onQuantityChange?: (qty: number) => void;
    onNoteChange?: (note: string) => void;
    incrementDisabled?: boolean;
    incrementBlockedMessage?: string;
    onIncrementBlocked?: () => void;
    searchHighlighted?: boolean;
    deliveryDay?: string;
    layout?: 'grid' | 'list';
    /** Featured home tiles: fixed size, navigate to vendor instead of add-to-cart */
    browseMode?: boolean;
    browseHint?: string;
    onBrowse?: () => void;
    /** When true, phased-out dropdown choices are hidden unless already selected. */
    hidePhaseoutUnlessOnOrder?: boolean;
};

export function PortalProductCard({
    item,
    quantity,
    note = '',
    onQuantityChange,
    onNoteChange,
    incrementDisabled,
    incrementBlockedMessage,
    onIncrementBlocked,
    searchHighlighted,
    deliveryDay,
    layout = 'grid',
    browseMode = false,
    browseHint,
    onBrowse,
    hidePhaseoutUnlessOnOrder = false,
}: Props) {
    const points = getItemPoints(item);
    const dropdownGroups = React.useMemo(() => getMenuItemDropdownGroups(item), [item]);
    const hasDropdowns = dropdownGroups.length > 0;
    const showOptions = !browseMode && quantity > 0 && hasDropdowns && !!onNoteChange;
    const isExpanded = showOptions;
    const useCompactHead = showOptions && layout === 'grid';

    const handleAdd = () => {
        if (!onQuantityChange) return;
        if (incrementDisabled) {
            onIncrementBlocked?.();
            return;
        }
        onQuantityChange(quantity + 1);
    };

    const handleMinus = () => onQuantityChange?.(Math.max(0, quantity - 1));

    const imageWrapClass = [
        styles.portalV2ProductImageWrap,
        useCompactHead ? styles.portalV2ProductImageWrapFixed : '',
    ]
        .filter(Boolean)
        .join(' ');

    const imageControls = browseMode ? (
        <button type="button" className={styles.portalV2BrowseBtn} onClick={onBrowse}>
            View in menu
        </button>
    ) : quantity > 0 ? (
        <div className={styles.portalV2StepperOverlay}>
            <div className={styles.portalV2Stepper}>
                <button type="button" className={styles.portalV2StepperBtn} onClick={handleMinus} aria-label="Decrease">
                    <Minus size={16} />
                </button>
                <span className={styles.portalV2StepperQty}>{quantity}</span>
                <PortalIncrementTooltip message={incrementDisabled ? incrementBlockedMessage : undefined}>
                    <button
                        type="button"
                        className={styles.portalV2StepperBtn}
                        onClick={handleAdd}
                        disabled={incrementDisabled}
                        aria-label="Increase"
                    >
                        <Plus size={16} />
                    </button>
                </PortalIncrementTooltip>
            </div>
        </div>
    ) : (
        <PortalIncrementTooltip message={incrementDisabled ? incrementBlockedMessage : undefined}>
            <span className={styles.portalV2AddBtnWrap}>
                <button
                    type="button"
                    className={styles.portalV2AddBtn}
                    onClick={handleAdd}
                    disabled={incrementDisabled}
                    aria-label="Add to order"
                >
                    +
                </button>
            </span>
        </PortalIncrementTooltip>
    );

    const imageBlock = (
        <div className={imageWrapClass}>
            {item.imageUrl ? (
                <img src={item.imageUrl} alt="" className={styles.portalV2ProductImage} />
            ) : (
                <PortalFoodImagePlaceholder size="fill" className={styles.portalV2ProductImagePlaceholder} />
            )}
            {imageControls}
        </div>
    );

    const metaBlock = (
        <div className={styles.portalV2ProductBody}>
            {item.brand && <div className={styles.portalV2ProductBrand}>{item.brand}</div>}
            <div className={styles.portalV2ProductName}>{item.name}</div>
            <div className={styles.portalV2ProductPoints}>
                {points} pt{points !== 1 ? 's' : ''}
            </div>
            {browseMode && browseHint && (
                <p className={styles.portalV2BrowseHint}>{browseHint}</p>
            )}
        </div>
    );

    const optionsBlock =
        showOptions && onNoteChange ? (
            <PortalItemDropdownFields
                item={item}
                quantity={quantity}
                note={note}
                onNoteChange={onNoteChange}
                hidePhaseoutUnlessOnOrder={hidePhaseoutUnlessOnOrder}
            />
        ) : null;

    const cardClass = [
        layout === 'grid' ? styles.portalV2ProductCard : styles.portalV2ProductListCard,
        browseMode ? styles.portalV2ProductCardFeatured : '',
        isExpanded ? styles.portalV2ProductCardExpanded : '',
        searchHighlighted ? styles.portalV2ProductCardHighlight : '',
        showOptions && quantity === 1 ? styles.portalV2ProductCardDropdown : '',
        showOptions && quantity > 1 ? styles.portalV2ProductCardMultiDropdown : '',
    ]
        .filter(Boolean)
        .join(' ');

    const cardStyle = React.useMemo((): React.CSSProperties | undefined => {
        if (layout !== 'grid' || !showOptions) return undefined;
        if (quantity > 1) {
            return {
                '--instance-count': quantity,
                gridColumn: `span ${Math.min(quantity + 1, 5)}`,
            } as React.CSSProperties;
        }
        return { gridColumn: 'span 2' };
    }, [layout, showOptions, quantity]);

    const topSection = useCompactHead ? (
        <div className={styles.portalV2ProductCardHead}>
            {imageBlock}
            {metaBlock}
        </div>
    ) : (
        <>
            {imageBlock}
            {metaBlock}
        </>
    );

    if (layout === 'list') {
        return (
            <div
                className={cardClass}
                style={cardStyle}
                data-item-id={item.id}
                data-food-item-id={item.id}
                {...(deliveryDay ? { 'data-delivery-day': deliveryDay } : {})}
            >
                <div className={styles.portalV2ProductListRow}>
                    <div style={{ width: 72, flexShrink: 0 }}>{imageBlock}</div>
                    {metaBlock}
                </div>
                {optionsBlock}
            </div>
        );
    }

    return (
        <div
            className={cardClass}
            style={cardStyle}
            data-item-id={item.id}
            data-food-item-id={item.id}
            {...(deliveryDay ? { 'data-delivery-day': deliveryDay } : {})}
        >
            {topSection}
            {optionsBlock}
        </div>
    );
}

'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { MenuItem, MealItem } from '@/lib/types';
import { getItemPoints } from '@/lib/utils';
import {
    decodeDropdownSelections,
    DROPDOWN_INSTANCE_SEP,
    encodeDropdownSelections,
    filterDropdownOptionsForViewer,
    formatGroupMultiParents,
    formatGroupSlot,
    formatGroupSlotWithSubs,
    getGroupMaxSelections,
    getMenuItemDropdownGroups,
    getSubDropdownEntryForOption,
    getVisibleDropdownDisplayOptions,
    groupSupportsMultiSelect,
    isCorruptedLabeledDropdownNote,
    isSubDropdownArray,
    joinDropdownInstanceNotes,
    orderMultiSelectParents,
    parseGroupMultiParents,
    parseGroupSlotSubs,
    repairCorruptedDropdownNote,
    sortSubDropdownArrayForDisplay,
    splitDropdownInstanceNotes,
} from '@/lib/menu-item-dropdowns';
import { DropdownMultiSelectOptions } from '@/components/clients/DropdownMultiSelectOptions';
import { Check, Minus, Plus, Utensils, X } from 'lucide-react';
import TextareaAutosize from 'react-textarea-autosize';
import { createPortal } from 'react-dom';
import styles from './MenuItemCard.module.css';

export const PORTAL_INCREMENT_BLOCKED_MESSAGE =
    'To add this item, remove or reduce other items in your order first. Everything draws from the same weekly meal allowance.';

function BlockedIncrementTooltip({
    message,
    className,
    children,
}: {
    message?: string;
    className?: string;
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
                className={className}
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
                        className={styles.blockedIncrementTooltip}
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

function dropdownPlaceholder(label: string): string {
    const t = label.trim();
    if (!t) return 'Select option…';
    const lower = t.toLowerCase();
    const article = /^[aeiou]/i.test(t) ? 'an' : 'a';
    return `Select ${article} ${lower}…`;
}

interface Props {
    item: MenuItem | MealItem;
    quantity: number;
    note?: string;
    onQuantityChange: (newQty: number) => void;
    onNoteChange: (note: string) => void;
    contextLabel?: string; // e.g. "Vendor Name" or "Category"
    /** When true, show checkbox instead of +/- controls; checked = 1, unchecked = 0 */
    checkboxMode?: boolean;
    /** Pulse highlight after catalog search navigation */
    searchHighlighted?: boolean;
    /** Disambiguates duplicate item cards in multi-day menus */
    deliveryDay?: string;
    /** When true, block adding quantity (plus / unchecked checkbox). Minus still works. */
    incrementDisabled?: boolean;
    /** Called when user tries to increment while incrementDisabled (e.g. weekly limit). */
    onIncrementBlocked?: () => void;
    /** When true, phased-out dropdown choices are hidden unless already selected. */
    hidePhaseoutUnlessOnOrder?: boolean;
}

export default function MenuItemCard({
    item,
    quantity,
    note = '',
    onQuantityChange,
    onNoteChange,
    contextLabel,
    checkboxMode = false,
    searchHighlighted = false,
    deliveryDay,
    incrementDisabled = false,
    onIncrementBlocked,
    hidePhaseoutUnlessOnOrder = false,
}: Props) {
    const pathname = usePathname();
    const isClientPortal = (pathname ?? '').startsWith('/client-portal');
    const allowNotes = !isClientPortal;

    const [isModalOpen, setIsModalOpen] = React.useState(false);
    const handleIncrement = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        e?.preventDefault();
        if (incrementDisabled) {
            onIncrementBlocked?.();
            return;
        }
        onQuantityChange(quantity + 1);
    };
    const handleDecrement = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        onQuantityChange(Math.max(0, quantity - 1));
    };

    const toggleModal = () => {
        if (checkboxMode) return; // No modal in checkbox mode
        setIsModalOpen(!isModalOpen);
    };

    const stopPropagation = (e: React.MouseEvent) => e.stopPropagation();

    const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        e.stopPropagation();
        if (incrementDisabled && e.target.checked) {
            onIncrementBlocked?.();
            return;
        }
        onQuantityChange(e.target.checked ? 1 : 0);
    };

    const plusDisabled = incrementDisabled;
    const checkboxDisabled = incrementDisabled && quantity === 0;
    const incrementBlockedHint =
        incrementDisabled && onIncrementBlocked ? PORTAL_INCREMENT_BLOCKED_MESSAGE : undefined;

    const displayPoints = getItemPoints(item);
    const isChecked = checkboxMode ? quantity >= 1 : false;

    const dropdownGroups = React.useMemo(() => getMenuItemDropdownGroups(item), [item]);
    const showDropdown = quantity > 0 && dropdownGroups.length > 0;
    const multiInstanceDropdowns = showDropdown && quantity > 1;
    const showNotesTextarea =
        quantity > 0 && Boolean(item.notesEnabled) && allowNotes && !showDropdown;

    const instanceNotes = React.useMemo(
        () => splitDropdownInstanceNotes(note, quantity),
        [note, quantity],
    );

    const [selections, setSelections] = React.useState<string[]>(() =>
        decodeDropdownSelections(instanceNotes[0] ?? note, dropdownGroups),
    );

    React.useEffect(() => {
        if (!showDropdown || dropdownGroups.length === 0) return;
        if (!isCorruptedLabeledDropdownNote(note, dropdownGroups)) return;
        const repaired = repairCorruptedDropdownNote(note, dropdownGroups, quantity);
        if (repaired !== note) onNoteChange(repaired);
    }, [note, quantity, showDropdown, dropdownGroups, onNoteChange]);

    React.useEffect(() => {
        if (multiInstanceDropdowns) return;
        setSelections(decodeDropdownSelections(note, dropdownGroups));
    }, [note, dropdownGroups, multiInstanceDropdowns]);

    React.useEffect(() => {
        if (!showDropdown) return;
        if (quantity <= 1) {
            if (note.includes(DROPDOWN_INSTANCE_SEP)) {
                const first = splitDropdownInstanceNotes(note, 1)[0] ?? '';
                if (first !== note) onNoteChange(first);
            }
            return;
        }
        if (!note.trim() && !note.includes(DROPDOWN_INSTANCE_SEP)) return;
        const joined = joinDropdownInstanceNotes(splitDropdownInstanceNotes(note, quantity));
        if (joined !== note) onNoteChange(joined);
    }, [quantity, note, showDropdown]);

    const dropdownSelectId = React.useId();

    const handleDropdownChange = (index: number, value: string, subValue?: string, subIndex?: number) => {
        const next = [...selections];
        if (subValue !== undefined && subIndex !== undefined) {
            const { parent, subs } = parseGroupSlotSubs(next[index] ?? '');
            const subArr = [...subs];
            while (subArr.length <= subIndex) subArr.push('');
            subArr[subIndex] = subValue;
            next[index] = formatGroupSlotWithSubs(parent, subArr);
        } else if (subValue !== undefined) {
            const { parent } = parseGroupSlotSubs(next[index] ?? '');
            next[index] = formatGroupSlot(parent, subValue);
        } else {
            next[index] = formatGroupSlotWithSubs(value, []);
        }
        setSelections(next);
        onNoteChange(encodeDropdownSelections(next, dropdownGroups));
    };

    const handleInstanceDropdownChange = (
        instanceIndex: number,
        groupIndex: number,
        value: string,
        subValue?: string,
        subIndex?: number,
    ) => {
        const instances = splitDropdownInstanceNotes(note, quantity);
        const decoded = decodeDropdownSelections(instances[instanceIndex] ?? '', dropdownGroups);
        const next = [...decoded];
        if (subValue !== undefined && subIndex !== undefined) {
            const { parent, subs } = parseGroupSlotSubs(next[groupIndex] ?? '');
            const subArr = [...subs];
            while (subArr.length <= subIndex) subArr.push('');
            subArr[subIndex] = subValue;
            next[groupIndex] = formatGroupSlotWithSubs(parent, subArr);
        } else if (subValue !== undefined) {
            const { parent } = parseGroupSlotSubs(next[groupIndex] ?? '');
            next[groupIndex] = formatGroupSlot(parent, subValue);
        } else {
            next[groupIndex] = formatGroupSlotWithSubs(value, []);
        }
        instances[instanceIndex] = encodeDropdownSelections(next, dropdownGroups);
        onNoteChange(joinDropdownInstanceNotes(instances));
    };

    const applyMultiSelectToggle = (
        currentSelections: string[],
        groupIndex: number,
        option: string,
        checked: boolean,
    ): string[] => {
        const next = [...currentSelections];
        const group = dropdownGroups[groupIndex];
        const { parent } = parseGroupSlotSubs(next[groupIndex] ?? '');
        const selected = parseGroupMultiParents(parent);
        const updated = checked
            ? selected.includes(option)
                ? selected
                : [...selected, option]
            : selected.filter((s) => s !== option);
        next[groupIndex] = formatGroupMultiParents(orderMultiSelectParents(group, updated));
        return next;
    };

    const applyMultiSelectAdd = (
        currentSelections: string[],
        groupIndex: number,
        option: string,
    ): string[] => {
        const next = [...currentSelections];
        const group = dropdownGroups[groupIndex];
        const { parent } = parseGroupSlotSubs(next[groupIndex] ?? '');
        const selected = parseGroupMultiParents(parent);
        if (!selected.includes(option)) return next;
        if (selected.length >= getGroupMaxSelections(group)) return next;
        next[groupIndex] = formatGroupMultiParents(
            orderMultiSelectParents(group, [...selected, option]),
        );
        return next;
    };

    const applyMultiSelectRemove = (
        currentSelections: string[],
        groupIndex: number,
        option: string,
    ): string[] => {
        const next = [...currentSelections];
        const group = dropdownGroups[groupIndex];
        const { parent } = parseGroupSlotSubs(next[groupIndex] ?? '');
        const selected = parseGroupMultiParents(parent);
        const removeAt = selected.lastIndexOf(option);
        if (removeAt < 0) return next;
        const updated = [...selected.slice(0, removeAt), ...selected.slice(removeAt + 1)];
        next[groupIndex] = formatGroupMultiParents(orderMultiSelectParents(group, updated));
        return next;
    };

    const handleMultiSelectToggle = (groupIndex: number, option: string, checked: boolean) => {
        const next = applyMultiSelectToggle(selections, groupIndex, option, checked);
        setSelections(next);
        onNoteChange(encodeDropdownSelections(next, dropdownGroups));
    };

    const handleMultiSelectAdd = (groupIndex: number, option: string) => {
        const next = applyMultiSelectAdd(selections, groupIndex, option);
        setSelections(next);
        onNoteChange(encodeDropdownSelections(next, dropdownGroups));
    };

    const handleMultiSelectRemove = (groupIndex: number, option: string) => {
        const next = applyMultiSelectRemove(selections, groupIndex, option);
        setSelections(next);
        onNoteChange(encodeDropdownSelections(next, dropdownGroups));
    };

    const handleInstanceMultiSelectToggle = (
        instanceIndex: number,
        groupIndex: number,
        option: string,
        checked: boolean,
    ) => {
        const instances = splitDropdownInstanceNotes(note, quantity);
        const decoded = decodeDropdownSelections(instances[instanceIndex] ?? '', dropdownGroups);
        const next = applyMultiSelectToggle(decoded, groupIndex, option, checked);
        instances[instanceIndex] = encodeDropdownSelections(next, dropdownGroups);
        onNoteChange(joinDropdownInstanceNotes(instances));
    };

    const handleInstanceMultiSelectAdd = (
        instanceIndex: number,
        groupIndex: number,
        option: string,
    ) => {
        const instances = splitDropdownInstanceNotes(note, quantity);
        const decoded = decodeDropdownSelections(instances[instanceIndex] ?? '', dropdownGroups);
        const next = applyMultiSelectAdd(decoded, groupIndex, option);
        instances[instanceIndex] = encodeDropdownSelections(next, dropdownGroups);
        onNoteChange(joinDropdownInstanceNotes(instances));
    };

    const handleInstanceMultiSelectRemove = (
        instanceIndex: number,
        groupIndex: number,
        option: string,
    ) => {
        const instances = splitDropdownInstanceNotes(note, quantity);
        const decoded = decodeDropdownSelections(instances[instanceIndex] ?? '', dropdownGroups);
        const next = applyMultiSelectRemove(decoded, groupIndex, option);
        instances[instanceIndex] = encodeDropdownSelections(next, dropdownGroups);
        onNoteChange(joinDropdownInstanceNotes(instances));
    };

    const renderDropdowns = (forModal: boolean, instanceIndex = 0, instanceNote?: string) => {
        const instanceSelections = decodeDropdownSelections(
            instanceNote ?? (instanceIndex === 0 && !multiInstanceDropdowns ? note : ''),
            dropdownGroups,
        );

        return dropdownGroups.map((group, index) => {
            const selectId = forModal
                ? `${dropdownSelectId}-modal-${instanceIndex}-${index}`
                : `${dropdownSelectId}-${instanceIndex}-${index}`;
            const selectClass = forModal ? styles.modalDropdownSelect : `${styles.noteInput} ${styles.dropdownSelect}`;
            const labelClass = forModal ? styles.modalLabel : styles.dropdownLabel;
            const wrapClass = forModal ? styles.modalNoteSection : styles.dropdownWrap;
            const subWrapClass = forModal ? styles.modalNoteSection : `${styles.dropdownWrap} ${styles.subDropdownWrap}`;
            const slot = multiInstanceDropdowns
                ? (instanceSelections[index] ?? '')
                : (selections[index] ?? '');
            const { parent, subs } = parseGroupSlotSubs(slot);
            const multiSelected = parseGroupMultiParents(parent);
            const isMulti = groupSupportsMultiSelect(group);
            const subEntry = !isMulti && parent ? getSubDropdownEntryForOption(group, parent) : undefined;
            const onParentChange = multiInstanceDropdowns
                ? (e: React.ChangeEvent<HTMLSelectElement>) =>
                      handleInstanceDropdownChange(instanceIndex, index, e.target.value)
                : (e: React.ChangeEvent<HTMLSelectElement>) => handleDropdownChange(index, e.target.value);

            const renderSubDropdowns = () => {
                if (!subEntry) {
                    const hasArraySubs = group.subDropdowns
                        ? Object.values(group.subDropdowns).some((entry) => isSubDropdownArray(entry))
                        : false;
                    if (hasArraySubs && !parent) {
                        return (
                            <p
                                className={styles.dropdownHint}
                                style={forModal ? { marginTop: 8, fontSize: '0.85rem' } : { marginTop: 6, fontSize: '0.8rem' }}
                            >
                                Select a delivery day above to choose juices.
                            </p>
                        );
                    }
                    return null;
                }
                if (isSubDropdownArray(subEntry)) {
                    const sortedSubs = sortSubDropdownArrayForDisplay(subEntry);
                    return sortedSubs.map((subDef, displayIndex) => {
                        const origIndex = subEntry.findIndex((x) => x.label.trim() === subDef.label.trim());
                        const subIndex = origIndex >= 0 ? origIndex : displayIndex;
                        const subSelectId = `${selectId}-sub-${subIndex}`;
                        const onSubChange = multiInstanceDropdowns
                            ? (e: React.ChangeEvent<HTMLSelectElement>) =>
                                  handleInstanceDropdownChange(
                                      instanceIndex,
                                      index,
                                      parent,
                                      e.target.value,
                                      subIndex,
                                  )
                            : (e: React.ChangeEvent<HTMLSelectElement>) =>
                                  handleDropdownChange(index, parent, e.target.value, subIndex);
                        return (
                            <div
                                key={subSelectId}
                                className={subWrapClass}
                                style={forModal ? { marginTop: 8 } : { marginTop: 6 }}
                            >
                                <label className={labelClass} htmlFor={subSelectId}>
                                    {subDef.label}
                                </label>
                                <select
                                    id={subSelectId}
                                    className={selectClass}
                                    aria-label={`${item.name}${multiInstanceDropdowns ? ` #${instanceIndex + 1}` : ''}: ${subDef.label}`}
                                    value={subs[subIndex] ?? ''}
                                    onChange={onSubChange}
                                >
                                    <option value="">{dropdownPlaceholder(subDef.label)}</option>
                                    {filterDropdownOptionsForViewer(
                                        subDef,
                                        subs[subIndex] ?? '',
                                        hidePhaseoutUnlessOnOrder,
                                    ).map((opt) => (
                                        <option key={opt} value={opt}>
                                            {opt}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        );
                    });
                }
                const subSelectId = `${selectId}-sub`;
                const onSubChange = multiInstanceDropdowns
                    ? (e: React.ChangeEvent<HTMLSelectElement>) =>
                          handleInstanceDropdownChange(instanceIndex, index, parent, e.target.value)
                    : (e: React.ChangeEvent<HTMLSelectElement>) =>
                          handleDropdownChange(index, parent, e.target.value);
                return (
                    <div className={subWrapClass} style={forModal ? { marginTop: 8 } : { marginTop: 6 }}>
                        <label className={labelClass} htmlFor={subSelectId}>
                            {subEntry.label}
                        </label>
                        <select
                            id={subSelectId}
                            className={selectClass}
                            aria-label={`${item.name}${multiInstanceDropdowns ? ` #${instanceIndex + 1}` : ''}: ${subEntry.label}`}
                            value={subs[0] ?? ''}
                            onChange={onSubChange}
                        >
                            <option value="">{dropdownPlaceholder(subEntry.label)}</option>
                            {filterDropdownOptionsForViewer(
                                subEntry,
                                subs[0] ?? '',
                                hidePhaseoutUnlessOnOrder,
                            ).map((opt) => (
                                <option key={opt} value={opt}>
                                    {opt}
                                </option>
                            ))}
                        </select>
                    </div>
                );
            };

            return (
                <div
                    key={`${instanceIndex}-${group.label}-${index}`}
                    className={wrapClass}
                    onClick={stopPropagation}
                    style={forModal ? undefined : index > 0 ? { marginTop: 8 } : undefined}
                >
                    <label className={labelClass} htmlFor={selectId}>
                        {group.label}
                    </label>
                    {isMulti ? (
                        <DropdownMultiSelectOptions
                            group={group}
                            selected={multiSelected}
                            onToggle={(opt, checked) =>
                                multiInstanceDropdowns
                                    ? handleInstanceMultiSelectToggle(instanceIndex, index, opt, checked)
                                    : handleMultiSelectToggle(index, opt, checked)
                            }
                            onAddAnother={(opt) =>
                                multiInstanceDropdowns
                                    ? handleInstanceMultiSelectAdd(instanceIndex, index, opt)
                                    : handleMultiSelectAdd(index, opt)
                            }
                            onRemoveOne={(opt) =>
                                multiInstanceDropdowns
                                    ? handleInstanceMultiSelectRemove(instanceIndex, index, opt)
                                    : handleMultiSelectRemove(index, opt)
                            }
                            hidePhaseoutUnlessOnOrder={hidePhaseoutUnlessOnOrder}
                            itemName={item.name}
                            instanceLabel={multiInstanceDropdowns ? ` #${instanceIndex + 1}` : undefined}
                            selectId={selectId}
                        />
                    ) : (
                        <select
                            id={selectId}
                            className={selectClass}
                            aria-label={`${item.name}${multiInstanceDropdowns ? ` #${instanceIndex + 1}` : ''}: ${group.label}`}
                            value={parent}
                            onChange={onParentChange}
                        >
                            <option value="">{dropdownPlaceholder(group.label)}</option>
                            {getVisibleDropdownDisplayOptions(group, parent, hidePhaseoutUnlessOnOrder).map((opt) => (
                                <option key={opt} value={opt}>
                                    {opt}
                                </option>
                            ))}
                        </select>
                    )}
                    {renderSubDropdowns()}
                </div>
            );
        });
    };

    const renderDropdownSection = (forModal: boolean) => {
        if (!multiInstanceDropdowns) {
            return renderDropdowns(forModal);
        }
        const rowClass = forModal ? styles.modalDropdownInstances : styles.dropdownInstancesRow;
        const colClass = forModal ? styles.modalDropdownInstanceColumn : styles.dropdownInstanceColumn;
        return (
            <div className={rowClass} onClick={stopPropagation}>
                {instanceNotes.map((instanceNote, instanceIndex) => (
                    <div key={instanceIndex} className={colClass}>
                        <div className={styles.dropdownInstanceLabel}>#{instanceIndex + 1}</div>
                        {renderDropdowns(forModal, instanceIndex, instanceNote)}
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div
            className={`${styles.card} ${quantity > 0 ? styles.selected : ''} ${searchHighlighted ? styles.searchHighlighted : ''} ${multiInstanceDropdowns ? styles.multiInstanceCard : ''}`}
            data-food-item-id={item.id}
            {...(deliveryDay ? { 'data-delivery-day': deliveryDay } : {})}
            style={
                multiInstanceDropdowns
                    ? ({ '--instance-count': quantity } as React.CSSProperties)
                    : undefined
            }
            onClick={isClientPortal && quantity > 0 ? undefined : toggleModal}
        >
            {/* Image: always show in client portal (catering placeholder when missing) */}
            {(isClientPortal || item.imageUrl) && (
                <div
                    className={`${styles.imageContainer} ${item.imageUrl ? styles.hasImage : styles.fallbackActive}`}
                >
                    {item.imageUrl && (
                        <img
                            src={item.imageUrl}
                            alt={item.name}
                            className={styles.image}
                            onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                e.currentTarget.parentElement?.classList.add(styles.fallbackActive);
                            }}
                        />
                    )}
                    <div className={styles.placeholder} aria-hidden>
                        <Utensils size={64} strokeWidth={1.5} />
                    </div>
                </div>
            )}

            {/* Content Section */}
            <div className={styles.content}>
                <div className={styles.header}>
                    <div className={styles.name}>{item.name}</div>
                    <div className={styles.value}>{displayPoints} pts</div>
                </div>

                {contextLabel && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                        {contextLabel}
                    </div>
                )}

                {/* Dropdown choices → stored as item note (semicolon-separated groups; || between units when qty > 1) */}
                {showDropdown && renderDropdownSection(false)}

                {/* Note Input (only if selected, notes enabled, no dropdown options) */}
                {showNotesTextarea && (
                    <TextareaAutosize
                        className={styles.noteInput}
                        minRows={1}
                        placeholder="Add special instructions..."
                        value={note}
                        onClick={stopPropagation}
                        onChange={(e) => onNoteChange(e.target.value)}
                    />
                )}

                {/* Controls */}
                <div className={styles.controls} onClick={stopPropagation}>
                    {checkboxMode ? (
                        <BlockedIncrementTooltip
                            message={checkboxDisabled ? incrementBlockedHint : undefined}
                            className={styles.tooltipAnchorInline}
                        >
                            <label
                                className={`${styles.checkboxLabel} ${checkboxDisabled ? styles.checkboxLabelDisabled : ''}`}
                            >
                                <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={handleCheckboxChange}
                                    className={styles.checkbox}
                                />
                                <span className={styles.checkboxCustom}>
                                    {isChecked && <Check size={14} strokeWidth={3} />}
                                </span>
                                <span className={styles.checkboxText}>Select</span>
                            </label>
                        </BlockedIncrementTooltip>
                    ) : (
                        <div className={styles.qtyGroup}>
                            <button
                                className={styles.qtyBtn}
                                onClick={handleDecrement}
                                disabled={quantity === 0}
                            >
                                <Minus size={14} />
                            </button>
                            <span className={styles.qtyValue}>{quantity}</span>
                            <BlockedIncrementTooltip
                                message={incrementBlockedHint}
                                className={styles.tooltipAnchorInline}
                            >
                                <button
                                    className={`${styles.qtyBtn} ${plusDisabled ? styles.qtyBtnBlocked : ''}`}
                                    onClick={handleIncrement}
                                    onMouseDown={stopPropagation}
                                    aria-disabled={plusDisabled}
                                    type="button"
                                >
                                    <Plus size={14} />
                                </button>
                            </BlockedIncrementTooltip>
                        </div>
                    )}
                </div>
            </div>

            {/* Detailed Modal */}
            {isModalOpen &&
                typeof document !== 'undefined' &&
                createPortal(
                    <div className={styles.modalOverlay} onClick={toggleModal}>
                        <div className={styles.modalBody} onClick={stopPropagation}>
                            <button className={styles.closeBtn} onClick={toggleModal}>
                                <X size={24} />
                            </button>

                            {item.imageUrl && (
                                <div className={styles.modalImageContainer}>
                                    <img src={item.imageUrl} alt={item.name} className={styles.modalImage} />
                                </div>
                            )}

                            <div className={styles.modalContent}>
                                <div className={styles.modalHeader}>
                                    <h2 className={styles.modalName}>{item.name}</h2>
                                    <div className={styles.modalValue}>{displayPoints} pts</div>
                                </div>

                                {contextLabel && <div className={styles.modalContext}>{contextLabel}</div>}

                                {showDropdown && renderDropdownSection(true)}

                                {item.notesEnabled && allowNotes && !showDropdown && (
                                    <div className={styles.modalNoteSection}>
                                        <label className={styles.modalLabel}>Special Instructions</label>
                                        <TextareaAutosize
                                            className={styles.modalNoteInput}
                                            minRows={3}
                                            placeholder="Add any specific requirements or preferences..."
                                            value={note}
                                            onChange={(e) => onNoteChange(e.target.value)}
                                        />
                                    </div>
                                )}

                                <div className={styles.modalControls}>
                                    <div className={styles.modalQtyGroup}>
                                        <button
                                            className={styles.modalQtyBtn}
                                            onClick={handleDecrement}
                                            disabled={quantity === 0}
                                        >
                                            <Minus size={20} />
                                        </button>
                                        <span className={styles.modalQtyValue}>{quantity}</span>
                                        <BlockedIncrementTooltip
                                            message={incrementBlockedHint}
                                            className={styles.tooltipAnchorInline}
                                        >
                                            <button
                                                className={`${styles.modalQtyBtn} ${plusDisabled ? styles.modalQtyBtnBlocked : ''}`}
                                                onClick={handleIncrement}
                                                onMouseDown={stopPropagation}
                                                aria-disabled={plusDisabled}
                                                type="button"
                                            >
                                                <Plus size={20} />
                                            </button>
                                        </BlockedIncrementTooltip>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>,
                    document.body,
                )}
        </div>
    );
}

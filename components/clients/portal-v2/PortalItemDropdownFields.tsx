'use client';

import React from 'react';
import type { MenuItem } from '@/lib/types';
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
import styles from './portal-v2.module.css';

function dropdownPlaceholder(label: string): string {
    const t = label.trim();
    if (!t) return 'Select option…';
    const article = /^[aeiou]/i.test(t) ? 'an' : 'a';
    return `Select ${article} ${t.toLowerCase()}…`;
}

type Props = {
    item: MenuItem;
    quantity: number;
    note: string;
    onNoteChange: (note: string) => void;
    /** When true, phased-out dropdown choices are hidden unless already selected. */
    hidePhaseoutUnlessOnOrder?: boolean;
};

/** Inline dropdown fields for portal v2 product cards (stored in item note). */
export function PortalItemDropdownFields({
    item,
    quantity,
    note,
    onNoteChange,
    hidePhaseoutUnlessOnOrder = false,
}: Props) {
    const dropdownGroups = React.useMemo(() => getMenuItemDropdownGroups(item), [item]);
    const showDropdown = quantity > 0 && dropdownGroups.length > 0;
    const multiInstanceDropdowns = showDropdown && quantity > 1;

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
    }, [quantity, note, showDropdown, onNoteChange]);

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

    const renderDropdowns = (instanceIndex = 0, instanceNote?: string) => {
        const instanceSelections = decodeDropdownSelections(
            instanceNote ?? (instanceIndex === 0 && !multiInstanceDropdowns ? note : ''),
            dropdownGroups,
        );

        return dropdownGroups.map((group, index) => {
            const selectId = `${dropdownSelectId}-${instanceIndex}-${index}`;
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
                if (!subEntry) return null;
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
                            <div key={subSelectId} className={styles.portalV2DropdownWrap}>
                                <label className={styles.portalV2DropdownLabel} htmlFor={subSelectId}>
                                    {subDef.label}
                                </label>
                                <select
                                    id={subSelectId}
                                    className={styles.portalV2DropdownSelect}
                                    aria-label={`${item.name}: ${subDef.label}`}
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
                    <div className={styles.portalV2DropdownWrap}>
                        <label className={styles.portalV2DropdownLabel} htmlFor={subSelectId}>
                            {subEntry.label}
                        </label>
                        <select
                            id={subSelectId}
                            className={styles.portalV2DropdownSelect}
                            aria-label={`${item.name}: ${subEntry.label}`}
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
                <div key={`${instanceIndex}-${group.label}-${index}`} className={styles.portalV2DropdownWrap}>
                    <label className={styles.portalV2DropdownLabel} htmlFor={selectId}>
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
                            className={styles.portalV2DropdownSelect}
                            aria-label={`${item.name}: ${group.label}`}
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

    if (!showDropdown) return null;

    if (!multiInstanceDropdowns) {
        return <div className={styles.portalV2DropdownPanel}>{renderDropdowns()}</div>;
    }

    return (
        <div
            className={`${styles.portalV2DropdownPanel} ${styles.portalV2DropdownPanelMulti}`}
            style={{ '--instance-count': quantity } as React.CSSProperties}
        >
            <div className={styles.portalV2DropdownInstancesRow}>
                {instanceNotes.map((instanceNote, instanceIndex) => (
                    <div key={instanceIndex} className={styles.portalV2DropdownInstanceColumn}>
                        <div className={styles.portalV2DropdownInstanceLabel}>#{instanceIndex + 1}</div>
                        {renderDropdowns(instanceIndex, instanceNote)}
                    </div>
                ))}
            </div>
        </div>
    );
}

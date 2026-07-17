'use client';

import React from 'react';
import { ChevronDown, Minus, Plus } from 'lucide-react';
import type { MenuItemDropdownGroup } from '@/lib/types';
import {
    getGroupMaxSelections,
    getVisibleDropdownDisplayOptions,
} from '@/lib/menu-item-dropdowns';
import styles from './DropdownMultiSelectOptions.module.css';

type Props = {
    group: MenuItemDropdownGroup;
    selected: string[];
    onToggle: (option: string, checked: boolean) => void;
    /** Add another of an already-checked option (encoded as a duplicate in the note). */
    onAddAnother?: (option: string) => void;
    /** Remove one copy of an already-checked option from the note. */
    onRemoveOne?: (option: string) => void;
    hidePhaseoutUnlessOnOrder?: boolean;
    itemName?: string;
    instanceLabel?: string;
    placeholder?: string;
    selectId?: string;
};

function dropdownPlaceholder(label: string): string {
    const t = label.trim();
    if (!t) return 'Select option…';
    const article = /^[aeiou]/i.test(t) ? 'an' : 'a';
    return `Select ${article} ${t.toLowerCase()}…`;
}

function formatTriggerLabel(selected: string[], placeholder: string): string {
    if (selected.length === 0) return placeholder;
    const counts = new Map<string, number>();
    for (const s of selected) {
        counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    const parts: string[] = [];
    for (const [label, n] of counts) {
        parts.push(n > 1 ? `${label} ×${n}` : label);
    }
    if (parts.length === 1) return parts[0];
    if (parts.length === 2) return `${parts[0]}, ${parts[1]}`;
    return `${selected.length} selected`;
}

/** Collapsible dropdown with checkboxes for groups with maxSelections > 1. */
export function DropdownMultiSelectOptions({
    group,
    selected,
    onToggle,
    onAddAnother,
    onRemoveOne,
    hidePhaseoutUnlessOnOrder = false,
    itemName,
    instanceLabel,
    placeholder,
    selectId,
}: Props) {
    const max = getGroupMaxSelections(group);
    const selectedJoined = selected.join('|');
    const sortedOptions = getVisibleDropdownDisplayOptions(group, selectedJoined, hidePhaseoutUnlessOnOrder);
    const atMax = selected.length >= max;
    const [open, setOpen] = React.useState(false);
    const rootRef = React.useRef<HTMLDivElement>(null);
    const ph = placeholder ?? dropdownPlaceholder(group.label);
    const triggerText = formatTriggerLabel(selected, ph);
    const showQtyControls = Boolean(onAddAnother || onRemoveOne);

    React.useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onPointerDown);
        return () => document.removeEventListener('mousedown', onPointerDown);
    }, [open]);

    React.useEffect(() => {
        if (!open) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false);
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [open]);

    return (
        <div ref={rootRef} className={styles.root}>
            <button
                id={selectId}
                type="button"
                className={styles.trigger}
                aria-expanded={open}
                aria-haspopup="listbox"
                aria-label={`${itemName ?? 'Item'}${instanceLabel ?? ''}: ${group.label}`}
                onClick={() => setOpen((v) => !v)}
            >
                <span className={selected.length > 0 ? styles.triggerValue : styles.triggerPlaceholder}>
                    {triggerText}
                </span>
                <ChevronDown size={16} className={open ? styles.chevronOpen : styles.chevron} aria-hidden />
            </button>
            {open && (
                <div className={styles.panel} role="listbox" aria-multiselectable aria-label={group.label}>
                    <div className={styles.hint}>
                        Select up to {max} ({selected.length}/{max})
                    </div>
                    {sortedOptions.map((opt) => {
                        const count = selected.filter((s) => s === opt).length;
                        const checked = count > 0;
                        const disabled = !checked && atMax;
                        const canAddAnother = Boolean(onAddAnother) && checked && !atMax;
                        const canRemoveOne = Boolean(onRemoveOne) && checked;
                        const id = `${selectId ?? group.label}-${opt}`.replace(/\s+/g, '-');
                        return (
                            <div key={opt} className={styles.optionRow}>
                                <label className={styles.option} htmlFor={id}>
                                    <input
                                        id={id}
                                        type="checkbox"
                                        checked={checked}
                                        disabled={disabled}
                                        onChange={(e) => onToggle(opt, e.target.checked)}
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                    <span className={styles.optionLabel}>
                                        {opt}
                                        {count > 1 ? ` ×${count}` : ''}
                                    </span>
                                </label>
                                {showQtyControls && checked && (
                                    <div className={styles.qtyControls}>
                                        {canRemoveOne && (
                                            <button
                                                type="button"
                                                className={styles.qtyButton}
                                                aria-label={`Remove one ${opt}`}
                                                title={`Remove one ${opt}`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onRemoveOne?.(opt);
                                                }}
                                            >
                                                <Minus size={14} aria-hidden />
                                            </button>
                                        )}
                                        {canAddAnother && (
                                            <button
                                                type="button"
                                                className={styles.qtyButton}
                                                aria-label={`Add another ${opt}`}
                                                title={`Add another ${opt}`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onAddAnother?.(opt);
                                                }}
                                            >
                                                <Plus size={14} aria-hidden />
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

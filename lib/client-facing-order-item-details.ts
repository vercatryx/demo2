import type { MenuItemDropdownGroup } from '@/lib/types';
import {
    expandDropdownNoteToDeliveryLines,
    dropdownGroupsForDbMenuRow,
    nonemptyDropdownGroups,
} from '@/lib/menu-item-dropdowns';

function splitSemicolonNoteParts(notes: string): string[] {
    return notes.split(';').map((part) => part.trim()).filter(Boolean);
}

/**
 * Order-level `orders.notes` for display. Never returns raw JSON payloads
 * (e.g. equipment selection `{ vendorId, equipmentId, equipmentName, price }`).
 */
export function formatOrderLevelNotesForDisplay(notes: string | null | undefined): string | null {
    if (!notes || typeof notes !== 'string') return null;
    const trimmed = notes.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
            const parsed = JSON.parse(trimmed) as unknown;
            if (parsed !== null && typeof parsed === 'object') {
                return null;
            }
        } catch {
            // Not valid JSON — treat as freeform text.
        }
    }

    return trimmed;
}

/** Client-safe detail lines for one order item (dropdown-aware, like vendor Excel export). */
export function clientFacingOrderItemDetailLines(args: {
    itemName: string;
    quantity: number;
    note?: string | null;
    dropdownEnabled?: boolean;
    dropdownGroups?: MenuItemDropdownGroup[];
}): string[] {
    const note = (args.note ?? '').trim();
    if (!note) return [];

    // Never surface structured JSON blobs as item notes.
    if (note.startsWith('{') || note.startsWith('[')) {
        try {
            const parsed = JSON.parse(note) as unknown;
            if (parsed !== null && typeof parsed === 'object') {
                return [];
            }
        } catch {
            // fall through
        }
    }

    // Excel Client Breakdown: semicolon-separated segments each get their own row.
    if (note.includes(';')) {
        return splitSemicolonNoteParts(note);
    }

    const groups = nonemptyDropdownGroups(args.dropdownGroups ?? []);
    if (args.dropdownEnabled && groups.length > 0) {
        const expanded = expandDropdownNoteToDeliveryLines(
            note,
            groups,
            args.itemName,
            args.quantity,
        );
        if (expanded.length > 0) {
            return expanded.map((line) => line.description);
        }
    }

    return [note];
}

export type CatalogDropdownMeta = {
    dropdownEnabled?: boolean;
    dropdownGroups?: MenuItemDropdownGroup[];
};

export function catalogDropdownMetaFromMenuRow(row: {
    dropdown_enabled?: boolean | null;
    dropdown_options?: unknown;
}): CatalogDropdownMeta {
    return {
        dropdownEnabled: row.dropdown_enabled === true,
        dropdownGroups: dropdownGroupsForDbMenuRow({
            id: '',
            dropdown_enabled: row.dropdown_enabled,
            dropdown_options: row.dropdown_options,
        }),
    };
}

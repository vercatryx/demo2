import type { Vendor } from '@/lib/types';
import { sortWeekdays } from '@/lib/order-dates';

export function mergeDeliveryDayOrdersToVendorSelections(config: any): any[] {
    let existingSelections = config.vendorSelections ? [...config.vendorSelections] : [];
    if (existingSelections.length === 0 && config.deliveryDayOrders && typeof config.deliveryDayOrders === 'object') {
        const vendorMap = new Map<string, any>();
        for (const day of sortWeekdays(Object.keys(config.deliveryDayOrders))) {
            const dayOrder = config.deliveryDayOrders[day];
            const daySelections = dayOrder?.vendorSelections || [];
            for (const sel of daySelections) {
                if (!sel.vendorId) continue;
                if (!vendorMap.has(sel.vendorId)) {
                    vendorMap.set(sel.vendorId, {
                        vendorId: sel.vendorId,
                        selectedDeliveryDays: [],
                        itemsByDay: {},
                        itemNotesByDay: {},
                    });
                }
                const v = vendorMap.get(sel.vendorId)!;
                if (!v.selectedDeliveryDays.includes(day)) v.selectedDeliveryDays.push(day);
                v.itemsByDay[day] = sel.items || {};
                if (!v.itemNotesByDay) v.itemNotesByDay = {};
                v.itemNotesByDay[day] = sel.itemNotes || {};
            }
        }
        existingSelections = Array.from(vendorMap.values());
    }
    return existingSelections;
}

export function normalizeConfigForVendorEditing(config: any): any {
    const newConfig = { ...config };
    let selections = (config.vendorSelections || []).map((s: any) => ({ ...s }));

    if (config.deliveryDayOrders && typeof config.deliveryDayOrders === 'object') {
        for (const day of sortWeekdays(Object.keys(config.deliveryDayOrders))) {
            const daySelections = config.deliveryDayOrders[day]?.vendorSelections || [];
            for (const sel of daySelections) {
                if (!sel?.vendorId) continue;
                let idx = selections.findIndex((s: any) => s.vendorId === sel.vendorId);
                if (idx < 0) {
                    selections.push({
                        vendorId: sel.vendorId,
                        selectedDeliveryDays: [day],
                        itemsByDay: { [day]: sel.items || {} },
                        itemNotesByDay: { [day]: sel.itemNotes || {} },
                        items: {},
                        itemNotes: {},
                    });
                } else {
                    const block = { ...selections[idx] };
                    const days = [...(block.selectedDeliveryDays || [])];
                    if (!days.includes(day)) days.push(day);
                    block.selectedDeliveryDays = days;
                    block.itemsByDay = { ...(block.itemsByDay || {}), [day]: sel.items || {} };
                    block.itemNotesByDay = { ...(block.itemNotesByDay || {}), [day]: sel.itemNotes || {} };
                    selections[idx] = block;
                }
            }
        }
        delete newConfig.deliveryDayOrders;
    }

    newConfig.vendorSelections = selections;
    return newConfig;
}

export function createVendorSelectionPatch(vendors: Vendor[], vendorId: string, existing?: any): any {
    const vendor = vendors.find((v) => v.id === vendorId);
    const autoSelectDay = vendor?.deliveryDays?.length === 1 ? vendor.deliveryDays[0] : null;
    const vendorChanged = !existing?.vendorId || existing.vendorId !== vendorId;
    const hasExistingByDay =
        existing?.itemsByDay && typeof existing.itemsByDay === 'object' && Object.keys(existing.itemsByDay).length > 0;
    // When promoting flat items into a single auto day, migrate notes with them.
    const migratingFlatToDay = !vendorChanged && !!autoSelectDay && !hasExistingByDay;

    return {
        ...existing,
        vendorId,
        items: vendorChanged ? {} : migratingFlatToDay ? {} : (existing?.items || {}),
        itemsByDay: vendorChanged
            ? (autoSelectDay ? { [autoSelectDay]: {} } : {})
            : (hasExistingByDay
                ? existing.itemsByDay
                : (autoSelectDay ? { [autoSelectDay]: { ...(existing?.items || {}) } } : {})),
        itemNotes: vendorChanged ? {} : migratingFlatToDay ? {} : (existing?.itemNotes || {}),
        itemNotesByDay: vendorChanged
            ? {}
            : (existing?.itemNotesByDay && Object.keys(existing.itemNotesByDay).length > 0
                ? existing.itemNotesByDay
                : (migratingFlatToDay && autoSelectDay
                    ? { [autoSelectDay]: { ...(existing?.itemNotes || {}) } }
                    : (existing?.itemNotesByDay || {}))),
        selectedDeliveryDays: vendorChanged
            ? (autoSelectDay ? [autoSelectDay] : [])
            : (existing?.selectedDeliveryDays || (autoSelectDay ? [autoSelectDay] : [])),
    };
}

export function resolveVendorBlockForSearch(
    config: any,
    targetVendorId: string,
): { nextConfig: any; vendorIndex: number } {
    const normalized = normalizeConfigForVendorEditing(config);
    let selections = [...(normalized.vendorSelections || [])];

    let vendorIndex = selections.findIndex((s: any) => s.vendorId === targetVendorId);
    if (vendorIndex < 0) {
        const emptyIndex = selections.findIndex((s: any) => !s?.vendorId);
        if (emptyIndex >= 0) {
            vendorIndex = emptyIndex;
        } else {
            vendorIndex = selections.length;
            selections.push({ vendorId: '', items: {} });
        }
    }

    normalized.vendorSelections = selections;
    return { nextConfig: normalized, vendorIndex };
}

export function ensureVendorBlockIndex(
    config: any,
    vendors: Vendor[],
    vendorId: string,
): { nextConfig: any; blockIndex: number } {
    const normalized = normalizeConfigForVendorEditing(config);
    let selections = [...(normalized.vendorSelections || [])];
    let blockIndex = selections.findIndex((s: any) => s.vendorId === vendorId);
    if (blockIndex < 0) {
        const emptyIndex = selections.findIndex((s: any) => !s?.vendorId);
        if (emptyIndex >= 0) {
            selections[emptyIndex] = createVendorSelectionPatch(vendors, vendorId, selections[emptyIndex]);
            blockIndex = emptyIndex;
        } else {
            blockIndex = selections.length;
            selections.push(createVendorSelectionPatch(vendors, vendorId));
        }
    }
    normalized.vendorSelections = selections;
    return { nextConfig: normalized, blockIndex };
}

export function getVendorBlockIndex(config: any, vendorId: string): number {
    const selections = mergeDeliveryDayOrdersToVendorSelections(config);
    return selections.findIndex((s: any) => s.vendorId === vendorId);
}

export function getItemQtyFromVendorBlock(block: any, itemId: string, day?: string): number {
    if (!block) return 0;
    if (day && block.itemsByDay?.[day]) return Number(block.itemsByDay[day][itemId]) || 0;
    return Number(block.items?.[itemId]) || 0;
}

/** Prefer by-day note, then flat — empty by-day buckets should not hide flat notes. */
export function getItemNoteFromVendorBlock(block: any, itemId: string, day?: string): string {
    if (!block) return '';
    if (day && block.itemNotesByDay?.[day]) {
        const byDay = block.itemNotesByDay[day][itemId];
        if (typeof byDay === 'string' && byDay.trim()) return byDay;
    }
    const flat = block.itemNotes?.[itemId];
    return typeof flat === 'string' ? flat : '';
}

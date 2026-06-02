import { normalizeUpcomingOrder } from '@/lib/upcoming-order-converter';
import type { MessagingChannel, MessagingRecipient, RecipientFilter, ResolveRecipientsInput } from './types';

type UpcomingOrderLike = {
    serviceType?: string;
    vendorSelections?: Array<{ vendorId?: string; items?: Record<string, number>; itemsByDay?: Record<string, Record<string, number>> }>;
    deliveryDayOrders?: Record<string, { vendorSelections?: Array<{ vendorId?: string; items?: Record<string, number> }> }>;
    mealSelections?: Record<string, { vendorId?: string | null; items?: Record<string, number> }>;
    boxOrders?: Array<{ boxTypeId?: string; box_type_id?: string; items?: Record<string, number> }>;
    boxTypeId?: string;
};

type ClientRow = {
    id: string;
    full_name: string | null;
    email: string | null;
    phone_number: string | null;
    secondary_phone_number: string | null;
    upcoming_order: unknown;
    client_statuses: { name?: string } | { name?: string }[] | null;
};

function statusNameFromRow(row: ClientRow): string | null {
    const statusRow = row.client_statuses;
    if (Array.isArray(statusRow)) return statusRow[0]?.name ?? null;
    return statusRow?.name ?? null;
}

function isApprovedStatus(name: string | null): boolean {
    return (name ?? '').trim().toLowerCase() === 'approved';
}

function vendorIdsInOrder(uo: UpcomingOrderLike): Set<string> {
    const ids = new Set<string>();
    const normalized = normalizeUpcomingOrder(uo as any) as UpcomingOrderLike | null;
    const vendorSelections = normalized?.vendorSelections ?? uo.vendorSelections ?? [];

    for (const vs of vendorSelections) {
        if (vs.vendorId) ids.add(vs.vendorId);
    }

    if (uo.deliveryDayOrders) {
        for (const dayData of Object.values(uo.deliveryDayOrders)) {
            for (const vs of dayData?.vendorSelections ?? []) {
                if (vs.vendorId) ids.add(vs.vendorId);
            }
        }
    }

    if (uo.mealSelections) {
        for (const sel of Object.values(uo.mealSelections)) {
            if (sel.vendorId) ids.add(sel.vendorId);
        }
    }

    return ids;
}

function foodItemIdsInOrder(uo: UpcomingOrderLike): Set<string> {
    const found = new Set<string>();
    const normalized = normalizeUpcomingOrder(uo as any) as UpcomingOrderLike | null;
    const vendorSelections = normalized?.vendorSelections ?? uo.vendorSelections ?? [];

    function collectFromItems(items: Record<string, number> | undefined) {
        if (!items) return;
        for (const [itemId, qty] of Object.entries(items)) {
            if (Number(qty) > 0) found.add(itemId);
        }
    }

    for (const vs of vendorSelections) {
        collectFromItems(vs.items);
        if (vs.itemsByDay) {
            for (const dayItems of Object.values(vs.itemsByDay)) {
                collectFromItems(dayItems);
            }
        }
    }

    if (uo.deliveryDayOrders) {
        for (const dayData of Object.values(uo.deliveryDayOrders)) {
            for (const vs of dayData?.vendorSelections ?? []) {
                collectFromItems(vs.items);
            }
        }
    }

    if (uo.mealSelections) {
        for (const sel of Object.values(uo.mealSelections)) {
            collectFromItems(sel.items);
        }
    }

    return found;
}

function boxItemIdsInOrder(uo: UpcomingOrderLike): Set<string> {
    const found = new Set<string>();
    for (const box of uo.boxOrders ?? []) {
        const items = box.items;
        if (!items || typeof items !== 'object') continue;
        for (const [itemId, qty] of Object.entries(items)) {
            if (Number(qty) > 0) found.add(itemId);
        }
    }
    return found;
}

function matchesFilter(uo: UpcomingOrderLike | null, filter: RecipientFilter): boolean {
    if (filter.mode === 'everyone') return true;
    if (!uo) return filter.mode === 'manual';

    if (filter.mode === 'vendor') {
        const vendorIds = new Set(filter.vendorIds);
        if (vendorIds.size === 0) return false;
        const inOrder = vendorIdsInOrder(uo);
        for (const id of vendorIds) {
            if (inOrder.has(id)) return true;
        }
        return false;
    }

    if (filter.mode === 'foodItem') {
        const targetIds = new Set(filter.itemIds);
        if (targetIds.size === 0) return false;
        const inOrder = foodItemIdsInOrder(uo);
        for (const id of targetIds) {
            if (inOrder.has(id)) return true;
        }
        return false;
    }

    if (filter.mode === 'boxItem') {
        const targetIds = new Set(filter.itemIds);
        if (targetIds.size === 0) return false;
        const inOrder = boxItemIdsInOrder(uo);
        for (const id of targetIds) {
            if (inOrder.has(id)) return true;
        }
        return false;
    }

    return false;
}

function primaryPhone(row: ClientRow): string | null {
    const primary = row.phone_number?.trim();
    if (primary) return primary;
    return row.secondary_phone_number?.trim() || null;
}

function buildRecipient(row: ClientRow, channel: MessagingChannel): MessagingRecipient {
    const fullName = row.full_name?.trim() || row.id;
    const email = row.email?.trim() || null;
    const phone = primaryPhone(row);
    const statusName = statusNameFromRow(row);

    let canSend = false;
    let skipReason: string | undefined;

    if (channel === 'email') {
        if (email) canSend = true;
        else skipReason = 'No email on file';
    } else {
        // sms and call both use phone
        if (phone) canSend = true;
        else skipReason = 'No phone on file';
    }

    return {
        clientId: row.id,
        fullName,
        email,
        phone,
        statusName,
        canSend,
        skipReason,
    };
}

export function resolveRecipientsFromClients(
    clients: ClientRow[],
    input: ResolveRecipientsInput
): MessagingRecipient[] {
    const { channel, filter, approvedOnly = true } = input;
    const manualIds = filter.mode === 'manual' ? new Set(filter.clientIds) : null;

    const recipients: MessagingRecipient[] = [];

    for (const client of clients) {
        const statusName = statusNameFromRow(client);
        if (approvedOnly && !isApprovedStatus(statusName)) continue;

        if (manualIds) {
            if (!manualIds.has(client.id)) continue;
        } else if (!matchesFilter(client.upcoming_order as UpcomingOrderLike | null, filter)) {
            continue;
        }

        recipients.push(buildRecipient(client, channel));
    }

    recipients.sort((a, b) => a.clientId.localeCompare(b.clientId));
    return recipients;
}

export function resolveSingleRecipient(
    client: ClientRow,
    channel: MessagingChannel
): MessagingRecipient {
    return buildRecipient(client, channel);
}

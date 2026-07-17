/** Where an upcoming-order change was saved from (used for portal save provenance). */
export const ORDER_HISTORY_SOURCES = [
    'admin',
    'portal',
    'sms',
    'ivr',
    'system',
    'restore',
] as const;

export type OrderHistorySource = (typeof ORDER_HISTORY_SOURCES)[number];

/**
 * Portal autosave / rapid saves: within this window, replace the latest history row
 * instead of appending another.
 */
export const PORTAL_ORDER_HISTORY_COALESCE_MS = 15 * 60 * 1000;

export function isOrderHistorySource(value: unknown): value is OrderHistorySource {
    return typeof value === 'string' && (ORDER_HISTORY_SOURCES as readonly string[]).includes(value);
}

/** Human-readable label for admin UI / reports. */
export function orderHistorySourceLabel(source: unknown): string {
    switch (source) {
        case 'admin':
            return 'Admin';
        case 'portal':
            return 'Client portal';
        case 'sms':
            return 'SMS';
        case 'ivr':
            return 'IVR (phone)';
        case 'system':
            return 'System';
        case 'restore':
            return 'History restore';
        default:
            return typeof source === 'string' && source.trim() ? source.trim() : 'Unknown';
    }
}

/**
 * Infer source from legacy entries that only set updatedBy / summary
 * (before savedFrom was written explicitly).
 */
export function inferOrderHistorySource(entry: {
    savedFrom?: unknown;
    source?: unknown;
    updatedBy?: unknown;
    summary?: unknown;
    details?: unknown;
}): OrderHistorySource | null {
    if (isOrderHistorySource(entry.savedFrom)) return entry.savedFrom;
    if (isOrderHistorySource(entry.source)) return entry.source;

    const who = String(entry.updatedBy ?? '').toLowerCase();
    const summary = `${entry.summary ?? ''} ${entry.details ?? ''}`.toLowerCase();

    if (who.includes('sms') || summary.includes('sms')) return 'sms';
    if (who.includes('ivr') || summary.includes('ivr') || summary.includes('phone')) return 'ivr';
    if (who.includes('portal') || summary.includes('portal')) return 'portal';
    if (who.includes('restore') || summary.includes('restore')) return 'restore';
    if (who.includes('admin') || who.includes('navigator') || who.includes('system')) return 'admin';
    if (who.trim()) return 'admin';
    return null;
}

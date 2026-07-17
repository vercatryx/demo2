/**
 * demo-food keeps `clients.service_type` as a real column (unlike Triangle, which
 * derives it solely from `upcoming_order.serviceType` JSON). Accept either a full
 * client row (`{ service_type, upcoming_order }`) or a bare `upcoming_order` value
 * for backward compatibility with Triangle-style call sites, and prefer the column
 * when present.
 */
export function getClientServiceType(input: unknown): string {
    if (!input || typeof input !== 'object') return '';
    const obj = input as Record<string, unknown>;

    if (typeof obj.service_type === 'string' && obj.service_type.trim() !== '') {
        return obj.service_type.trim();
    }

    const upcomingOrder =
        obj.upcoming_order && typeof obj.upcoming_order === 'object'
            ? (obj.upcoming_order as Record<string, unknown>)
            : obj;
    const st = upcomingOrder.serviceType ?? upcomingOrder.service_type;
    if (typeof st === 'string' && st.trim() !== '') return st.trim();
    return '';
}

/** Prefer upcoming_order JSON (source of truth), then in-form edit, then mapped client field. */
export function resolveEffectiveServiceType(options: {
    editingServiceType?: string | null;
    upcomingOrder?: unknown;
    fallbackServiceType?: string | null;
}): string {
    const fromOrder = getClientServiceType(options.upcomingOrder);
    if (fromOrder) return fromOrder;
    if (options.editingServiceType?.trim()) return options.editingServiceType.trim();
    return options.fallbackServiceType?.trim() ?? '';
}

export function withUpcomingOrderServiceType(
    upcomingOrder: unknown,
    serviceType: string,
): Record<string, unknown> {
    const base =
        upcomingOrder && typeof upcomingOrder === 'object'
            ? { ...(upcomingOrder as Record<string, unknown>) }
            : {};
    if (serviceType.trim()) base.serviceType = serviceType.trim();
    return base;
}

/** Legacy NOT NULL column — mirror upcoming_order JSON until the column is dropped. */
export function legacyClientServiceTypeColumn(upcomingOrder: unknown, fallback = 'Food'): string {
    return getClientServiceType(upcomingOrder) || fallback;
}

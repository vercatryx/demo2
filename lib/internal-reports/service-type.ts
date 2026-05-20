/** Effective service type from clients row (matches portal / extension logic). */
export function effectiveServiceType(client: { upcoming_order?: unknown; service_type?: string }): string {
    const uo = client.upcoming_order;
    if (uo && typeof uo === 'object') {
        const st = (uo as Record<string, unknown>).serviceType;
        if (typeof st === 'string' && st.trim()) return st;
    }
    return client.service_type?.trim() ?? '';
}

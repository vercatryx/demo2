/** Empty upcoming-order shape for the client portal, preserving case id and service type. */
export function buildEmptyPortalOrderConfig(prev: Record<string, unknown> | null | undefined, serviceType: string) {
    const base: Record<string, unknown> = {
        serviceType,
        caseId: prev?.caseId,
        notes: prev?.notes ?? null,
    };

    if (serviceType === 'Boxes') {
        return {
            ...base,
            boxOrders: [],
        };
    }

    return {
        ...base,
        vendorSelections: [],
        mealSelections: {},
    };
}

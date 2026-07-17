/** Service-type buckets for household linking and portal account switching. */

export type HouseholdLinkBucket = 'food' | 'boxes' | 'custom' | 'equipment';

const BUCKET_LABELS: Record<HouseholdLinkBucket, string> = {
    food: 'Food/Meal',
    boxes: 'Boxes',
    custom: 'Custom',
    equipment: 'Equipment',
};

/** Map client service_type to a link bucket. Food and Meal may link together. */
export function getHouseholdLinkBucket(serviceType: string | null | undefined): HouseholdLinkBucket | null {
    const normalized = (serviceType || '').trim();
    switch (normalized) {
        case 'Food':
        case 'Meal':
            return 'food';
        case 'Boxes':
            return 'boxes';
        case 'Custom':
            return 'custom';
        case 'Equipment':
            return 'equipment';
        default:
            return null;
    }
}

export function areHouseholdServiceTypesCompatible(
    a: string | null | undefined,
    b: string | null | undefined,
): boolean {
    const bucketA = getHouseholdLinkBucket(a);
    const bucketB = getHouseholdLinkBucket(b);
    if (!bucketA || !bucketB) return false;
    return bucketA === bucketB;
}

export function householdLinkBucketLabel(serviceType: string | null | undefined): string {
    const bucket = getHouseholdLinkBucket(serviceType);
    if (!bucket) return serviceType?.trim() || 'Unknown';
    return BUCKET_LABELS[bucket];
}

export function householdLinkIncompatibilityMessage(
    typeA: string | null | undefined,
    typeB: string | null | undefined,
): string {
    const labelA = householdLinkBucketLabel(typeA);
    const labelB = householdLinkBucketLabel(typeB);
    return `Cannot link ${labelA} with ${labelB}. Linked accounts must share the same service type — Food/Meal with Food/Meal, Boxes with Boxes, Custom with Custom, or Equipment with Equipment. Food, Boxes, and Custom cannot be mixed.`;
}

export function validateHouseholdServiceTypes(
    serviceTypes: Array<string | null | undefined>,
): { ok: true } | { ok: false; message: string } {
    const buckets = new Set<HouseholdLinkBucket>();
    for (const serviceType of serviceTypes) {
        const bucket = getHouseholdLinkBucket(serviceType);
        if (!bucket) {
            return {
                ok: false,
                message: `Cannot link clients with service type "${serviceType?.trim() || 'Unknown'}".`,
            };
        }
        buckets.add(bucket);
    }
    if (buckets.size <= 1) {
        return { ok: true };
    }
    const labels = [...new Set(serviceTypes.map((t) => householdLinkBucketLabel(t)))];
    return {
        ok: false,
        message: `Cannot link mixed service types (${labels.join(', ')}). Food/Meal, Boxes, Custom, and Equipment must each stay in their own group.`,
    };
}

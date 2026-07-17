import { filterCatalogHitsByQuery, normalizeSearchText } from '@/lib/catalog-search-utils';
import type { MenuItem, Vendor } from '@/lib/types';

export type FoodCatalogSearchHit = {
    itemId: string;
    vendorId: string;
    vendorName: string;
    itemNumber: number | null;
    label: string;
    tokens: string;
};

function vendorLookupKey(vendorId: string | null | undefined): string {
    return String(vendorId ?? '').trim().toLowerCase();
}

function buildVendorNameById(vendors: Vendor[]): Map<string, string> {
    const vendorNameById = new Map<string, string>();
    for (const vendor of vendors) {
        const key = vendorLookupKey(vendor.id);
        if (!key) continue;
        vendorNameById.set(key, vendor.name);
    }
    return vendorNameById;
}

/** Searchable food vendor menu items across all vendors. */
export function buildFoodCatalogSearchHits(
    menuItems: MenuItem[],
    vendors: Vendor[],
    options?: {
        hidePhaseoutUnlessOnOrder?: boolean;
        selectedItemIds?: Set<string>;
    },
): FoodCatalogSearchHit[] {
    const vendorNameById = buildVendorNameById(vendors);
    const hits: FoodCatalogSearchHit[] = [];
    const hidePhaseout = options?.hidePhaseoutUnlessOnOrder === true;
    const selectedIds = options?.selectedItemIds ?? new Set<string>();

    for (const item of menuItems) {
        if (item.isActive === false) continue;
        if (hidePhaseout && item.phaseout === true && !selectedIds.has(item.id)) continue;
        if (!item.vendorId) continue;

        const vendorName = vendorNameById.get(vendorLookupKey(item.vendorId)) ?? 'Unknown vendor';
        const idBits: string[] = [item.id];
        if (item.itemNumber != null) idBits.push(String(item.itemNumber));
        if (item.uspId) idBits.push(item.uspId);

        const labelParts: string[] = [];
        if (item.itemNumber != null) labelParts.push(`Item#${item.itemNumber}`);
        labelParts.push(item.name);
        labelParts.push(vendorName);

        hits.push({
            itemId: item.id,
            vendorId: item.vendorId,
            vendorName,
            itemNumber: item.itemNumber ?? null,
            label: labelParts.join(' · '),
            tokens: normalizeSearchText(
                item.name,
                vendorName,
                item.itemNumber != null ? `item#${item.itemNumber}` : '',
                ...idBits,
                item.itemNumber,
            ),
        });
    }

    return hits;
}

export function filterFoodCatalogSearchHits(
    hits: FoodCatalogSearchHit[],
    query: string,
    limit = 24,
): FoodCatalogSearchHit[] {
    return filterCatalogHitsByQuery(hits, query, limit);
}

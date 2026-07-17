import type { MenuItem } from '@/lib/types';

export type PortalFeaturedItems = {
    food: Record<string, string>;
    box: Record<string, string>;
};

/** Admin-defined section titles — food and boxes each have their own list. */
export type PortalFeaturedSectionNames = {
    food: string[];
    box: string[];
};

export type PortalFeaturedSection = {
    title: string;
    items: MenuItem[];
};

const LEGACY_SECTION_TITLE = 'Featured items';

export function normalizePortalFeaturedSection(section: string): string {
    return section.trim().toLowerCase();
}

function parseSectionNameList(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const names: string[] = [];
    for (const entry of raw) {
        if (typeof entry !== 'string') continue;
        const trimmed = entry.trim();
        if (!trimmed) continue;
        const key = normalizePortalFeaturedSection(trimmed);
        if (seen.has(key)) continue;
        seen.add(key);
        names.push(trimmed);
    }
    return names;
}

export function parsePortalFeaturedSectionNames(raw: unknown): PortalFeaturedSectionNames {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return { food: [], box: [] };
    }
    const row = raw as Record<string, unknown>;
    return {
        food: parseSectionNameList(row.food),
        box: parseSectionNameList(row.box),
    };
}

export function portalFeaturedSectionOptions(
    presets: string[],
    currentValue?: string | null,
): string[] {
    const options = [...presets];
    const trimmed = currentValue?.trim();
    if (!trimmed) return options;
    const key = normalizePortalFeaturedSection(trimmed);
    if (!options.some((name) => normalizePortalFeaturedSection(name) === key)) {
        options.unshift(trimmed);
    }
    return options;
}

function parseSectionMap(raw: unknown): Record<string, string> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const map: Record<string, string> = {};
    for (const [itemId, section] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof itemId !== 'string' || typeof section !== 'string') continue;
        const trimmed = section.trim();
        if (trimmed) map[itemId] = trimmed;
    }
    return map;
}

function legacyIdsToMap(ids: unknown): Record<string, string> {
    if (!Array.isArray(ids)) return {};
    const map: Record<string, string> = {};
    for (const id of ids) {
        if (typeof id === 'string') map[id] = LEGACY_SECTION_TITLE;
    }
    return map;
}

export function parsePortalFeaturedItems(raw: unknown): PortalFeaturedItems {
    if (!raw || typeof raw !== 'object') {
        return { food: {}, box: {} };
    }
    const featured = raw as Record<string, unknown>;

    if (
        (featured.food && typeof featured.food === 'object' && !Array.isArray(featured.food)) ||
        (featured.box && typeof featured.box === 'object' && !Array.isArray(featured.box))
    ) {
        return {
            food: parseSectionMap(featured.food),
            box: parseSectionMap(featured.box),
        };
    }

    return {
        food: legacyIdsToMap(featured.foodItemIds),
        box: legacyIdsToMap(featured.boxItemIds),
    };
}

export function isFoodMenuItem(vendorId: string | null | undefined): boolean {
    return !!vendorId;
}

export function enrichMenuItemsWithPortalFeatured(
    items: MenuItem[],
    featured: PortalFeaturedItems,
): MenuItem[] {
    return items.map((item) => ({
        ...item,
        portalFeaturedSection: isFoodMenuItem(item.vendorId)
            ? featured.food[item.id] ?? null
            : featured.box[item.id] ?? null,
    }));
}

export function applyPortalFeaturedSection(
    current: PortalFeaturedItems,
    itemId: string,
    section: string | null | undefined,
    isFood: boolean,
): PortalFeaturedItems {
    const key = isFood ? 'food' : 'box';
    const otherKey = isFood ? 'box' : 'food';
    const nextMap = { ...current[key] };
    const otherMap = { ...current[otherKey] };
    delete otherMap[itemId];

    const trimmed = section?.trim();
    if (trimmed) {
        delete nextMap[itemId];
        nextMap[itemId] = trimmed;
    } else {
        delete nextMap[itemId];
    }

    return {
        food: isFood ? nextMap : otherMap,
        box: isFood ? otherMap : nextMap,
    };
}

export function buildPortalFeaturedSections(
    menuItems: MenuItem[],
    featured: PortalFeaturedItems,
    mode: 'food' | 'boxes',
    sectionNames?: PortalFeaturedSectionNames,
): PortalFeaturedSection[] {
    const assignmentMap = mode === 'food' ? featured.food : featured.box;
    const presetOrder = mode === 'food' ? (sectionNames?.food ?? []) : (sectionNames?.box ?? []);
    const itemById = new Map(menuItems.map((m) => [m.id, m]));

    const sectionTitles = new Map<string, string>();
    const sectionItemIds = new Map<string, string[]>();

    for (const [itemId, sectionLabel] of Object.entries(assignmentMap)) {
        const trimmed = sectionLabel?.trim();
        if (!trimmed) continue;
        const key = normalizePortalFeaturedSection(trimmed);
        if (!sectionTitles.has(key)) {
            sectionTitles.set(key, trimmed);
            sectionItemIds.set(key, []);
        }
        sectionItemIds.get(key)!.push(itemId);
    }

    const presetKeys = presetOrder.map((name) => normalizePortalFeaturedSection(name));
    const orderedKeys: string[] = [];
    for (const key of presetKeys) {
        if (sectionTitles.has(key) && !orderedKeys.includes(key)) {
            orderedKeys.push(key);
        }
    }
    for (const key of sectionTitles.keys()) {
        if (!orderedKeys.includes(key)) orderedKeys.push(key);
    }

    return orderedKeys
        .map((key) => ({
            title: sectionTitles.get(key)!,
            items: (sectionItemIds.get(key) ?? [])
                .map((id) => itemById.get(id))
                .filter((m): m is MenuItem => !!m && m.isActive !== false),
        }))
        .filter((section) => section.items.length > 0);
}

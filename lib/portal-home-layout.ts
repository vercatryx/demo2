import type { PortalFeaturedSection } from './portal-featured-items';
import { normalizePortalFeaturedSection } from './portal-featured-items';
import {
    getInfoBlockBodyForMode,
    isPortalHomeInfoBlock,
    isPortalHomePromoBlock,
    type PortalHomeBlock,
} from './portal-home-blocks';

export type PortalHomeLayoutEntry =
    | { kind: 'info'; blockId: string }
    | { kind: 'promo'; blockId: string }
    | { kind: 'featured'; sectionKey: string }
    | { kind: 'recent_orders' };

export const PORTAL_HOME_RECENT_ORDERS_ENTRY: PortalHomeLayoutEntry = { kind: 'recent_orders' };

export type PortalHomeLayoutOrder = {
    food: PortalHomeLayoutEntry[];
    boxes: PortalHomeLayoutEntry[];
};

export type PortalHomeContentRow =
    | { kind: 'info'; block: PortalHomeBlock }
    | { kind: 'promo'; block: PortalHomeBlock }
    | { kind: 'featured'; section: PortalFeaturedSection }
    | { kind: 'recent_orders' };

export function layoutEntryKey(entry: PortalHomeLayoutEntry): string {
    if (entry.kind === 'featured') return `featured:${entry.sectionKey}`;
    if (entry.kind === 'recent_orders') return 'recent_orders';
    return `${entry.kind}:${entry.blockId}`;
}

function parseEntry(raw: unknown): PortalHomeLayoutEntry | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const row = raw as Record<string, unknown>;
    if (row.kind === 'info' && typeof row.blockId === 'string' && row.blockId.trim()) {
        return { kind: 'info', blockId: row.blockId.trim() };
    }
    if (row.kind === 'promo' && typeof row.blockId === 'string' && row.blockId.trim()) {
        return { kind: 'promo', blockId: row.blockId.trim() };
    }
    if (row.kind === 'featured' && typeof row.sectionKey === 'string' && row.sectionKey.trim()) {
        return { kind: 'featured', sectionKey: normalizePortalFeaturedSection(row.sectionKey) };
    }
    if (row.kind === 'recent_orders') {
        return PORTAL_HOME_RECENT_ORDERS_ENTRY;
    }
    return null;
}

function parseEntryList(raw: unknown): PortalHomeLayoutEntry[] {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const entries: PortalHomeLayoutEntry[] = [];
    for (const item of raw) {
        const entry = parseEntry(item);
        if (!entry) continue;
        const key = layoutEntryKey(entry);
        if (seen.has(key)) continue;
        seen.add(key);
        entries.push(entry);
    }
    return entries;
}

export function parsePortalHomeLayoutOrder(raw: unknown): PortalHomeLayoutOrder {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return { food: [], boxes: [] };
    }
    const row = raw as Record<string, unknown>;
    return {
        food: parseEntryList(row.food),
        boxes: parseEntryList(row.boxes ?? row.box),
    };
}

function infoBlocksForMode(blocks: PortalHomeBlock[], mode: 'food' | 'boxes'): PortalHomeBlock[] {
    return blocks
        .filter(
            (block) =>
                isPortalHomeInfoBlock(block) &&
                block.isActive &&
                !!getInfoBlockBodyForMode(block, mode).trim(),
        )
        .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
}

function promoBlocksForMode(blocks: PortalHomeBlock[], mode: 'food' | 'boxes'): PortalHomeBlock[] {
    return blocks
        .filter(
            (block) =>
                isPortalHomePromoBlock(block) &&
                block.isActive &&
                (block.audience === 'both' || block.audience === mode),
        )
        .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
}

/** Keep saved order, drop stale entries, prepend missing info boxes, append new promo/featured items. */
export function syncPortalHomeLayoutOrder(
    order: PortalHomeLayoutEntry[],
    blocks: PortalHomeBlock[],
    sectionNames: string[],
    mode: 'food' | 'boxes',
): PortalHomeLayoutEntry[] {
    const infoBlocks = infoBlocksForMode(blocks, mode);
    const promoBlocks = promoBlocksForMode(blocks, mode);
    const infoIds = new Set(infoBlocks.map((block) => block.id));
    const promoIds = new Set(promoBlocks.map((block) => block.id));
    const sectionKeys = new Set(sectionNames.map((name) => normalizePortalFeaturedSection(name)));

    const kept: PortalHomeLayoutEntry[] = [];
    const keptInfoIds = new Set<string>();
    const keptPromoIds = new Set<string>();
    const keptSectionKeys = new Set<string>();
    let keptRecentOrders = false;

    for (const entry of order) {
        if (entry.kind === 'info') {
            if (!infoIds.has(entry.blockId) || keptInfoIds.has(entry.blockId)) continue;
            keptInfoIds.add(entry.blockId);
            kept.push(entry);
            continue;
        }
        if (entry.kind === 'promo') {
            if (!promoIds.has(entry.blockId) || keptPromoIds.has(entry.blockId)) continue;
            keptPromoIds.add(entry.blockId);
            kept.push(entry);
            continue;
        }
        if (entry.kind === 'recent_orders') {
            if (keptRecentOrders) continue;
            keptRecentOrders = true;
            kept.push(PORTAL_HOME_RECENT_ORDERS_ENTRY);
            continue;
        }
        if (!sectionKeys.has(entry.sectionKey) || keptSectionKeys.has(entry.sectionKey)) continue;
        keptSectionKeys.add(entry.sectionKey);
        kept.push(entry);
    }

    const missingInfo: PortalHomeLayoutEntry[] = [];
    for (const block of infoBlocks) {
        if (!keptInfoIds.has(block.id)) {
            missingInfo.push({ kind: 'info', blockId: block.id });
        }
    }

    for (const block of promoBlocks) {
        if (!keptPromoIds.has(block.id)) {
            kept.push({ kind: 'promo', blockId: block.id });
        }
    }

    for (const name of sectionNames) {
        const key = normalizePortalFeaturedSection(name);
        if (!keptSectionKeys.has(key)) {
            kept.push({ kind: 'featured', sectionKey: key });
        }
    }

    const hasInfoInSavedOrder = order.some((entry) => entry.kind === 'info');
    const withInfo =
        !hasInfoInSavedOrder && missingInfo.length > 0 ? [...missingInfo, ...kept] : [...kept, ...missingInfo];

    if (!keptRecentOrders) {
        withInfo.push(PORTAL_HOME_RECENT_ORDERS_ENTRY);
    }

    return withInfo;
}

export function defaultPortalHomeLayoutOrder(
    blocks: PortalHomeBlock[],
    sectionNames: string[],
    mode: 'food' | 'boxes',
): PortalHomeLayoutEntry[] {
    const entries: PortalHomeLayoutEntry[] = infoBlocksForMode(blocks, mode).map((block) => ({
        kind: 'info',
        blockId: block.id,
    }));
    for (const block of promoBlocksForMode(blocks, mode)) {
        entries.push({ kind: 'promo', blockId: block.id });
    }
    for (const name of sectionNames) {
        const key = normalizePortalFeaturedSection(name);
        if (!key) continue;
        entries.push({ kind: 'featured', sectionKey: key });
    }
    entries.push(PORTAL_HOME_RECENT_ORDERS_ENTRY);
    return entries;
}

export function buildPortalHomeContentRows(
    blocks: PortalHomeBlock[],
    featuredSections: PortalFeaturedSection[],
    layoutOrder: PortalHomeLayoutOrder | undefined,
    mode: 'food' | 'boxes',
    sectionNames: string[],
): PortalHomeContentRow[] {
    const infoBlocks = infoBlocksForMode(blocks, mode);
    const promoBlocks = promoBlocksForMode(blocks, mode);
    const infoById = new Map(infoBlocks.map((block) => [block.id, block]));
    const promoById = new Map(promoBlocks.map((block) => [block.id, block]));
    const featuredByKey = new Map(
        featuredSections.map((section) => [normalizePortalFeaturedSection(section.title), section]),
    );

    const savedOrder = mode === 'food' ? layoutOrder?.food : layoutOrder?.boxes;
    const order =
        savedOrder && savedOrder.length > 0
            ? syncPortalHomeLayoutOrder(savedOrder, blocks, sectionNames, mode)
            : defaultPortalHomeLayoutOrder(blocks, sectionNames, mode);

    const rows: PortalHomeContentRow[] = [];
    for (const entry of order) {
        if (entry.kind === 'info') {
            const block = infoById.get(entry.blockId);
            if (block) rows.push({ kind: 'info', block });
            continue;
        }
        if (entry.kind === 'promo') {
            const block = promoById.get(entry.blockId);
            if (block) rows.push({ kind: 'promo', block });
            continue;
        }
        if (entry.kind === 'recent_orders') {
            rows.push({ kind: 'recent_orders' });
            continue;
        }
        const section = featuredByKey.get(entry.sectionKey);
        if (section && section.items.length > 0) {
            rows.push({ kind: 'featured', section });
        }
    }
    return rows;
}

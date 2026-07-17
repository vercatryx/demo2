export type PortalHomeBlockType = 'promo' | 'info';

export type PortalHomeBlockImageLayout = 'none' | 'background' | 'side';

export type PortalHomeBlockLinkType = 'none' | 'vendor' | 'category' | 'product' | 'url';

export type PortalHomeBlockAudience = 'food' | 'boxes' | 'both';

/** Side image frame (width / height) — matches portal card CSS. */
export const PORTAL_HOME_SIDE_IMAGE_ASPECT = 4 / 3;
/** Full-background banner frame (width / height) — matches portal card CSS. */
export const PORTAL_HOME_BACKGROUND_IMAGE_ASPECT = 16 / 9;

export function getPortalHomeImageAspect(layout: PortalHomeBlockImageLayout): number {
    return layout === 'background'
        ? PORTAL_HOME_BACKGROUND_IMAGE_ASPECT
        : PORTAL_HOME_SIDE_IMAGE_ASPECT;
}

export function getPortalHomeImageAspectLabel(layout: PortalHomeBlockImageLayout): string {
    return layout === 'background' ? '16:9' : '4:3';
}

/** One screen of content inside a promo block (used when cycling multiple promos). */
export type PortalHomePromoSlide = {
    id: string;
    title: string;
    subtitle?: string;
    body?: string;
    imageUrl?: string | null;
    imageLayout: PortalHomeBlockImageLayout;
    linkType: PortalHomeBlockLinkType;
    linkVendorId?: string | null;
    linkCategoryId?: string | null;
    linkMenuItemId?: string | null;
    linkUrl?: string | null;
    linkOpenInNewTab?: boolean;
    ctaLabel?: string;
};

export type PortalHomePromoLinkTarget = Pick<
    PortalHomePromoSlide,
    | 'linkType'
    | 'linkVendorId'
    | 'linkCategoryId'
    | 'linkMenuItemId'
    | 'linkUrl'
    | 'linkOpenInNewTab'
>;

export const DEFAULT_PROMO_SLIDE_DURATION_SECONDS = 5;
export const DEFAULT_PROMO_SLIDE_TRANSITION_MS = 400;

export type PortalHomeBlock = {
    id: string;
    /** Promo = card with optional image/link. Info = plain text in the “How to use it” area. */
    blockType: PortalHomeBlockType;
    /** Admin list label; shown on portal for promo blocks only. */
    title: string;
    subtitle?: string;
    /** Promo block body copy */
    body?: string;
    /** Info box: separate copy per portal (no headline on either) */
    infoBodyFood?: string;
    infoBodyBoxes?: string;
    /** Info box: show Triangle Square logo above the Markdown body */
    infoShowLogo?: boolean;
    imageUrl?: string | null;
    imageLayout: PortalHomeBlockImageLayout;
    linkType: PortalHomeBlockLinkType;
    linkVendorId?: string | null;
    linkCategoryId?: string | null;
    linkMenuItemId?: string | null;
    linkUrl?: string | null;
    linkOpenInNewTab?: boolean;
    ctaLabel?: string;
    audience: PortalHomeBlockAudience;
    sortOrder: number;
    isActive: boolean;
    /** Extra slides beyond the first; when 2+ total, the block cycles in place on the portal. */
    promoSlides?: PortalHomePromoSlide[];
    /** Seconds each slide stays visible before advancing (default 5). */
    slideDurationSeconds?: number;
    /** Crossfade duration in ms (default 400). */
    slideTransitionMs?: number;
};

export function createEmptyPortalHomeBlock(
    sortOrder: number,
    blockType: PortalHomeBlockType = 'promo',
): PortalHomeBlock {
    return {
        id: crypto.randomUUID(),
        blockType,
        title: blockType === 'info' ? 'Info box' : '',
        subtitle: '',
        body: '',
        infoBodyFood: blockType === 'info' ? DEFAULT_INFO_BODY_FOOD : '',
        infoBodyBoxes: blockType === 'info' ? DEFAULT_INFO_BODY_BOXES : '',
        infoShowLogo: false,
        imageUrl: null,
        imageLayout: 'side',
        linkType: 'none',
        linkVendorId: null,
        linkCategoryId: null,
        linkMenuItemId: null,
        linkUrl: null,
        linkOpenInNewTab: false,
        ctaLabel: 'Learn more',
        audience: 'both',
        sortOrder,
        isActive: true,
    };
}

export function getInfoBlockBodyForMode(
    block: PortalHomeBlock,
    mode: 'food' | 'boxes',
): string {
    if (!isPortalHomeInfoBlock(block)) return '';
    return mode === 'food' ? block.infoBodyFood?.trim() ?? '' : block.infoBodyBoxes?.trim() ?? '';
}

export function infoBlockHasAnyBody(block: PortalHomeBlock): boolean {
    return !!(block.infoBodyFood?.trim() || block.infoBodyBoxes?.trim());
}

/** Starter “How to use it” copy — boxes portal (Markdown). */
export const DEFAULT_INFO_BODY_BOXES = `1. **Home** is always at the top of the list on the left — come back here anytime. Pick a **category** below it to browse items and add them to your box. Your cart stays open on the right.

2. Each category has a **point limit**. The category list on the left shows points used; when you open a category, a bar at the top tracks that category's points. Warnings also appear under your cart if you go over a limit.

3. There is no Save button — your order **saves automatically** as you go. Check under your cart for status updates.

4. Changes for next week must be in by **Tuesday 11:59 PM**.

### Two ways to fill your box

- **Food Box** — choose only your protein; the rest is pre-selected for you.
- **Build your own** — pick each item yourself.

*You can't combine both options in one box.*`;

/** Starter “How to use it” copy — food portal (Markdown). */
export const DEFAULT_INFO_BODY_FOOD = `1. **Home** is always at the top of the list on the left — come back here anytime. Pick a **kitchen** below it to browse the menu and add items. Your cart stays open on the right.

2. Some kitchens deliver on **multiple days**. Pick a day to start with — you can split items across days using the bar at the top of the menu, which shows a preview for each day.

3. Each kitchen has a **minimum per delivery day** (meal points, not combined across days). If a day is below its minimum, you'll see a warning in the day bar, vendor list, and under your cart.

4. There is no Save button — your order **saves automatically** as you go. Check under your cart for status updates.

5. Changes for next week must be in by **Tuesday 11:59 PM**.`;

/** Plain-text defaults before Markdown — auto-upgraded on load when unchanged. */
const LEGACY_PLAIN_INFO_BODY_BOXES = `Home is always at the top of the list on the left — come back here anytime. Pick a category below it to browse items and add them to your box. Your cart stays open on the right.

Each category has a point limit. The category list on the left shows points used; when you open a category, a bar at the top tracks that category's points. Warnings also appear under your cart if you go over a limit.

There is no Save button — your order saves automatically as you go. Check under your cart for status updates.

Changes for next week must be in by Tuesday 11:59 PM.

Two ways to fill your box:
• Food Box — choose only your protein; the rest is pre-selected for you.
• Build your own — pick each item yourself.

You can't combine both options in one box.`;

const LEGACY_PLAIN_INFO_BODY_FOOD = `Home is always at the top of the list on the left — come back here anytime. Pick a kitchen below it to browse the menu and add items. Your cart stays open on the right.

Some kitchens deliver on multiple days. Pick a day to start with — you can split items across days using the bar at the top of the menu, which shows a preview for each day.

Each kitchen has a minimum per delivery day (meal points, not combined across days). If a day is below its minimum, you'll see a warning in the day bar, vendor list, and under your cart.

There is no Save button — your order saves automatically as you go. Check under your cart for status updates.

Changes for next week must be in by Tuesday 11:59 PM.`;

/** @deprecated Saved blocks that only contain the old food-box blurb are upgraded to {@link DEFAULT_INFO_BODY_BOXES}. */
const LEGACY_INFO_BODY_BOXES_FOOD_BOX_ONLY = `Two ways to fill your box:

• Food Box — choose only your protein; the rest is pre-selected for you.
• Build your own — pick each item yourself.

You can't combine both options in one box.`;

function normalizeInfoBody(value: string | undefined): string {
    return value?.trim() ?? '';
}

function migrateInfoBlockBodies(block: PortalHomeBlock): PortalHomeBlock {
    if (!isPortalHomeInfoBlock(block)) return block;

    let infoBodyFood = block.infoBodyFood ?? '';
    let infoBodyBoxes = block.infoBodyBoxes ?? '';

    const boxesTrim = normalizeInfoBody(infoBodyBoxes);
    const foodTrim = normalizeInfoBody(infoBodyFood);

    if (boxesTrim === normalizeInfoBody(LEGACY_INFO_BODY_BOXES_FOOD_BOX_ONLY)) {
        infoBodyBoxes = DEFAULT_INFO_BODY_BOXES;
    } else if (boxesTrim === normalizeInfoBody(LEGACY_PLAIN_INFO_BODY_BOXES)) {
        infoBodyBoxes = DEFAULT_INFO_BODY_BOXES;
    }

    if (foodTrim === normalizeInfoBody(LEGACY_PLAIN_INFO_BODY_FOOD)) {
        infoBodyFood = DEFAULT_INFO_BODY_FOOD;
    }

    // Only apply full defaults when both sides are still empty (never saved / legacy empty row).
    if (!normalizeInfoBody(infoBodyFood) && !normalizeInfoBody(infoBodyBoxes)) {
        infoBodyFood = DEFAULT_INFO_BODY_FOOD;
        infoBodyBoxes = DEFAULT_INFO_BODY_BOXES;
    }

    return { ...block, infoBodyFood, infoBodyBoxes };
}

export function createDefaultInfoBlock(sortOrder = 0): PortalHomeBlock {
    return {
        ...createEmptyPortalHomeBlock(sortOrder, 'info'),
        title: 'Portal instructions',
        infoBodyFood: DEFAULT_INFO_BODY_FOOD,
        infoBodyBoxes: DEFAULT_INFO_BODY_BOXES,
        infoShowLogo: true,
    };
}

/** Ensures a starter info box exists when none has been configured yet. */
export function withDefaultPortalHomeBlocks(blocks: PortalHomeBlock[]): PortalHomeBlock[] {
    const infoIndex = blocks.findIndex(isPortalHomeInfoBlock);

    if (infoIndex >= 0) {
        const info = blocks[infoIndex];
        if (!infoBlockHasAnyBody(info)) {
            const filled = createDefaultInfoBlock(info.sortOrder);
            const next = [...blocks];
            next[infoIndex] = {
                ...filled,
                id: info.id,
                title: info.title?.trim() || filled.title,
                isActive: info.isActive,
            };
            return next;
        }
        const next = [...blocks];
        next[infoIndex] = migrateInfoBlockBodies(info);
        return next;
    }

    const defaultInfo = createDefaultInfoBlock(0);
    return [defaultInfo, ...blocks.map((block, index) => ({ ...block, sortOrder: index + 1 }))];
}

export function isPortalHomeInfoBlock(block: PortalHomeBlock): boolean {
    return block.blockType === 'info';
}

export function isPortalHomePromoBlock(block: PortalHomeBlock): boolean {
    return block.blockType !== 'info';
}

export function splitPortalHomeBlocks(blocks: PortalHomeBlock[]): {
    infoBlocks: PortalHomeBlock[];
    promoBlocks: PortalHomeBlock[];
} {
    const infoBlocks: PortalHomeBlock[] = [];
    const promoBlocks: PortalHomeBlock[] = [];
    for (const block of blocks) {
        if (isPortalHomeInfoBlock(block)) infoBlocks.push(block);
        else promoBlocks.push(block);
    }
    return { infoBlocks, promoBlocks };
}

function parseLinkType(raw: unknown): PortalHomeBlockLinkType {
    if (raw === 'vendor' || raw === 'category' || raw === 'product' || raw === 'url') return raw;
    return 'none';
}

function parseImageLayout(raw: unknown, hasImage: boolean): PortalHomeBlockImageLayout {
    if (raw === 'background' || raw === 'side') return raw;
    if (raw === 'none') return 'none';
    return hasImage ? 'side' : 'none';
}

function parseAudience(raw: unknown): PortalHomeBlockAudience {
    if (raw === 'food' || raw === 'boxes') return raw;
    return 'both';
}

function parseBlockType(raw: unknown): PortalHomeBlockType {
    if (raw === 'info') return 'info';
    return 'promo';
}

function parseBlock(raw: unknown, index: number): PortalHomeBlock | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const row = raw as Record<string, unknown>;
    const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : crypto.randomUUID();
    const title = typeof row.title === 'string' ? row.title : '';
    const imageUrl =
        typeof row.imageUrl === 'string' && row.imageUrl.trim() ? row.imageUrl.trim() : null;

    const blockType = parseBlockType(row.blockType);
    const legacyBody = typeof row.body === 'string' ? row.body : '';
    let infoBodyFood = typeof row.infoBodyFood === 'string' ? row.infoBodyFood : '';
    let infoBodyBoxes = typeof row.infoBodyBoxes === 'string' ? row.infoBodyBoxes : '';

    if (blockType === 'info' && !infoBodyFood.trim() && !infoBodyBoxes.trim() && legacyBody.trim()) {
        const aud = parseAudience(row.audience);
        if (aud === 'food' || aud === 'both') infoBodyFood = legacyBody;
        if (aud === 'boxes' || aud === 'both') infoBodyBoxes = legacyBody;
    }

    const promoSlidesRaw = Array.isArray(row.promoSlides) ? row.promoSlides : [];
    const promoSlides = promoSlidesRaw
        .map((slide) => parsePromoSlide(slide))
        .filter((slide): slide is PortalHomePromoSlide => slide !== null);

    const slideDurationSeconds =
        typeof row.slideDurationSeconds === 'number' && Number.isFinite(row.slideDurationSeconds)
            ? row.slideDurationSeconds
            : undefined;
    const slideTransitionMs =
        typeof row.slideTransitionMs === 'number' && Number.isFinite(row.slideTransitionMs)
            ? row.slideTransitionMs
            : undefined;

    return {
        id,
        blockType,
        title,
        subtitle: typeof row.subtitle === 'string' ? row.subtitle : '',
        body: legacyBody,
        infoBodyFood,
        infoBodyBoxes,
        infoShowLogo: row.infoShowLogo === true,
        imageUrl,
        imageLayout: parseImageLayout(row.imageLayout, !!imageUrl),
        linkType: parseLinkType(row.linkType),
        linkVendorId: typeof row.linkVendorId === 'string' ? row.linkVendorId : null,
        linkCategoryId: typeof row.linkCategoryId === 'string' ? row.linkCategoryId : null,
        linkMenuItemId: typeof row.linkMenuItemId === 'string' ? row.linkMenuItemId : null,
        linkUrl: typeof row.linkUrl === 'string' ? row.linkUrl : null,
        linkOpenInNewTab: row.linkOpenInNewTab === true,
        ctaLabel: typeof row.ctaLabel === 'string' ? row.ctaLabel : 'Learn more',
        audience: parseAudience(row.audience),
        sortOrder: typeof row.sortOrder === 'number' ? row.sortOrder : index,
        isActive: row.isActive !== false,
        promoSlides: promoSlides.length > 0 ? promoSlides : undefined,
        slideDurationSeconds,
        slideTransitionMs,
    };
}

export function parsePortalHomeBlocks(raw: unknown): PortalHomeBlock[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((row, index) => parseBlock(row, index))
        .filter((block): block is PortalHomeBlock => block !== null)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
}

function blockIsVisibleOnPortal(block: PortalHomeBlock, mode: 'food' | 'boxes'): boolean {
    if (isPortalHomeInfoBlock(block)) return !!getInfoBlockBodyForMode(block, mode);
    if (block.audience !== 'both' && block.audience !== mode) return false;
    return getPromoSlides(block).some((slide) => promoSlideHasContent(slide));
}

export function filterPortalHomeBlocksForMode(
    blocks: PortalHomeBlock[],
    mode: 'food' | 'boxes',
): PortalHomeBlock[] {
    return blocks.filter((block) => block.isActive && blockIsVisibleOnPortal(block, mode));
}

export function promoLinkTargetHasLink(target: PortalHomePromoLinkTarget): boolean {
    switch (target.linkType) {
        case 'vendor':
            return !!target.linkVendorId;
        case 'category':
            return !!target.linkCategoryId;
        case 'product':
            return !!target.linkMenuItemId;
        case 'url':
            return !!target.linkUrl?.trim();
        default:
            return false;
    }
}

export function blockHasLink(block: PortalHomeBlock): boolean {
    return promoLinkTargetHasLink(block);
}

export function createEmptyPortalHomePromoSlide(): PortalHomePromoSlide {
    return {
        id: crypto.randomUUID(),
        title: '',
        subtitle: '',
        body: '',
        imageUrl: null,
        imageLayout: 'side',
        linkType: 'none',
        linkVendorId: null,
        linkCategoryId: null,
        linkMenuItemId: null,
        linkUrl: null,
        linkOpenInNewTab: false,
        ctaLabel: 'Learn more',
    };
}

export function promoSlideFromBlock(block: PortalHomeBlock): PortalHomePromoSlide {
    return {
        id: `${block.id}-slide-0`,
        title: block.title,
        subtitle: block.subtitle,
        body: block.body,
        imageUrl: block.imageUrl,
        imageLayout: block.imageLayout,
        linkType: block.linkType,
        linkVendorId: block.linkVendorId,
        linkCategoryId: block.linkCategoryId,
        linkMenuItemId: block.linkMenuItemId,
        linkUrl: block.linkUrl,
        linkOpenInNewTab: block.linkOpenInNewTab,
        ctaLabel: block.ctaLabel,
    };
}

export function applyPromoSlideToBlockFields(
    block: PortalHomeBlock,
    slide: PortalHomePromoSlide,
): PortalHomeBlock {
    return {
        ...block,
        title: slide.title,
        subtitle: slide.subtitle,
        body: slide.body,
        imageUrl: slide.imageUrl,
        imageLayout: slide.imageLayout,
        linkType: slide.linkType,
        linkVendorId: slide.linkVendorId,
        linkCategoryId: slide.linkCategoryId,
        linkMenuItemId: slide.linkMenuItemId,
        linkUrl: slide.linkUrl,
        linkOpenInNewTab: slide.linkOpenInNewTab,
        ctaLabel: slide.ctaLabel,
    };
}

/** All slides for a promo block — first slide always comes from top-level fields. */
export function getPromoSlides(block: PortalHomeBlock): PortalHomePromoSlide[] {
    const first = promoSlideFromBlock(block);
    const extra = block.promoSlides ?? [];
    if (extra.length === 0) return [first];
    return [first, ...extra];
}

export function promoBlockHasCarousel(block: PortalHomeBlock): boolean {
    return getPromoSlides(block).length >= 2;
}

export function getPromoSlideDurationSeconds(block: PortalHomeBlock): number {
    const raw = block.slideDurationSeconds;
    if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 1) return raw;
    return DEFAULT_PROMO_SLIDE_DURATION_SECONDS;
}

export function getPromoSlideTransitionMs(block: PortalHomeBlock): number {
    const raw = block.slideTransitionMs;
    if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return raw;
    return DEFAULT_PROMO_SLIDE_TRANSITION_MS;
}

export function promoSlideHasContent(slide: PortalHomePromoSlide): boolean {
    return slide.title.trim() !== '' || !!slide.body?.trim();
}

export function applyPromoSlidesToBlock(
    block: PortalHomeBlock,
    slides: PortalHomePromoSlide[],
): PortalHomeBlock {
    const [first, ...rest] = slides;
    if (!first) return block;

    let next = applyPromoSlideToBlockFields(block, first);
    if (rest.length === 0) {
        const { promoSlides: _removed, slideDurationSeconds, slideTransitionMs, ...single } = next;
        return single;
    }

    next = { ...next, promoSlides: rest };
    return next;
}

function parsePromoSlide(raw: unknown): PortalHomePromoSlide | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const row = raw as Record<string, unknown>;
    const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : crypto.randomUUID();
    const imageUrl =
        typeof row.imageUrl === 'string' && row.imageUrl.trim() ? row.imageUrl.trim() : null;

    return {
        id,
        title: typeof row.title === 'string' ? row.title : '',
        subtitle: typeof row.subtitle === 'string' ? row.subtitle : '',
        body: typeof row.body === 'string' ? row.body : '',
        imageUrl,
        imageLayout: parseImageLayout(row.imageLayout, !!imageUrl),
        linkType: parseLinkType(row.linkType),
        linkVendorId: typeof row.linkVendorId === 'string' ? row.linkVendorId : null,
        linkCategoryId: typeof row.linkCategoryId === 'string' ? row.linkCategoryId : null,
        linkMenuItemId: typeof row.linkMenuItemId === 'string' ? row.linkMenuItemId : null,
        linkUrl: typeof row.linkUrl === 'string' ? row.linkUrl : null,
        linkOpenInNewTab: row.linkOpenInNewTab === true,
        ctaLabel: typeof row.ctaLabel === 'string' ? row.ctaLabel : 'Learn more',
    };
}

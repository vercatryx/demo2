/**
 * Default portal images for well-known box categories.
 * Matched by normalized category name (DB names vary slightly).
 *
 * Important: the designated food-box category name is a long sentence that
 * mentions Fruits/Vegetables — always resolve food-box before produce.
 */

const BASE = '/images/box-categories';

export type BoxCategoryPortalImages = {
    /** Square-ish icon for sidebar + department list */
    imageUrl: string;
    /** Wide hero when browsing the category */
    heroImageUrl: string;
};

type Entry = {
    match: (normalized: string) => boolean;
    images: BoxCategoryPortalImages;
};

const FOOD_BOX_IMAGES: BoxCategoryPortalImages = {
    imageUrl: `${BASE}/food-box-v3.jpg`,
    heroImageUrl: `${BASE}/food-box-hero-v3.jpg`,
};

function normalizeCategoryName(name: string): string {
    return name
        .replace(/^\[Preview\]\s*/i, '')
        .toLowerCase()
        .replace(/&/g, ' ')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** True for the long “Random Food Box …” catalog name (and short aliases). */
function isFoodBoxCategoryName(normalized: string): boolean {
    if (!normalized) return false;
    if (normalized.startsWith('random food box')) return true;
    if (normalized === 'food box' || normalized === 'random') return true;
    // Long admin label: "Random Food Box (This option is only if … Includes … Fruits …)"
    if (normalized.includes('random food box') && normalized.includes('protein')) return true;
    if (normalized.includes('you may only choose your protein')) return true;
    return false;
}

const ENTRIES: Entry[] = [
    // Food box MUST be first — its full name mentions Fruits & Vegetables.
    {
        match: isFoodBoxCategoryName,
        images: FOOD_BOX_IMAGES,
    },
    {
        match: (n) =>
            n === 'fruits vegetables' ||
            n === 'fruit vegetables' ||
            n === 'fruits vegetable' ||
            n === 'produce' ||
            // Short title only — do not match long descriptions that list produce.
            (n.length <= 40 && n.includes('fruit') && n.includes('vegetable')),
        images: {
            imageUrl: `${BASE}/fruits-vegetables-v2.jpg`,
            heroImageUrl: `${BASE}/fruits-vegetables-hero-v2.jpg`,
        },
    },
    {
        match: (n) => n === 'grain' || n === 'grains' || n.startsWith('grain '),
        images: {
            imageUrl: `${BASE}/grain-v2.jpg`,
            heroImageUrl: `${BASE}/grain-hero-v2.jpg`,
        },
    },
    {
        match: (n) => n === 'protein' || n.startsWith('protein '),
        images: {
            imageUrl: `${BASE}/protein-v2.jpg`,
            heroImageUrl: `${BASE}/protein-hero-v2.jpg`,
        },
    },
    {
        match: (n) => n === 'dairy' || n.startsWith('dairy '),
        images: {
            imageUrl: `${BASE}/dairy-v2.jpg`,
            heroImageUrl: `${BASE}/dairy-hero-v2.jpg`,
        },
    },
    {
        match: (n) => n === 'grocery' || n === 'groceries' || n.startsWith('grocery '),
        images: {
            imageUrl: `${BASE}/grocery-v2.jpg`,
            heroImageUrl: `${BASE}/grocery-hero-v2.jpg`,
        },
    },
];

type ResolveOpts = {
    /** When set, this category id always gets the cardboard food-box images. */
    foodBoxCategoryId?: string | null;
    categoryId?: string | null;
};

/** Resolve sidebar/list + hero images for a box category. */
export function getBoxCategoryPortalImages(
    categoryName: string | null | undefined,
    opts?: ResolveOpts,
): BoxCategoryPortalImages | null {
    if (opts?.foodBoxCategoryId && opts.categoryId && opts.categoryId === opts.foodBoxCategoryId) {
        return FOOD_BOX_IMAGES;
    }
    if (!categoryName?.trim()) return null;
    const normalized = normalizeCategoryName(categoryName);
    if (!normalized) return null;
    for (const entry of ENTRIES) {
        if (entry.match(normalized)) return entry.images;
    }
    return null;
}

export function getBoxCategoryImageUrl(
    categoryName: string | null | undefined,
    opts?: ResolveOpts,
): string | null {
    return getBoxCategoryPortalImages(categoryName, opts)?.imageUrl ?? null;
}

export function getBoxCategoryHeroImageUrl(
    categoryName: string | null | undefined,
    opts?: ResolveOpts,
): string | null {
    return getBoxCategoryPortalImages(categoryName, opts)?.heroImageUrl ?? null;
}

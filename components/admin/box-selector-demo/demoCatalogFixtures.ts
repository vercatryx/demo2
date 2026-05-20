/**
 * Local-only catalog data for box-selector demo pages (not in Supabase).
 * Merged on the server with real DB rows so you can test trees and quotas without seeding.
 */
import type { ItemCategory, MenuItem } from '@/lib/types';

/** Twenty demo departments — first one carries the bulk item list for scroll testing. */
const DEMO_CATEGORY_NAMES = [
    'Mega aisle',
    'Produce',
    'Dairy & eggs',
    'Bakery',
    'Frozen',
    'Dry goods',
    'Beverages',
    'Snacks',
    'Condiments',
    'Household',
    'Personal care',
    'Baby',
    'Pet',
    'Deli',
    'Meat & seafood',
    'Plant-based',
    'International',
    'Breakfast',
    'Baking supplies',
    'Seasonal',
] as const;

/** Fixed point targets for quota strip cards (merged with DB categories that omit setValue). */
const DEMO_CATEGORY_TARGETS: number[] = [
    4, 6, 5, 8, 4, 6, 7, 5, 4, 6, 5, 8, 4, 6, 5, 7, 4, 6, 5, 8,
];

export const DEMO_CATEGORIES: ItemCategory[] = DEMO_CATEGORY_NAMES.map((name, i) => ({
    id: `demo-cat-${String(i + 1).padStart(2, '0')}`,
    name: `Demo · ${name}`,
    setValue: DEMO_CATEGORY_TARGETS[i] ?? 4,
    sortOrder: 900 + i,
    isActive: true,
}));

const DEMO_MEGA_CATEGORY_ID = 'demo-cat-01';

function mi(
    id: string,
    name: string,
    categoryId: string,
    opts?: { quotaValue?: number; value?: number },
): MenuItem {
    return {
        id,
        vendorId: '',
        name,
        value: opts?.value ?? 1,
        isActive: true,
        categoryId,
        quotaValue: opts?.quotaValue ?? 1,
    };
}

/** One category with twenty lines so the item picker scrolls like production. */
const DEMO_MEGA_ITEMS: MenuItem[] = Array.from({ length: 20 }, (_, i) => {
    const n = i + 1;
    return mi(
        `demo-mi-mega-${String(n).padStart(2, '0')}`,
        `Demo · Staple pick ${n} (grain / protein / pantry)`,
        DEMO_MEGA_CATEGORY_ID,
        { quotaValue: n % 4 === 0 ? 2 : 1 },
    );
});

/** One extra item on most other demo departments so category strips stay realistic when long. */
const DEMO_SIDE_ITEMS: MenuItem[] = DEMO_CATEGORY_NAMES.slice(1).flatMap((label, idx) => {
    const catNum = idx + 2;
    const categoryId = `demo-cat-${String(catNum).padStart(2, '0')}`;
    const slug = label.replace(/[^a-z]+/gi, '-').toLowerCase();
    return [
        mi(`demo-mi-side-${slug}-a`, `Demo · ${label} — option A`, categoryId),
        mi(`demo-mi-side-${slug}-b`, `Demo · ${label} — option B`, categoryId),
    ];
});

export const DEMO_MENU_ITEMS: MenuItem[] = [...DEMO_MEGA_ITEMS, ...DEMO_SIDE_ITEMS];

/** Append fixtures after DB rows; skip fixture ids that already exist in base. */
export function mergeDemoCatalog<T extends { id: string }>(base: T[], demo: T[]): T[] {
    const ids = new Set(base.map((x) => x.id));
    return [...base, ...demo.filter((d) => !ids.has(d.id))];
}

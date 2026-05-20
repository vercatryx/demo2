import type { DemoBoxLayoutConfig } from './constants';
import { CATEGORY_LAYOUT_STORAGE_KEY } from './constants';
import { normalizeSubMenuForest } from './subMenuTree';

export const UNASSIGNED_SUBMENU_ID = '__unassigned__';

export function defaultLayoutConfig(): DemoBoxLayoutConfig {
    return {
        orderedCategoryIds: [],
        subMenusByCategory: {},
        itemSubMenuByItemId: {},
    };
}

export function parseLayoutFromStorage(raw: string | null): DemoBoxLayoutConfig | null {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as Partial<DemoBoxLayoutConfig> & { orderedCategoryIds?: string[] };
        const base = defaultLayoutConfig();
        const rawSubs = parsed.subMenusByCategory && typeof parsed.subMenusByCategory === 'object' ? parsed.subMenusByCategory : {};
        const subMenusByCategory: Record<string, import('./constants').DemoSubMenuNode[]> = {};
        for (const [catId, forest] of Object.entries(rawSubs)) {
            subMenusByCategory[catId] = normalizeSubMenuForest(forest);
        }
        return {
            orderedCategoryIds: Array.isArray(parsed.orderedCategoryIds) ? parsed.orderedCategoryIds : base.orderedCategoryIds,
            subMenusByCategory,
            itemSubMenuByItemId:
                parsed.itemSubMenuByItemId && typeof parsed.itemSubMenuByItemId === 'object'
                    ? parsed.itemSubMenuByItemId
                    : {},
        };
    } catch {
        return null;
    }
}

export function readLayoutConfig(): DemoBoxLayoutConfig | null {
    if (typeof window === 'undefined') return null;
    return parseLayoutFromStorage(localStorage.getItem(CATEGORY_LAYOUT_STORAGE_KEY));
}

export function writeLayoutConfig(config: DemoBoxLayoutConfig): void {
    localStorage.setItem(CATEGORY_LAYOUT_STORAGE_KEY, JSON.stringify(config));
}

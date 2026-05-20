/** Browser-only — category order + optional nested sub-menu navigation for box selector prototypes. */
export const CATEGORY_LAYOUT_STORAGE_KEY = 'triangle-box-demo-category-order';

/** Nested folder-style groups (each row can have children). */
export type DemoSubMenuNode = {
    id: string;
    name: string;
    children: DemoSubMenuNode[];
};

/** Persisted in localStorage under CATEGORY_LAYOUT_STORAGE_KEY */
export type DemoBoxLayoutConfig = {
    orderedCategoryIds: string[];
    /** Per category: forest of sub-menu roots (each node may nest children). */
    subMenusByCategory: Record<string, DemoSubMenuNode[]>;
    /** Menu item → leaf (or any) sub-menu node id; empty/unset may mean “Unassigned”. */
    itemSubMenuByItemId: Record<string, string>;
};

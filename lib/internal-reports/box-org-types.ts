/** Mirrors Admin → Boxes Org layout JSON (`box_menu_layout_configs.config`). */
export type BoxOrgSubMenuNode = {
    id: string;
    name: string;
    children: BoxOrgSubMenuNode[];
};

export type BoxOrgLayoutConfig = {
    orderedCategoryIds: string[];
    subMenusByCategory: Record<string, BoxOrgSubMenuNode[]>;
    itemSubMenuByItemId: Record<string, string>;
};

export type BoxOrgSpreadsheetRow = {
    rowIndex: number;
    name: string;
    category: string;
    sub1: string;
    sub2: string;
    price: number | null;
    itemNumber: string;
    upc: string;
    vendorId: string;
    vendorName: string;
};

export type NormalizedBoxOrgUploadRow = BoxOrgSpreadsheetRow & {
    menuItemId: string | null;
    categoryId: string | null;
    folderNodeId: string | null;
    isNewMenuItem: boolean;
    warnings: string[];
};

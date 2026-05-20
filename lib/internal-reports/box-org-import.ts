import { randomUUID } from 'crypto';
import postgres from 'postgres';
import { parseLayoutFromStorage } from '@/components/admin/box-selector-demo/layoutStorage';
import type { DemoBoxLayoutConfig, DemoSubMenuNode } from '@/components/admin/box-selector-demo/constants';
import { findNode, normalizeSubMenuForest } from '@/components/admin/box-selector-demo/subMenuTree';
import type { ProposeBatchWritesInput } from '@/lib/internal-reports/propose-batch-writes';
import {
    runProposeBatchWritesTool,
    type PendingWritesReadyPayload,
} from '@/lib/internal-reports/propose-batch-writes';
import { resolveInternalReportsPostgresUrl } from '@/lib/internal-reports/postgres-url';
import {
    isBoxesOrgSpreadsheet,
    parseBoxesOrgSpreadsheetRows,
    BOXES_ORG_TEMPLATE_COLUMNS,
} from '@/lib/internal-reports/box-org-spreadsheet';
import type { ParsedSpreadsheetUpload } from '@/lib/internal-reports/spreadsheet-upload';
import type { BoxOrgSpreadsheetRow, NormalizedBoxOrgUploadRow } from '@/lib/internal-reports/box-org-types';
import { buildQueryExportWorkbook } from '@/lib/internal-reports/build-adhoc-xlsx';
import { putExportXlsx } from '@/lib/internal-reports/export-token-cache';
import { tryPublishXlsxPublicUrl } from '@/lib/internal-reports/publish-export-r2';

export type BoxesOrgImportOptions = {
    uspIdSource?: 'item_number' | 'upc';
    createMissingCategories?: boolean;
    createMissingFolders?: boolean;
    /** When true, rows with no name match get new menu_items (default true). */
    createMissingMenuItems?: boolean;
    /** menu_items.value / quota_value for new rows (default 1). */
    defaultItemValue?: number;
};

type DbCategory = { id: string; name: string };
type DbMenuItem = {
    id: string;
    name: string;
    category_id: string | null;
    vendor_id: string | null;
    price_each: string | number | null;
    usp_id: string | null;
};
type DbVendor = { id: string; name: string };

function sqlLiteral(s: string): string {
    return `'${s.replace(/'/g, "''")}'`;
}

function normName(s: string): string {
    return s.trim().toLowerCase();
}

function newFolderId(): string {
    return `sm-${randomUUID()}`;
}

function parseLayoutConfig(raw: unknown): DemoBoxLayoutConfig {
    if (!raw || typeof raw !== 'object') {
        return { orderedCategoryIds: [], subMenusByCategory: {}, itemSubMenuByItemId: {} };
    }
    const parsed = parseLayoutFromStorage(JSON.stringify(raw));
    return (
        parsed ?? {
            orderedCategoryIds: [],
            subMenusByCategory: {},
            itemSubMenuByItemId: {},
        }
    );
}

function findChildByName(nodes: DemoSubMenuNode[], name: string): DemoSubMenuNode | null {
    const n = normName(name);
    for (const node of nodes) {
        if (normName(node.name) === n) return node;
    }
    return null;
}

function ensureFolderPath(
    roots: DemoSubMenuNode[],
    sub1: string,
    sub2: string,
    create: boolean
): { roots: DemoSubMenuNode[]; leafId: string | null } {
    if (!sub1.trim()) return { roots, leafId: null };
    let forest = [...roots];
    let s1 = findChildByName(forest, sub1);
    if (!s1) {
        if (!create) return { roots: forest, leafId: null };
        s1 = { id: newFolderId(), name: sub1.trim(), children: [] };
        forest = [...forest, s1];
    }
    if (!sub2.trim()) return { roots: forest, leafId: s1.id };
    let s2 = findChildByName(s1.children ?? [], sub2);
    if (!s2) {
        if (!create) return { roots: forest, leafId: null };
        s2 = { id: newFolderId(), name: sub2.trim(), children: [] };
        s1 = { ...s1, children: [...(s1.children ?? []), s2] };
        forest = forest.map((n) => (n.id === s1!.id ? s1! : n));
    }
    return { roots: forest, leafId: s2.id };
}

function replaceForestInLayout(
    layout: DemoBoxLayoutConfig,
    categoryId: string,
    forest: DemoSubMenuNode[]
): DemoBoxLayoutConfig {
    return {
        ...layout,
        subMenusByCategory: { ...layout.subMenusByCategory, [categoryId]: forest },
    };
}

function folderPathForItem(
    layout: DemoBoxLayoutConfig,
    categoryId: string,
    itemId: string
): { sub1: string; sub2: string } {
    const nodeId = layout.itemSubMenuByItemId[itemId];
    if (!nodeId) return { sub1: '', sub2: '' };
    const forest = layout.subMenusByCategory[categoryId] ?? [];
    const node = findNode(forest, nodeId);
    if (!node) return { sub1: '', sub2: '' };
    for (const root of forest) {
        if (root.id === nodeId) return { sub1: root.name, sub2: '' };
        for (const child of root.children ?? []) {
            if (child.id === nodeId) return { sub1: root.name, sub2: child.name };
            for (const grand of child.children ?? []) {
                if (grand.id === nodeId) return { sub1: root.name, sub2: child.name };
            }
        }
    }
    return { sub1: '', sub2: '' };
}

async function loadDbState() {
    const url = await resolveInternalReportsPostgresUrl();
    if (!url) throw new Error('No Postgres URL configured for internal reports.');
    const sql = postgres(url, { max: 1, idle_timeout: 20, connect_timeout: 30, ssl: 'require' });
    try {
        const [categories, menuItems, vendors, layoutRow] = await Promise.all([
            sql<DbCategory[]>`SELECT id, name FROM public.item_categories ORDER BY sort_order ASC NULLS LAST, name ASC`,
            sql<DbMenuItem[]>`
                SELECT id, name, category_id, vendor_id, price_each, usp_id
                FROM public.menu_items
                WHERE is_active IS DISTINCT FROM false
                ORDER BY name ASC`,
            sql<DbVendor[]>`SELECT id, name FROM public.vendors ORDER BY name ASC`,
            sql<{ config: unknown }[]>`
                SELECT config FROM public.box_menu_layout_configs WHERE id = 1 LIMIT 1`,
        ]);
        const layout = parseLayoutConfig(layoutRow[0]?.config ?? null);
        return { categories, menuItems, vendors, layout };
    } finally {
        await sql.end({ timeout: 5 }).catch(() => undefined);
    }
}

function uspForRow(row: BoxOrgSpreadsheetRow, uspSource: 'item_number' | 'upc'): string | null {
    const raw = uspSource === 'upc' ? row.upc : row.itemNumber;
    if (raw == null || raw === '') return null;
    return String(raw).trim();
}

function priceForRow(row: BoxOrgSpreadsheetRow): number {
    if (row.price != null && row.price > 0) return row.price;
    return 0.01;
}

export function normalizeBoxesOrgRows(
    rows: BoxOrgSpreadsheetRow[],
    db: Awaited<ReturnType<typeof loadDbState>>,
    options: BoxesOrgImportOptions
): {
    normalized: NormalizedBoxOrgUploadRow[];
    layout: DemoBoxLayoutConfig;
    newCategories: { id: string; name: string }[];
    newMenuItemCount: number;
} {
    const createCats = options.createMissingCategories !== false;
    const createFolders = options.createMissingFolders !== false;
    const createItems = options.createMissingMenuItems !== false;
    const uspSource = options.uspIdSource ?? 'item_number';
    const itemValue = options.defaultItemValue ?? 1;

    const catByNorm = new Map(db.categories.map((c) => [normName(c.name), c]));
    const itemByNorm = new Map(db.menuItems.map((m) => [normName(m.name), m]));
    const vendorByNorm = new Map(db.vendors.map((v) => [normName(v.name), v]));
    const vendorById = new Map(db.vendors.map((v) => [v.id, v]));

    let layout: DemoBoxLayoutConfig = {
        orderedCategoryIds: [...db.layout.orderedCategoryIds],
        subMenusByCategory: { ...db.layout.subMenusByCategory },
        itemSubMenuByItemId: { ...db.layout.itemSubMenuByItemId },
    };

    const newCategories: { id: string; name: string }[] = [];
    const normalized: NormalizedBoxOrgUploadRow[] = [];
    let newMenuItemCount = 0;

    for (const row of rows) {
        const warnings: string[] = [];
        let menuItem = itemByNorm.get(normName(row.name));
        let isNewMenuItem = false;
        if (!menuItem) {
            if (!createItems) {
                warnings.push(`No menu item matched name "${row.name}" — row skipped.`);
                normalized.push({
                    ...row,
                    menuItemId: null,
                    categoryId: null,
                    folderNodeId: null,
                    isNewMenuItem: false,
                    warnings,
                });
                continue;
            }
            const id = randomUUID();
            menuItem = {
                id,
                name: row.name.trim(),
                category_id: null,
                vendor_id: null,
                price_each: null,
                usp_id: null,
            };
            itemByNorm.set(normName(row.name), menuItem);
            isNewMenuItem = true;
            newMenuItemCount++;
        }

        let categoryId = menuItem.category_id;
        if (row.category) {
            let cat = catByNorm.get(normName(row.category));
            if (!cat && createCats) {
                const id = randomUUID();
                cat = { id, name: row.category.trim() };
                catByNorm.set(normName(cat.name), cat);
                newCategories.push(cat);
                if (!layout.orderedCategoryIds.includes(id)) {
                    layout.orderedCategoryIds = [...layout.orderedCategoryIds, id];
                }
                layout.subMenusByCategory[id] = layout.subMenusByCategory[id] ?? [];
            }
            if (cat) categoryId = cat.id;
            else warnings.push(`Category "${row.category}" not found and create is disabled.`);
        }

        let folderNodeId: string | null = null;
        if (categoryId && (row.sub1 || row.sub2)) {
            const forest = normalizeSubMenuForest(layout.subMenusByCategory[categoryId] ?? []);
            const ensured = ensureFolderPath(forest, row.sub1, row.sub2, createFolders);
            if (ensured.leafId) {
                folderNodeId = ensured.leafId;
                layout = replaceForestInLayout(layout, categoryId, ensured.roots);
                layout.itemSubMenuByItemId[menuItem.id] = ensured.leafId;
            } else {
                warnings.push(`Folder path sub1="${row.sub1}" sub2="${row.sub2}" could not be resolved.`);
            }
        } else if (categoryId && !row.sub1 && !row.sub2) {
            delete layout.itemSubMenuByItemId[menuItem.id];
        }

        let resolvedVendorId = row.vendorId || null;
        if (resolvedVendorId && !vendorById.has(resolvedVendorId)) {
            warnings.push(`vendor_id "${resolvedVendorId}" not found.`);
            resolvedVendorId = null;
        }
        if (!resolvedVendorId && row.vendorName) {
            const v = vendorByNorm.get(normName(row.vendorName));
            if (v) resolvedVendorId = v.id;
            else warnings.push(`Vendor "${row.vendorName}" not found.`);
        }

        if (!row.price || row.price <= 0) {
            warnings.push('Price missing or unparseable — will use minimum 0.01 for new/updated price_each.');
        }
        if (uspSource === 'upc' && !row.upc) {
            warnings.push('usp_id uses UPC column but UPC is empty for this row.');
        }

        normalized.push({
            ...row,
            price: priceForRow(row),
            vendorId: resolvedVendorId ?? '',
            menuItemId: menuItem.id,
            categoryId,
            folderNodeId,
            isNewMenuItem,
            warnings,
        });
    }

    const activeCatIds = new Set([
        ...db.categories.map((c) => c.id),
        ...newCategories.map((c) => c.id),
    ]);
    layout.orderedCategoryIds = layout.orderedCategoryIds.filter((id) => activeCatIds.has(id));
    for (const c of [...db.categories, ...newCategories]) {
        if (!layout.orderedCategoryIds.includes(c.id)) {
            layout.orderedCategoryIds.push(c.id);
        }
    }

    return { normalized, layout, newCategories, newMenuItemCount };
}

function buildNewMenuItemsInsert(
    normalized: NormalizedBoxOrgUploadRow[],
    options: BoxesOrgImportOptions
): { values: string; impactValues: string } | null {
    const uspSource = options.uspIdSource ?? 'item_number';
    const itemValue = options.defaultItemValue ?? 1;
    const lines: string[] = [];
    const impact: string[] = [];
    for (const r of normalized) {
        if (!r.isNewMenuItem || !r.menuItemId) continue;
        const usp = uspForRow(r, uspSource);
        const uspLit = usp ? sqlLiteral(usp) : 'NULL';
        const cat = r.categoryId ? sqlLiteral(r.categoryId) : 'NULL';
        const price = String(priceForRow(r));
        lines.push(
            `(${sqlLiteral(r.menuItemId)}, ${sqlLiteral(r.name)}, NULL, ${itemValue}, ${price}, true, ${cat}, ${itemValue}, ${uspLit}, 0)`
        );
        impact.push(
            `(${sqlLiteral(r.menuItemId)}, ${sqlLiteral(r.name)}, ${cat}, ${price}, ${uspLit})`
        );
    }
    if (!lines.length) return null;
    return {
        values: lines.join(',\n  '),
        impactValues: impact.join(',\n  '),
    };
}

function buildValuesClause(
    normalized: NormalizedBoxOrgUploadRow[],
    options: BoxesOrgImportOptions
): string | null {
    const uspSource = options.uspIdSource ?? 'item_number';
    const lines: string[] = [];
    for (const r of normalized) {
        if (!r.menuItemId) continue;
        const hasPrice = r.price != null;
        const hasCat = Boolean(r.category && r.categoryId);
        const hasVendor = Boolean(r.vendorId);
        const usp =
            uspSource === 'upc'
                ? r.upc || null
                : r.itemNumber || null;
        const hasUsp = usp !== null && usp !== '';
        if (!hasPrice && !hasCat && !hasVendor && !hasUsp) continue;

        const cat = hasCat && r.categoryId ? sqlLiteral(r.categoryId) : 'NULL';
        const price = hasPrice ? String(r.price) : 'NULL';
        const vendor = hasVendor && r.vendorId ? sqlLiteral(r.vendorId) : 'NULL';
        const uspLit = hasUsp ? sqlLiteral(usp!) : 'NULL';
        lines.push(`(${sqlLiteral(r.menuItemId)}, ${cat}, ${price}, ${vendor}, ${uspLit})`);
    }
    if (!lines.length) return null;
    return lines.join(',\n  ');
}

export async function buildBoxesOrgTemplateRows(): Promise<Record<string, unknown>[]> {
    const db = await loadDbState();
    const catName = new Map(db.categories.map((c) => [c.id, c.name]));
    const vendorName = new Map(db.vendors.map((v) => [v.id, v.name]));

    return db.menuItems.map((m) => {
        const catId = m.category_id ?? '';
        const paths = catId
            ? folderPathForItem(db.layout, catId, m.id)
            : { sub1: '', sub2: '' };
        return {
            menu_item_id: m.id,
            Name: m.name,
            'item #': m.usp_id ?? '',
            UPC: '',
            Price: m.price_each ?? '',
            Category: catId ? (catName.get(catId) ?? '') : '',
            sub1: paths.sub1,
            Sub2: paths.sub2,
            vendor_id: m.vendor_id ?? '',
            Vendor: m.vendor_id ? (vendorName.get(m.vendor_id) ?? '') : '',
        };
    });
}

export async function exportBoxesOrgTemplateXlsx(): Promise<{
    downloadUrl: string;
    filename: string;
    rowCount: number;
}> {
    const rows = await buildBoxesOrgTemplateRows();
    const buf = buildQueryExportWorkbook(rows, 'Boxes Org');
    const filename = 'Box item upload template.xlsx';
    const publicUrl = await tryPublishXlsxPublicUrl(buf, filename);
    const downloadUrl =
        publicUrl ??
        (() => {
            const token = putExportXlsx(buf, filename);
            return `/api/internal-reports/download?token=${token}`;
        })();
    return { downloadUrl, filename, rowCount: rows.length };
}

export async function buildBoxesOrgImportProposal(
    upload: ParsedSpreadsheetUpload,
    options: BoxesOrgImportOptions = {}
): Promise<
    | {
          ok: true;
          proposal: ProposeBatchWritesInput;
          warnings: string[];
          matchedCount: number;
          skippedCount: number;
          newMenuItemCount: number;
      }
    | { ok: false; error: string }
> {
    if (!isBoxesOrgSpreadsheet(upload)) {
        return {
            ok: false,
            error:
                'Spreadsheet does not look like a Boxes Org upload. Need a Name column plus Category and/or sub1/Sub2.',
        };
    }

    let rows: BoxOrgSpreadsheetRow[];
    try {
        rows = parseBoxesOrgSpreadsheetRows(upload);
    } catch (e: unknown) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }

    const db = await loadDbState();
    const { normalized, layout, newCategories, newMenuItemCount } = normalizeBoxesOrgRows(rows, db, options);

    const matched = normalized.filter((r) => r.menuItemId);
    const skipped = normalized.length - matched.length;
    const warnings = normalized.flatMap((r) => r.warnings.map((w) => `Row ${r.rowIndex}: ${w}`));

    if (matched.length === 0) {
        return {
            ok: false,
            error: 'No rows could be applied. Enable create missing menu items or fix Name values.',
        };
    }

    const operations: ProposeBatchWritesInput['operations'] = [];

    if (newCategories.length > 0) {
        const values = newCategories
            .map((c) => `(${sqlLiteral(c.id)}, ${sqlLiteral(c.name)})`)
            .join(',\n  ');
        operations.push({
            title: 'New item categories',
            impact_select_sql: `SELECT v.id, v.name
FROM (VALUES ${values}) AS v(id, name)`,
            write_sql: `INSERT INTO public.item_categories (id, name, sort_order, meal_type)
SELECT v.id::varchar, v.name::varchar, 0, 'Lunch'
FROM (VALUES ${values}) AS v(id, name)
ON CONFLICT (id) DO NOTHING`,
        });
    }

    const newItemInsert = buildNewMenuItemsInsert(normalized, options);
    if (newItemInsert) {
        operations.push({
            title: 'New menu items',
            impact_select_sql: `SELECT v.id, v.name, v.category_id, v.price_each, v.usp_id
FROM (VALUES ${newItemInsert.impactValues}) AS v(id, name, category_id, price_each, usp_id)`,
            write_sql: `INSERT INTO public.menu_items (
  id, name, vendor_id, value, price_each, is_active, category_id, quota_value, usp_id, sort_order
)
SELECT
  v.id::varchar,
  v.name::varchar,
  NULL,
  v.value::numeric,
  v.price_each::numeric,
  true,
  v.category_id::varchar,
  v.quota_value::numeric,
  v.usp_id::text,
  0
FROM (
  VALUES ${newItemInsert.values}
) AS v(id, name, vendor_id, value, price_each, is_active, category_id, quota_value, usp_id, sort_order)`,
        });
    }

    const valuesClause = buildValuesClause(
        normalized.filter((r) => !r.isNewMenuItem),
        options
    );
    if (valuesClause) {
        const ids = matched.map((r) => r.menuItemId!).filter(Boolean);
        const idList = ids.map((id) => sqlLiteral(id)).join(', ');
        operations.push({
            title: 'Menu item fields',
            impact_select_sql: `SELECT m.id, m.name AS item_name,
  m.category_id AS before_category_id,
  v.category_id::varchar AS after_category_id,
  m.price_each AS before_price_each,
  v.price_each::numeric AS after_price_each,
  m.vendor_id AS before_vendor_id,
  v.vendor_id::varchar AS after_vendor_id,
  m.usp_id AS before_usp_id,
  v.usp_id::text AS after_usp_id
FROM public.menu_items m
JOIN (
  VALUES ${valuesClause}
) AS v(id, category_id, price_each, vendor_id, usp_id) ON m.id = v.id::varchar
WHERE m.id IN (${idList})`,
            write_sql: `UPDATE public.menu_items m
SET
  category_id = COALESCE(v.category_id::varchar, m.category_id),
  price_each = COALESCE(v.price_each::numeric, m.price_each),
  vendor_id = COALESCE(v.vendor_id::varchar, m.vendor_id),
  usp_id = COALESCE(v.usp_id::text, m.usp_id),
  updated_at = CURRENT_TIMESTAMP
FROM (
  VALUES ${valuesClause}
) AS v(id, category_id, price_each, vendor_id, usp_id)
WHERE m.id = v.id::varchar`,
        });
    }

    const configJson = JSON.stringify({
        orderedCategoryIds: layout.orderedCategoryIds,
        subMenusByCategory: layout.subMenusByCategory,
        itemSubMenuByItemId: layout.itemSubMenuByItemId,
    });
    operations.push({
        title: 'Boxes Org layout',
        impact_select_sql: `SELECT 1 AS id,
  COALESCE((SELECT config FROM public.box_menu_layout_configs WHERE id = 1), '{}'::jsonb) AS before_config,
  ${sqlLiteral(configJson)}::jsonb AS after_config`,
        write_sql: `INSERT INTO public.box_menu_layout_configs (id, config, updated_at)
VALUES (1, ${sqlLiteral(configJson)}::jsonb, CURRENT_TIMESTAMP)
ON CONFLICT (id) DO UPDATE
SET config = EXCLUDED.config, updated_at = EXCLUDED.updated_at`,
    });

    const summary =
        `Boxes Org bootstrap: ${matched.length} item(s)` +
        (newMenuItemCount ? `, ${newMenuItemCount} new menu item(s)` : '') +
        (newCategories.length ? `, ${newCategories.length} new categor${newCategories.length === 1 ? 'y' : 'ies'}` : '') +
        ', folders/layout updated.';

    return {
        ok: true,
        proposal: { summary, operations },
        warnings,
        matchedCount: matched.length,
        skippedCount: skipped,
        newMenuItemCount,
    };
}

export async function runProposeBoxesOrgImportTool(
    upload: ParsedSpreadsheetUpload,
    options: BoxesOrgImportOptions,
    onReady: (payload: PendingWritesReadyPayload) => void | Promise<void>
): Promise<string> {
    const built = await buildBoxesOrgImportProposal(upload, options);
    if (!built.ok) {
        return JSON.stringify({ ok: false, error: built.error }, null, 2);
    }
    const result = await runProposeBatchWritesTool(built.proposal, onReady);
    try {
        const parsed = JSON.parse(result) as { ok?: boolean };
        if (parsed.ok) {
            return JSON.stringify(
                {
                    ...parsed,
                    boxes_org: {
                        matched_rows: built.matchedCount,
                        new_menu_items: built.newMenuItemCount,
                        skipped_rows: built.skippedCount,
                        warnings: built.warnings.slice(0, 40),
                    },
                },
                null,
                2
            );
        }
    } catch {
        /* return raw */
    }
    return result;
}

export { isBoxesOrgSpreadsheet, parseBoxesOrgSpreadsheetRows, BOXES_ORG_TEMPLATE_COLUMNS };

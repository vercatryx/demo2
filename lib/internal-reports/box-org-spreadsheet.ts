import type { ParsedSpreadsheetUpload } from '@/lib/internal-reports/spreadsheet-upload';
import type { BoxOrgSpreadsheetRow } from '@/lib/internal-reports/box-org-types';

const NAME_KEYS = ['name', 'item', 'item name', 'menu item', 'product'];
const CATEGORY_KEYS = ['category', 'catagory', 'cat'];
const SUB1_KEYS = ['sub1', 'sub 1', 'folder1', 'folder 1', 'subfolder1'];
const SUB2_KEYS = ['sub2', 'sub 2', 'folder2', 'folder 2', 'subfolder2'];
const PRICE_KEYS = ['price', 'price_each', 'price each'];
const ITEM_NUM_KEYS = ['item #', 'item#', 'item number', 'item_number', 'sku'];
const UPC_KEYS = ['upc', 'barcode'];
const VENDOR_KEYS = ['vendor', 'vendor name'];
const VENDOR_ID_KEYS = ['vendor_id', 'vendor id'];

function normKey(k: string): string {
    return k.trim().toLowerCase().replace(/\s+/g, ' ');
}

function pickColumn(columns: string[], aliases: string[]): string | null {
    const byNorm = new Map(columns.map((c) => [normKey(c), c]));
    for (const a of aliases) {
        const hit = byNorm.get(normKey(a));
        if (hit) return hit;
    }
    return null;
}

function cellStr(row: Record<string, unknown>, col: string | null): string {
    if (!col) return '';
    const v = row[col];
    if (v == null || v === '') return '';
    return String(v).trim();
}

/** Parses "USD 1.29", "$1.29", or plain numbers into price_each. */
export function parsePriceCell(row: Record<string, unknown>, col: string | null): number | null {
    const s = cellStr(row, col);
    if (!s) return null;
    const usd = s.match(/usd\s*([\d,]+(?:\.\d+)?)/i);
    if (usd) {
        const n = Number(usd[1].replace(/,/g, ''));
        if (Number.isFinite(n) && n > 0) return n;
    }
    const n = Number(s.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : null;
}

export function isBoxesOrgSpreadsheet(upload: ParsedSpreadsheetUpload): boolean {
    const nameCol = pickColumn(upload.columns, NAME_KEYS);
    if (!nameCol) return false;
    const hasOrg =
        Boolean(pickColumn(upload.columns, CATEGORY_KEYS)) ||
        Boolean(pickColumn(upload.columns, SUB1_KEYS)) ||
        Boolean(pickColumn(upload.columns, SUB2_KEYS));
    return hasOrg;
}

export function parseBoxesOrgSpreadsheetRows(upload: ParsedSpreadsheetUpload): BoxOrgSpreadsheetRow[] {
    const cols = upload.columns;
    const nameCol = pickColumn(cols, NAME_KEYS);
    if (!nameCol) {
        throw new Error('Boxes Org spreadsheet needs a Name column (menu item name).');
    }
    const categoryCol = pickColumn(cols, CATEGORY_KEYS);
    const sub1Col = pickColumn(cols, SUB1_KEYS);
    const sub2Col = pickColumn(cols, SUB2_KEYS);
    const priceCol = pickColumn(cols, PRICE_KEYS);
    const itemNumCol = pickColumn(cols, ITEM_NUM_KEYS);
    const upcCol = pickColumn(cols, UPC_KEYS);
    const vendorCol = pickColumn(cols, VENDOR_KEYS);
    const vendorIdCol = pickColumn(cols, VENDOR_ID_KEYS);

    const out: BoxOrgSpreadsheetRow[] = [];
    for (let i = 0; i < upload.rows.length; i++) {
        const row = upload.rows[i];
        const name = cellStr(row, nameCol);
        if (!name) continue;
        out.push({
            rowIndex: i + 2,
            name,
            category: cellStr(row, categoryCol),
            sub1: cellStr(row, sub1Col),
            sub2: cellStr(row, sub2Col),
            price: parsePriceCell(row, priceCol),
            itemNumber: cellStr(row, itemNumCol),
            upc: cellStr(row, upcCol),
            vendorId: cellStr(row, vendorIdCol),
            vendorName: cellStr(row, vendorCol),
        });
    }
    if (out.length === 0) {
        throw new Error('No data rows with a Name value found.');
    }
    return out;
}

export const BOXES_ORG_TEMPLATE_COLUMNS = [
    'menu_item_id',
    'Name',
    'item #',
    'UPC',
    'Price',
    'Category',
    'sub1',
    'Sub2',
    'vendor_id',
    'Vendor',
] as const;

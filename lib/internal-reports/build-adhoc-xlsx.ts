import * as XLSX from 'xlsx';

function safeSheetName(name: string): string {
    const n = name.replace(/[*?:/\\[\]]/g, '_').slice(0, 31);
    return n.length ? n : 'Export';
}

function serializeCell(v: unknown): unknown {
    if (typeof v === 'bigint') return v.toString();
    if (v !== null && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v)) {
        try {
            return JSON.stringify(v);
        } catch {
            return String(v);
        }
    }
    if (Array.isArray(v) || (typeof v === 'object' && v !== null)) {
        try {
            return JSON.stringify(v);
        } catch {
            return String(v);
        }
    }
    return v;
}

function serializeRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
    return rows.map((r) => {
        const o: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(r)) {
            o[k] = serializeCell(v);
        }
        return o;
    });
}

/** Single-sheet workbook (data only). */
export function buildQueryExportWorkbook(rows: Record<string, unknown>[], sheetName: string): Buffer {
    const wb = XLSX.utils.book_new();

    const data = rows.length ? serializeRows(rows) : [{ _message: 'No rows returned.' }];
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(sheetName));

    const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
}

/** One tab per operation — full impact rows for human review before applying writes. */
export function buildMultiSheetImpactWorkbook(sheets: { sheetName: string; rows: Record<string, unknown>[] }[]): Buffer {
    const wb = XLSX.utils.book_new();
    if (sheets.length === 0) {
        const ws = XLSX.utils.json_to_sheet([{ _message: 'No proposal sheets.' }]);
        XLSX.utils.book_append_sheet(wb, ws, 'Summary');
    } else {
        for (const { sheetName, rows } of sheets) {
            const data = rows.length ? serializeRows(rows) : [{ _message: 'No rows in this step.' }];
            const ws = XLSX.utils.json_to_sheet(data);
            XLSX.utils.book_append_sheet(wb, ws, safeSheetName(sheetName));
        }
    }
    const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
}

import * as XLSX from 'xlsx';
import {
    analyzeSpreadsheetStructure,
    buildAttachedSpreadsheetSystemSection,
    type SpreadsheetStructureProfile,
} from '@/lib/internal-reports/spreadsheet-structure';

export type { SpreadsheetStructureProfile } from '@/lib/internal-reports/spreadsheet-structure';
export { analyzeSpreadsheetStructure, formatStructureForUserChat } from '@/lib/internal-reports/spreadsheet-structure';

const MAX_ROWS_PARSE = 5_000;
/** Structure analysis samples at most this many rows; import tools use full `rows`. */
const MAX_ROWS_STRUCTURE_SAMPLE = 150;

function isIgnorableColumn(name: string): boolean {
    const n = name.trim().toLowerCase();
    return !n || n.startsWith('__empty');
}

export type ParsedSpreadsheetUpload = {
    filename: string;
    sheetName: string;
    columns: string[];
    rowCount: number;
    rows: Record<string, unknown>[];
    truncatedForModel: boolean;
};

function serializeCell(v: unknown): unknown {
    if (v == null || v === '') return v;
    if (typeof v === 'bigint') return v.toString();
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'object' && !Array.isArray(v)) {
        try {
            return JSON.stringify(v);
        } catch {
            return String(v);
        }
    }
    return v;
}

function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
        const key = String(k).trim();
        if (!key) continue;
        out[key] = serializeCell(v);
    }
    return out;
}

/** Parse first worksheet of an Excel upload for the copilot to interpret. */
export function parseSpreadsheetUpload(buffer: Buffer, filename: string): ParsedSpreadsheetUpload {
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) {
        throw new Error('The workbook has no sheets.');
    }
    const sheet = wb.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    if (raw.length === 0) {
        throw new Error('The first sheet is empty.');
    }

    const columns = Object.keys(raw[0] ?? {})
        .map((k) => String(k).trim())
        .filter((c) => !isIgnorableColumn(c));
    if (columns.length === 0) {
        throw new Error('No column headers found in the first row.');
    }

    const allRows: Record<string, unknown>[] = [];
    for (let i = 0; i < Math.min(raw.length, MAX_ROWS_PARSE); i++) {
        const normalized = normalizeRow(raw[i]);
        const hasData = Object.values(normalized).some((v) => v !== '' && v != null);
        if (hasData) allRows.push(normalized);
    }

    if (allRows.length === 0) {
        throw new Error('No data rows found below the header row.');
    }

    return {
        filename,
        sheetName,
        columns,
        rowCount: allRows.length,
        rows: allRows,
        truncatedForModel: allRows.length > MAX_ROWS_STRUCTURE_SAMPLE,
    };
}

/** System prompt block: column/structure profile only (full rows stay server-side for apply tools). */
export function formatSpreadsheetForSystemPrompt(
    upload: ParsedSpreadsheetUpload,
    userHint?: string,
    profile?: SpreadsheetStructureProfile
): string {
    const p = profile ?? analyzeSpreadsheetStructure(upload);
    return buildAttachedSpreadsheetSystemSection(upload, p, userHint);
}

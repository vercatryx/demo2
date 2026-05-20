import * as XLSX from 'xlsx';
import type { ReportSheet } from '@/lib/internal-reports/types';

function safeSheetName(name: string): string {
    const n = name.replace(/[*?:/\\[\]]/g, '_').slice(0, 31);
    return n.length ? n : 'Sheet';
}

/** Multi-sheet workbook: README + one sheet per report block. */
export function buildReportsWorkbook(sheets: ReportSheet[], generatedAtIso: string): Buffer {
    const wb = XLSX.utils.book_new();

    const readmeRows: (string | number | null)[][] = [
        ['Demo Food — internal operational reports'],
        ['Generated (UTC)', generatedAtIso],
        [''],
        ['Each data sheet includes a title in row 1 of metadata is in README only; data starts at row 1 in sheet.'],
        [''],
        ['Sheets included:'],
        ...sheets.map((s) => [s.name, s.title, s.methodology ?? '']),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(readmeRows), 'README');

    for (const sh of sheets) {
        const rows = sh.rows.length ? sh.rows : [{ _empty: 'No rows matched this report.' }];
        const ws = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, safeSheetName(sh.name));
    }

    const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
}

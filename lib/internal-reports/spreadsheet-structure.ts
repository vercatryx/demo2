import { isBoxesOrgSpreadsheet } from '@/lib/internal-reports/box-org-spreadsheet';
import type { ParsedSpreadsheetUpload } from '@/lib/internal-reports/spreadsheet-upload';

export type SpreadsheetColumnProfile = {
    name: string;
    nonEmptyCount: number;
    emptyCount: number;
    inferredType: 'text' | 'number' | 'date' | 'boolean' | 'mixed';
    sampleValues: string[];
};

export type SpreadsheetStructureProfile = {
    filename: string;
    sheetName: string;
    rowCount: number;
    columnCount: number;
    columns: SpreadsheetColumnProfile[];
    /** Heuristic labels — what this file likely is for in Demo Food. */
    detectedProfiles: string[];
    suggestedActions: string[];
    boxesOrgDetected: boolean;
};

const NAME_LIKE = /^(name|item|menu|product)/i;
const ID_LIKE = /^(id|_.*_id$|menu_item_id|client_id|vendor_id)/i;
const PRICE_LIKE = /^(price|price_each|amount)/i;
const VENDOR_LIKE = /^vendor/i;
const CATEGORY_LIKE = /^(category|catagory|cat)$/i;
const SUB1_LIKE = /^sub\s*1$|^sub1$|^folder\s*1$/i;
const SUB2_LIKE = /^sub\s*2$|^sub2$|^folder\s*2$/i;

function normCol(c: string): string {
    return c.trim().toLowerCase().replace(/\s+/g, ' ');
}

function inferCellType(v: unknown): 'empty' | 'text' | 'number' | 'date' | 'boolean' {
    if (v == null || v === '') return 'empty';
    if (typeof v === 'boolean') return 'boolean';
    if (typeof v === 'number' && Number.isFinite(v)) return 'number';
    if (v instanceof Date) return 'date';
    const s = String(v).trim();
    if (!s) return 'empty';
    if (/^(true|false)$/i.test(s)) return 'boolean';
    if (!Number.isNaN(Number(s.replace(/[$,]/g, ''))) && /[\d]/.test(s)) return 'number';
    if (/^\d{4}-\d{2}-\d{2}/.test(s) || /^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(s)) return 'date';
    return 'text';
}

function mergeTypes(types: Set<string>): SpreadsheetColumnProfile['inferredType'] {
    const t = [...types].filter((x) => x !== 'empty');
    if (t.length === 0) return 'text';
    if (t.length === 1) return t[0] as SpreadsheetColumnProfile['inferredType'];
    if (t.every((x) => x === 'text' || x === 'number')) return 'mixed';
    return 'mixed';
}

function sampleToString(v: unknown): string {
    if (v == null || v === '') return '';
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    const s = String(v).trim();
    return s.length > 48 ? `${s.slice(0, 45)}…` : s;
}

/** Inspect columns and shape only — not a full data dump for the model. */
const STRUCTURE_SAMPLE = 150;

export function analyzeSpreadsheetStructure(upload: ParsedSpreadsheetUpload): SpreadsheetStructureProfile {
    const sampleRows = upload.rows.slice(0, STRUCTURE_SAMPLE);
    const rowCount = upload.rowCount;
    const columns: SpreadsheetColumnProfile[] = upload.columns.map((col) => {
        const types = new Set<string>();
        const samples: string[] = [];
        let nonEmpty = 0;
        for (const row of sampleRows) {
            const v = row[col];
            const t = inferCellType(v);
            types.add(t);
            if (t !== 'empty') {
                nonEmpty++;
                const s = sampleToString(v);
                if (s && samples.length < 3 && !samples.includes(s)) samples.push(s);
            }
        }
        // Extrapolate non-empty from sample if rows truncated in memory
        const sampledRows = upload.rows.length;
        const emptyInSample = sampledRows - nonEmpty;
        const estimatedNonEmpty =
            sampledRows > 0 && sampledRows < rowCount
                ? Math.round((nonEmpty / sampledRows) * rowCount)
                : nonEmpty;
        return {
            name: col,
            nonEmptyCount: Math.min(estimatedNonEmpty, rowCount),
            emptyCount: Math.max(0, rowCount - estimatedNonEmpty),
            inferredType: mergeTypes(types),
            sampleValues: samples,
        };
    });

    const colNorms = new Set(upload.columns.map(normCol));
    const detectedProfiles: string[] = [];
    const suggestedActions: string[] = [];
    const boxesOrgDetected = isBoxesOrgSpreadsheet(upload);

    if (boxesOrgDetected) {
        detectedProfiles.push('boxes_org (Admin → Boxes Org: menu_items + folder layout)');
        suggestedActions.push('export_boxes_org_template (refresh from DB)');
        suggestedActions.push(
            'propose_boxes_org_import (creates missing menu_items + categories + folders — needs Enable editing)'
        );
    }

    const hasName = [...colNorms].some((c) => NAME_LIKE.test(c));
    const hasPrice = [...colNorms].some((c) => PRICE_LIKE.test(c));
    const hasId = [...colNorms].some((c) => ID_LIKE.test(c) || c.endsWith('_id') || c === 'id');
    const hasVendor = [...colNorms].some((c) => VENDOR_LIKE.test(c));
    const hasCategory = [...colNorms].some((c) => CATEGORY_LIKE.test(c));
    const hasSub = [...colNorms].some((c) => SUB1_LIKE.test(c) || SUB2_LIKE.test(c));

    if (hasName && hasPrice && !boxesOrgDetected) {
        detectedProfiles.push('menu_or_catalog_pricing (likely menu_items.price_each updates)');
        suggestedActions.push('propose_batch_writes with impact SELECT on menu_items');
    }
    if (hasId && hasPrice) {
        suggestedActions.push('Match rows by id column for safer bulk UPDATEs');
    }
    if (hasVendor) {
        detectedProfiles.push('vendor_columns (join or update vendor_id on menu_items / orders)');
    }
    if (hasCategory || hasSub) {
        detectedProfiles.push('category_or_folder_columns');
    }
    if (detectedProfiles.length === 0) {
        detectedProfiles.push('generic_tabular (map columns to public tables via data dictionary)');
        suggestedActions.push('run_select_query to preview joins, then export or propose_batch_writes');
    }

    suggestedActions.push('offer_spreadsheet_reupload (optional — user already has Upload Excel visible)');

    return {
        filename: upload.filename,
        sheetName: upload.sheetName,
        rowCount,
        columnCount: upload.columns.length,
        columns,
        detectedProfiles,
        suggestedActions: [...new Set(suggestedActions)],
        boxesOrgDetected,
    };
}

export function formatStructureForUserChat(profile: SpreadsheetStructureProfile, userHint?: string): string {
    const lines = [
        `Uploaded **${profile.filename}** (${profile.rowCount} rows, ${profile.columnCount} columns on sheet "${profile.sheetName}").`,
        '',
        '**Likely use:** ' + profile.detectedProfiles.join('; '),
        '',
        '**Columns:**',
        ...profile.columns.map((c) => {
            const samples =
                c.sampleValues.length > 0 ? ` — e.g. ${c.sampleValues.map((s) => `"${s}"`).join(', ')}` : '';
            return `- \`${c.name}\` (${c.inferredType}, ~${c.nonEmptyCount} filled)${samples}`;
        }),
    ];
    if (userHint?.trim()) lines.push('', `**Your note:** ${userHint.trim()}`);
    lines.push('', 'What should we do with this file? (I only inspected structure — not every row.)');
    return lines.join('\n');
}

export function buildAttachedSpreadsheetSystemSection(
    upload: ParsedSpreadsheetUpload,
    profile: SpreadsheetStructureProfile,
    userHint?: string
): string {
    const hint = userHint?.trim() ? `\nUser note: ${userHint.trim()}` : '';
    const colBlock = profile.columns
        .map(
            (c) =>
                `- \`${c.name}\`: type≈${c.inferredType}, ~${c.nonEmptyCount}/${profile.rowCount} non-empty` +
                (c.sampleValues.length ? `, samples: ${c.sampleValues.join(' | ')}` : '')
        )
        .join('\n');

    return (
        `### Attached spreadsheet (structure only — do not assume row-level values)${hint}\n` +
        `- **File:** ${upload.filename} | **Sheet:** ${upload.sheetName} | **Rows:** ${profile.rowCount} | **Columns:** ${profile.columnCount}\n` +
        `- **Full row data** is stored server-side for this chat (not repeated here). Use import tools when the user asks to **apply**; until then, reason from **structure** and answer in plain language.\n` +
        `- **Detected profiles:** ${profile.detectedProfiles.join('; ')}\n` +
        `- **Suggested tools:** ${profile.suggestedActions.join('; ')}\n\n` +
        `**Column profiles:**\n${colBlock}\n\n` +
        `**Behavior on upload:** Explain what this file *can* be used for (exports, Boxes Org import, batch writes, etc.). ` +
        `Do **not** paste row JSON. Do **not** auto-apply unless the user clearly asked to apply/import. ` +
        `Ask what they want next.\n` +
        (profile.boxesOrgDetected
            ? `\n**Boxes Org:** Use **propose_boxes_org_import** when they want to apply — not \`box_types\`.\n`
            : '')
    );
}

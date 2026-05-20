import { buildMultiSheetImpactWorkbook } from '@/lib/internal-reports/build-adhoc-xlsx';
import { putExportXlsx } from '@/lib/internal-reports/export-token-cache';
import { tryPublishXlsxPublicUrl } from '@/lib/internal-reports/publish-export-r2';
import { createPendingWritesToken } from '@/lib/internal-reports/pending-writes-store';
import { validateReadonlySelect, runReadonlySelectForExport } from '@/lib/internal-reports/read-sql';
import { toolUnavailablePayload } from '@/lib/internal-reports/user-errors';
import { dryRunWritesInRollbackTransaction, internalReportsWritesEnabled, validateSingleWriteSql } from '@/lib/internal-reports/write-sql';

const MAX_OPERATIONS = 12;
const MAX_IMPACT_ROWS_PER_OP = 25_000;
const SAMPLE_ROWS_FOR_UI = 5;

export type ProposeBatchOperationInput = {
    title: string;
    impact_select_sql: string;
    write_sql: string;
};

export type ProposeBatchWritesInput = {
    summary: string;
    operations: ProposeBatchOperationInput[];
};

export type PendingWritesReadyPayload = {
    pendingId: string;
    summary: string;
    operationCount: number;
    totalImpactRows: number;
    downloadUrl: string;
    filename: string;
    operations: { title: string; impactRowCount: number; sampleRows: Record<string, unknown>[] }[];
};

function sanitizeProposalFilenameBase(summary: string): string {
    let s = summary
        .replace(/[\x00-\x1f<>:"/\\|?*]+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    s = s.replace(/^\.+|\.+$/g, '');
    if (!s) s = 'Proposed data changes';
    if (s.length > 80) s = s.slice(0, 80).trim();
    return s;
}

function buildProposalXlsxFilename(summary: string): string {
    const base = sanitizeProposalFilenameBase(summary);
    const dateStr = new Date().toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'America/New_York',
    });
    return `Proposed changes — ${base} — ${dateStr}.xlsx`;
}

function shortSheetTitle(title: string, index: number): string {
    const raw = (title || `Step ${index + 1}`).trim() || `Step ${index + 1}`;
    return raw.length > 60 ? `${raw.slice(0, 57)}…` : raw;
}

/**
 * Validates impact SELECTs, builds review workbook, dry-runs writes (rolled back), stores pending payload.
 */
export async function runProposeBatchWritesTool(
    input: unknown,
    onReady: (payload: PendingWritesReadyPayload) => void | Promise<void>
): Promise<string> {
    if (!internalReportsWritesEnabled()) {
        return toolUnavailablePayload('propose_batch_writes', 'batch writes disabled in env');
    }

    const body = (input ?? {}) as ProposeBatchWritesInput;
    const summary = String(body.summary ?? '').trim();
    const operations = Array.isArray(body.operations) ? body.operations : [];

    if (!summary) {
        return JSON.stringify({ ok: false, error: '`summary` is required (plain-language description of the change).' }, null, 2);
    }
    if (operations.length === 0) {
        return JSON.stringify({ ok: false, error: 'At least one operation is required.' }, null, 2);
    }
    if (operations.length > MAX_OPERATIONS) {
        return JSON.stringify(
            { ok: false, error: `Too many operations (max ${MAX_OPERATIONS}). Split into smaller proposals.` },
            null,
            2
        );
    }

    const normalized: { title: string; impactSql: string; writeSql: string }[] = [];
    for (let i = 0; i < operations.length; i++) {
        const op = operations[i] as ProposeBatchOperationInput;
        const title = String(op?.title ?? '').trim() || `Step ${i + 1}`;
        const impactSql = String(op?.impact_select_sql ?? '').trim();
        const writeSql = String(op?.write_sql ?? '').trim();
        if (!impactSql || !writeSql) {
            return JSON.stringify(
                { ok: false, error: `Operation ${i + 1} (${title}): both impact_select_sql and write_sql are required.` },
                null,
                2
            );
        }
        const iv = validateReadonlySelect(impactSql);
        if (!iv.ok) {
            return JSON.stringify(
                { ok: false, error: `Operation ${i + 1} (${title}) impact_select_sql: ${iv.error}` },
                null,
                2
            );
        }
        const wv = validateSingleWriteSql(writeSql);
        if (!wv.ok) {
            return JSON.stringify(
                { ok: false, error: `Operation ${i + 1} (${title}) write_sql: ${wv.error}` },
                null,
                2
            );
        }
        normalized.push({ title, impactSql: iv.sql, writeSql: wv.sql });
    }

    const sheets: { sheetName: string; rows: Record<string, unknown>[] }[] = [];
    const opMeta: { title: string; impactRowCount: number; sampleRows: Record<string, unknown>[] }[] = [];
    let totalImpactRows = 0;

    try {
        for (let i = 0; i < normalized.length; i++) {
            const { title, impactSql } = normalized[i];
            const r = await runReadonlySelectForExport(impactSql, MAX_IMPACT_ROWS_PER_OP);
            totalImpactRows += r.row_count;
            sheets.push({
                sheetName: shortSheetTitle(title, i),
                rows: r.rows,
            });
            opMeta.push({
                title,
                impactRowCount: r.row_count,
                sampleRows: r.rows.slice(0, SAMPLE_ROWS_FOR_UI),
            });
        }
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return toolUnavailablePayload('propose_batch_writes impact', msg);
    }

    if (totalImpactRows === 0) {
        return JSON.stringify(
            {
                ok: false,
                error: 'Impact SELECTs returned zero rows total. Adjust criteria or confirm data before proposing writes.',
            },
            null,
            2
        );
    }

    try {
        await dryRunWritesInRollbackTransaction(normalized.map((o) => o.writeSql));
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return toolUnavailablePayload('propose_batch_writes dry-run', msg);
    }

    let pendingId: string;
    try {
        pendingId = createPendingWritesToken({
            summary,
            operations: normalized.map((o) => ({ title: o.title, write_sql: o.writeSql })),
        });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return JSON.stringify({ ok: false, error: msg }, null, 2);
    }

    let buf: Buffer;
    try {
        buf = buildMultiSheetImpactWorkbook(sheets);
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return JSON.stringify({ ok: false, error: `Failed to build review workbook: ${msg}` }, null, 2);
    }

    const fname = buildProposalXlsxFilename(summary);
    let downloadUrl: string;
    try {
        const publicUrl = await tryPublishXlsxPublicUrl(buf, fname);
        downloadUrl =
            publicUrl ??
            (() => {
                const token = putExportXlsx(buf, fname);
                return `/api/internal-reports/download?token=${token}`;
            })();
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return JSON.stringify({ ok: false, error: `Failed to publish review workbook: ${msg}` }, null, 2);
    }

    const payload: PendingWritesReadyPayload = {
        pendingId,
        summary,
        operationCount: normalized.length,
        totalImpactRows,
        downloadUrl,
        filename: fname,
        operations: opMeta,
    };
    await onReady(payload);

    return JSON.stringify(
        {
            ok: true,
            pending_id: pendingId,
            instruction:
                'In your reply: (1) Give a short plain-language recap of what will change. (2) Show a **small** markdown table of examples using `sample_rows` below (not every row). (3) Say the full audit trail is in the Excel file linked in the UI and they must review it before applying. (4) Explain they can **Apply changes** or **Dismiss** — nothing runs until they confirm in the UI with APPLY. Do not paste the raw download URL.',
            summary,
            total_impact_rows: totalImpactRows,
            operations: opMeta.map((o) => ({
                title: o.title,
                impact_row_count: o.impactRowCount,
                sample_rows: o.sampleRows,
            })),
        },
        null,
        2
    );
}

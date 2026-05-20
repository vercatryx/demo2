import fs from 'fs';
import path from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { callLLM, type LlmMessage, type LlmTool } from '@/lib/ai/llm';
import { resolveReportsLlm } from '@/lib/llm-env';
import {
    DATA_COPILOT_SUPPORT_MESSAGE,
    toolUnavailablePayload,
    toUserFacingReportsError,
} from '@/lib/internal-reports/user-errors';
import { buildQueryExportWorkbook } from '@/lib/internal-reports/build-adhoc-xlsx';
import { putExportXlsx } from '@/lib/internal-reports/export-token-cache';
import { tryPublishXlsxPublicUrl } from '@/lib/internal-reports/publish-export-r2';
import { runProposeBatchWritesTool } from '@/lib/internal-reports/propose-batch-writes';
import { validateEditingSessionToken } from '@/lib/internal-reports/editing-session';
import { getInternalReportsPostgresUrl, runReadonlySelect, runReadonlySelectForExport } from '@/lib/internal-reports/read-sql';
import { internalReportsWritesEnabled } from '@/lib/internal-reports/write-sql';
import {
    exportBoxesOrgTemplateXlsx,
    runProposeBoxesOrgImportTool,
} from '@/lib/internal-reports/box-org-import';
import { isBoxesOrgSpreadsheet } from '@/lib/internal-reports/box-org-spreadsheet';
import {
    formatSpreadsheetForSystemPrompt,
    type ParsedSpreadsheetUpload,
} from '@/lib/internal-reports/spreadsheet-upload';
import type { SpreadsheetStructureProfile } from '@/lib/internal-reports/spreadsheet-structure';

const MAX_TURNS = 20;

function loadDictionaryExcerpt(maxChars: number): string {
    const p = path.join(process.cwd(), 'docs', 'DATABASE_DATA_DICTIONARY.md');
    if (!fs.existsSync(p)) {
        return '(docs/DATABASE_DATA_DICTIONARY.md not found — run `npm run db:docs`.)';
    }
    const raw = fs.readFileSync(p, 'utf8');
    if (raw.length <= maxChars) return raw;
    return raw.slice(0, maxChars) + '\n\n… [truncated; full file in repo docs/DATABASE_DATA_DICTIONARY.md]';
}

/** Strip characters unsafe in Windows / macOS filenames; keep spaces and normal punctuation readable. */
function sanitizeDownloadFilenameBase(label: string): string {
    let s = label
        .replace(/[\x00-\x1f<>:"/\\|?*]+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    s = s.replace(/^\.+|\.+$/g, '');
    if (!s) s = 'Data export';
    if (s.length > 100) s = s.slice(0, 100).trim();
    return s;
}

/** Filename shown to the user when they download (spaces allowed; no ISO timestamps). */
function buildFriendlyXlsxFilename(downloadLabel: string): string {
    const base = sanitizeDownloadFilenameBase(downloadLabel);
    const dateStr = new Date().toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'America/New_York',
    });
    return `${base} - ${dateStr}.xlsx`;
}

/** Text-only recap so the model remembers recent turns without relying on bulky tool payloads. */
function buildConversationRecap(msgs: LlmMessage[], maxUserLines: number, maxAssistantExcerpts: number): string {
    const users: string[] = [];
    const assistants: string[] = [];
    for (const m of msgs) {
        if (m.role === 'user') {
            users.push((m as { content: string }).content.trim().slice(0, 2000));
        } else if (m.role === 'assistant') {
            const c = ((m as { content?: string }).content ?? '').trim();
            if (c) assistants.push(c.slice(0, 900));
        }
    }
    if (users.length === 0 && assistants.length === 0) return '';
    const u = users.slice(-maxUserLines);
    const a = assistants.slice(-maxAssistantExcerpts);
    const parts: string[] = [];
    if (u.length) {
        parts.push(
            '**Recent user messages** (oldest → newest; text only, no query result rows):\n' +
                u.map((t, i) => `${i + 1}. ${t}`).join('\n\n')
        );
    }
    if (a.length) {
        parts.push(
            '**Recent assistant replies** (excerpts, oldest → newest):\n' + a.map((t, i) => `${i + 1}. ${t}`).join('\n\n')
        );
    }
    return parts.join('\n\n');
}

/**
 * Keeps the last `tailCount` messages verbatim for the model.
 * Older `tool` messages are replaced with a short placeholder so context stays bounded.
 */
function lightenHistoryForLlm(msgs: LlmMessage[], tailCount: number): LlmMessage[] {
    if (msgs.length <= tailCount) return msgs;
    const cut = msgs.length - tailCount;
    return msgs.map((m, i) => {
        if (i < cut && m.role === 'tool') {
            const t = m as { role: 'tool'; toolCallId: string; toolName: string; content: string };
            return {
                ...m,
                content: JSON.stringify({
                    note: 'Earlier tool output omitted from context (no row data here).',
                    tool: t.toolName,
                }),
            };
        }
        return m;
    });
}

function buildTools(includeProposeWrites: boolean): LlmTool[] {
    const proposeWritesTool: LlmTool = {
        name: 'propose_batch_writes',
        description:
            'When the user wants **bulk data changes** (UPDATE/DELETE/INSERT): build a **review package**. ' +
            'Requires a read-only **impact_select_sql** per step that lists **every** affected row with clear before/after columns, ' +
            'and a matching **write_sql** (single UPDATE, DELETE, or INSERT). Creates a multi-sheet Excel for full audit and registers a pending change — **nothing is committed** until the user confirms in the UI. ' +
            'Use only after you understand the schema; prefer narrow predicates and public schema.',
        inputSchema: {
            type: 'object',
            properties: {
                summary: {
                    type: 'string',
                    description:
                        'Plain-language description of the overall change (used in filenames and the confirmation UI).',
                },
                operations: {
                    type: 'array',
                    description:
                        'Ordered steps; all run in one transaction if the user applies. Each step needs matching scope between impact SELECT and write SQL.',
                    items: {
                        type: 'object',
                        properties: {
                            title: { type: 'string', description: 'Short label for this step / Excel tab.' },
                            impact_select_sql: {
                                type: 'string',
                                description:
                                    'Single SELECT or WITH (read-only). Must return **all** rows this step will affect, with audit columns.',
                            },
                            write_sql: {
                                type: 'string',
                                description: 'Single UPDATE, DELETE, or INSERT that performs this step for the same rows.',
                            },
                        },
                        required: ['title', 'impact_select_sql', 'write_sql'],
                    },
                },
            },
            required: ['summary', 'operations'],
        },
    };

    const out: LlmTool[] = [
        {
            name: 'run_select_query',
            description:
                'Preview: run a single read-only SELECT or WITH (max 1000 rows returned). Use this to explore, validate joins, and check row counts before exporting.',
            inputSchema: {
                type: 'object',
                properties: {
                    sql: { type: 'string', description: 'Single SELECT or WITH statement.' },
                    max_rows: {
                        type: 'integer',
                        description: 'Optional max rows (default 300, hard cap 1000).',
                    },
                },
                required: ['sql'],
            },
        },
        {
            name: 'export_select_to_xlsx',
            description:
                'Build a downloadable Excel workbook from ONE read-only SELECT/WITH (single data sheet). ' +
                '**Default:** call this whenever the user asked anything that can be answered with tabular query results — ' +
                'they should almost always get an .xlsx without having to ask. Skip only for pure definitions, empty results they do not care to download, or when they explicitly say no file.',
            inputSchema: {
                type: 'object',
                properties: {
                    sql: { type: 'string', description: 'Single SELECT or WITH to export.' },
                    download_label: {
                        type: 'string',
                        description:
                            'Human-readable download title (becomes the .xlsx filename). 3–10 words a teammate would ' +
                            'recognize: what this file is and roughly for when (e.g. "Orders stuck in billing past 14 days", ' +
                            '"Active clients with no order this week"). Title or sentence case; no file extension; avoid ' +
                            'SQL, table names, or snake_case.',
                    },
                    sheet_name: {
                        type: 'string',
                        description:
                            'Optional short Excel tab name (≤31 chars after sanitization). If omitted, derived from download_label.',
                    },
                    max_rows: {
                        type: 'integer',
                        description: 'Optional max rows (default 10000, hard cap 25000).',
                    },
                },
                required: ['sql', 'download_label'],
            },
        },
    ];
    out.push({
        name: 'offer_spreadsheet_reupload',
        description:
            'Show the **Upload Excel** button in the chat UI. Call when the user should **edit a spreadsheet and re-upload** it for bulk changes — ' +
            'typically right after you export an editable template (stable id/key columns + columns they fill in). ' +
            'Do **not** call for read-only exports or one-off downloads.',
        inputSchema: {
            type: 'object',
            properties: {
                label: {
                    type: 'string',
                    description:
                        'One short sentence shown beside Upload Excel (e.g. "After editing, upload your filled file here.").',
                },
                optional_hint: {
                    type: 'string',
                    description:
                        'Optional default note sent with the upload (e.g. "new values are in the new_price_each column").',
                },
            },
            required: ['label'],
        },
    });
    out.push({
        name: 'export_boxes_org_template',
        description:
            'Download the **Boxes Org** Excel template (Admin → Boxes Org): menu items with Category, sub1, Sub2 folders, ' +
            'price, vendor, and ids. Use before bulk org edits; then **offer_spreadsheet_reupload** for the filled file.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    });
    if (includeProposeWrites) {
        out.push(proposeWritesTool);
        out.push({
            name: 'propose_boxes_org_import',
            description:
                'Apply an attached **Boxes Org** spreadsheet: create missing **menu_items**, **item_categories**, and folder layout, ' +
                'then assign items to Category/sub1/Sub2. Same as Admin → Boxes Org bootstrap. Requires **Enable editing** + upload in chat. ' +
                'Do **not** use propose_batch_writes with invented upload_* tables.',
            inputSchema: {
                type: 'object',
                properties: {
                    usp_id_source: {
                        type: 'string',
                        enum: ['item_number', 'upc'],
                        description:
                            'Which spreadsheet column maps to menu_items.usp_id. Default item_number (column "item #").',
                    },
                    create_missing_menu_items: {
                        type: 'boolean',
                        description:
                            'If true (default), INSERT new menu_items for Names not in DB (value=1, no vendor, parsed price).',
                    },
                    create_missing_categories: {
                        type: 'boolean',
                        description: 'If true (default), INSERT item_categories when Category name is new.',
                    },
                    create_missing_folders: {
                        type: 'boolean',
                        description: 'If true (default), create sub1/Sub2 folder nodes when missing in layout JSON.',
                    },
                    default_item_value: {
                        type: 'number',
                        description: 'menu_items.value and quota_value for new items (default 1).',
                    },
                },
            },
        });
    }
    return out;
}

function toolOfferSpreadsheetReupload(input: unknown): string {
    const body = (input ?? {}) as { label?: string; optional_hint?: string };
    const label = String(body.label ?? '').trim();
    if (!label) {
        return JSON.stringify({ ok: false, error: 'label is required.' }, null, 2);
    }
    return JSON.stringify(
        {
            ok: true,
            upload_button_offered: true,
            label,
            optional_hint: body.optional_hint?.trim() || undefined,
        },
        null,
        2
    );
}

async function toolRunSelectQuery(input: unknown): Promise<string> {
    const body = (input ?? {}) as { sql?: string; max_rows?: number };
    const sql = String(body.sql ?? '');
    const maxRows = typeof body.max_rows === 'number' ? body.max_rows : undefined;
    try {
        const r = await runReadonlySelect(sql, maxRows ?? 300);
        return JSON.stringify(
            {
                ok: true,
                columns: r.columns,
                row_count: r.row_count,
                truncated: r.truncated,
                max_rows_applied: r.max_rows_applied,
                sample_rows: r.rows.slice(0, 25),
            },
            null,
            2
        );
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return toolUnavailablePayload('run_select_query', msg);
    }
}

async function toolExportSelectToXlsx(input: unknown): Promise<string> {
    const body = (input ?? {}) as { sql?: string; sheet_name?: string; max_rows?: number; download_label?: string };
    const sql = String(body.sql ?? '');
    const downloadLabel = String(body.download_label ?? '').trim();
    const sheetName =
        String(body.sheet_name ?? downloadLabel ?? 'Export')
            .trim()
            .slice(0, 80) || 'Export';
    const maxRows = typeof body.max_rows === 'number' ? body.max_rows : 10_000;
    try {
        const r = await runReadonlySelectForExport(sql, maxRows);
        const buf = buildQueryExportWorkbook(r.rows, sheetName);
        const fname = buildFriendlyXlsxFilename(downloadLabel || sheetName);
        const publicUrl = await tryPublishXlsxPublicUrl(buf, fname);
        const downloadUrl = publicUrl ?? (() => {
            const token = putExportXlsx(buf, fname);
            return `/api/internal-reports/download?token=${token}`;
        })();
        return JSON.stringify(
            {
                ok: true,
                download_url: downloadUrl,
                filename: fname,
                row_count: r.row_count,
                truncated: r.truncated,
                max_rows_applied: r.max_rows_applied,
                column_count: r.columns.length,
            },
            null,
            2
        );
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return toolUnavailablePayload('export_select_to_xlsx', msg);
    }
}

function countSuccessfulSql(msgs: LlmMessage[]): number {
    let n = 0;
    for (const m of msgs) {
        if (m.role === 'tool' && m.content.includes('"ok": true')) n++;
    }
    return n;
}

function toolSummary(name: string, payload: string): string {
    const max = 400;
    if (payload.length <= max) return payload;
    return payload.slice(0, max) + '…';
}

export type InternalReportsProgressEvent =
    | { type: 'turn'; turn: number; maxTurns: number }
    | { type: 'llm_start' }
    | { type: 'llm_end'; toolCallCount: number; textLength: number }
    | { type: 'tool_start'; name: string; callId: string }
    | { type: 'tool_end'; name: string; callId: string; summary: string }
    | { type: 'export_ready'; url: string; filename: string; rowCount: number; truncated: boolean }
    | {
          type: 'pending_writes_ready';
          pendingId: string;
          summary: string;
          operationCount: number;
          totalImpactRows: number;
          downloadUrl: string;
          filename: string;
          operations: { title: string; impactRowCount: number; sampleRows: Record<string, unknown>[] }[];
      }
    | { type: 'assistant_chunk'; text: string }
    | { type: 'spreadsheet_upload_offered'; label: string; hint?: string };

export type InternalReportsChatOptions = {
    requireSqlSuccessCount?: number;
    onProgress?: (e: InternalReportsProgressEvent) => void | Promise<void>;
    /** If true, emit assistant_chunk events by splitting final assistant text (UX “typing”). */
    streamAssistantTyping?: boolean;
    /**
     * Signed token from POST /api/internal-reports/editing-session (user enabled **Enable editing**).
     * Without a valid token, propose_batch_writes is not offered and must not run.
     */
    editingSessionToken?: string;
    /** Parsed Excel from POST /api/internal-reports/upload-spreadsheet — copilot infers bulk changes. */
    spreadsheetUpload?: ParsedSpreadsheetUpload;
    spreadsheetUploadHint?: string;
    spreadsheetStructure?: SpreadsheetStructureProfile;
};

export async function runInternalReportsChat(
    _supabase: SupabaseClient,
    messages: LlmMessage[],
    options?: InternalReportsChatOptions
): Promise<{ messages: LlmMessage[]; error?: string }> {
    const emit = options?.onProgress;
    const streamTyping = options?.streamAssistantTyping === true;
    const chunkSize = 72;

    const llm = resolveReportsLlm();
    if (!llm) {
        console.error('[internal-reports] No LLM API key configured');
        return {
            messages,
            error: DATA_COPILOT_SUPPORT_MESSAGE,
        };
    }
    const { provider, model } = llm;

    const dict = loadDictionaryExcerpt(45_000);
    const pgConfigured = Boolean(getInternalReportsPostgresUrl());
    const editingUnlocked = validateEditingSessionToken(options?.editingSessionToken);
    const writesToolEnabled = Boolean(pgConfigured && internalReportsWritesEnabled() && editingUnlocked);
    const editingGateHelp =
        internalReportsWritesEnabled() && pgConfigured && !editingUnlocked
            ? `

### Data editing gate
- **Enable editing** is off for this chat request: **propose_batch_writes** is not in your tool list. Ask the user to turn **Enable editing** on in the page header and send their message again.
`
            : internalReportsWritesEnabled() && pgConfigured && editingUnlocked
              ? `

### Data editing gate
- **Enable editing** is **on** for this request: **propose_batch_writes** is in your tool list. When the user wants bulk data changes, use it (impact SELECT + write SQL per step, review Excel, then they confirm in the UI). **Do not** ask them to enable editing again unless a later message clearly fails for lack of a session token.
`
              : '';

    const mutationPolicy = `

### Data mutations — no manual SQL (critical)
- **Never** put runnable **UPDATE**, **DELETE**, **INSERT**, DDL, or multi-statement write scripts in your reply for anyone to paste into a SQL client. This copilot does not offer a “run it yourself” path.
- **Never** invent tables from filenames (e.g. \`upload_good_stuff_sheet1\`) — there is no per-upload table. Boxes Org spreadsheets → **propose_boxes_org_import** only.
- Data changes only go through **propose_batch_writes** or **propose_boxes_org_import** (review Excel + UI confirmation), and only when that tool appears in your list (**Enable editing** on; batch writes are on by default unless an admin disabled them in server env).
- If the user asks to **modify** rows but **propose_batch_writes** is **not** in your tools: tell them to turn **Enable editing** on in the page header and ask again (or, if batch writes were explicitly disabled for this deployment, that must be turned back on in server configuration). You may still use **run_select_query** / **export_select_to_xlsx** with **SELECT/WITH only** to explore or export — **no DML in prose.**
`;

    const toolsList = `### Tools
- **run_select_query** — fast preview (capped rows). Use to explore and validate logic.
- **export_select_to_xlsx** — produce a **downloadable Excel** (one data sheet) from one SELECT/WITH.
- **offer_spreadsheet_reupload** — show the **Upload Excel** button after an editable export (call when re-upload is the next step).
- **export_boxes_org_template** — Excel for **Admin → Boxes Org** (menu items + Category/sub1/Sub2).${
        writesToolEnabled
            ? '\n- **propose_batch_writes** — package **bulk writes** for human review: impact SELECT + matching write SQL per step; generates a multi-sheet **review Excel** and a pending change. **Does not commit** until the user confirms in the UI.\n- **propose_boxes_org_import** — apply an uploaded Boxes Org spreadsheet (same tables as the admin tab; requires upload in chat).'
            : ''
    }`;

    const writesInstructions = writesToolEnabled
        ? `

### Batch data changes (propose_batch_writes)
- Use when the user asks to **update, delete, or insert** many rows — not for read-only questions.
- For **each** step provide **title**, **impact_select_sql** (single SELECT/WITH), and **write_sql** (single UPDATE, DELETE, or INSERT).
- **impact_select_sql** must list **every** row that step will touch, with columns that make the change obvious (e.g. keys, \`before_*\` / \`after_*\` or current vs proposed values). This populates the review Excel.
- **write_sql** must apply only to that same scope (same filters/joins in spirit). Steps run **in order** in **one transaction** if applied.
- Prefer **run_select_query** first to validate predicates; then call **propose_batch_writes** with the final impact SELECTs and writes.
- After the tool returns: give a short recap, a **small** markdown table from the sample rows only, and say the **full** audit is in the review Excel and nothing applies until they confirm in the UI. **Never** claim the database was already updated.
- **Do not** paste the tool’s **write_sql** (or raw UPDATE/DELETE/INSERT) into your assistant message — the UI and apply step handle execution.
`
        : '';

    const baseSystem = `You are the Demo Food app's **internal data copilot** (meal delivery / client orders / vendors / billing). There are **no pre-built report definitions** in your toolset: you interpret every question from scratch using the schema documentation below, write your own SQL, and answer from query results.

${toolsList}
${writesInstructions}${editingGateHelp}${mutationPolicy}
### Conversation
- The **system** block may include a short **Conversation memory** section: recent user messages and assistant reply excerpts (text only, no result rows). Use it for follow-ups (“same as before”, “narrow that”, etc.).
- The **message list** may shorten older **tool** payloads to save tokens; rely on memory + new queries as needed.

### Voice and formatting
- Write for a **busy teammate**, not an engineer: short sections, plain language, no raw JSON dumps, no tool names or internal field names unless they asked for technical detail.
- Use **GitHub-flavored Markdown** in assistant messages: \`##\` / \`###\` headings, **bold** for key numbers, bullet lists, and short tables only when helpful. The chat UI renders Markdown.

### Rules — Excel is the default deliverable
- Whenever the user’s question can be answered with **tabular data** from the database, **always** call **export_select_to_xlsx** with a sensible final SELECT so they get an .xlsx **without having to ask**.
- On every export, **download_label** is required: a **short, human filename title** (plain English, 3–10 words) so the saved file reads naturally in Downloads — e.g. “Orders stuck in billing over 14 days”, not table names or snake_case.
- **Exceptions (rare):** skip export if they clearly only want a single scalar with no spreadsheet, there are **zero** rows and a file would be pointless, or they explicitly say they do not want a file.
- Use **run_select_query** first if you need to iterate; then **export** the same logic for the full row set.
- Never imply a fixed “named report” catalog; you always compose ad-hoc SQL.
- When you exported, **do not paste long download URLs** in the message — the app shows a proper **Download** link under your reply. Briefly say that an Excel file is attached below (and mention row count / truncation in plain words if relevant).
- One SQL statement per **run_select_query** / **export_select_to_xlsx** call (SELECT or WITH only). **propose_batch_writes** is different: each operation carries a paired impact SELECT and one write statement. Use **public** schema.
- For “today” in NY use \`(CURRENT_TIMESTAMP AT TIME ZONE 'America/New_York')::date\` or equivalent.

### When tools fail or data is unavailable (critical)
- If a tool returns \`ok: false\` with \`user_message\`, that is what the user sees — use it verbatim (e.g. “I can't pull that up right now. Please contact support.”).
- If the same payload includes \`model_hint\` (SQL/schema error), **fix your SQL using the data dictionary** and call the tool again in the same turn if you can. **Never** put \`model_hint\` text in the user-visible reply.
- **Never** mention Postgres, Supabase, connection strings, poolers, tenants, environment variables, API keys, npm, or server configuration to the user.
- **delivery_days** lives on **\`vendors\`** (JSONB), not \`menu_items\` — join through \`vendor_id\`.
- **clients.upcoming_order** (JSONB) is the cart snapshot — there is no \`active_order\` column on \`clients\`.
- **orders.notes** holds billing/order notes — there is no \`billing_notes\` column.
- **No** \`dropdown_enabled\` / \`dropdown_options\` on \`menu_items\` or \`breakfast_items\` in this project.
- **Billing weeks** are Sun–Sat in America/New_York; do not call \`billing_week_start_sunday\` (not deployed here).

### Admin → Boxes Org (menu catalog layout — not box_types)
- **Boxes Org** organizes **menu_items** for the box selector: category (\`menu_items.category_id\` → \`item_categories\`), folder tree + item placement in **\`box_menu_layout_configs\`** (single row \`id = 1\`, JSON \`config\`: \`orderedCategoryIds\`, \`subMenusByCategory\`, \`itemSubMenuByItemId\`).
- **Do not** put Category/sub1/Sub2 on \`box_types\` — that table is box program SKUs (name, vendor, price), not the org tab.
- Workflow: **export_boxes_org_template** → user edits → upload → **propose_boxes_org_import** (requires **Enable editing** + attached spreadsheet).
- **New items:** set \`create_missing_menu_items: true\` (default) to INSERT \`menu_items\` when Name is not in DB — no vendor required; \`value\` / \`quota_value\` default 1; parses \`USD x.xx\` prices; \`usp_id\` from UPC or item #.
- Match existing rows by **Name**; never use filename-based table names in SQL.

### Excel round-trip (any table — edit, re-upload, bulk apply)
- **Upload Excel** is always visible in the UI. When a file is attached, you receive **structure only** (columns, types, samples, detected profiles) — **not** every row. Full rows are server-side for apply tools when the user asks to import/apply.
- On attach: explain what the file **can** be used for from structure; ask what they want. Do **not** auto-apply unless they clearly ask.
- For spreadsheet-driven bulk changes: export templates when helpful; use **propose_batch_writes** or **propose_boxes_org_import** when they confirm apply (requires **Enable editing**).
- **offer_spreadsheet_reupload** is optional (button already visible); use for a short label/hint after an export if helpful.

### Data dictionary (truncated)
---
${dict}
---`;

    const recap = buildConversationRecap(messages, 10, 8);
    let systemWithRecap = recap
        ? `${baseSystem}\n\n### Conversation memory (text only — for follow-ups and pronouns)\n${recap}\n`
        : baseSystem;
    if (options?.spreadsheetUpload) {
        systemWithRecap += `\n\n${formatSpreadsheetForSystemPrompt(
            options.spreadsheetUpload,
            options.spreadsheetUploadHint,
            options.spreadsheetStructure
        )}\n`;
        if (
            (options.spreadsheetStructure?.boxesOrgDetected ?? isBoxesOrgSpreadsheet(options.spreadsheetUpload)) &&
            writesToolEnabled
        ) {
            systemWithRecap +=
                '\n**Boxes Org file attached:** When the user asks to **apply/import**, use **propose_boxes_org_import** (confirm usp_id: item # vs UPC if unclear). Do not use **box_types** or manual layout SQL until they ask to apply.\n';
        }
    }

    const LLM_HISTORY_TAIL = 56;

    const minSql =
        typeof options?.requireSqlSuccessCount === 'number' && options.requireSqlSuccessCount > 0
            ? Math.min(options.requireSqlSuccessCount, 20)
            : 0;

    if (minSql > 0 && !getInternalReportsPostgresUrl()) {
        console.error('[internal-reports] requireSqlSuccessCount but no Postgres URL');
        return {
            messages: [
                ...messages,
                {
                    role: 'assistant',
                    content: DATA_COPILOT_SUPPORT_MESSAGE,
                },
            ],
            error: DATA_COPILOT_SUPPORT_MESSAGE,
        };
    }

    const working = [...messages];
    for (let turn = 0; turn < MAX_TURNS; turn++) {
        await emit?.({ type: 'turn', turn: turn + 1, maxTurns: MAX_TURNS });
        const successes = countSuccessfulSql(working);
        const needTools = minSql > 0 && successes < minSql;

        await emit?.({ type: 'llm_start' });
        const res = await callLLM({
            provider,
            model,
            system: systemWithRecap,
            messages: lightenHistoryForLlm(working, LLM_HISTORY_TAIL),
            tools: buildTools(writesToolEnabled),
            maxTokens: 8192,
            ...(needTools ? { toolChoice: 'required' as const } : {}),
        });
        await emit?.({
            type: 'llm_end',
            toolCallCount: res.toolCalls.length,
            textLength: (res.text ?? '').length,
        });

        if (res.toolCalls.length === 0) {
            const text = res.text || '(no text)';
            if (streamTyping && text.length > 0) {
                for (let i = 0; i < text.length; i += chunkSize) {
                    await emit?.({ type: 'assistant_chunk', text: text.slice(i, i + chunkSize) });
                }
            }
            working.push({ role: 'assistant', content: text });
            return { messages: working };
        }

        working.push({
            role: 'assistant',
            content: res.text || '',
            toolCalls: res.toolCalls,
        });

        for (const tc of res.toolCalls) {
            await emit?.({ type: 'tool_start', name: tc.name, callId: tc.id });
            let payload = '';
            try {
                if (tc.name === 'run_select_query') {
                    payload = await toolRunSelectQuery(tc.input);
                } else if (tc.name === 'export_select_to_xlsx') {
                    payload = await toolExportSelectToXlsx(tc.input);
                    try {
                        const parsed = JSON.parse(payload) as {
                            ok?: boolean;
                            download_url?: string;
                            filename?: string;
                            row_count?: number;
                            truncated?: boolean;
                        };
                        if (parsed.ok && parsed.download_url) {
                            await emit?.({
                                type: 'export_ready',
                                url: parsed.download_url,
                                filename: parsed.filename ?? 'export.xlsx',
                                rowCount: parsed.row_count ?? 0,
                                truncated: Boolean(parsed.truncated),
                            });
                        }
                    } catch {
                        /* ignore */
                    }
                } else if (tc.name === 'offer_spreadsheet_reupload') {
                    payload = toolOfferSpreadsheetReupload(tc.input);
                    try {
                        const parsed = JSON.parse(payload) as {
                            ok?: boolean;
                            label?: string;
                            optional_hint?: string;
                        };
                        if (parsed.ok && parsed.label) {
                            await emit?.({
                                type: 'spreadsheet_upload_offered',
                                label: parsed.label,
                                hint: parsed.optional_hint,
                            });
                        }
                    } catch {
                        /* ignore */
                    }
                } else if (tc.name === 'export_boxes_org_template') {
                    try {
                        const exp = await exportBoxesOrgTemplateXlsx();
                        payload = JSON.stringify(
                            {
                                ok: true,
                                download_url: exp.downloadUrl,
                                filename: exp.filename,
                                row_count: exp.rowCount,
                                columns: [
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
                                ],
                            },
                            null,
                            2
                        );
                        await emit?.({
                            type: 'export_ready',
                            url: exp.downloadUrl,
                            filename: exp.filename,
                            rowCount: exp.rowCount,
                            truncated: false,
                        });
                    } catch (e: unknown) {
                        payload = toolUnavailablePayload(
                            'export_boxes_org_template',
                            e instanceof Error ? e.message : String(e)
                        );
                    }
                } else if (tc.name === 'propose_boxes_org_import') {
                    if (!editingUnlocked) {
                        payload = JSON.stringify({
                            ok: false,
                            error:
                                'Editing is not enabled. Turn on **Enable editing** in the page header, then ask again.',
                        });
                    } else if (!options?.spreadsheetUpload) {
                        payload = JSON.stringify({
                            ok: false,
                            error: 'No spreadsheet uploaded in this chat. Export the Boxes Org template, upload the filled file, then ask to apply.',
                        });
                    } else {
                        const body = (tc.input ?? {}) as {
                            usp_id_source?: 'item_number' | 'upc';
                            create_missing_menu_items?: boolean;
                            create_missing_categories?: boolean;
                            create_missing_folders?: boolean;
                            default_item_value?: number;
                        };
                        payload = await runProposeBoxesOrgImportTool(
                            options.spreadsheetUpload,
                            {
                                uspIdSource: body.usp_id_source ?? 'item_number',
                                createMissingMenuItems: body.create_missing_menu_items !== false,
                                createMissingCategories: body.create_missing_categories,
                                createMissingFolders: body.create_missing_folders,
                                defaultItemValue: body.default_item_value,
                            },
                            async (p) => {
                                await emit?.({
                                    type: 'pending_writes_ready',
                                    pendingId: p.pendingId,
                                    summary: p.summary,
                                    operationCount: p.operationCount,
                                    totalImpactRows: p.totalImpactRows,
                                    downloadUrl: p.downloadUrl,
                                    filename: p.filename,
                                    operations: p.operations,
                                });
                            }
                        );
                    }
                } else if (tc.name === 'propose_batch_writes') {
                    if (!editingUnlocked) {
                        payload = JSON.stringify({
                            ok: false,
                            error:
                                'Editing is not enabled. Turn on **Enable editing** in the page header, then ask again.',
                        });
                    } else {
                        payload = await runProposeBatchWritesTool(tc.input, async (p) => {
                            await emit?.({
                                type: 'pending_writes_ready',
                                pendingId: p.pendingId,
                                summary: p.summary,
                                operationCount: p.operationCount,
                                totalImpactRows: p.totalImpactRows,
                                downloadUrl: p.downloadUrl,
                                filename: p.filename,
                                operations: p.operations,
                            });
                        });
                    }
                } else {
                    payload = JSON.stringify({ error: 'unknown_tool', name: tc.name });
                }
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                payload = toolUnavailablePayload(tc.name, msg);
            }
            await emit?.({ type: 'tool_end', name: tc.name, callId: tc.id, summary: toolSummary(tc.name, payload) });
            working.push({
                role: 'tool',
                toolCallId: tc.id,
                toolName: tc.name,
                content: payload,
            });
        }
    }

    working.push({
        role: 'assistant',
        content: 'Stopped after maximum tool turns. Ask to continue with a narrower sub-question.',
    });
    return { messages: working };
}

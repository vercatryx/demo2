/**
 * Builds docs/DATABASE_DATA_DICTIONARY.md from:
 *   - extracted_schema.sql (live extract via npm run db:extract-schema — source of truth)
 *   - supabase/migrations/*.sql (ADD COLUMN / COMMENT ON COLUMN merged when extract predates a migration)
 *   - Hand-rolled stubs for tables missing from extract
 *   - applyDemoSchemaOverrides() safety net for known Triangle-era drift
 *
 * Run: npm run db:docs  (extracts live schema first, then generates)
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const EXTRACT = path.join(ROOT, 'extracted_schema.sql');
const OUT = path.join(ROOT, 'docs', 'DATABASE_DATA_DICTIONARY.md');
const MIGRATION_DIRS = [
    path.join(ROOT, 'supabase', 'migrations'),
    path.join(ROOT, 'supabase', 'migrations', 'demo-merge'),
].filter((d) => fs.existsSync(d));

const SCHEMAS = ['public', 'auth', 'storage'] as const;

type ColRow = { name: string; definition: string; comment: string | null };
type TableDoc = { schema: string; name: string; tableComment: string | null; columns: ColRow[] };

/** Tables / columns known from migrations + app code but missing from extracted_schema.sql snapshot */
const STUB_TABLES: TableDoc[] = [
    {
        schema: 'public',
        name: 'box_types',
        tableComment:
            'Box program definitions (name, default price, optional vendor). Used by Boxes ordering and box_quotas.',
        columns: [
            { name: 'id', definition: 'uuid PK', comment: null },
            { name: 'created_at', definition: 'timestamptz', comment: null },
            { name: 'name', definition: 'text NOT NULL', comment: null },
            { name: 'vendor_id', definition: 'uuid FK → vendors', comment: null },
            { name: 'is_active', definition: 'boolean', comment: null },
            { name: 'price_each', definition: 'numeric(10,2)', comment: null },
            {
                name: 'usp_id',
                definition: 'text',
                comment: 'Optional USP or external catalog id; set in admin only.',
            },
        ],
    },
    {
        schema: 'public',
        name: 'box_quotas',
        tableComment:
            'Per box_type_id + item_categories row: target “value” units required in that category for a full box (used with clients.upcoming_order boxOrders).',
        columns: [
            { name: 'id', definition: 'uuid PK', comment: null },
            { name: 'box_type_id', definition: 'uuid FK → box_types', comment: null },
            { name: 'category_id', definition: 'uuid FK → item_categories', comment: null },
            { name: 'target_value', definition: 'numeric', comment: 'Required category value sum for quota compliance.' },
        ],
    },
];

function readAllMigrationSql(): string {
    const chunks: string[] = [];
    for (const dir of MIGRATION_DIRS) {
        const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql'));
        for (const f of files) {
            chunks.push(fs.readFileSync(path.join(dir, f), 'utf8'));
        }
    }
    return chunks.join('\n\n');
}

/** COMMENT ON COLUMN — qualified schema or default public (migrations often omit public.) */
function parseColumnComments(sql: string): Map<string, string> {
    const map = new Map<string, string>();
    const re =
        /COMMENT ON COLUMN (?:(public|auth|storage)\.)?(\w+)\.(\w+)\s+IS\s*(?:\n\s*)?'((?:[^']|'')*)'\s*;/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) {
        const schema = (m[1] || 'public').toLowerCase();
        const key = `${schema}.${m[2]}.${m[3]}`;
        const text = m[4].replace(/''/g, "'");
        map.set(key, text);
    }
    return map;
}

function parseTableComments(sql: string): Map<string, string> {
    const map = new Map<string, string>();
    const re = /COMMENT ON TABLE (?:(public|auth|storage)\.)?(\w+)\s+IS\s*(?:\n\s*)?'((?:[^']|'')*)'\s*;/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) {
        const schema = (m[1] || 'public').toLowerCase();
        map.set(`${schema}.${m[2]}`, m[3].replace(/''/g, "'"));
    }
    return map;
}

/** `create table if not exists [public.]name (` … `);` with balanced parentheses */
function parseMigrationCreateIfNotExists(migrationSql: string): TableDoc[] {
    const out: TableDoc[] = [];
    const header = /create\s+table\s+if\s+not\s+exists\s+/gi;
    let hm: RegExpExecArray | null;
    while ((hm = header.exec(migrationSql)) !== null) {
        let i = header.lastIndex;
        while (i < migrationSql.length && /\s/.test(migrationSql[i])) i++;
        let schema = 'public';
        if (migrationSql.slice(i, i + 7).toLowerCase() === 'public.') {
            i += 7;
        }
        const nameStart = i;
        while (i < migrationSql.length && /[\w]/.test(migrationSql[i])) i++;
        const name = migrationSql.slice(nameStart, i);
        if (!name) continue;
        while (i < migrationSql.length && /\s/.test(migrationSql[i])) i++;
        if (migrationSql[i] !== '(') continue;
        i++;
        let depth = 1;
        const bodyStart = i;
        while (i < migrationSql.length && depth > 0) {
            const c = migrationSql[i];
            if (c === '(') depth++;
            else if (c === ')') depth--;
            i++;
        }
        const body = migrationSql.slice(bodyStart, i - 1);
        const columns: ColRow[] = [];
        for (const line of body.split(/\r?\n/)) {
            const t = line.trim();
            if (!t || t.toUpperCase().startsWith('CONSTRAINT ') || t === ');') continue;
            const colMatch = /^(\w+)\s+(.+)$/.exec(t);
            if (!colMatch) continue;
            const colName = colMatch[1];
            const def = colMatch[2].replace(/,\s*$/, '');
            columns.push({ name: colName, definition: def, comment: null });
        }
        if (columns.length === 0) continue;
        out.push({ schema, name, tableComment: null, columns });
    }
    return out;
}

function parseCreateTables(
    sql: string,
    colComments: Map<string, string>,
    tableComments: Map<string, string>
): TableDoc[] {
    const out: TableDoc[] = [];
    const re =
        /CREATE TABLE (public|auth|storage)\.(\w+) \(([\s\S]*?)\);\s*\r?\n\r?\nALTER TABLE \1\.\2 OWNER TO [^;]+;/g;
    let m: RegExpExecArray | null;

    while ((m = re.exec(sql)) !== null) {
        const schema = m[1];
        const name = m[2];
        const body = m[3];
        const columns: ColRow[] = [];
        const lines = body.split(/\r?\n/);
        for (const line of lines) {
            const t = line.trim();
            if (!t || t.startsWith('CONSTRAINT ') || t === ');') continue;
            const colMatch = /^(\w+)\s+(.+)$/.exec(t);
            if (!colMatch) continue;
            const colName = colMatch[1];
            const def = colMatch[2].replace(/,\s*$/, '');
            const ckey = `${schema}.${name}.${colName}`;
            columns.push({
                name: colName,
                definition: def,
                comment: colComments.get(ckey) ?? null,
            });
        }
        out.push({
            schema,
            name,
            tableComment: tableComments.get(`${schema}.${name}`) ?? null,
            columns,
        });
    }
    return out;
}

function enrichTableComments(tables: TableDoc[], tableComments: Map<string, string>): void {
    for (const t of tables) {
        const k = `${t.schema}.${t.name}`;
        const c = tableComments.get(k);
        if (c && !t.tableComment) t.tableComment = c;
    }
}

function enrichColumnComments(tables: TableDoc[], colComments: Map<string, string>): void {
    for (const t of tables) {
        for (const col of t.columns) {
            const k = `${t.schema}.${t.name}.${col.name}`;
            const c = colComments.get(k);
            if (c && !col.comment) col.comment = c;
        }
    }
}

type AddCol = { table: string; name: string; definition: string; comment: string | null };

/** Merge ALTER TABLE public.T ADD COLUMN ... from migrations into table list */
function parseMigrationAddColumns(migrationSql: string): AddCol[] {
    const adds: AddCol[] = [];
    const blockRe =
        /ALTER TABLE\s+(?:public\.)?(\w+)\s+ADD COLUMN IF NOT EXISTS\s+(\w+)\s+([^;]+);/gi;
    let m: RegExpExecArray | null;
    while ((m = blockRe.exec(migrationSql)) !== null) {
        adds.push({ table: m[1], name: m[2], definition: m[3].trim(), comment: null });
    }
    const commentRe =
        /COMMENT ON COLUMN public\.(\w+)\.(\w+)\s+IS\s*(?:\n\s*)?'((?:[^']|'')*)'\s*;/gi;
    while ((m = commentRe.exec(migrationSql)) !== null) {
        const table = m[1];
        const col = m[2];
        const text = m[3].replace(/''/g, "'");
        const existing = adds.find((a) => a.table === table && a.name === col);
        if (existing) existing.comment = text;
        else adds.push({ table, name: col, definition: '(from migration comment only)', comment: text });
    }
    return adds;
}

function mergeStubAndMigrations(
    tables: TableDoc[],
    migrationSql: string,
    colComments: Map<string, string>,
    tableComments: Map<string, string>
): TableDoc[] {
    const byKey = new Map<string, TableDoc>();
    for (const t of tables) byKey.set(`${t.schema}.${t.name}`, { ...t, columns: [...t.columns] });

    const extractKeys = new Set(byKey.keys());
    for (const migTable of parseMigrationCreateIfNotExists(migrationSql)) {
        const k = `${migTable.schema}.${migTable.name}`;
        if (extractKeys.has(k)) continue;
        if (!byKey.has(k)) {
            enrichColumnComments([migTable], colComments);
            enrichTableComments([migTable], tableComments);
            byKey.set(k, migTable);
        }
    }

    for (const stub of STUB_TABLES) {
        const k = `${stub.schema}.${stub.name}`;
        if (!byKey.has(k)) byKey.set(k, { ...stub, columns: [...stub.columns] });
    }

    const adds = parseMigrationAddColumns(migrationSql);
    for (const a of adds) {
        const k = `public.${a.table}`;
        let t = byKey.get(k);
        if (!t) {
            t = {
                schema: 'public',
                name: a.table,
                tableComment:
                    'Table present in migrations but not in extracted_schema.sql — column list may be incomplete; re-dump schema or query information_schema.',
                columns: [],
            };
            byKey.set(k, t);
        }
        if (!t.columns.some((c) => c.name === a.name)) {
            t.columns.push({
                name: a.name,
                definition: a.definition,
                comment: a.comment,
            });
        } else if (a.comment) {
            const col = t.columns.find((c) => c.name === a.name);
            if (col && !col.comment) col.comment = a.comment;
        }
    }

    const merged = Array.from(byKey.values());
    enrichColumnComments(merged, colComments);
    enrichTableComments(merged, tableComments);
    applyDemoSchemaOverrides(merged);

    return merged.sort((a, b) => {
        const si = SCHEMAS.indexOf(a.schema as (typeof SCHEMAS)[number]);
        const sj = SCHEMAS.indexOf(b.schema as (typeof SCHEMAS)[number]);
        if (si !== sj) return si - sj;
        return a.name.localeCompare(b.name);
    });
}

function dropColumns(table: TableDoc | undefined, names: Set<string>): void {
    if (!table) return;
    table.columns = table.columns.filter((c) => !names.has(c.name));
}

function ensureColumn(table: TableDoc | undefined, col: ColRow): void {
    if (!table) return;
    if (!table.columns.some((c) => c.name === col.name)) table.columns.push(col);
}

/** Align dictionary with prisma/schema.prisma + demo-merge migrations (not Triangle extract). */
function applyDemoSchemaOverrides(tables: TableDoc[]): void {
    const byName = (name: string) => tables.find((t) => t.schema === 'public' && t.name === name);

    dropColumns(byName('menu_items'), new Set(['delivery_days', 'focus_x', 'focus_y', 'notes_enabled', 'dropdown_enabled', 'dropdown_options']));
    ensureColumn(byName('menu_items'), { name: 'image_url', definition: 'text', comment: null });
    ensureColumn(byName('menu_items'), { name: 'sort_order', definition: 'integer', comment: null });

    dropColumns(byName('breakfast_items'), new Set(['dropdown_enabled', 'dropdown_options', 'focus_x', 'focus_y']));

    dropColumns(byName('orders'), new Set(['billing_notes']));
    ensureColumn(byName('orders'), { name: 'notes', definition: 'text', comment: 'Order / billing notes.' });
    ensureColumn(byName('orders'), { name: 'bill_amount', definition: 'numeric(10,2)', comment: null });
    ensureColumn(byName('orders'), { name: 'vendor_id', definition: 'varchar(36)', comment: null });
    ensureColumn(byName('orders'), {
        name: 'actual_delivery_date',
        definition: 'timestamptz',
        comment: 'When delivery was completed.',
    });

    const clients = byName('clients');
    dropColumns(clients, new Set(['active_order']));
    ensureColumn(clients, {
        name: 'upcoming_order',
        definition: 'jsonb',
        comment: 'Canonical cart JSON — see UPCOMING_ORDER_SCHEMA.md.',
    });
    ensureColumn(clients, { name: 'meal_planner_data', definition: 'jsonb', comment: null });
    ensureColumn(clients, { name: 'archived_at', definition: 'timestamptz', comment: null });
    ensureColumn(clients, { name: 'voucher_amount', definition: 'text', comment: null });

    const vendors = byName('vendors');
    const vDays = vendors?.columns.find((c) => c.name === 'delivery_days');
    if (vDays) vDays.definition = 'jsonb';
    ensureColumn(vendors, { name: 'is_default', definition: 'boolean', comment: null });
}

function escapeMdCell(s: string): string {
    return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function renderTable(t: TableDoc): string {
    const head = t.tableComment
        ? `### \`${t.schema}.${t.name}\`\n\n*${escapeMdCell(t.tableComment)}*\n\n`
        : `### \`${t.schema}.${t.name}\`\n\n`;

    const rows = t.columns.map((c) => {
        const note = c.comment
            ? escapeMdCell(c.comment)
            : '_No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._';
        return `| \`${c.name}\` | ${escapeMdCell(c.definition)} | ${note} |`;
    });

    return (
        head +
        '| Column | Type / definition | Meaning (DB comment or guidance) |\n' +
        '|--------|---------------------|-------------------------------------|\n' +
        rows.join('\n') +
        '\n\n'
    );
}

function main() {
    if (!fs.existsSync(EXTRACT)) {
        console.error('Missing extracted_schema.sql. Run: npm run db:extract-schema');
        process.exit(1);
    }
    const extractBanner = fs.readFileSync(EXTRACT, 'utf8').slice(0, 400);
    const fromLive = /Live schema extract/i.test(extractBanner);
    if (!fromLive) {
        console.warn(
            'WARN  extracted_schema.sql does not look like a live extract — run npm run db:extract-schema for accuracy.'
        );
    }
    const sql = fs.readFileSync(EXTRACT, 'utf8');
    const migrationSql = readAllMigrationSql();
    const colComments = parseColumnComments(sql + '\n' + migrationSql);
    const tableComments = parseTableComments(sql + '\n' + migrationSql);
    let tables = parseCreateTables(sql, colComments, tableComments);
    tables = mergeStubAndMigrations(tables, migrationSql, colComments, tableComments);

    const intro = `# Database data dictionary (Demo Food)

This file is **machine-oriented documentation** for humans and AI agents: table/column definitions from **live Postgres** (\`extracted_schema.sql\`), merged with \`supabase/migrations/demo-merge/\` when needed, plus Demo Food–specific pitfalls below.

## Regenerate (recommended after schema migrations)

\`\`\`bash
npm run db:docs
\`\`\`

That runs \`db:extract-schema\` (live introspection) then rebuilds this file. One-off extract only: \`npm run db:extract-schema\`.

## Schemas included

| Schema | Purpose |
|--------|---------|
| **public** | Application data: clients, orders, vendors, menus, billing, forms, SMS/AI usage, etc. |
| **auth** | Supabase Auth (login identities, sessions). Do not store app PHI here. |
| **storage** | Supabase Storage metadata (file buckets/objects). |

Other Supabase schemas (\`extensions\`, \`realtime\`, \`vault\`, …) are platform-internal — query live \`information_schema.columns\` in the SQL Editor if you need them. This dump did not include separate \`extensions\` user tables.

## Concepts not visible as single columns

- **\`clients.upcoming_order\` (JSONB)** — Canonical “next week” cart for Food / Meal / Boxes / Custom. Shape is documented in \`UPCOMING_ORDER_SCHEMA.md\` in this repo. Do not confuse with the relational \`upcoming_orders\` table (scheduled rows per delivery day).
- **Billing week** — Sunday–Saturday in **America/New_York** (\`lib/produce-roster-week.ts\`). There is **no** \`billing_week_start_sunday\` RPC on Demo Food.
- **Admin → Boxes Org** — **Not** \`box_types\`. Uses \`menu_items\` (name, price, vendor, \`category_id\`, \`usp_id\`), \`item_categories\`, and \`box_menu_layout_configs\` row \`id = 1\` JSON \`config\`: \`orderedCategoryIds\`, \`subMenusByCategory\` (sub1/sub2 folder trees per category), \`itemSubMenuByItemId\` (menu item → folder node id). Data Copilot: \`export_boxes_org_template\` / \`propose_boxes_org_import\`.

## Common column placement (demo DB — do not guess)

| Column / concept | Table | Notes |
|------------------|-------|--------|
| \`delivery_days\` | **\`vendors\`** only (JSONB) | Join \`menu_items.vendor_id\` → \`vendors.id\`. Not on \`menu_items\`. |
| \`minimum_meals\`, \`cutoff_hours\` | **\`vendors\`** | Food vendor rules. |
| \`upcoming_order\` (JSONB) | **\`clients\`** | Cart snapshot. **No** \`active_order\` column. Not the same as table \`upcoming_orders\`. |
| \`notes\` | **\`orders\`** | Order/billing notes. **No** \`billing_notes\` column. |
| \`dropdown_enabled\` / \`dropdown_options\` | _none_ | Not stored on menu/breakfast tables in Demo Food. |

---

`;

    const sections: string[] = [intro];
    for (const sch of SCHEMAS) {
        const subset = tables.filter((t) => t.schema === sch);
        if (subset.length === 0) continue;
        sections.push(`## Schema: \`${sch}\`\n\n`);
        for (const t of subset.sort((a, b) => a.name.localeCompare(b.name))) {
            sections.push(renderTable(t));
        }
    }

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, sections.join(''), 'utf8');
    console.log('Wrote', OUT, `(${tables.length} tables)`);
}

main();

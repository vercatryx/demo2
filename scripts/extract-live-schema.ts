/**
 * Introspect the live Demo Food Postgres database and write extracted_schema.sql
 * in the format expected by scripts/generate-database-data-dictionary.ts.
 *
 *   npm run db:extract-schema
 *
 * Requires DATABASE_URL (or SUPABASE_DATABASE_URL) in .env.local — uses the same
 * pooler host discovery as Data Copilot (lib/internal-reports/postgres-url.ts).
 */
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import postgres from 'postgres';
import { resolveInternalReportsPostgresUrl } from '../lib/internal-reports/postgres-url';

const ROOT = path.resolve(__dirname, '..');
const OUT_SQL = path.join(ROOT, 'extracted_schema.sql');
const OUT_TXT = path.join(ROOT, 'docs', 'db-schema-dump.txt');
const SCHEMAS = ['public', 'auth', 'storage'] as const;

config({ path: path.join(ROOT, '.env.local') });
config({ path: path.join(ROOT, '.env.demo.local') });

type ColRow = {
    table_schema: string;
    table_name: string;
    column_name: string;
    ordinal_position: number;
    data_type: string;
    udt_name: string;
    is_nullable: string;
    column_default: string | null;
    character_maximum_length: number | null;
    numeric_precision: number | null;
    numeric_scale: number | null;
};

function pgType(c: ColRow): string {
    const u = c.udt_name;
    if (u === 'varchar' && c.character_maximum_length != null) {
        return `character varying(${c.character_maximum_length})`;
    }
    if (u === 'bpchar' && c.character_maximum_length != null) {
        return `character(${c.character_maximum_length})`;
    }
    if (u === 'numeric' && c.numeric_precision != null) {
        return c.numeric_scale != null
            ? `numeric(${c.numeric_precision},${c.numeric_scale})`
            : `numeric(${c.numeric_precision})`;
    }
    if (u === 'int4') return 'integer';
    if (u === 'int8') return 'bigint';
    if (u === 'int2') return 'smallint';
    if (u === 'float8') return 'double precision';
    if (u === 'float4') return 'real';
    if (u === 'bool') return 'boolean';
    if (u === 'jsonb') return 'jsonb';
    if (u === 'json') return 'json';
    if (u === 'uuid') return 'uuid';
    if (u === 'text') return 'text';
    if (u === 'date') return 'date';
    if (u === 'time') return 'time without time zone';
    if (u === 'timetz') return 'time with time zone';
    if (u === 'timestamp') return 'timestamp without time zone';
    if (u === 'timestamptz') return 'timestamp with time zone';
    if (u.startsWith('_')) return `${pgType({ ...c, udt_name: u.slice(1) } as ColRow)}[]`;
    return u;
}

function formatDefault(def: string | null): string {
    if (def == null) return '';
    const d = def.trim();
    if (!d) return '';
    return ` DEFAULT ${d}`;
}

async function main() {
    const url = await resolveInternalReportsPostgresUrl();
    if (!url) {
        console.error('No Postgres URL. Set DATABASE_URL in .env.local (Supabase Connect URI).');
        process.exit(1);
    }

    const sql = postgres(url, { max: 1, ssl: 'require', connect_timeout: 30 });
    const generatedAt = new Date().toISOString();

    try {
        const columns = await sql<ColRow[]>`
            SELECT table_schema, table_name, column_name, ordinal_position,
                   data_type, udt_name, is_nullable, column_default,
                   character_maximum_length, numeric_precision, numeric_scale
            FROM information_schema.columns
            WHERE table_schema IN ('public', 'auth', 'storage')
            ORDER BY table_schema, table_name, ordinal_position
        `;

        const tableComments = await sql<{ schema: string; table: string; comment: string | null }[]>`
            SELECT n.nspname AS schema, c.relname AS table, d.description AS comment
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            LEFT JOIN pg_description d ON d.objoid = c.oid AND d.objsubid = 0
            WHERE c.relkind = 'r'
              AND n.nspname IN ('public', 'auth', 'storage')
            ORDER BY 1, 2
        `;

        const columnComments = await sql<{
            schema: string;
            table: string;
            column: string;
            comment: string | null;
        }[]>`
            SELECT n.nspname AS schema, c.relname AS table, a.attname AS column, d.description AS comment
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            JOIN pg_attribute a ON a.attrelid = c.oid
            LEFT JOIN pg_description d ON d.objoid = c.oid AND d.objsubid = a.attnum
            WHERE c.relkind = 'r'
              AND n.nspname IN ('public', 'auth', 'storage')
              AND a.attnum > 0
              AND NOT a.attisdropped
            ORDER BY 1, 2, a.attnum
        `;

        const routines = await sql<{ schema: string; name: string; args: string }[]>`
            SELECT routine_schema AS schema, routine_name AS name,
                   COALESCE(data_type, 'void') AS args
            FROM information_schema.routines
            WHERE routine_schema = 'public'
              AND routine_type = 'FUNCTION'
            ORDER BY routine_name
        `;

        const tblCommentMap = new Map<string, string>();
        for (const r of tableComments) {
            if (r.comment) tblCommentMap.set(`${r.schema}.${r.table}`, r.comment);
        }
        const colCommentMap = new Map<string, string>();
        for (const r of columnComments) {
            if (r.comment) colCommentMap.set(`${r.schema}.${r.table}.${r.column}`, r.comment);
        }

        const byTable = new Map<string, ColRow[]>();
        for (const c of columns) {
            const k = `${c.table_schema}.${c.table_name}`;
            if (!byTable.has(k)) byTable.set(k, []);
            byTable.get(k)!.push(c);
        }

        const sqlLines: string[] = [
            '--',
            `-- Live schema extract (Demo Food) — generated ${generatedAt}`,
            '-- Source: scripts/extract-live-schema.ts (information_schema + pg_catalog)',
            '-- Regenerate: npm run db:extract-schema  (or npm run db:docs)',
            '--',
            '',
        ];

        const txtLines: string[] = [
            `# Database schema dump (live Postgres)`,
            `Generated: ${generatedAt}`,
            '',
        ];

        for (const schema of SCHEMAS) {
            const tables = [...byTable.keys()]
                .filter((k) => k.startsWith(`${schema}.`))
                .map((k) => k.slice(schema.length + 1))
                .sort();

            if (tables.length === 0) continue;

            txtLines.push(`## Schema: ${schema} (${tables.length} tables)`, '');

            for (const table of tables) {
                const key = `${schema}.${table}`;
                const cols = byTable.get(key) ?? [];
                sqlLines.push(`-- Name: ${table}; Type: TABLE; Schema: ${schema}; Owner: postgres`, '');
                sqlLines.push(`CREATE TABLE ${schema}.${table} (`);

                const colLines: string[] = [];
                for (const c of cols) {
                    const nullable = c.is_nullable === 'YES' ? '' : ' NOT NULL';
                    colLines.push(
                        `    ${c.column_name} ${pgType(c)}${nullable}${formatDefault(c.column_default)}`
                    );
                }
                sqlLines.push(colLines.join(',\n'));
                sqlLines.push(');', '');
                sqlLines.push(`ALTER TABLE ${schema}.${table} OWNER TO postgres;`, '');

                const tComment = tblCommentMap.get(key);
                if (tComment) {
                    const esc = tComment.replace(/'/g, "''");
                    sqlLines.push(`COMMENT ON TABLE ${schema}.${table} IS '${esc}';`, '');
                }

                for (const c of cols) {
                    const cc = colCommentMap.get(`${key}.${c.column_name}`);
                    if (!cc) continue;
                    const esc = cc.replace(/'/g, "''");
                    sqlLines.push(`COMMENT ON COLUMN ${schema}.${table}.${c.column_name} IS '${esc}';`);
                }
                sqlLines.push('');

                txtLines.push(`### ${table}`);
                for (const c of cols) {
                    txtLines.push(`  ${c.column_name}: ${pgType(c)}${c.is_nullable === 'YES' ? '' : ' NOT NULL'}`);
                }
                txtLines.push('');
            }
        }

        if (routines.length > 0) {
            sqlLines.push('-- Public RPC / functions (for agent reference)', '');
            for (const r of routines) {
                sqlLines.push(`-- FUNCTION public.${r.name} → ${r.args}`);
            }
            sqlLines.push('');
        }

        if (fs.existsSync(OUT_SQL)) {
            const backup = `${OUT_SQL}.bak`;
            fs.copyFileSync(OUT_SQL, backup);
            console.log('Backed up previous extract to', path.basename(backup));
        }

        fs.writeFileSync(OUT_SQL, sqlLines.join('\n'), 'utf8');
        fs.mkdirSync(path.dirname(OUT_TXT), { recursive: true });
        fs.writeFileSync(OUT_TXT, txtLines.join('\n'), 'utf8');

        const publicCount = [...byTable.keys()].filter((k) => k.startsWith('public.')).length;
        console.log(`Wrote ${OUT_SQL} (${publicCount} public tables, ${columns.length} columns)`);
        console.log(`Wrote ${OUT_TXT}`);
        if (routines.length) {
            console.log(`Public functions: ${routines.map((r) => r.name).join(', ')}`);
        }
    } finally {
        await sql.end({ timeout: 10 }).catch(() => undefined);
    }
}

main().catch((e) => {
    console.error('extract-live-schema failed:', e instanceof Error ? e.message : e);
    process.exit(1);
});

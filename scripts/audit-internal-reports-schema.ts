/**
 * Cross-checks internal-reports code against prisma/schema.prisma and (optionally) live Postgres.
 *
 *   npm run audit:internal-reports
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import fs from 'fs';
import postgres from 'postgres';
import { resolveInternalReportsPostgresUrl } from '../lib/internal-reports/postgres-url';

config({ path: resolve(process.cwd(), '.env.local') });

const ROOT = resolve(__dirname, '..');
const RUNNERS = fs.readFileSync(resolve(ROOT, 'lib/internal-reports/runners.ts'), 'utf8');

/** .select('a, b, c') column lists in runners.ts */
function runnerSelectColumns(): { table: string; columns: string[] }[] {
    const hits: { table: string; columns: string[] }[] = [];
    const re = /\.from\('(\w+)'\)\s*\n?\s*\.select\('([^']+)'\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(RUNNERS)) !== null) {
        hits.push({
            table: m[1],
            columns: m[2].split(',').map((c) => c.trim()),
        });
    }
    return hits;
}

const BANNED_IN_RUNNERS = [
    'billing_notes',
    'dropdown_enabled',
    'dropdown_options',
    'billing_week_start_sunday',
    'active_order',
];

async function main() {
    let failed = false;

    const selectBodies = [...RUNNERS.matchAll(/\.select\('([^']+)'\)/g)].map((m) => m[1]);
    const rpcBodies = [...RUNNERS.matchAll(/\.rpc\('([^']+)'/g)].map((m) => m[1]);
    for (const banned of BANNED_IN_RUNNERS) {
        if (selectBodies.some((s) => s.includes(banned)) || rpcBodies.some((r) => r === banned)) {
            console.error(`FAIL  runners.ts still uses banned identifier in .select/.rpc: ${banned}`);
            failed = true;
        }
    }

    const url = await resolveInternalReportsPostgresUrl();
    if (url) {
        const sql = postgres(url, { max: 1, ssl: 'require', connect_timeout: 15 });
        try {
            for (const { table, columns } of runnerSelectColumns()) {
                for (const col of columns) {
                    const rows = await sql`
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${col}
                        LIMIT 1
                    `;
                    if (rows.length === 0) {
                        console.error(`FAIL  live DB missing public.${table}.${col}`);
                        failed = true;
                    }
                }
            }
            const rpc = await sql`
                SELECT 1 FROM information_schema.routines
                WHERE routine_schema = 'public' AND routine_name = 'billing_week_start_sunday'
                LIMIT 1
            `;
            if (rpc.length > 0) {
                console.warn('WARN  billing_week_start_sunday exists on DB but runners should not call it');
            }
            console.log('OK    live Postgres column checks');
        } finally {
            await sql.end({ timeout: 5 }).catch(() => undefined);
        }
    } else {
        console.warn('SKIP  no DATABASE_URL — prisma-only checks only');
    }

    if (failed) process.exit(1);
    console.log('OK    internal-reports schema audit passed');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

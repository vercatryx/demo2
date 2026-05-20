/**
 * Verify Postgres connectivity for Data Copilot (read-only SQL).
 *
 *   npm run test:internal-reports-db
 */
import { config } from 'dotenv';
import path from 'path';
import postgres from 'postgres';
import {
    discoverWorkingPoolerHost,
    parsePostgresUrl,
    postgresConnectionHint,
    resolveInternalReportsPostgresUrl,
    supabaseProjectRefFromEnv,
} from '../lib/internal-reports/postgres-url';

config({ path: path.resolve(__dirname, '../.env.local') });
config({ path: path.resolve(__dirname, '../.env.demo.local') });

async function main() {
    const ref = supabaseProjectRefFromEnv();
    const raw = process.env.DATABASE_URL?.trim();
    const creds = raw ? parsePostgresUrl(raw) : null;

    console.log('Project ref (NEXT_PUBLIC_SUPABASE_URL):', ref ?? '(unknown)');
    if (!creds) {
        console.error('No usable DATABASE_URL in .env.local');
        console.error(postgresConnectionHint());
        process.exit(1);
    }

    console.log('DATABASE_URL host in file:', creds.host, 'port', creds.port);
    const discovered = await discoverWorkingPoolerHost(creds);
    if (discovered && discovered !== creds.host) {
        console.log('Detected pooler host for this project:', discovered);
        console.log('  (Your .env still has', creds.host + ' — the app will auto-correct at runtime.)');
    } else if (discovered) {
        console.log('Pooler host matches:', discovered);
    } else {
        console.log('Could not find a pooler host that recognizes this project.');
    }

    const url = await resolveInternalReportsPostgresUrl();
    if (!url) {
        console.error('Could not build a Postgres URL.');
        process.exit(1);
    }

    const parsed = parsePostgresUrl(url);
    console.log('Connecting with host:', parsed?.host, 'port', parsed?.port, 'user', parsed?.username);

    const sql = postgres(url, { max: 1, ssl: 'require', connect_timeout: 20 });
    try {
        const rows = await sql`select current_database() as db, current_user as usr`;
        console.log('OK — connected:', rows[0]);
        const sample = await sql`
            select id, full_name, created_at
            from public.clients
            order by created_at desc nulls last
            limit 3
        `;
        console.log('Sample clients (latest 3):', sample);
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('FAILED:', msg);
        if (/password authentication failed/i.test(msg)) {
            console.error('\nThe pooler host is likely correct, but the password in DATABASE_URL is wrong.');
            console.error('In Supabase → Connect, copy the FULL connection URI after resetting the database password.');
            console.error('Do not paste only the password into the old template from .env.local.example.');
            if (discovered && discovered !== creds.host) {
                console.error(`\nSuggested host: ${discovered} (not ${creds.host})`);
            }
        } else if (/tenant or user not found/i.test(msg)) {
            console.error('\nWrong pooler region/host. Copy the URI from Supabase Connect for this project.');
        }
        console.error('\n' + postgresConnectionHint());
        process.exit(1);
    } finally {
        await sql.end({ timeout: 5 }).catch(() => undefined);
    }
}

main();

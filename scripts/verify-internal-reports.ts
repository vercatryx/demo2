/**
 * Runs all internal report SQL (via Supabase service role) without starting Next.
 *
 *   npm run verify:internal-reports
 *
 * Requires `.env.local`: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY
 */
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

async function main() {
    const { createReportsSupabase, runAllReports } = await import('../lib/internal-reports');
    const sb = createReportsSupabase();
    const sheets = await runAllReports(sb);
    let total = 0;
    for (const s of sheets) {
        const n = s.rows.length;
        total += n;
        console.log(`OK  ${s.name.padEnd(28)} rows=${n}  ${s.title}`);
    }
    console.log('---');
    console.log(`Total row count (sum of sheets): ${total}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

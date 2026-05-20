/**
 * Calls the internal reports chat API (Next dev server) and sanity-checks the response.
 *
 *   INTERNAL_REPORTS_CHAT_URL=http://127.0.0.1:3001/api/internal-reports/chat npx tsx scripts/e2e-internal-reports-chat.ts
 *
 * Requires the dev server, OPENAI_API_KEY (or ANTHROPIC_API_KEY) on the server,
 * and INTERNAL_REPORTS_POSTGRES_URL or SUPABASE_DATABASE_URL for SQL tools.
 */
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

const URL =
    process.env.INTERNAL_REPORTS_CHAT_URL?.trim() ||
    'http://127.0.0.1:3001/api/internal-reports/chat';

const USER_PROMPT = `You are being evaluated automatically.

Produce answers for ALL six evaluation reports described in your instructions:
(1) food meal allowance gap,
(2) active 14+ days never ordered,
(3) stale billing / proof orders,
(4) expiration passed but status not Expired,
(5) vendors down week-over-week,
(6) dropdown menu lines.

For each report: run whatever SELECT/WITH queries you need, then give a short summary with an approximate or exact row count.
If Postgres is not configured on the server, say so clearly instead of inventing numbers.`;

type ApiMsg =
    | { role: 'user'; content: string }
    | { role: 'assistant'; content?: string; toolCalls?: unknown[] }
    | { role: 'tool'; content?: string };

async function main() {
    const res = await fetch(URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            messages: [{ role: 'user', content: USER_PROMPT }],
            requireSqlSuccessCount: 6,
        }),
    });

    const text = await res.text();
    let body: { error?: string; messages?: ApiMsg[] };
    try {
        body = JSON.parse(text) as typeof body;
    } catch {
        console.error('Non-JSON response', res.status, text.slice(0, 500));
        process.exit(1);
    }

    if (!res.ok) {
        console.error('HTTP', res.status, body.error ?? text.slice(0, 800));
        if (res.status === 503 && body.error?.includes('INTERNAL_REPORTS_POSTGRES_URL')) {
            console.error(
                '\nThe regression request needs a direct Postgres URI in the **Next.js process** environment.\n' +
                    'Add to `.env.local` (same file the dev server loads), then restart `next dev`:\n' +
                    '  INTERNAL_REPORTS_POSTGRES_URL=postgresql://…\n' +
                    'Use Supabase → Project Settings → Database → Connection string → URI (Session pooler is fine).\n' +
                    '`DATABASE_URL` is ignored if it is a `prisma+` URL.\n'
            );
        }
        process.exit(1);
    }

    const msgs = body.messages ?? [];
    const lastAssistant = [...msgs]
        .reverse()
        .find(
            (m) =>
                m.role === 'assistant' &&
                !(Array.isArray((m as { toolCalls?: unknown[] }).toolCalls) && (m as { toolCalls?: unknown[] }).toolCalls!.length > 0)
        );
    const content = (lastAssistant as { content?: string } | undefined)?.content?.trim() ?? '';

    let sqlOk = 0;
    let sqlFail = 0;
    for (const m of msgs) {
        if (m.role !== 'tool' || typeof m.content !== 'string') continue;
        if (m.content.includes('"ok": true')) sqlOk++;
        if (m.content.includes('"ok": false')) sqlFail++;
    }

    const toolTurns = msgs.filter((m) => m.role === 'tool').length;

    console.log('--- e2e internal-reports chat ---');
    console.log('URL:', URL);
    console.log('messages:', msgs.length);
    console.log('tool turns:', toolTurns);
    console.log('tool results with ok:true:', sqlOk, ' ok:false:', sqlFail);
    console.log('last assistant chars:', content.length);

    if (toolTurns < 4) {
        console.error('Expected at least 4 run_select_query round-trips for the six-report evaluation.');
        process.exit(1);
    }

    if (sqlOk < 3) {
        const sample = msgs.find((m) => m.role === 'tool' && typeof m.content === 'string');
        if (sample && typeof sample.content === 'string') {
            console.error('Sample tool payload:', sample.content.slice(0, 600));
        }
        console.error(
            'Expected at least 3 successful SQL results. Check INTERNAL_REPORTS_POSTGRES_URL on the Next server and query errors in tool payloads.'
        );
        process.exit(1);
    }

    if (content.length < 120) {
        console.error('Expected a substantive final assistant reply.');
        process.exit(1);
    }

    const markers = ['1)', '2)', '(1)', 'Report 1', '## 1', 'six', 'Six', 'evaluation'];
    if (!markers.some((k) => content.includes(k))) {
        console.warn('Warning: final reply may not enumerate all six reports (heuristic).');
    }

    console.log('OK');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

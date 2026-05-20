import { NextRequest, NextResponse } from 'next/server';
import { authorizeInternalReportsRequest } from '@/lib/internal-reports/auth';
import { parsePendingWritesToken } from '@/lib/internal-reports/pending-writes-store';
import { validateEditingSessionToken } from '@/lib/internal-reports/editing-session';
import { commitWritesTransaction, internalReportsWritesEnabled } from '@/lib/internal-reports/write-sql';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const APPLY_TOKEN = 'APPLY';

export async function POST(request: NextRequest) {
    if (!internalReportsWritesEnabled()) {
        return NextResponse.json(
            {
                error:
                    'Batch writes are disabled (INTERNAL_REPORTS_ALLOW_WRITES is false / off). Enable writes in env to commit.',
                code: 'BATCH_WRITES_DISABLED',
            },
            { status: 403 }
        );
    }
    if (!(await authorizeInternalReportsRequest(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: { pendingId?: string; confirmationPhrase?: string; editingSessionToken?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const editingSessionToken = String(body.editingSessionToken ?? '').trim();
    if (!validateEditingSessionToken(editingSessionToken)) {
        return NextResponse.json(
            {
                error:
                    'Enable editing is off or your editing session expired. Turn **Enable editing** on in the data copilot page, then try again.',
            },
            { status: 403 }
        );
    }

    const pendingId = String(body.pendingId ?? '').trim();
    const phrase = String(body.confirmationPhrase ?? '').trim();
    if (!pendingId) {
        return NextResponse.json({ error: 'pendingId is required' }, { status: 400 });
    }
    if (phrase !== APPLY_TOKEN) {
        return NextResponse.json(
            { error: `Confirmation must be exactly ${APPLY_TOKEN} (all caps).` },
            { status: 400 }
        );
    }

    const pending = parsePendingWritesToken(pendingId);
    if (!pending) {
        return NextResponse.json(
            { error: 'Invalid, expired, or tampered proposal. Generate a new proposal in chat.' },
            { status: 404 }
        );
    }

    const writes = pending.operations.map((o) => o.write_sql);
    try {
        const { counts } = await commitWritesTransaction(writes);
        return NextResponse.json({
            ok: true,
            summary: pending.summary,
            rows_affected_per_operation: pending.operations.map((o, i) => ({
                title: o.title,
                rows_affected: counts[i] ?? 0,
            })),
        });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
}

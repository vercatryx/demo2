import { NextRequest, NextResponse } from 'next/server';
import { authorizeInternalReportsRequest } from '@/lib/internal-reports/auth';
import {
    createEditingSessionToken,
    editingSessionExpiresAt,
    validateEditingSessionToken,
} from '@/lib/internal-reports/editing-session';
import { internalReportsWritesEnabled } from '@/lib/internal-reports/write-sql';

export const dynamic = 'force-dynamic';

const HDR = 'x-internal-reports-editing-session';

/** Mint a short-lived token after the user turns on **Enable editing** in the UI. */
export async function POST(request: NextRequest) {
    if (!(await authorizeInternalReportsRequest(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!internalReportsWritesEnabled()) {
        return NextResponse.json(
            {
                error:
                    'Batch writes are disabled (INTERNAL_REPORTS_ALLOW_WRITES is set to false / off). Unset it or set to true to allow editing.',
                code: 'BATCH_WRITES_DISABLED',
            },
            { status: 403 }
        );
    }
    try {
        const token = createEditingSessionToken();
        const expiresAt = editingSessionExpiresAt(token);
        return NextResponse.json({ token, expiresAt });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

/** Check whether a stored editing session token is still valid (e.g. after refresh). */
export async function GET(request: NextRequest) {
    if (!(await authorizeInternalReportsRequest(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = request.headers.get(HDR)?.trim();
    if (!token) {
        return NextResponse.json({ error: 'Missing X-Internal-Reports-Editing-Session header' }, { status: 400 });
    }
    const valid = validateEditingSessionToken(token);
    return NextResponse.json({
        valid,
        expiresAt: valid ? editingSessionExpiresAt(token) : null,
    });
}

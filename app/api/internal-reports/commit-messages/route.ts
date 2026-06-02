import { NextRequest, NextResponse } from 'next/server';
import { authorizeInternalReportsRequest } from '@/lib/internal-reports/auth';
import { parsePendingMessagesToken } from '@/lib/internal-reports/pending-messages-store';
import { dispatchMessage } from '@/lib/messaging/render-message';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const SEND_TOKEN = 'SEND';

export async function POST(request: NextRequest) {
    if (!(await authorizeInternalReportsRequest(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: { pendingId?: string; confirmationPhrase?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const pendingId = String(body.pendingId ?? '').trim();
    const phrase = String(body.confirmationPhrase ?? '').trim();
    if (!pendingId) {
        return NextResponse.json({ error: 'pendingId is required' }, { status: 400 });
    }
    if (phrase !== SEND_TOKEN) {
        return NextResponse.json(
            { error: `Confirmation must be exactly ${SEND_TOKEN} (all caps).` },
            { status: 400 }
        );
    }

    const pending = parsePendingMessagesToken(pendingId);
    if (!pending) {
        return NextResponse.json(
            { error: 'Invalid, expired, or tampered proposal. Generate a new proposal in chat.' },
            { status: 404 }
        );
    }

    const queue = pending.recipients.filter((r) => r.canSend);
    let sent = 0;
    let failed = 0;
    const errors: { clientId: string; error: string }[] = [];

    for (const recipient of queue) {
        const result = await dispatchMessage({
            channel: pending.channel,
            to: recipient.to,
            fullName: recipient.fullName,
            clientId: recipient.clientId,
            subject: recipient.subject,
            bodyHtml: recipient.bodyHtml,
            bodyText: recipient.bodyText,
        });
        if (result.success) {
            sent++;
        } else {
            failed++;
            errors.push({ clientId: recipient.clientId, error: result.error ?? 'Send failed' });
        }
    }

    return NextResponse.json({
        ok: true,
        summary: pending.summary,
        channel: pending.channel,
        sent,
        failed,
        skipped: pending.recipients.length - queue.length,
        errors: errors.slice(0, 20),
    });
}

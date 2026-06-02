import { NextRequest, NextResponse } from 'next/server';
import { dispatchMessage } from '@/lib/messaging/render-message';
import { requireAdminMessaging } from '@/lib/messaging/require-admin';

export async function POST(request: NextRequest) {
    const auth = await requireAdminMessaging();
    if (!auth.ok) {
        return NextResponse.json({ error: auth.msg }, { status: auth.status });
    }

    try {
        const body = await request.json();
        const channel = body.channel === 'sms' ? 'sms' : body.channel === 'call' ? 'call' : 'email';
        const testTo = typeof body.testTo === 'string' ? body.testTo.trim() : '';
        if (!testTo) {
            return NextResponse.json({ error: 'testTo is required' }, { status: 400 });
        }

        const sampleName =
            typeof body.sampleName === 'string' && body.sampleName.trim()
                ? body.sampleName.trim()
                : 'Sample Client';

        const result = await dispatchMessage({
            channel,
            to: testTo,
            fullName: sampleName,
            subject: typeof body.subject === 'string' ? body.subject : undefined,
            bodyHtml: typeof body.bodyHtml === 'string' ? body.bodyHtml : undefined,
            bodyText: typeof body.bodyText === 'string' ? body.bodyText : undefined,
        });

        if (!result.success) {
            return NextResponse.json({ error: result.error ?? 'Send failed' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            provider: result.provider,
        });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Test send failed';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

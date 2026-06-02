import { NextRequest, NextResponse } from 'next/server';
import { resolveSingleRecipient } from '@/lib/messaging/recipient-resolver';
import { dispatchMessage } from '@/lib/messaging/render-message';
import { requireAdminMessaging } from '@/lib/messaging/require-admin';
import { getMessagingSupabase } from '@/lib/messaging/supabase-admin';

export async function POST(request: NextRequest) {
    const auth = await requireAdminMessaging();
    if (!auth.ok) {
        return NextResponse.json({ error: auth.msg }, { status: auth.status });
    }

    try {
        const body = await request.json();
        const channel = body.channel === 'sms' ? 'sms' : body.channel === 'call' ? 'call' : 'email';
        const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : '';
        if (!clientId) {
            return NextResponse.json({ error: 'clientId is required' }, { status: 400 });
        }

        const supabase = getMessagingSupabase();
        const { data: client, error } = await supabase
            .from('clients')
            .select('id, full_name, email, phone_number, secondary_phone_number, upcoming_order, client_statuses(name)')
            .eq('id', clientId)
            .maybeSingle();

        if (error) throw error;
        if (!client) {
            return NextResponse.json({ error: 'Client not found' }, { status: 404 });
        }

        const recipient = resolveSingleRecipient(client, channel);
        if (!recipient.canSend) {
            return NextResponse.json(
                { success: false, error: recipient.skipReason ?? 'Cannot send to this client' },
                { status: 400 }
            );
        }

        const to = channel === 'email' ? recipient.email! : recipient.phone!;
        const result = await dispatchMessage({
            channel,
            to,
            fullName: recipient.fullName,
            clientId: recipient.clientId,
            subject: typeof body.subject === 'string' ? body.subject : undefined,
            bodyHtml: typeof body.bodyHtml === 'string' ? body.bodyHtml : undefined,
            bodyText: typeof body.bodyText === 'string' ? body.bodyText : undefined,
        });

        if (!result.success) {
            return NextResponse.json({ success: false, error: result.error ?? 'Send failed' });
        }

        return NextResponse.json({
            success: true,
            clientId: recipient.clientId,
            provider: result.provider,
        });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Send failed';
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}

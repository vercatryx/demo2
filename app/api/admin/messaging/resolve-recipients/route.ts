import { NextRequest, NextResponse } from 'next/server';
import { resolveRecipientsFromClients } from '@/lib/messaging/recipient-resolver';
import { requireAdminMessaging } from '@/lib/messaging/require-admin';
import { loadAllClientsForMessaging } from '@/lib/messaging/supabase-admin';
import type { RecipientFilter, ResolveRecipientsInput } from '@/lib/messaging/types';

function parseFilter(raw: unknown): RecipientFilter | null {
    if (!raw || typeof raw !== 'object') return null;
    const f = raw as Record<string, unknown>;
    const mode = f.mode;
    if (mode === 'everyone') return { mode: 'everyone' };
    if (mode === 'vendor' && Array.isArray(f.vendorIds)) {
        return { mode: 'vendor', vendorIds: f.vendorIds.filter((id): id is string => typeof id === 'string') };
    }
    if (mode === 'foodItem' && Array.isArray(f.itemIds)) {
        return { mode: 'foodItem', itemIds: f.itemIds.filter((id): id is string => typeof id === 'string') };
    }
    if (mode === 'boxItem' && Array.isArray(f.itemIds)) {
        return { mode: 'boxItem', itemIds: f.itemIds.filter((id): id is string => typeof id === 'string') };
    }
    if (mode === 'manual' && Array.isArray(f.clientIds)) {
        return { mode: 'manual', clientIds: f.clientIds.filter((id): id is string => typeof id === 'string') };
    }
    return null;
}

export async function POST(request: NextRequest) {
    const auth = await requireAdminMessaging();
    if (!auth.ok) {
        return NextResponse.json({ error: auth.msg }, { status: auth.status });
    }

    try {
        const body = await request.json();
        const channel = body.channel === 'sms' ? 'sms' : body.channel === 'call' ? 'call' : 'email';
        const filter = parseFilter(body.filter);
        if (!filter) {
            return NextResponse.json({ error: 'Invalid filter' }, { status: 400 });
        }

        const input: ResolveRecipientsInput = {
            channel,
            filter,
            approvedOnly: body.approvedOnly !== false,
        };

        const clients = await loadAllClientsForMessaging();
        const recipients = resolveRecipientsFromClients(clients, input);

        const willSend = recipients.filter((r) => r.canSend).length;
        const skipped = recipients.length - willSend;

        return NextResponse.json({
            recipients,
            summary: {
                total: recipients.length,
                willSend,
                skipped,
            },
        });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Failed to resolve recipients';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

import { NextRequest, NextResponse } from 'next/server';
import type { LlmMessage } from '@/lib/ai/llm';
import { authorizeInternalReportsRequest } from '@/lib/internal-reports/auth';
import { createReportsSupabase } from '@/lib/internal-reports';
import { runInternalReportsChat } from '@/lib/internal-reports/chat-handler';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
    if (!(await authorizeInternalReportsRequest(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: { messages?: LlmMessage[]; requireSqlSuccessCount?: number; editingSessionToken?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const messages = Array.isArray(body.messages) ? body.messages : null;
    if (!messages || messages.length === 0) {
        return NextResponse.json({ error: 'messages[] required' }, { status: 400 });
    }

    const editingSessionToken =
        typeof body.editingSessionToken === 'string' && body.editingSessionToken.length > 0
            ? body.editingSessionToken
            : undefined;

    try {
        const supabase = createReportsSupabase();
        const { messages: out, error } = await runInternalReportsChat(supabase, messages, {
            requireSqlSuccessCount: body.requireSqlSuccessCount,
            editingSessionToken,
        });
        if (error) {
            return NextResponse.json({ error, messages: out }, { status: 503 });
        }
        return NextResponse.json({ messages: out });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[internal-reports chat]', msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

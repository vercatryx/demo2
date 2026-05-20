import type { NextRequest } from 'next/server';
import type { LlmMessage } from '@/lib/ai/llm';
import { authorizeInternalReportsRequest } from '@/lib/internal-reports/auth';
import { createReportsSupabase } from '@/lib/internal-reports';
import { runInternalReportsChat } from '@/lib/internal-reports/chat-handler';
import type { ParsedSpreadsheetUpload } from '@/lib/internal-reports/spreadsheet-upload';
import type { SpreadsheetStructureProfile } from '@/lib/internal-reports/spreadsheet-structure';
import { toUserFacingReportsError } from '@/lib/internal-reports/user-errors';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function sseEncode(obj: unknown): Uint8Array {
    const line = `data: ${JSON.stringify(obj)}\n\n`;
    return new TextEncoder().encode(line);
}

export async function POST(request: NextRequest) {
    if (!(await authorizeInternalReportsRequest(request))) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'content-type': 'application/json' },
        });
    }

    let body: {
        messages?: LlmMessage[];
        requireSqlSuccessCount?: number;
        editingSessionToken?: string;
        spreadsheetUpload?: ParsedSpreadsheetUpload;
        spreadsheetUploadHint?: string;
        spreadsheetStructure?: SpreadsheetStructureProfile;
    };
    try {
        body = await request.json();
    } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
            status: 400,
            headers: { 'content-type': 'application/json' },
        });
    }

    const messages = Array.isArray(body.messages) ? body.messages : null;
    if (!messages || messages.length === 0) {
        return new Response(JSON.stringify({ error: 'messages[] required' }), {
            status: 400,
            headers: { 'content-type': 'application/json' },
        });
    }

    const editingSessionToken =
        typeof body.editingSessionToken === 'string' && body.editingSessionToken.length > 0
            ? body.editingSessionToken
            : undefined;

    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            const push = (e: unknown) => {
                controller.enqueue(sseEncode(e));
            };
            try {
                const supabase = createReportsSupabase();
                const { messages: out, error } = await runInternalReportsChat(supabase, messages, {
                    requireSqlSuccessCount: body.requireSqlSuccessCount,
                    streamAssistantTyping: true,
                    editingSessionToken,
                    spreadsheetUpload: body.spreadsheetUpload,
                    spreadsheetUploadHint: body.spreadsheetUploadHint,
                    spreadsheetStructure: body.spreadsheetStructure,
                    onProgress: async (e) => {
                        push(e);
                    },
                });
                if (error) {
                    push({ type: 'error', message: toUserFacingReportsError(error, 'chat') });
                }
                push({ type: 'done', messages: out });
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                push({ type: 'error', message: toUserFacingReportsError(msg, 'chat stream') });
                push({ type: 'done', messages: messages });
            } finally {
                controller.close();
            }
        },
    });

    return new Response(stream, {
        status: 200,
        headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    });
}

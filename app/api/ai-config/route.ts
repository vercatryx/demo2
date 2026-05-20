/**
 * Admin-only API for the shared AI Instructions builder.
 *
 *   GET  /api/ai-config   -> current row (or a default skeleton if the table is empty)
 *   POST /api/ai-config   -> validate -> compile -> persist (local demo; no Retell sync)
 *
 * Gated by the admin session cookie. Any non-admin role is rejected with 403.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSession } from '@/lib/session';
import { compileFinalPrompt, type FunctionBlock } from '@/lib/ai/compile-prompt';
import { FUNCTIONS_CATALOG } from '@/lib/ai/functions-catalog';

const LOG = '[ai-config]';

type AiConfigRow = {
    id: string;
    general_instructions: string;
    function_blocks: FunctionBlock[];
    llm_provider: 'anthropic' | 'openai';
    llm_model: string;
    retell_llm_id: string | null;
    retell_agent_id: string | null;
    compiled_prompt: string | null;
    updated_at: string;
    updated_by: string | null;
};

function adminSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('Supabase env vars missing');
    return createClient(url, key, { auth: { persistSession: false } });
}

async function requireAdmin(): Promise<{ ok: true; userId: string; name: string } | { ok: false; status: number; msg: string }> {
    const session = await getSession();
    if (!session?.userId) return { ok: false, status: 401, msg: 'Not authenticated' };
    if (session.role !== 'admin' && session.role !== 'super-admin') {
        return { ok: false, status: 403, msg: 'Admins only' };
    }
    return { ok: true, userId: String(session.userId), name: String(session.name ?? 'Admin') };
}

export async function GET() {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ error: auth.msg }, { status: auth.status });

    const supabase = adminSupabase();
    const { data, error } = await supabase
        .from('ai_config')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error(LOG, 'GET failed', error);
        return NextResponse.json({ error: 'database_error', message: error.message }, { status: 500 });
    }

    const row = (data as AiConfigRow | null) ?? null;
    return NextResponse.json({
        config: row ?? {
            id: null,
            general_instructions: '',
            function_blocks: [],
            llm_provider: 'anthropic',
            llm_model: 'claude-haiku-4-5',
            retell_llm_id: null,
            retell_agent_id: null,
            compiled_prompt: null,
            updated_at: null,
            updated_by: null
        },
        catalog: FUNCTIONS_CATALOG
    });
}

export async function POST(request: NextRequest) {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ error: auth.msg }, { status: auth.status });

    let body: {
        general_instructions?: string;
        llm_provider?: 'anthropic' | 'openai';
        llm_model?: string;
        sync?: boolean;
    };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
    }

    const general = typeof body.general_instructions === 'string' ? body.general_instructions : '';
    // The builder is a single textbox. function_blocks are no longer edited here.
    // We keep the column for backwards compatibility but do not rely on it.
    const compiled = compileFinalPrompt({ general_instructions: general });

    const supabase = adminSupabase();

    const { data: existing } = await supabase
        .from('ai_config')
        .select('id')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    const retell_llm_id = process.env.RETELL_LLM_ID ?? null;
    const retell_agent_id = process.env.RETELL_AGENT_ID ?? null;

    const payload = {
        general_instructions: general,
        function_blocks: [] as FunctionBlock[],
        llm_provider: body.llm_provider === 'openai' ? 'openai' : 'anthropic',
        llm_model: typeof body.llm_model === 'string' && body.llm_model.trim() ? body.llm_model.trim() : 'claude-sonnet-4-6',
        retell_llm_id,
        retell_agent_id,
        compiled_prompt: compiled,
        updated_at: new Date().toISOString(),
        updated_by: auth.name
    };

    let savedId: string | null = null;
    if (existing?.id) {
        const { error } = await supabase.from('ai_config').update(payload).eq('id', existing.id);
        if (error) {
            console.error(LOG, 'update failed', error);
            return NextResponse.json({ error: 'database_error', message: error.message }, { status: 500 });
        }
        savedId = existing.id;
    } else {
        const { data, error } = await supabase.from('ai_config').insert(payload).select('id').single();
        if (error) {
            console.error(LOG, 'insert failed', error);
            return NextResponse.json({ error: 'database_error', message: error.message }, { status: 500 });
        }
        savedId = (data as { id: string }).id;
    }

    return NextResponse.json({
        ok: true,
        id: savedId,
        compiled_prompt: compiled,
    });
}

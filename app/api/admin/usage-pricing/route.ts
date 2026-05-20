/**
 * CRUD for `usage_pricing_rates` — internal rate card for parenthetical USD on /admin/ai-usage.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { adminSupabase } from '@/lib/supabase-admin';

async function requireAdmin() {
    const session = await getSession();
    if (!session?.userId) return { ok: false as const, status: 401 };
    if (session.role !== 'admin' && session.role !== 'super-admin') {
        return { ok: false as const, status: 403 };
    }
    return { ok: true as const };
}

export async function GET() {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: auth.status });

    const supabase = adminSupabase();
    const { data, error } = await supabase
        .from('usage_pricing_rates')
        .select('id, dimension, model_key, usd_per_unit, label, updated_at')
        .order('dimension')
        .order('model_key');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ rates: data ?? [] });
}

export async function PATCH(request: NextRequest) {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: auth.status });

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
    }

    const updates = (body as { updates?: Array<{ id: string; usd_per_unit: number }> })?.updates;
    if (!Array.isArray(updates) || updates.length === 0) {
        return NextResponse.json({ error: 'updates_required' }, { status: 400 });
    }

    const supabase = adminSupabase();
    for (const u of updates) {
        if (!u.id || typeof u.usd_per_unit !== 'number' || !Number.isFinite(u.usd_per_unit)) {
            return NextResponse.json({ error: 'invalid_update_row' }, { status: 400 });
        }
    }

    for (const u of updates) {
        const { error } = await supabase
            .from('usage_pricing_rates')
            .update({ usd_per_unit: u.usd_per_unit, updated_at: new Date().toISOString() })
            .eq('id', u.id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data, error } = await supabase
        .from('usage_pricing_rates')
        .select('id, dimension, model_key, usd_per_unit, label, updated_at')
        .order('dimension')
        .order('model_key');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ rates: data ?? [] });
}

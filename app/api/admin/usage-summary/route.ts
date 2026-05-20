/**
 * Roll-up totals for the same filter set as GET /api/admin/usage-events (for summary cards).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { adminSupabase } from '@/lib/supabase-admin';
import { applyUsageFilters, clientIdsMatchingName } from '@/lib/billing/usage-admin-query';
import { estimateEventUsd, type PricingRateRow } from '@/lib/billing/pricing-estimate';

async function requireAdmin() {
    const session = await getSession();
    if (!session?.userId) return { ok: false as const, status: 401 };
    if (session.role !== 'admin' && session.role !== 'super-admin') {
        return { ok: false as const, status: 403 };
    }
    return { ok: true as const };
}

const PAGE = 800;

export async function GET(request: NextRequest) {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: auth.status });

    const sp = request.nextUrl.searchParams;
    const params = {
        from: sp.get('from'),
        to: sp.get('to'),
        kind: sp.get('kind'),
        channel: sp.get('channel'),
        client_id: sp.get('client_id'),
        phone: sp.get('phone'),
        model: sp.get('model'),
        provider: sp.get('provider'),
        sms_direction: sp.get('sms_direction'),
        q: sp.get('q'),
    };

    const supabase = adminSupabase();
    const nameIds = params.q ? await clientIdsMatchingName(supabase, params.q) : [];

    const { data: ratesRows } = await supabase.from('usage_pricing_rates').select('dimension, model_key, usd_per_unit');
    const rates: PricingRateRow[] = (ratesRows ?? []).map(r => ({
        dimension: r.dimension as string,
        model_key: (r.model_key as string) ?? '',
        usd_per_unit: Number(r.usd_per_unit),
    }));
    const pricingConfigured = rates.some(r => Number.isFinite(r.usd_per_unit) && r.usd_per_unit > 0);

    let offset = 0;
    let totalRows = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let smsSegmentsInbound = 0;
    let smsSegmentsOutbound = 0;
    let voiceSeconds = 0;
    let estimatedUsdSum = 0;
    const llmByModel = new Map<string, { input: number; output: number; completions: number }>();

    for (;;) {
        let q = supabase
            .from('usage_events')
            .select('kind, model, provider, input_tokens, output_tokens, sms_segments, sms_direction, duration_seconds');
        q = applyUsageFilters(q, params, nameIds);
        q = q.order('occurred_at', { ascending: false }).range(offset, offset + PAGE - 1);

        const { data: batch, error } = await q;
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        if (!batch?.length) break;

        totalRows += batch.length;
        for (const r of batch) {
            estimatedUsdSum += estimateEventUsd(rates, r as Parameters<typeof estimateEventUsd>[1]);

            if (r.kind === 'llm_completion') {
                const it = r.input_tokens ?? 0;
                const ot = r.output_tokens ?? 0;
                inputTokens += it;
                outputTokens += ot;
                const m = (r.model as string) || 'unknown';
                const cur = llmByModel.get(m) ?? { input: 0, output: 0, completions: 0 };
                cur.input += it;
                cur.output += ot;
                cur.completions += 1;
                llmByModel.set(m, cur);
            } else if (r.kind === 'sms_message') {
                const seg = r.sms_segments ?? 0;
                if (r.sms_direction === 'outbound') smsSegmentsOutbound += seg;
                else smsSegmentsInbound += seg;
            } else if (r.kind === 'voice_call') {
                voiceSeconds += r.duration_seconds ?? 0;
            }
        }

        if (batch.length < PAGE) break;
        offset += PAGE;
        if (offset > 500000) break;
    }

    return NextResponse.json({
        totalRows,
        inputTokens,
        outputTokens,
        smsSegmentsInbound,
        smsSegmentsOutbound,
        voiceSeconds,
        estimatedUsdSum,
        llmByModel: Object.fromEntries(llmByModel),
        pricingConfigured,
    });
}

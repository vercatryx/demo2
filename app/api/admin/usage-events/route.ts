/**
 * Paginated usage_events with filters + parenthetical USD from pricing table.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { adminSupabase } from '@/lib/supabase-admin';
import { applyUsageFilters, clientIdsMatchingName } from '@/lib/billing/usage-admin-query';
import { estimateEventUsd, type PricingRateRow } from '@/lib/billing/pricing-estimate';

const SORT_WHITELIST = new Set([
    'occurred_at',
    'kind',
    'channel',
    'provider',
    'model',
    'input_tokens',
    'output_tokens',
    'sms_segments',
    'duration_seconds',
    'phone_e164',
]);

async function requireAdmin() {
    const session = await getSession();
    if (!session?.userId) return { ok: false as const, status: 401 };
    if (session.role !== 'admin' && session.role !== 'super-admin') {
        return { ok: false as const, status: 403 };
    }
    return { ok: true as const };
}

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

    const sortRaw = sp.get('sort') ?? 'occurred_at';
    const sortCol = SORT_WHITELIST.has(sortRaw) ? sortRaw : 'occurred_at';
    const orderAsc = sp.get('order') === 'asc';
    const limit = Math.min(100, Math.max(1, Number(sp.get('limit')) || 50));
    const offset = Math.max(0, Number(sp.get('offset')) || 0);

    let dataQuery = supabase.from('usage_events').select('*');
    dataQuery = applyUsageFilters(dataQuery, params, nameIds);
    dataQuery = dataQuery.order(sortCol, { ascending: orderAsc }).order('id', { ascending: orderAsc });
    dataQuery = dataQuery.range(offset, offset + limit - 1);

    let countQuery = supabase.from('usage_events').select('*', { count: 'exact', head: true });
    countQuery = applyUsageFilters(countQuery, params, nameIds);

    const [{ data: rows, error: rowsErr }, { count, error: countErr }, { data: ratesRows }] = await Promise.all([
        dataQuery,
        countQuery,
        supabase.from('usage_pricing_rates').select('dimension, model_key, usd_per_unit'),
    ]);

    if (rowsErr) return NextResponse.json({ error: rowsErr.message }, { status: 500 });
    if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 });

    const rates: PricingRateRow[] = (ratesRows ?? []).map(r => ({
        dimension: r.dimension as string,
        model_key: (r.model_key as string) ?? '',
        usd_per_unit: Number(r.usd_per_unit),
    }));

    const rawRows = rows ?? [];
    const clientIds = [...new Set(rawRows.map(r => r.client_id).filter(Boolean))] as string[];
    let nameById: Record<string, string> = {};
    if (clientIds.length > 0) {
        const { data: cm } = await supabase.from('clients').select('id, full_name').in('id', clientIds);
        nameById = Object.fromEntries((cm ?? []).map(c => [c.id as string, c.full_name as string]));
    }

    const events = rawRows.map(row => ({
        ...row,
        client_name: row.client_id ? nameById[row.client_id as string] ?? null : null,
        estimated_usd: estimateEventUsd(rates, row as never),
    }));

    return NextResponse.json({
        events,
        total: count ?? 0,
        limit,
        offset,
        sort: sortCol,
        order: orderAsc ? 'asc' : 'desc',
    });
}

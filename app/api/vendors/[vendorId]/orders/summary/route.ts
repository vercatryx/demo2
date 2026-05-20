/**
 * GET /api/vendors/[vendorId]/orders/summary
 * GET /api/vendors/[vendorId]/orders/summary?since=YYYY-MM-DD
 *
 * Returns per-date order count and total_items only (no full orders).
 * When `since` is provided, uses the faster `get_vendor_orders_summary_recent`
 * RPC which returns { rows, total_dates } for dates >= since.
 * Falls back to the original `get_vendor_orders_summary` + JS filtering
 * if the new function hasn't been deployed yet.
 */

import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { getSupabaseDbApiKey } from '@/lib/supabase-env';
import { computeVendorOrdersSummary } from '@/lib/vendor-orders-summary';

const SINGLE_VENDOR_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ vendorId: string }> }
) {
    const { vendorId } = await params;

    if (!vendorId) {
        return Response.json({ error: 'vendorId required' }, { status: 400 });
    }

    const session = await getSession();
    const isSingleVendor = vendorId === SINGLE_VENDOR_ID;
    const allowed =
        isSingleVendor ||
        (session &&
            (session.role === 'admin' ||
                session.role === 'super-admin' ||
                session.role === 'navigator' ||
                session.userId === vendorId));
    if (!allowed) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = getSupabaseDbApiKey();
    if (!url || !serviceKey) {
        return Response.json({ error: 'Server missing Supabase config' }, { status: 500 });
    }

    const db = createClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    const sinceParam = request.nextUrl.searchParams.get('since');

    try {
        const { rows, total_dates } = await computeVendorOrdersSummary(db, vendorId, sinceParam);
        if (sinceParam) {
            return Response.json({ rows, total_dates });
        }
        return Response.json(rows);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[vendor orders summary]', message);
        return Response.json({ error: message }, { status: 500 });
    }
}

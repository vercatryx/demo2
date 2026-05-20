import type { SupabaseClient } from '@supabase/supabase-js';
import { getFoodAllowanceSnapshot } from '@/lib/internal-reports/food-allowance';
import { effectiveServiceType } from '@/lib/internal-reports/service-type';
import { addDaysYmd, nyCalendarYmd } from '@/lib/internal-reports/ny-date';
import type { ReportId, ReportSheet } from '@/lib/internal-reports/types';
import { getRosterWeekStartSundayForCalendarDateKey } from '@/lib/produce-roster-week';

/** Supabase PostgREST `.in()` URLs fail around 400+ UUIDs — keep chunks small. */
const CHUNK = 200;

/** Sunday YYYY-MM-DD of the week containing `ymd` (America/New_York calendar). */
function billingWeekSundayYmd(ymd: string): string {
    return getRosterWeekStartSundayForCalendarDateKey(ymd);
}

async function mapPool<T, R>(items: T[], concurrency: number, fn: (t: T) => Promise<R>): Promise<R[]> {
    const out: R[] = [];
    for (let i = 0; i < items.length; i += concurrency) {
        const chunk = items.slice(i, i + concurrency);
        out.push(...(await Promise.all(chunk.map(fn))));
    }
    return out;
}

/** Food clients: upcoming uses less than full weekly meal allowance (remaining > 0). */
export async function runFoodUnderMealAllowance(supabase: SupabaseClient): Promise<ReportSheet[]> {
    const { data: clients, error } = await supabase
        .from('clients')
        .select('id, full_name, service_type, upcoming_order, approved_meals_per_week')
        .not('upcoming_order', 'is', null);
    if (error) throw new Error(error.message);

    const rows: Record<string, unknown>[] = [];
    const candidates = (clients ?? []).filter((c) => {
        const approved = Math.max(0, Number((c as { approved_meals_per_week?: number }).approved_meals_per_week) || 0);
        if (approved <= 0) return false;
        return effectiveServiceType(c as { upcoming_order?: unknown; service_type?: string }) === 'Food';
    });

    const hits = await mapPool(candidates, 6, async (c) => {
        const id = (c as { id: string }).id;
        const res = await getFoodAllowanceSnapshot(supabase, {
            id,
            approved_meals_per_week: (c as { approved_meals_per_week?: number }).approved_meals_per_week,
            service_type: (c as { service_type?: string }).service_type,
            upcoming_order: (c as { upcoming_order?: unknown }).upcoming_order,
        });
        if (!res || res.success !== true) return null;
        if (res.remaining_meals <= 0.02) return null;
        return {
            client_id: id,
            full_name: (c as { full_name?: string }).full_name ?? '',
            approved_meals_per_week: res.approved_meals_per_week,
            used_meals_total: res.used_meals_total,
            remaining_meals: res.remaining_meals,
        };
    });
    for (const h of hits) {
        if (h) rows.push(h);
    }

    rows.sort((a, b) => String(a.client_id).localeCompare(String(b.client_id)));

    return [
        {
            name: 'Food_under_allowance',
            title: 'Food clients under weekly meal allowance',
            methodology:
                'Effective service type Food, approved_meals_per_week > 0, clients.upcoming_order present. ' +
                'Uses the same meal accounting as SMS get_food_vendors_and_menu (vendor lines + meal packages). ' +
                'Listed when remaining_meals > 0 (not using the full weekly allowance).',
            rows,
        },
    ];
}

/** Primary clients: deliveries-allowed status, not expired by expiration_date, created ≥14 days ago, never an orders row. */
export async function runActiveTwoWeeksNoOrders(supabase: SupabaseClient): Promise<ReportSheet[]> {
    const todayNy = nyCalendarYmd();
    const { data: statuses, error: se } = await supabase.from('client_statuses').select('id, name, deliveries_allowed');
    if (se) throw new Error(se.message);
    const allowedIds = new Set(
        (statuses ?? [])
            .filter((s: { deliveries_allowed?: boolean }) => s.deliveries_allowed === true)
            .map((s: { id: string }) => s.id)
    );

    const { data: clients, error: ce } = await supabase
        .from('clients')
        .select('id, full_name, status_id, expiration_date, created_at, parent_client_id')
        .is('parent_client_id', null);
    if (ce) throw new Error(ce.message);

    const { data: orderClients, error: oe } = await supabase.from('orders').select('client_id');
    if (oe) throw new Error(oe.message);
    const everOrdered = new Set((orderClients ?? []).map((r: { client_id: string }) => r.client_id).filter(Boolean));

    const cutoffMs = Date.parse(`${addDaysYmd(todayNy, -14)}T00:00:00.000Z`);

    const rows: Record<string, unknown>[] = [];
    for (const c of clients ?? []) {
        if (!allowedIds.has((c as { status_id: string }).status_id)) continue;
        const exp = (c as { expiration_date?: string | null }).expiration_date;
        const expStr = exp ? String(exp).slice(0, 10) : '';
        if (expStr && expStr < todayNy) continue;
        const created = (c as { created_at?: string }).created_at;
        const createdMs = created ? Date.parse(created) : 0;
        if (!createdMs || createdMs > cutoffMs) continue;
        const id = (c as { id: string }).id;
        if (everOrdered.has(id)) continue;
        rows.push({
            client_id: id,
            full_name: (c as { full_name?: string }).full_name ?? '',
            status_id: (c as { status_id: string }).status_id,
            created_at: created ?? '',
            expiration_date: expStr || null,
        });
    }
    rows.sort((a, b) => String(a.client_id).localeCompare(String(b.client_id)));

    return [
        {
            name: 'Active_no_orders',
            title: 'Active primary clients (14d+) with no orders ever',
            methodology:
                'Primary client (parent_client_id null), client_statuses.deliveries_allowed, expiration_date empty or ≥ today (NY calendar), ' +
                'created_at at least 14 days ago (UTC parse of created_at vs NY “today” cutoff date), and no row in public.orders for that client_id.',
            rows,
        },
    ];
}

/** Orders stuck in billing_pending (last_updated older than 14 days). */
export async function runBillingPendingStale(supabase: SupabaseClient): Promise<ReportSheet[]> {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - 14);
    const iso = cutoff.toISOString();

    const { data, error } = await supabase
        .from('orders')
        .select('id, order_number, client_id, service_type, status, last_updated, scheduled_delivery_date, notes')
        .eq('status', 'billing_pending')
        .lt('last_updated', iso)
        .order('last_updated', { ascending: true });
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as Record<string, unknown>[];

    const { data: wfp, error: wfpErr } = await supabase
        .from('orders')
        .select('id, order_number, client_id, service_type, status, last_updated, scheduled_delivery_date')
        .eq('status', 'waiting_for_proof')
        .lt('last_updated', iso)
        .order('last_updated', { ascending: true });
    if (wfpErr) throw new Error(wfpErr.message);

    return [
        {
            name: 'Billing_pending_2wk',
            title: 'Orders billing_pending > 14 days (last_updated)',
            methodology:
                'status = billing_pending AND last_updated older than 14 days (UTC clock). Separate sheet lists waiting_for_proof for the same age threshold.',
            rows,
        },
        {
            name: 'Waiting_proof_2wk',
            title: 'Orders waiting_for_proof > 14 days',
            methodology: 'Same time rule as billing_pending sheet; optional pipeline visibility.',
            rows: (wfp ?? []) as Record<string, unknown>[],
        },
    ];
}

/** expiration_date (NY calendar) passed but status is not the “Expired” client_status. */
export async function runExpirationPassedNotExpired(supabase: SupabaseClient): Promise<ReportSheet[]> {
    const todayNy = nyCalendarYmd();
    const { data: expiredRow, error: exErr } = await supabase
        .from('client_statuses')
        .select('id, name')
        .ilike('name', 'expired')
        .maybeSingle();
    if (exErr) throw new Error(exErr.message);
    const expiredId = expiredRow?.id as string | undefined;
    if (!expiredId) {
        return [
            {
                name: 'Expired_mismatch',
                title: 'Expiration passed but not Expired status',
                methodology:
                    'MISSING CONFIG: No client_status row with name ilike expired. Add status before this report can run (see expire-clients-by-date cron).',
                rows: [],
            },
        ];
    }

    const { data: statuses } = await supabase.from('client_statuses').select('id, name');
    const statusName = new Map<string, string>((statuses ?? []).map((s: { id: string; name: string }) => [s.id, s.name]));

    const { data: clients, error } = await supabase
        .from('clients')
        .select('id, full_name, status_id, expiration_date, email')
        .not('expiration_date', 'is', null)
        .lte('expiration_date', todayNy)
        .neq('status_id', expiredId);
    if (error) throw new Error(error.message);

    const rows = (clients ?? []).map((c) => ({
        client_id: (c as { id: string }).id,
        full_name: (c as { full_name?: string }).full_name ?? '',
        expiration_date: String((c as { expiration_date?: string }).expiration_date).slice(0, 10),
        current_status_id: (c as { status_id: string }).status_id,
        current_status_name: statusName.get((c as { status_id: string }).status_id) ?? '',
        email: (c as { email?: string | null }).email ?? '',
    }));
    rows.sort((a, b) => a.client_id.localeCompare(b.client_id));

    return [
        {
            name: 'Exp_passed_not_expired',
            title: 'Clients past expiration_date (NY) not on Expired status',
            methodology:
                'Compare expiration_date to America/New_York calendar “today” (en-CA). Rows where expiration_date ≤ today and status_id ≠ id of client_status named Expired (case-insensitive). Matches expire-clients-by-date cron intent.',
            rows,
        },
    ];
}

async function vendorOrderCountsForWeek(
    supabase: SupabaseClient,
    weekSunday: string,
    weekSaturday: string
): Promise<Map<string, number>> {
    const { data: orders, error } = await supabase
        .from('orders')
        .select('id')
        .gte('scheduled_delivery_date', weekSunday)
        .lte('scheduled_delivery_date', weekSaturday)
        .not('status', 'eq', 'cancelled');
    if (error) throw new Error(error.message);
    const ids = [...new Set((orders ?? []).map((o: { id: string }) => o.id))];
    const vendorToOrders = new Map<string, Set<string>>();
    for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        if (chunk.length === 0) continue;
        const { data: ovs, error: ve } = await supabase.from('order_vendor_selections').select('order_id, vendor_id').in('order_id', chunk);
        if (ve) throw new Error(ve.message);
        for (const r of ovs ?? []) {
            const vid = (r as { vendor_id: string | null }).vendor_id;
            const oid = (r as { order_id: string }).order_id;
            if (!vid) continue;
            let s = vendorToOrders.get(vid);
            if (!s) {
                s = new Set();
                vendorToOrders.set(vid, s);
            }
            s.add(oid);
        }
    }
    const out = new Map<string, number>();
    for (const [vid, set] of vendorToOrders) out.set(vid, set.size);
    return out;
}

export async function runVendorsOrdersDownVsLastWeek(supabase: SupabaseClient): Promise<ReportSheet[]> {
    const todayNy = nyCalendarYmd();
    const thisSunday = billingWeekSundayYmd(todayNy);
    const thisSaturday = addDaysYmd(thisSunday, 6);
    const lastSunday = addDaysYmd(thisSunday, -7);
    const lastSaturday = addDaysYmd(thisSunday, -1);

    const thisWeek = await vendorOrderCountsForWeek(supabase, thisSunday, thisSaturday);
    const lastWeek = await vendorOrderCountsForWeek(supabase, lastSunday, lastSaturday);

    const vendorIds = new Set<string>([...thisWeek.keys(), ...lastWeek.keys()]);
    const { data: vendors } = await supabase.from('vendors').select('id, name, is_active');
    const vname = new Map((vendors ?? []).map((v: { id: string; name: string }) => [v.id, v.name]));

    const rows: Record<string, unknown>[] = [];
    for (const vid of vendorIds) {
        const a = lastWeek.get(vid) ?? 0;
        const b = thisWeek.get(vid) ?? 0;
        if (a > 0 && b < a) {
            rows.push({
                vendor_id: vid,
                vendor_name: vname.get(vid) ?? '',
                orders_last_week: a,
                orders_this_week: b,
                delta: b - a,
                week_last_label: `${lastSunday}–${lastSaturday}`,
                week_this_label: `${thisSunday}–${thisSaturday}`,
            });
        }
    }
    rows.sort((a, b) => (Number(b.orders_last_week) - Number(a.orders_last_week)) || String(a.vendor_id).localeCompare(String(b.vendor_id)));

    return [
        {
            name: 'Vendors_down_wow',
            title: 'Vendors with fewer distinct orders this week vs last',
            methodology:
                'Weeks are Sun–Sat inclusive on orders.scheduled_delivery_date (America/New_York calendar week containing today). ' +
                'Cancelled orders excluded. Count = distinct order_id per vendor from order_vendor_selections.',
            rows,
        },
    ];
}

/** Demo Food DB has no menu_items/breakfast_items dropdown columns (unlike Triangle). */
export async function runMenuItemsWithDropdown(_supabase: SupabaseClient): Promise<ReportSheet[]> {
    return [
        {
            name: 'Menu_dropdowns',
            title: 'Menu dropdown options (N/A on Demo Food)',
            methodology:
                'Demo Food does not store dropdown_enabled / dropdown_options on menu_items. ' +
                'Use ad-hoc SQL in Data Copilot or inspect clients.upcoming_order JSON if needed.',
            rows: [],
        },
        {
            name: 'Breakfast_dropdowns',
            title: 'Breakfast item dropdown options (N/A on Demo Food)',
            methodology:
                'Demo Food does not store dropdown_enabled / dropdown_options on breakfast_items. ' +
                'Meal package options live in upcoming_order JSON and breakfast_items rows.',
            rows: [],
        },
    ];
}

const RUNNERS: Record<ReportId, (s: SupabaseClient) => Promise<ReportSheet[]>> = {
    food_under_meal_allowance: runFoodUnderMealAllowance,
    active_two_weeks_no_orders: runActiveTwoWeeksNoOrders,
    billing_pending_over_two_weeks: runBillingPendingStale,
    expiration_passed_not_expired_status: runExpirationPassedNotExpired,
    vendors_orders_down_vs_last_week: runVendorsOrdersDownVsLastWeek,
    menu_items_with_dropdown: runMenuItemsWithDropdown,
};

export async function runReport(supabase: SupabaseClient, id: ReportId): Promise<ReportSheet[]> {
    return RUNNERS[id](supabase);
}

export async function runAllReports(supabase: SupabaseClient): Promise<ReportSheet[]> {
    const order: ReportId[] = [
        'active_two_weeks_no_orders',
        'billing_pending_over_two_weeks',
        'expiration_passed_not_expired_status',
        'vendors_orders_down_vs_last_week',
        'menu_items_with_dropdown',
        'food_under_meal_allowance',
    ];
    const out: ReportSheet[] = [];
    for (const k of order) {
        out.push(...(await RUNNERS[k](supabase)));
    }
    return out;
}

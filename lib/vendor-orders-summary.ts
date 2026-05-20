import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getTodayInAppTz, toCalendarDateKeyInAppTz } from '@/lib/timezone';
import { getSupabaseDbApiKey } from '@/lib/supabase-env';

/** Same cutoff as VendorDetail (yesterday in app timezone). */
export function getVendorSummarySinceDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return getTodayInAppTz(d);
}

export type VendorOrderSummaryRow = {
  date_key: string;
  order_count: number;
  total_items: number;
};

const ROW_CHUNK = 500;

/**
 * Per-date order counts for a vendor without Postgres RPC (demo DB may not have RPCs deployed).
 */
export async function computeVendorOrdersSummary(
  db: SupabaseClient,
  vendorId: string,
  since?: string | null
): Promise<{ rows: VendorOrderSummaryRow[]; total_dates: number }> {
  const byDate = new Map<string, { orderIds: Set<string>; totalItems: number }>();

  const addOrder = (order: {
    id: string;
    scheduled_delivery_date?: string | null;
    total_items?: number | null;
    service_type?: string | null;
  }) => {
    if (order.service_type === 'Produce') return;
    const dateKey =
      (order.scheduled_delivery_date &&
        (toCalendarDateKeyInAppTz(order.scheduled_delivery_date) ??
          String(order.scheduled_delivery_date).slice(0, 10))) ||
      'no-date';
    let bucket = byDate.get(dateKey);
    if (!bucket) {
      bucket = { orderIds: new Set(), totalItems: 0 };
      byDate.set(dateKey, bucket);
    }
    if (!bucket.orderIds.has(order.id)) {
      bucket.orderIds.add(order.id);
      bucket.totalItems += Number(order.total_items) || 0;
    }
  };

  let offset = 0;
  while (true) {
    const { data, error } = await db
      .from('orders')
      .select('id, scheduled_delivery_date, total_items, service_type')
      .eq('vendor_id', vendorId)
      .range(offset, offset + ROW_CHUNK - 1);
    if (error) throw error;
    const rows = data ?? [];
    for (const o of rows) addOrder(o);
    if (rows.length < ROW_CHUNK) break;
    offset += ROW_CHUNK;
  }

  const junctionOrderIds = new Set<string>();
  offset = 0;
  while (true) {
    const { data } = await db
      .from('order_vendor_selections')
      .select('order_id')
      .eq('vendor_id', vendorId)
      .range(offset, offset + ROW_CHUNK - 1);
    const rows = data ?? [];
    for (const r of rows) junctionOrderIds.add(r.order_id);
    if (rows.length < ROW_CHUNK) break;
    offset += ROW_CHUNK;
  }
  offset = 0;
  while (true) {
    const { data } = await db
      .from('order_box_selections')
      .select('order_id')
      .eq('vendor_id', vendorId)
      .range(offset, offset + ROW_CHUNK - 1);
    const rows = data ?? [];
    for (const r of rows) junctionOrderIds.add(r.order_id);
    if (rows.length < ROW_CHUNK) break;
    offset += ROW_CHUNK;
  }

  const junctionIds = Array.from(junctionOrderIds);
  for (let i = 0; i < junctionIds.length; i += ROW_CHUNK) {
    const batch = junctionIds.slice(i, i + ROW_CHUNK);
    const { data } = await db
      .from('orders')
      .select('id, scheduled_delivery_date, total_items, service_type')
      .in('id', batch);
    for (const o of data ?? []) addOrder(o);
  }

  const allRows: VendorOrderSummaryRow[] = Array.from(byDate.entries()).map(([date_key, b]) => ({
    date_key,
    order_count: b.orderIds.size,
    total_items: b.totalItems,
  }));

  allRows.sort((a, b) => {
    if (a.date_key === 'no-date') return 1;
    if (b.date_key === 'no-date') return -1;
    return b.date_key.localeCompare(a.date_key);
  });

  const total_dates = allRows.length;
  const rows =
    since != null && since !== ''
      ? allRows.filter((r) => r.date_key === 'no-date' || r.date_key >= since)
      : allRows;

  return { rows, total_dates };
}

/** Server-only: load summary with service role (vendor page RSC; no browser session). */
export async function loadVendorOrdersSummary(
  vendorId: string,
  since?: string | null
): Promise<{ rows: VendorOrderSummaryRow[]; total_dates: number }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = getSupabaseDbApiKey();
  if (!url || !key) {
    return { rows: [], total_dates: 0 };
  }
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return computeVendorOrdersSummary(db, vendorId, since ?? getVendorSummarySinceDate());
}

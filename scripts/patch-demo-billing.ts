/**
 * Enable billing API data on an existing demo-food database.
 * Sets bill=true on parent clients and aligns a subset of orders to the current billing week.
 *
 *   npm run patch:demo-billing
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import { getSupabaseDbApiKey } from '../lib/supabase-env';

function lastMondayISO(): string {
  const d = new Date();
  const day = d.getDay();
  const daysBack = (day + 6) % 7;
  d.setDate(d.getDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = getSupabaseDbApiKey();
  if (!supabaseUrl || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or Supabase DB key in .env.local');
    process.exit(1);
  }

  const sb = createClient(supabaseUrl, key, { auth: { persistSession: false } });
  const billStart = lastMondayISO();
  const billEnd = addDays(billStart, 6);

  console.log(`Billing window: ${billStart} … ${billEnd}`);

  const { data: parents, error: parentErr } = await sb
    .from('clients')
    .select('id, full_name, parent_client_id, bill, case_id_external')
    .is('parent_client_id', null)
    .is('archived_at', null)
    .limit(5000);

  if (parentErr) {
    console.error('Failed to load clients:', parentErr.message);
    process.exit(1);
  }

  const parentRows = parents ?? [];
  if (parentRows.length === 0) {
    console.log('No parent clients found.');
    return;
  }

  let billEnabled = 0;
  let urlsSet = 0;
  for (let i = 0; i < parentRows.length; i++) {
    const row = parentRows[i]!;
    if (i % 4 === 0) continue;
    const updates: Record<string, unknown> = { bill: true };
    if (!row.case_id_external && i < 120) {
      const fakeCase = `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`;
      const fakeContact = `00000000-0000-4000-9000-${String(i + 1).padStart(12, '0')}`;
      updates.case_id_external = `https://app.uniteus.io/dashboard/cases/open/${fakeCase}/contact/${fakeContact}/demographics`;
      urlsSet++;
    }
    const { error } = await sb.from('clients').update(updates).eq('id', row.id);
    if (error) {
      console.warn(`Client ${row.id}: ${error.message}`);
      continue;
    }
    billEnabled++;
  }

  console.log(`Enabled billing on ${billEnabled} parent client(s); set demo Unite URLs on ${urlsSet}.`);

  const { data: billableParents } = await sb
    .from('clients')
    .select('id')
    .is('parent_client_id', null)
    .neq('bill', false)
    .is('archived_at', null);

  const billableIds = (billableParents ?? []).map((r) => r.id);
  if (billableIds.length === 0) {
    console.log('No billable parents after patch.');
    return;
  }

  const { data: orders, error: orderErr } = await sb
    .from('orders')
    .select('id, client_id, status, scheduled_delivery_date, actual_delivery_date')
    .in('client_id', billableIds.slice(0, 800))
    .neq('status', 'billing_successful')
    .limit(2000);

  if (orderErr) {
    console.error('Failed to load orders:', orderErr.message);
    process.exit(1);
  }

  const orderList = orders ?? [];
  let ordersPatched = 0;
  for (let i = 0; i < orderList.length; i++) {
    if (i % 3 !== 0) continue;
    const o = orderList[i]!;
    const delivery = addDays(billStart, i % 7);
    const { error } = await sb
      .from('orders')
      .update({
        status: 'billing_pending',
        scheduled_delivery_date: delivery,
        actual_delivery_date: delivery,
      })
      .eq('id', o.id);
    if (!error) ordersPatched++;
  }

  console.log(`Set ${ordersPatched} order(s) to billing_pending in window ${billStart}–${billEnd}.`);
  console.log(`Test: curl "${process.env.NEXT_PUBLIC_APP_URL || 'https://scn.demo.poel.ai'}/api/bill/invoices?date=${billStart}"`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

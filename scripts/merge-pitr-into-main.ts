/**
 * Merge data FROM a good PITR clone INTO current production (MAIN).
 *
 * Rules (never deletes MAIN-only rows):
 * - Row only in PITR → insert on MAIN
 * - Row in both, PITR timestamp newer → replace row on MAIN from PITR
 * - Row in both, MAIN timestamp newer → skip (keeps post-restore work)
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/merge-pitr-into-main.ts --dry-run \
 *     --pitr-url https://hxzkejgwjqupbaxrvzut.supabase.co \
 *     --pitr-key "$PITR_SERVICE_ROLE_KEY"
 *
 *   ... same with --apply
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type Row = Record<string, unknown>;

function parseArgs() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--apply');
  let pitrUrl = process.env.PITR_SUPABASE_URL?.trim();
  let pitrKey = process.env.PITR_SUPABASE_KEY?.trim();
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--pitr-url' && args[i + 1]) pitrUrl = args[++i];
    if (args[i] === '--pitr-key' && args[i + 1]) pitrKey = args[++i];
  }
  return { dryRun, pitrUrl, pitrKey };
}

function sb(url: string, key: string) {
  return createClient(url, key, { auth: { persistSession: false } });
}

function ts(row: Row, table: string): string {
  if (table === 'orders' || table === 'upcoming_orders') {
    return String(row.last_updated ?? row.created_at ?? '');
  }
  return String(row.updated_at ?? row.created_at ?? row.timestamp ?? '');
}

async function fetchAll(client: SupabaseClient, table: string, select = '*'): Promise<Row[]> {
  const pageSize = 1000;
  let from = 0;
  const out: Row[] = [];
  while (true) {
    const { data, error } = await client
      .from(table)
      .select(select)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const batch = (data ?? []) as Row[];
    out.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

function planMerge(
  table: string,
  mainRows: Row[],
  pitrRows: Row[]
): { insert: Row[]; update: Row[]; skipMainNewer: number; skipSame: number } {
  const mainById = new Map(mainRows.map((r) => [String(r.id), r]));
  const insert: Row[] = [];
  const update: Row[] = [];
  let skipMainNewer = 0;
  let skipSame = 0;

  for (const p of pitrRows) {
    const id = String(p.id);
    const m = mainById.get(id);
    if (!m) {
      insert.push(p);
      continue;
    }
    const pAt = ts(p, table);
    const mAt = ts(m, table);
    if (pAt > mAt) update.push(p);
    else if (mAt > pAt) skipMainNewer++;
    else skipSame++;
  }
  return { insert, update, skipMainNewer, skipSame };
}

async function upsertRows(
  main: SupabaseClient,
  table: string,
  rows: Row[],
  dryRun: boolean
): Promise<void> {
  if (rows.length === 0) return;
  const batchSize = 100;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    if (dryRun) continue;
    const { error } = await main.from(table).upsert(batch, { onConflict: 'id' });
    if (error) throw new Error(`${table} upsert: ${error.message}`);
  }
}

async function syncOrderChildren(
  main: SupabaseClient,
  pitr: SupabaseClient,
  orderId: string,
  dryRun: boolean
) {
  const { data: pitrOvs, error: e1 } = await pitr
    .from('order_vendor_selections')
    .select('*')
    .eq('order_id', orderId);
  if (e1) throw new Error(e1.message);
  const ovs = pitrOvs ?? [];
  const vsIds = ovs.map((v) => v.id as string);

  const { data: pitrItems } =
    vsIds.length > 0
      ? await pitr.from('order_items').select('*').in('vendor_selection_id', vsIds)
      : { data: [] };
  const { data: pitrBoxes } = await pitr
    .from('order_box_selections')
    .select('*')
    .eq('order_id', orderId);

  if (dryRun) return;

  const { data: mainOvs } = await main.from('order_vendor_selections').select('id').eq('order_id', orderId);
  const mainVsIds = (mainOvs ?? []).map((v) => v.id as string);
  if (mainVsIds.length > 0) {
    await main.from('order_items').delete().in('vendor_selection_id', mainVsIds);
  }
  await main.from('order_vendor_selections').delete().eq('order_id', orderId);
  await main.from('order_box_selections').delete().eq('order_id', orderId);

  if (ovs.length > 0) {
    const { error } = await main.from('order_vendor_selections').insert(ovs);
    if (error) throw new Error(`order_vendor_selections: ${error.message}`);
  }
  if (pitrItems && pitrItems.length > 0) {
    const { error } = await main.from('order_items').insert(pitrItems);
    if (error) throw new Error(`order_items: ${error.message}`);
  }
  if (pitrBoxes && pitrBoxes.length > 0) {
    const { error } = await main.from('order_box_selections').insert(pitrBoxes);
    if (error) throw new Error(`order_box_selections: ${error.message}`);
  }
}

async function syncUpcomingOrderChildren(
  main: SupabaseClient,
  pitr: SupabaseClient,
  upcomingOrderId: string,
  dryRun: boolean
) {
  const { data: pitrOvs } = await pitr
    .from('upcoming_order_vendor_selections')
    .select('*')
    .eq('upcoming_order_id', upcomingOrderId);
  const ovs = pitrOvs ?? [];
  const vsIds = ovs.map((v) => v.id as string);

  const { data: pitrItems } =
    vsIds.length > 0
      ? await pitr.from('upcoming_order_items').select('*').in('upcoming_vendor_selection_id', vsIds)
      : { data: [] };
  const { data: pitrBoxes } = await pitr
    .from('upcoming_order_box_selections')
    .select('*')
    .eq('upcoming_order_id', upcomingOrderId);

  if (dryRun) return;

  const { data: mainOvs } = await main
    .from('upcoming_order_vendor_selections')
    .select('id')
    .eq('upcoming_order_id', upcomingOrderId);
  const mainVsIds = (mainOvs ?? []).map((v) => v.id as string);
  if (mainVsIds.length > 0) {
    await main.from('upcoming_order_items').delete().in('upcoming_vendor_selection_id', mainVsIds);
  }
  await main.from('upcoming_order_vendor_selections').delete().eq('upcoming_order_id', upcomingOrderId);
  await main.from('upcoming_order_box_selections').delete().eq('upcoming_order_id', upcomingOrderId);

  if (ovs.length > 0) await main.from('upcoming_order_vendor_selections').insert(ovs);
  if (pitrItems?.length) await main.from('upcoming_order_items').insert(pitrItems);
  if (pitrBoxes?.length) await main.from('upcoming_order_box_selections').insert(pitrBoxes);
}

function lightSelect(table: string): string {
  if (table === 'orders' || table === 'upcoming_orders') {
    return 'id, created_at, last_updated';
  }
  if (table === 'order_history') return 'id, timestamp';
  if (table === 'billing_records') return 'id, created_at';
  return 'id, updated_at, created_at';
}

async function mergeTableByTimestamp(
  main: SupabaseClient,
  pitr: SupabaseClient,
  table: string,
  dryRun: boolean,
  opts?: { syncChildren?: 'order' | 'upcoming' }
) {
  console.log(`\n--- ${table} ---`);
  const sel = lightSelect(table);
  const [mainLight, pitrLight] = await Promise.all([
    fetchAll(main, table, sel),
    fetchAll(pitr, table, sel),
  ]);
  const plan = planMerge(table, mainLight, pitrLight);
  console.log(
    `  insert ${plan.insert.length}, update ${plan.update.length}, skip (MAIN newer) ${plan.skipMainNewer}, unchanged ${plan.skipSame}`
  );

  const idsToFetch = [...plan.insert, ...plan.update].map((r) => String(r.id));
  if (idsToFetch.length === 0) return;

  const fullRows: Row[] = [];
  for (let i = 0; i < idsToFetch.length; i += 200) {
    const chunk = idsToFetch.slice(i, i + 200);
    const { data, error } = await pitr.from(table).select('*').in('id', chunk);
    if (error) throw new Error(`${table} fetch: ${error.message}`);
    fullRows.push(...((data ?? []) as Row[]));
  }

  await upsertRows(main, table, fullRows, dryRun);

  if (opts?.syncChildren === 'order' && !dryRun) {
    for (const id of idsToFetch) {
      await syncOrderChildren(main, pitr, id, dryRun);
    }
  }
  if (opts?.syncChildren === 'upcoming' && !dryRun) {
    for (const id of idsToFetch) {
      await syncUpcomingOrderChildren(main, pitr, id, dryRun);
    }
  }
  if (opts?.syncChildren === 'order' && dryRun) {
    console.log(`  (dry-run) would sync children for ${idsToFetch.length} orders`);
  }
}

async function mergeInsertOnlyById(
  main: SupabaseClient,
  pitr: SupabaseClient,
  table: string,
  dryRun: boolean
) {
  console.log(`\n--- ${table} (insert missing ids only) ---`);
  const [mainIds, pitrIds] = await Promise.all([
    fetchAll(main, table, 'id'),
    fetchAll(pitr, table, 'id'),
  ]);
  const mainSet = new Set(mainIds.map((r) => String(r.id)));
  const missing = pitrIds.filter((r) => !mainSet.has(String(r.id)));
  console.log(`  insert ${missing.length}`);
  if (missing.length === 0) return;

  const ids = missing.map((r) => String(r.id));
  const rows: Row[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data, error } = await pitr.from(table).select('*').in('id', chunk);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as Row[]));
  }
  await upsertRows(main, table, rows, dryRun);
}

async function main() {
  const { dryRun, pitrUrl, pitrKey } = parseArgs();
  const mainUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const mainKey =
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!mainUrl || !mainKey) {
    console.error('MAIN: set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }
  if (!pitrUrl || !pitrKey) {
    console.error('PITR: pass --pitr-url and --pitr-key (service role recommended)');
    process.exit(1);
  }

  const main = sb(mainUrl, mainKey);
  const pitr = sb(pitrUrl, pitrKey);

  console.log(dryRun ? '=== DRY RUN (no writes) ===' : '=== APPLYING MERGE ===');
  console.log('MAIN:', mainUrl);
  console.log('PITR:', pitrUrl);

  // Full client rows including upcoming_order JSON
  await mergeTableByTimestamp(main, pitr, 'clients', dryRun);

  await mergeTableByTimestamp(main, pitr, 'orders', dryRun, { syncChildren: 'order' });
  await mergeTableByTimestamp(main, pitr, 'upcoming_orders', dryRun, { syncChildren: 'upcoming' });

  await mergeInsertOnlyById(main, pitr, 'order_history', dryRun);
  await mergeInsertOnlyById(main, pitr, 'billing_records', dryRun);

  console.log('\nDone.');
  if (dryRun) {
    console.log('Re-run with --apply to write changes.');
  } else {
    console.log('Run compare:pitr again to verify.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

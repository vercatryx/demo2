/**
 * Compare current production Supabase vs a PITR / clone project.
 *
 * Usage (from demo-food/):
 *   npx tsx --env-file=.env.local scripts/compare-pitr-databases.ts \
 *     --pitr-url https://vahcjnulvdkqpcfswfyd.supabase.co \
 *     --pitr-key "$PITR_SERVICE_ROLE_OR_ANON_KEY"
 *
 * Env (optional):
 *   MAIN_SUPABASE_URL / MAIN_SUPABASE_KEY — default: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *   PITR_SUPABASE_URL / PITR_SUPABASE_KEY
 *   SINCE_ISO — only count rows updated after this time (default: 24h ago)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const TABLES_WITH_UPDATED_AT = [
  'clients',
  'orders',
  'upcoming_orders',
  'billing_records',
  'navigators',
  'vendors',
  'menu_items',
  'stops',
  'drivers',
] as const;

const TABLES_COUNT_ONLY = [
  'order_items',
  'order_vendor_selections',
  'navigator_logs',
  'order_history',
  'delivery_history',
  'meal_planner_orders',
  'admins',
] as const;

function parseArgs() {
  const args = process.argv.slice(2);
  let pitrUrl = process.env.PITR_SUPABASE_URL?.trim();
  let pitrKey = process.env.PITR_SUPABASE_KEY?.trim();
  let sinceIso = process.env.SINCE_ISO?.trim();
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--pitr-url' && args[i + 1]) pitrUrl = args[++i];
    if (args[i] === '--pitr-key' && args[i + 1]) pitrKey = args[++i];
    if (args[i] === '--since' && args[i + 1]) sinceIso = args[++i];
  }
  return { pitrUrl, pitrKey, sinceIso };
}

function projectRef(url: string): string {
  const m = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  return m?.[1] ?? url;
}

function sb(url: string, key: string): SupabaseClient {
  return createClient(url, key, { auth: { persistSession: false } });
}

async function countTable(client: SupabaseClient, table: string): Promise<number | null> {
  const { count, error } = await client.from(table).select('*', { count: 'exact', head: true });
  if (error) return null;
  return count ?? 0;
}

async function fetchAllIds(
  client: SupabaseClient,
  table: string,
  select: string
): Promise<Record<string, unknown>[]> {
  const pageSize = 1000;
  let from = 0;
  const out: Record<string, unknown>[] = [];
  while (true) {
    const { data, error } = await client
      .from(table)
      .select(select)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const batch = (data ?? []) as Record<string, unknown>[];
    out.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

async function rowsUpdatedSince(
  client: SupabaseClient,
  table: string,
  since: string
): Promise<number | null> {
  const tsCol = table === 'orders' ? 'last_updated' : 'updated_at';
  const { count, error } = await client
    .from(table)
    .select('*', { count: 'exact', head: true })
    .gte(tsCol, since);
  if (error) return null;
  return count ?? 0;
}

async function main() {
  const { pitrUrl, pitrKey, sinceIso } = parseArgs();
  const mainUrl = process.env.MAIN_SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const mainKey =
    process.env.MAIN_SUPABASE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!mainUrl || !mainKey) {
    console.error('Main: set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }
  if (!pitrUrl || !pitrKey) {
    console.error('PITR: pass --pitr-url and --pitr-key (service role recommended)');
    process.exit(1);
  }

  const since = sinceIso ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const main = sb(mainUrl, mainKey);
  const pitr = sb(pitrUrl, pitrKey);

  console.log('=== Database comparison ===');
  console.log('MAIN (current):', projectRef(mainUrl));
  console.log('PITR (recovery):', projectRef(pitrUrl));
  console.log('Rows updated since:', since);
  console.log('');

  console.log('--- Row counts ---');
  const allTables = [...TABLES_WITH_UPDATED_AT, ...TABLES_COUNT_ONLY];
  for (const table of allTables) {
    const [mainN, pitrN] = await Promise.all([countTable(main, table), countTable(pitr, table)]);
    const mainStr = mainN === null ? 'ERR' : String(mainN);
    const pitrStr = pitrN === null ? 'ERR' : String(pitrN);
    const delta =
      mainN !== null && pitrN !== null ? pitrN - mainN : null;
    const deltaStr = delta === null ? '' : `  (PITR − MAIN = ${delta >= 0 ? '+' : ''}${delta})`;
    console.log(`${table.padEnd(28)} MAIN=${mainStr.padStart(6)}  PITR=${pitrStr.padStart(6)}${deltaStr}`);
  }

  console.log('\n--- Updated in last window (by updated_at) ---');
  for (const table of TABLES_WITH_UPDATED_AT) {
    const [mainU, pitrU] = await Promise.all([
      rowsUpdatedSince(main, table, since),
      rowsUpdatedSince(pitr, table, since),
    ]);
    if (mainU === null && pitrU === null) continue;
    console.log(
      `${table.padEnd(28)} MAIN=${String(mainU ?? '?').padStart(6)}  PITR=${String(pitrU ?? '?').padStart(6)}`
    );
  }

  console.log('\n--- Clients diff (by id) ---');
  let mainClients: Record<string, unknown>[] = [];
  let pitrClients: Record<string, unknown>[] = [];
  try {
    [mainClients, pitrClients] = await Promise.all([
      fetchAllIds(main, 'clients', 'id, full_name, email, updated_at, created_at'),
      fetchAllIds(pitr, 'clients', 'id, full_name, email, updated_at, created_at'),
    ]);
  } catch (e) {
    console.error('Failed to load clients:', (e as Error).message);
    console.error('Tip: use service_role key for PITR if anon is blocked by RLS.');
    process.exit(1);
  }

  const mainById = new Map(mainClients.map((r) => [String(r.id), r]));
  const pitrById = new Map(pitrClients.map((r) => [String(r.id), r]));

  const onlyInPitr: Record<string, unknown>[] = [];
  const onlyInMain: Record<string, unknown>[] = [];
  const newerInPitr: { id: string; name: string; pitrAt: string; mainAt: string }[] = [];

  for (const [id, p] of pitrById) {
    const m = mainById.get(id);
    if (!m) {
      onlyInPitr.push(p);
      continue;
    }
    const pAt = String(p.updated_at ?? p.created_at ?? '');
    const mAt = String(m.updated_at ?? m.created_at ?? '');
    if (pAt > mAt) {
      newerInPitr.push({
        id,
        name: String(p.full_name ?? ''),
        pitrAt: pAt,
        mainAt: mAt,
      });
    }
  }
  for (const [id, m] of mainById) {
    if (!pitrById.has(id)) onlyInMain.push(m);
  }

  console.log(`Only in PITR (missing from MAIN): ${onlyInPitr.length}`);
  onlyInPitr.slice(0, 15).forEach((r) => {
    console.log(`  + ${r.id}  ${r.full_name}  ${r.email ?? ''}  updated=${r.updated_at}`);
  });
  if (onlyInPitr.length > 15) console.log(`  ... and ${onlyInPitr.length - 15} more`);

  console.log(`Only in MAIN (not in PITR): ${onlyInMain.length}`);
  onlyInMain.slice(0, 10).forEach((r) => {
    console.log(`  - ${r.id}  ${r.full_name}`);
  });

  console.log(`Same id, newer in PITR than MAIN: ${newerInPitr.length}`);
  newerInPitr
    .sort((a, b) => b.pitrAt.localeCompare(a.pitrAt))
    .slice(0, 20)
    .forEach((r) => {
      console.log(`  ~ ${r.id}  ${r.name}`);
      console.log(`      PITR updated: ${r.pitrAt}`);
      console.log(`      MAIN updated: ${r.mainAt}`);
    });

  console.log('\n--- Orders diff (by id) ---');
  try {
    const [mainOrders, pitrOrders] = await Promise.all([
      fetchAllIds(main, 'orders', 'id, client_id, status, order_number, last_updated, created_at'),
      fetchAllIds(pitr, 'orders', 'id, client_id, status, order_number, last_updated, created_at'),
    ]);
    const mainO = new Map(mainOrders.map((r) => [String(r.id), r]));
    const pitrO = new Map(pitrOrders.map((r) => [String(r.id), r]));
    let onlyPitrOrders = 0;
    let newerPitrOrders = 0;
    for (const [id, p] of pitrO) {
      const m = mainO.get(id);
      if (!m) onlyPitrOrders++;
      else {
        const pAt = String(p.last_updated ?? p.created_at ?? '');
        const mAt = String(m.last_updated ?? m.created_at ?? '');
        if (pAt > mAt) newerPitrOrders++;
      }
    }
    console.log(`Orders only in PITR: ${onlyPitrOrders}`);
    console.log(`Orders newer in PITR than MAIN: ${newerPitrOrders}`);
    console.log(`Orders only in MAIN: ${[...mainO.keys()].filter((id) => !pitrO.has(id)).length}`);
  } catch (e) {
    console.log('Orders diff skipped:', (e as Error).message);
  }

  console.log('\n--- Interpretation ---');
  console.log(
    '• "Only in PITR" / "newer in PITR" = likely work from the lost window you can merge back into MAIN.'
  );
  console.log('• If PITR counts look like demo seed (1000 clients, @demo.local), PITR point may be wrong.');
  console.log('• If PITR ≈ MAIN on everything, recovery clone may be same snapshot as current MAIN.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

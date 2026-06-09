/**
 * Refresh meal plan demo data on an existing demo-food database.
 * - clients.meal_planner_data with realistic items (qty + value so totals are non-zero)
 * - meal_planner_custom_items default template for upcoming Mon/Wed/Fri dates
 * - RPC helpers for calendar counts (if missing)
 *
 *   npm run patch:demo-meal-plan
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { getSupabaseDbApiKey } from '../lib/supabase-env';
import { menuItemName, mealItemName } from '../lib/demo-personas';

const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'] as const;

function addDays(base: Date, n: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function templateDatesAroundToday(now = new Date()): string[] {
  const out: string[] = [];
  for (let offset = -3; offset <= 42; offset++) {
    const dt = new Date(now);
    dt.setDate(now.getDate() + offset);
    const dow = dt.getDay();
    if (dow === 1 || dow === 3 || dow === 5) {
      out.push(dt.toISOString().slice(0, 10));
    }
  }
  return out;
}

function mealPlannerDatesForClient(clientIndex: number, now = new Date()): string[] {
  const dates: string[] = [];
  for (let d = -7; d <= 28; d++) {
    if ((d + clientIndex) % 2 === 0) dates.push(addDays(now, d));
  }
  return dates;
}

function buildDayItems(clientIndex: number, dayOffset: number) {
  const itemCount = 2 + ((clientIndex + dayOffset) % 2);
  const items: { mealType: string; name: string; quantity: number; value: number }[] = [];
  for (let j = 0; j < itemCount; j++) {
    const useMeal = (clientIndex + dayOffset + j) % 3 !== 0;
    const name = useMeal
      ? mealItemName((clientIndex * 3 + dayOffset + j) % 120)
      : menuItemName((clientIndex * 5 + dayOffset + j) % 120);
    const quantity = 1 + ((clientIndex + j) % 3);
    const value = 1 + ((clientIndex + dayOffset + j) % 2);
    items.push({
      mealType: MEAL_TYPES[(clientIndex + j) % MEAL_TYPES.length]!,
      name,
      quantity,
      value,
    });
  }
  return items;
}

const RPC_SQL = `
CREATE OR REPLACE FUNCTION get_meal_plan_edit_counts(p_start_date text, p_end_date text)
RETURNS TABLE(delivery_date text, client_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    (entry ->> 'scheduledDeliveryDate')::text AS delivery_date,
    count(DISTINCT c.id)::bigint AS client_count
  FROM clients c,
       jsonb_array_elements(c.meal_planner_data) AS entry
  WHERE c.meal_planner_data IS NOT NULL
    AND jsonb_typeof(c.meal_planner_data) = 'array'
    AND c.archived_at IS NULL
    AND (entry ->> 'scheduledDeliveryDate') >= p_start_date
    AND (entry ->> 'scheduledDeliveryDate') <= p_end_date
  GROUP BY (entry ->> 'scheduledDeliveryDate')
  ORDER BY delivery_date;
$$;

CREATE OR REPLACE FUNCTION get_clients_changed_from_default(p_delivery_date text)
RETURNS TABLE(full_name text)
LANGUAGE sql
STABLE
AS $$
  SELECT c.full_name::text
  FROM clients c
  WHERE c.meal_planner_data IS NOT NULL
    AND jsonb_typeof(c.meal_planner_data) = 'array'
    AND c.archived_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(c.meal_planner_data) AS entry
      WHERE (entry ->> 'scheduledDeliveryDate') = p_delivery_date
    )
  ORDER BY c.full_name;
$$;
`;

async function applyRpc(sb: ReturnType<typeof createClient>) {
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl && !dbUrl.includes('[REF]') && !dbUrl.includes('[PASSWORD]')) {
    const pg = await import('pg');
    const client = new pg.default.Client({ connectionString: dbUrl });
    await client.connect();
    await client.query(RPC_SQL);
    await client.end();
    console.log('Applied meal plan RPC functions via DATABASE_URL.');
    return;
  }
  const { error } = await sb.rpc('get_meal_plan_edit_counts', {
    p_start_date: '2000-01-01',
    p_end_date: '2000-01-02',
  });
  if (error?.message?.includes('Could not find the function')) {
    console.warn(
      'RPC functions missing and DATABASE_URL not set — apply sql/get_meal_plan_edit_counts_rpc.sql in Supabase SQL editor.'
    );
  } else {
    console.log('Meal plan RPC functions already present (or DATABASE_URL needed to create them).');
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = getSupabaseDbApiKey();
  if (!supabaseUrl || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or Supabase DB key in .env.local');
    process.exit(1);
  }

  const sb = createClient(supabaseUrl, key, { auth: { persistSession: false } });
  const now = new Date();
  const today = addDays(now, 0);
  console.log(`Patching meal plan demo data (anchor date: ${today})…`);

  const { data: clients, error: clientErr } = await sb
    .from('clients')
    .select('id, service_type')
    .in('service_type', ['Food', 'Meal'])
    .is('archived_at', null);

  if (clientErr) {
    console.error('Failed to load clients:', clientErr.message);
    process.exit(1);
  }

  const mealClients = clients ?? [];
  if (mealClients.length === 0) {
    console.log('No Food/Meal clients found.');
    return;
  }

  let updated = 0;
  for (let i = 0; i < mealClients.length; i++) {
    const c = mealClients[i]!;
    const dates = mealPlannerDatesForClient(i, now);
    const meal_planner_data = dates.map((d, dayIdx) => ({
      scheduledDeliveryDate: d,
      items: buildDayItems(i, dayIdx),
    }));
    const { error } = await sb
      .from('clients')
      .update({ meal_planner_data, updated_at: new Date().toISOString() })
      .eq('id', c.id);
    if (error) {
      console.warn(`Client ${c.id}: ${error.message}`);
      continue;
    }
    updated++;
    if (updated % 100 === 0) console.log(`  …${updated} clients`);
  }
  console.log(`Updated meal_planner_data on ${updated} Food/Meal client(s).`);

  const templateDates = templateDatesAroundToday(now);
  const { error: delErr } = await sb
    .from('meal_planner_custom_items')
    .delete()
    .is('client_id', null);
  if (delErr) console.warn('Clear template items:', delErr.message);

  const customRows: Record<string, unknown>[] = [];
  const configRows: Record<string, unknown>[] = [];
  for (const date of templateDates) {
    configRows.push({
      id: randomUUID(),
      calendar_date: date,
      client_id: null,
      expected_total_meals: 4 + (date.charCodeAt(8) % 3),
    });
    for (let j = 0; j < 4; j++) {
      customRows.push({
        id: randomUUID(),
        client_id: null,
        calendar_date: date,
        name: menuItemName((date.charCodeAt(8) + j) % 120),
        quantity: 1 + (j % 2),
        value: 1 + (j % 2),
        sort_order: j,
      });
    }
  }

  for (const batch of chunk(customRows, 200)) {
    const { error } = await sb.from('meal_planner_custom_items').insert(batch);
    if (error) throw error;
  }
  const { error: cfgDelErr } = await sb
    .from('meal_planner_date_config')
    .delete()
    .is('client_id', null);
  if (cfgDelErr) console.warn('Clear template config:', cfgDelErr.message);
  for (const batch of chunk(configRows, 100)) {
    const { error } = await sb.from('meal_planner_date_config').insert(batch);
    if (error) throw error;
  }
  console.log(
    `Seeded ${customRows.length} default template items across ${templateDates.length} calendar date(s).`
  );

  await applyRpc(sb);

  const monthStart = `${today.slice(0, 7)}-01`;
  const monthEnd = `${today.slice(0, 7)}-31`;
  const { data: rpcSample } = await sb.rpc('get_meal_plan_edit_counts', {
    p_start_date: monthStart,
    p_end_date: monthEnd,
  });
  const todayRow = (rpcSample as { delivery_date: string; client_count: number }[] | null)?.find(
    (r) => r.delivery_date === today
  );
  const todayCount = todayRow?.client_count ?? 'n/a';
  console.log(`Done. Clients with edits today (${today}): ${todayCount}`);
  console.log('Open /meal-plan-edits and click a green calendar day to verify.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

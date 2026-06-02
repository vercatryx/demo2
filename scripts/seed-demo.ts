/**
 * Demo database seed — run from demo-food:
 *   npm run seed:demo
 *   npm run seed:demo:reset
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { hashPassword } from '../lib/password';
import {
  realisticName,
  realisticEmail,
  realisticPhone,
  realisticStreet,
  metroLatLng,
  zoneStopLatLng,
  zoneDriverName,
  vendorName,
  navigatorName,
  menuItemName,
  mealItemName,
  produceVendorName,
  ROUTE_ZONES,
} from '../lib/demo-personas';
import { createPgSeedDb, type SeedDb } from './seed-db';
import { compileFinalPrompt } from '../lib/ai/compile-prompt';
import { seedAiUsageData } from '../lib/demo-seed-ai-usage';
import { demoProofUrl } from '../lib/demo-proof-urls';

type DemoSeedDb = SupabaseClient | SeedDb;

const PROTECTED_PROJECT_REFS = ['uqgbekvxvqntiptgvccw'];
const ALLOWED_DEMO_PROJECT_REFS = ['xijcvnsmmwwnpeadmsnb'];

function extractProjectRef(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const m = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  if (m) return m[1]!;
  const db = process.env.DATABASE_URL ?? '';
  const m2 = db.match(/postgres\.([a-z0-9]+)/) || db.match(/db\.([a-z0-9]+)\.supabase/);
  return m2?.[1] ?? null;
}

function assertSafeSeedTarget(): void {
  const ref = extractProjectRef();
  const confirm = process.env.DEMO_SEED_CONFIRM === 'I_UNDERSTAND';
  if (ref && PROTECTED_PROJECT_REFS.includes(ref) && !confirm) {
    throw new Error(
      `REFUSING SEED: project "${ref}" is production. Point .env.local at demo (${ALLOWED_DEMO_PROJECT_REFS.join(', ')}) only.`
    );
  }
  if (ref && !ALLOWED_DEMO_PROJECT_REFS.includes(ref) && !confirm) {
    throw new Error(
      `REFUSING SEED: unknown project "${ref}". Allowed: ${ALLOWED_DEMO_PROJECT_REFS.join(', ')}.`
    );
  }
}

async function createSupabaseSeedDb(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Set SUPABASE_SECRET_KEY (service role) or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  }
  const client = createClient(url, key, { auth: { persistSession: false } });
  const probe = await client.from('clients').select('id').limit(1);
  if (probe.error?.message?.includes('Legacy API keys are disabled')) {
    throw new Error('Legacy API keys disabled. Set DATABASE_URL or a valid SUPABASE_SECRET_KEY.');
  }
  if (probe.error) throw probe.error;
  return client;
}

async function createSeedDb(): Promise<DemoSeedDb> {
  assertSafeSeedTarget();
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl && !dbUrl.includes('[REF]') && !dbUrl.includes('[PASSWORD]')) {
    const dbRef =
      dbUrl.match(/postgres\.([a-z0-9]+)/)?.[1] ?? dbUrl.match(/db\.([a-z0-9]+)\.supabase/)?.[1];
    if (dbRef && PROTECTED_PROJECT_REFS.includes(dbRef) && process.env.DEMO_SEED_CONFIRM !== 'I_UNDERSTAND') {
      throw new Error(`REFUSING SEED: DATABASE_URL targets production (${dbRef}).`);
    }
    console.log('Using DATABASE_URL (direct Postgres) for seed…');
    const pg = createPgSeedDb(dbUrl);
    if ('probe' in pg && typeof pg.probe === 'function') {
      const probe = await pg.probe();
      if (probe.error) {
        console.warn(`DATABASE_URL failed (${probe.error.message}); falling back to Supabase API…`);
        if ('end' in pg && typeof pg.end === 'function') await pg.end();
        return createSupabaseSeedDb();
      }
    }
    return pg;
  }
  console.log('Using Supabase API for seed…');
  return createSupabaseSeedDb();
}

const RESET = process.argv.includes('--reset');
const CLIENT_COUNT = 1000;
const ORDER_COUNT = 3500;
const UPCOMING_COUNT = 400;
const NAV_LOG_COUNT = 2000;
const BILLING_COUNT = 0;
const MEAL_PLANNER_ORDER_COUNT = 2200;
const ROUTE_DAY = 'monday';
const DRIVERS_PER_DAY = ROUTE_ZONES.length;
const STOPS_PER_DRIVER = 32;
const PENDING_SCREENING_COUNT = 28;
const ORDER_HISTORY_COUNT = 500;
function pickClientContactFields(
  i: number,
  first: string,
  last: string
): {
  email: string | null;
  phone_number: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
} {
  const email = realisticEmail(first, last, i);
  const phone_number = realisticPhone(i);
  const address = realisticStreet(i);
  const city = 'Columbus';
  const state = 'OH';
  const zip = String(43201 + (i % 20));

  // Spread gaps across the roster so mass messaging / routing demos have realistic skips.
  const missingEmail = i % 10 === 1 || i % 10 === 6;
  const missingPhone = i % 10 === 2 || i % 10 === 7 || i % 17 === 0;
  const missingAddress = i % 10 === 4 || i % 13 === 5;

  return {
    email: missingEmail ? null : email,
    phone_number: missingPhone ? null : phone_number,
    address: missingAddress ? null : address,
    city: missingAddress ? null : city,
    state: missingAddress ? null : state,
    zip: missingAddress ? null : zip,
  };
}

function pickBillingOrderMeta(i: number): {
  status: string;
  proof: string | null;
  sched: string;
  actual: string | null;
  billed: boolean;
} {
  const sched = daysAgo(i % 14);
  const bucket = i % 10;
  const proof = demoProofUrl(i);
  if (bucket < 3) {
    return {
      status: 'billing_successful',
      proof,
      sched,
      actual: sched,
      billed: true,
    };
  }
  if (bucket < 5) {
    return { status: 'billing_pending', proof, sched, actual: sched, billed: false };
  }
  if (bucket < 7) {
    return { status: 'completed', proof, sched, actual: sched, billed: bucket < 6 };
  }
  if (bucket < 8) {
    return { status: 'delivered', proof: null, sched, actual: sched, billed: false };
  }
  return { status: 'scheduled', proof: null, sched: daysAhead(i % 7), actual: null, billed: false };
}

function mealPlannerDateRange(clientIndex: number): string[] {
  const dates: string[] = [];
  for (let d = -7; d <= 28; d++) {
    if ((d + clientIndex) % 2 === 0) dates.push(daysAhead(d));
  }
  return dates;
}

const SERVICE_TYPES = ['Food', 'Meal', 'Boxes', 'Produce', 'Equipment', 'Custom'] as const;
const SERVICE_WEIGHTS = [0.38, 0.28, 0.12, 0.15, 0.04, 0.03];

const AI_GENERAL_INSTRUCTIONS = `You are the meal program assistant for a Columbus-area food delivery nonprofit.

Tone: warm, concise, and professional. Confirm spellings for names and addresses when updating records.

When a caller asks about orders, deliveries, or meal changes, use the tools below. For any change that affects what will be delivered, read back a short summary and get explicit confirmation before calling a write tool.

Household rules:
- One active Food or Meal profile per phone number unless staff has linked dependants.
- Produce clients are routed to the produce team; do not promise hot-meal changes on that line.

Escalate to a human when the caller is upset, mentions a safety issue, or asks for something outside the tools list.`;

function buildFoodUpcomingOrder(vendorId: string, menuIds: string[], deliveryDay = 'Wednesday') {
  const items: Record<string, number> = {};
  for (let j = 0; j < 6; j++) {
    items[menuIds[j % menuIds.length]!] = 1 + (j % 3);
  }
  return {
    serviceType: 'Food',
    deliveryDayOrders: {
      [deliveryDay]: { vendorSelections: [{ vendorId, items }] },
    },
    vendorSelections: [{ vendorId, items: {} }],
  };
}

function buildMealUpcomingOrder(vendorId: string, mealItemIds: string[], mealCount = 14) {
  const items: Record<string, number> = {};
  for (let j = 0; j < Math.min(mealCount, mealItemIds.length); j++) {
    items[mealItemIds[j]!] = 1 + (j % 2);
  }
  return {
    serviceType: 'Meal',
    vendorSelections: [{ vendorId, items }],
  };
}

function templateDatesForSeed(): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let d = -3; d <= 35; d++) {
    const dt = new Date(now);
    dt.setDate(now.getDate() + d);
    const dow = dt.getDay();
    if (dow === 1 || dow === 3 || dow === 5) {
      out.push(dt.toISOString().slice(0, 10));
    }
  }
  return out;
}

function pickServiceType(i: number): string {
  const r = ((i * 17) % 100) / 100;
  let acc = 0;
  for (let j = 0; j < SERVICE_TYPES.length; j++) {
    acc += SERVICE_WEIGHTS[j]!;
    if (r < acc) return SERVICE_TYPES[j]!;
  }
  return 'Food';
}

type MenuSeedRow = { id: string; value: number; price_each: number };
type MealSeedRow = { id: string; price_each: number };

function menuUnitPrice(row: MenuSeedRow): number {
  return Number(row.price_each ?? row.value) || 0;
}

function mealUnitPrice(row: MealSeedRow): number {
  return Number(row.price_each) || 0;
}

/** Build line items + totals that match what the orders UI computes from order_items / box selections. */
function buildSeededOrderTotals(
  serviceType: string,
  i: number,
  menuCatalog: MenuSeedRow[],
  mealCatalog: MealSeedRow[],
  boxTypePrice: number
): { totalItems: number; totalValue: number; lineItems: Array<{
  menu_item_id?: string | null;
  meal_item_id?: string | null;
  quantity: number;
  custom_price: number;
}>; boxItems?: Record<string, number> } {
  const lineItems: Array<{
    menu_item_id?: string | null;
    meal_item_id?: string | null;
    quantity: number;
    custom_price: number;
  }> = [];

  if (serviceType === 'Boxes') {
    const boxItems: Record<string, number> = {};
    let totalItems = 0;
    let totalValue = boxTypePrice;
    for (let j = 0; j < 4; j++) {
      const menu = menuCatalog[(i + j) % menuCatalog.length]!;
      const qty = 1 + ((i + j) % 2);
      boxItems[menu.id] = qty;
      totalItems += qty;
      totalValue += menuUnitPrice(menu) * qty * 0.25;
    }
    return {
      totalItems: Math.max(totalItems, 4),
      totalValue: Math.round(totalValue * 100) / 100,
      lineItems: [],
      boxItems,
    };
  }

  const lineCount = 2 + (i % 3);
  let totalItems = 0;
  let totalValue = 0;

  for (let j = 0; j < lineCount; j++) {
    const qty = 1 + ((i + j) % 2);
    if (serviceType === 'Meal') {
      const meal = mealCatalog[(i + j) % mealCatalog.length]!;
      const unit = mealUnitPrice(meal);
      lineItems.push({ meal_item_id: meal.id, menu_item_id: null, quantity: qty, custom_price: unit });
      totalItems += qty;
      totalValue += unit * qty;
    } else {
      const menu = menuCatalog[(i + j) % menuCatalog.length]!;
      const unit = menuUnitPrice(menu);
      lineItems.push({ menu_item_id: menu.id, quantity: qty, custom_price: unit });
      totalItems += qty;
      totalValue += unit * qty;
    }
  }

  if (serviceType === 'Equipment') {
    return { totalItems: 1, totalValue: 65 + (i % 120), lineItems: [] };
  }

  return {
    totalItems: Math.max(totalItems, lineCount),
    totalValue: Math.round(Math.max(totalValue, 12) * 100) / 100,
    lineItems,
  };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function daysAhead(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const ROUTE_PALETTE = [
  '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b',
  '#e377c2', '#17becf', '#bcbd22', '#393b79', '#ad494a', '#637939',
];

async function main() {
  const db = await createSeedDb();
  const deliveryDate = daysAgo(0);

  if (RESET) {
    console.log('Truncating demo tables…');
    const tables = [
      'usage_events',
      'meal_planner_order_items',
      'meal_planner_orders',
      'meal_planner_custom_items',
      'meal_planner_date_config',
      'order_items',
      'order_vendor_selections',
      'order_box_selections',
      'upcoming_order_items',
      'upcoming_order_vendor_selections',
      'upcoming_order_box_selections',
      'billing_records',
      'navigator_logs',
      'delivery_history',
      'order_history',
      'stops',
      'driver_route_order',
      'orders',
      'upcoming_orders',
      'clients',
      'menu_items',
      'box_quotas',
      'box_types',
      'item_categories',
      'equipment',
      'produce_vendors',
      'vendors',
      'navigators',
      'nutritionists',
      'client_statuses',
      'drivers',
      'routes',
      'route_runs',
      'breakfast_items',
      'breakfast_categories',
      'form_answers',
      'filled_forms',
      'form_submissions',
      'questions',
      'forms',
      'usage_pricing_rates',
      'admins',
    ];
    for (const t of tables) {
      const { error } = await db.from(t).delete().neq('id', '00000000-0000-0000-0000-000000000000');
      const msg = error?.message ?? '';
      const skip = msg.includes('does not exist') || (error as { code?: string } | null)?.code === '42P01';
      if (error && !skip) console.warn(`  ${t}: ${msg}`);
    }
  }

  console.log('Seeding reference data…');
  const statusActive = randomUUID();
  const statusApproved = randomUUID();
  const statusPaused = randomUUID();
  const statusPending = randomUUID();
  await db.from('client_statuses').insert([
    { id: statusActive, name: 'Active', is_system_default: true, deliveries_allowed: true, requires_units_on_change: false },
    { id: statusApproved, name: 'Approved', deliveries_allowed: true, requires_units_on_change: false },
    { id: statusPaused, name: 'Paused', deliveries_allowed: false, requires_units_on_change: false },
    { id: statusPending, name: 'Pending screening', deliveries_allowed: false, requires_units_on_change: true },
  ]);

  const navigatorIds = Array.from({ length: 12 }, () => randomUUID());
  const navPw = await hashPassword('nav12345');
  await db.from('navigators').insert(
    navigatorIds.map((id, i) => ({
      id,
      name: navigatorName(i),
      email: realisticEmail('nav', String(i), i + 5000),
      password: navPw,
      is_active: true,
    }))
  );

  const vendorIds = Array.from({ length: 8 }, () => randomUUID());
  const vendorPw = await hashPassword('vendor12345');
  await db.from('vendors').insert(
    vendorIds.map((id, i) => ({
      id,
      name: vendorName(i),
      email: realisticEmail('orders', vendorName(i).split(' ')[0]!, i + 6000),
      password: vendorPw,
      service_type: 'Food,Meal,Boxes',
      delivery_days: ['Monday', 'Wednesday', 'Friday'],
      is_active: true,
      minimum_meals: 0,
      is_default: i === 0,
    }))
  );

  const catId = randomUUID();
  await db.from('item_categories').insert({ id: catId, name: 'Prepared meals', set_value: 10 });
  const menuIds: string[] = [];
  const menuCatalog: MenuSeedRow[] = [];
  const menuRows = Array.from({ length: 120 }, (_, i) => {
    const id = randomUUID();
    const unit = 5 + (i % 20);
    menuIds.push(id);
    const row: MenuSeedRow = { id, value: unit, price_each: unit };
    menuCatalog.push(row);
    return {
      id,
      vendor_id: vendorIds[i % vendorIds.length],
      name: menuItemName(i),
      value: unit,
      price_each: unit,
      is_active: true,
      category_id: catId,
      minimum_order: 0,
    };
  });
  for (const batch of chunk(menuRows, 100)) await db.from('menu_items').insert(batch);

  const mealCatBreakfast = randomUUID();
  const mealCatLunch = randomUUID();
  await db.from('breakfast_categories').insert([
    { id: mealCatBreakfast, name: 'Breakfast', meal_type: 'Breakfast', set_value: 1, sort_order: 0 },
    { id: mealCatLunch, name: 'Lunch', meal_type: 'Lunch', set_value: 1, sort_order: 1 },
  ]);
  const mealItemIds: string[] = [];
  const mealCatalog: MealSeedRow[] = [];
  const mealItemRows = Array.from({ length: 48 }, (_, i) => {
    const id = randomUUID();
    const price_each = 4 + (i % 12);
    mealItemIds.push(id);
    mealCatalog.push({ id, price_each });
    return {
      id,
      category_id: i % 2 === 0 ? mealCatBreakfast : mealCatLunch,
      name: mealItemName(i),
      quota_value: 1,
      price_each,
      is_active: true,
      sort_order: i,
    };
  });
  for (const batch of chunk(mealItemRows, 50)) await db.from('breakfast_items').insert(batch);

  const boxTypeId = randomUUID();
  await db.from('box_types').insert({
    id: boxTypeId,
    name: 'Standard box',
    vendor_id: vendorIds[0],
    is_active: true,
    price_each: 45,
  });
  await db.from('box_quotas').insert({
    id: randomUUID(),
    box_type_id: boxTypeId,
    category_id: catId,
    target_value: 10,
  });

  const produceVendorIds = Array.from({ length: 4 }, () => randomUUID());
  await db.from('produce_vendors').insert(
    produceVendorIds.map((id, i) => ({
      id,
      name: produceVendorName(i),
      token: randomUUID(),
      is_active: true,
    }))
  );

  const equipmentCatalog = ['Refrigerator', 'Microwave', 'Blender', 'Food scale', 'Insulated bag'].map((name, i) => ({
    id: randomUUID(),
    name,
    price: 25 + i * 40,
    vendor_id: vendorIds[i % vendorIds.length]!,
  }));
  await db.from('equipment').insert(equipmentCatalog);

  await db.from('nutritionists').insert(
    Array.from({ length: 4 }, (_, i) => ({
      id: randomUUID(),
      name: realisticName(800 + i).full,
      email: realisticEmail('nutrition', String(i), i + 7000),
    }))
  );

  const adminPw = await hashPassword(process.env.ENV_ADMIN_PASSWORD || '12345');
  await db.from('admins').insert({
    id: randomUUID(),
    username: process.env.ENV_ADMIN_USERNAME || 'admin',
    password: adminPw,
    name: 'System Administrator',
  });

  await db.from('app_settings').upsert({
    id: '1',
    weekly_cutoff_day: 'Friday',
    weekly_cutoff_time: '17:00',
    enable_passwordless_login: false,
  });

  const compiledAiPrompt = compileFinalPrompt({ general_instructions: AI_GENERAL_INSTRUCTIONS });
  await db.from('ai_config').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await db.from('ai_config').insert({
    general_instructions: AI_GENERAL_INSTRUCTIONS,
    function_blocks: [],
    llm_provider: 'anthropic',
    llm_model: 'claude-haiku-4-5',
    compiled_prompt: compiledAiPrompt,
  });

  const defaultVendorId = vendorIds[0]!;
  const defaultFoodTemplate = buildFoodUpcomingOrder(defaultVendorId, menuIds.slice(0, 24), 'Wednesday');
  await db.from('settings').delete().eq('key', 'default_order_template');
  await db.from('settings').insert({
    id: randomUUID(),
    key: 'default_order_template',
    value: JSON.stringify({ Food: defaultFoodTemplate }),
  });

  const screeningFormId = randomUUID();
  await db.from('forms').insert({
    id: screeningFormId,
    title: 'Screening Form',
    description: 'Initial eligibility and dietary screening',
  });
  const screeningQuestions = [
    { text: 'Do you have difficulty shopping for or preparing meals?', type: 'multiple_choice', options: ['Yes', 'No'] },
    { text: 'How many household members need meal delivery?', type: 'text', options: null },
    { text: 'List any food allergies or intolerances', type: 'text', options: null },
    { text: 'Preferred delivery day', type: 'multiple_choice', options: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] },
    { text: 'Do you require a special diet?', type: 'multiple_choice', options: ['Regular', 'Diabetic', 'Low sodium', 'Renal', 'Other'] },
    { text: 'Primary care physician name', type: 'text', options: null },
    { text: 'Emergency contact name and phone', type: 'text', options: null },
    { text: 'Current living situation', type: 'multiple_choice', options: ['Own home', 'Apartment', 'Assisted living', 'Other'] },
  ];
  const screeningQuestionIds = screeningQuestions.map(() => randomUUID());
  await db.from('questions').insert(
    screeningQuestions.map((q, i) => ({
      id: screeningQuestionIds[i],
      form_id: screeningFormId,
      text: q.text,
      type: q.type,
      options: q.options,
      order: i,
    }))
  );

  await db.from('usage_pricing_rates').insert([
    { id: randomUUID(), dimension: 'llm_input', model_key: 'claude-haiku-4-5', usd_per_unit: 0.25, label: 'Haiku input / 1M' },
    { id: randomUUID(), dimension: 'llm_output', model_key: 'claude-haiku-4-5', usd_per_unit: 1.25, label: 'Haiku output / 1M' },
    { id: randomUUID(), dimension: 'llm_input', model_key: '', usd_per_unit: 0.3, label: 'LLM input default / 1M' },
    { id: randomUUID(), dimension: 'llm_output', model_key: '', usd_per_unit: 1.5, label: 'LLM output default / 1M' },
    { id: randomUUID(), dimension: 'sms_segment_inbound', model_key: '', usd_per_unit: 0.008, label: 'SMS inbound segment' },
    { id: randomUUID(), dimension: 'sms_segment_outbound', model_key: '', usd_per_unit: 0.015, label: 'SMS outbound segment' },
    { id: randomUUID(), dimension: 'voice_minute', model_key: '', usd_per_unit: 0.05, label: 'Voice minute' },
  ]);

  console.log(`Seeding ${CLIENT_COUNT} clients…`);
  const clientIds: string[] = [];
  const clientMeta: { id: string; serviceType: string; first: string; last: string; full: string }[] = [];
  const parentPool: string[] = [];
  const clientRows = Array.from({ length: CLIENT_COUNT }, (_, i) => {
    const id = randomUUID();
    clientIds.push(id);
    const { first, last, full } = realisticName(i);
    const serviceType = pickServiceType(i);
    const produceVendorId =
      serviceType === 'Produce'
        ? produceVendorIds[i % produceVendorIds.length]!
        : i % 9 === 0
          ? produceVendorIds[i % produceVendorIds.length]!
          : null;
    const vendorForOrder = vendorIds[i % vendorIds.length]!;
    const isMeal = serviceType === 'Meal';
    const isFood = serviceType === 'Food';
    const statusId =
      isMeal && i % 3 !== 0
        ? statusApproved
        : i % 11 === 0
          ? statusPending
          : i % 13 === 0
            ? statusPaused
            : statusActive;
    clientMeta.push({ id, serviceType, first, last, full });
    if (i > 50 && i % 7 === 0 && parentPool.length > 0) {
      /* dependent */
    } else if (i % 7 !== 0 || i <= 50) {
      parentPool.push(id);
    }
    const { lat, lng } = metroLatLng(i);
    const contact = pickClientContactFields(i, first, last);
    return {
      id,
      full_name: full,
      first_name: first,
      last_name: last,
      email: contact.email,
      phone_number: contact.phone_number,
      address: contact.address,
      city: contact.city,
      state: contact.state,
      zip: contact.zip,
      lat,
      lng,
      latitude: lat,
      longitude: lng,
      navigator_id: navigatorIds[i % navigatorIds.length],
      status_id: statusId,
      service_type: serviceType,
      screening_status: i % 11 === 0 ? 'pending' : 'approved',
      parent_client_id:
        i > 50 && i % 7 === 0 && parentPool.length > 1 ? parentPool[Math.floor(i / 7) % parentPool.length] : null,
      authorized_amount: 100 + (i % 50),
      bill: i % 4 !== 0,
      delivery: true,
      produce_vendor_id: produceVendorId,
      upcoming_order:
        serviceType === 'Food' || serviceType === 'Meal' || serviceType === 'Boxes'
          ? {
              serviceType,
              vendorSelections: [
                { vendorId: vendorIds[i % vendorIds.length], items: {} },
              ],
            }
          : {},
    };
  });
  for (const batch of chunk(clientRows, 100)) {
    const { error } = await db.from('clients').insert(batch);
    if (error) throw error;
  }

  console.log(`Seeding ${ORDER_COUNT} orders…`);
  let orderNum = 10000;
  const orderRows: Record<string, unknown>[] = [];
  const ovsRows: { id: string; order_id: string; vendor_id: string }[] = [];
  const oiRows: {
    id: string;
    vendor_selection_id: string;
    menu_item_id?: string | null;
    meal_item_id?: string | null;
    quantity: number;
    custom_price: number;
  }[] = [];
  const obsRows: {
    id: string;
    order_id: string;
    vendor_id: string;
    box_type_id: string;
    quantity: number;
    items: Record<string, number>;
  }[] = [];
  const orderIdsByClient = new Map<string, string[]>();

  const billedOrderIds: string[] = [];
  for (let i = 0; i < ORDER_COUNT; i++) {
    const orderId = randomUUID();
    const clientId = clientIds[i % clientIds.length]!;
    const vendorId = vendorIds[i % vendorIds.length]!;
    const serviceType = pickServiceType(i);
    const billing = pickBillingOrderMeta(i);
    if (billing.billed) billedOrderIds.push(orderId);

    const totals = buildSeededOrderTotals(serviceType, i, menuCatalog, mealCatalog, 45);
    let notes: string | null = null;

    if (serviceType === 'Boxes' && totals.boxItems) {
      obsRows.push({
        id: randomUUID(),
        order_id: orderId,
        vendor_id: vendorId,
        box_type_id: boxTypeId,
        quantity: 1,
        items: totals.boxItems,
      });
    } else if (serviceType === 'Equipment') {
      const equip = equipmentCatalog[i % equipmentCatalog.length]!;
      notes = JSON.stringify({
        vendorId: equip.vendor_id,
        equipmentId: equip.id,
        equipmentName: equip.name,
        price: equip.price,
      });
    } else if (totals.lineItems.length > 0) {
      const vsId = randomUUID();
      ovsRows.push({ id: vsId, order_id: orderId, vendor_id: vendorId });
      for (const line of totals.lineItems) {
        oiRows.push({
          id: randomUUID(),
          vendor_selection_id: vsId,
          menu_item_id: line.menu_item_id ?? null,
          meal_item_id: line.meal_item_id ?? null,
          quantity: line.quantity,
          custom_price: line.custom_price,
        });
      }
    }

    orderRows.push({
      id: orderId,
      client_id: clientId,
      vendor_id: vendorId,
      service_type: serviceType,
      status: billing.status,
      scheduled_delivery_date: billing.sched,
      actual_delivery_date: billing.actual,
      proof_of_delivery_url: billing.proof,
      total_value: totals.totalValue,
      total_items: totals.totalItems,
      order_number: orderNum++,
      notes,
    });
    if (!orderIdsByClient.has(clientId)) orderIdsByClient.set(clientId, []);
    orderIdsByClient.get(clientId)!.push(orderId);
  }
  for (const batch of chunk(orderRows, 200)) await db.from('orders').insert(batch);
  for (const batch of chunk(ovsRows, 200)) await db.from('order_vendor_selections').insert(batch);
  for (const batch of chunk(oiRows, 200)) await db.from('order_items').insert(batch);
  for (const batch of chunk(obsRows, 200)) await db.from('order_box_selections').insert(batch);

  console.log(`Seeding ${UPCOMING_COUNT} upcoming orders…`);
  const upRows: Record<string, unknown>[] = [];
  const upVsRows: { id: string; upcoming_order_id: string; vendor_id: string }[] = [];
  const upOiRows: {
    id: string;
    upcoming_vendor_selection_id: string;
    menu_item_id?: string | null;
    meal_item_id?: string | null;
    quantity: number;
    custom_price: number;
  }[] = [];
  const upObsRows: {
    id: string;
    upcoming_order_id: string;
    vendor_id: string;
    box_type_id: string;
    quantity: number;
    items: Record<string, number>;
  }[] = [];

  for (let i = 0; i < UPCOMING_COUNT; i++) {
    const upId = randomUUID();
    const vendorId = vendorIds[i % vendorIds.length]!;
    const serviceType = pickServiceType(i);
    const totals = buildSeededOrderTotals(serviceType, i, menuCatalog, mealCatalog, 45);

    upRows.push({
      id: upId,
      client_id: clientIds[i % clientIds.length],
      service_type: serviceType,
      status: 'scheduled',
      scheduled_delivery_date: daysAhead(i % 14),
      total_value: totals.totalValue,
      total_items: totals.totalItems,
    });

    if (serviceType === 'Boxes' && totals.boxItems) {
      upObsRows.push({
        id: randomUUID(),
        upcoming_order_id: upId,
        vendor_id: vendorId,
        box_type_id: boxTypeId,
        quantity: 1,
        items: totals.boxItems,
      });
    } else if (totals.lineItems.length > 0) {
      const vsId = randomUUID();
      upVsRows.push({ id: vsId, upcoming_order_id: upId, vendor_id: vendorId });
      for (const line of totals.lineItems) {
        upOiRows.push({
          id: randomUUID(),
          upcoming_vendor_selection_id: vsId,
          menu_item_id: line.menu_item_id ?? null,
          meal_item_id: line.meal_item_id ?? null,
          quantity: line.quantity,
          custom_price: line.custom_price,
        });
      }
    }
  }
  for (const batch of chunk(upRows, 100)) await db.from('upcoming_orders').insert(batch);
  for (const batch of chunk(upVsRows, 100)) await db.from('upcoming_order_vendor_selections').insert(batch);
  for (const batch of chunk(upOiRows, 100)) await db.from('upcoming_order_items').insert(batch);
  for (const batch of chunk(upObsRows, 100)) await db.from('upcoming_order_box_selections').insert(batch);

  console.log(`Seeding meal planner (${MEAL_PLANNER_ORDER_COUNT} orders)…`);
  const mealClients = clientMeta.filter((c) => c.serviceType === 'Food' || c.serviceType === 'Meal');
  const mpOrderRows: Record<string, unknown>[] = [];
  const mpItemRows: Record<string, unknown>[] = [];
  const mpConfigRows: Record<string, unknown>[] = [];
  const mealTypes = ['Breakfast', 'Lunch', 'Dinner'];
  let mpIdx = 0;
  for (let o = 0; o < MEAL_PLANNER_ORDER_COUNT; o++) {
    const client = mealClients[o % mealClients.length]!;
    const orderId = randomUUID();
    const date = mealPlannerDateRange(o % mealClients.length)[o % 18] ?? daysAhead((o % 21) - 7);
    const mpLines: { quantity: number; unit: number }[] = [];
    for (let t = 0; t < 2 + (o % 2); t++) {
      const qty = 1 + (t % 2);
      const unit =
        o % 3 === 0
          ? menuUnitPrice(menuCatalog[o % menuCatalog.length]!)
          : mealUnitPrice(mealCatalog[o % mealCatalog.length]!);
      mpLines.push({ quantity: qty, unit });
      mpItemRows.push({
        id: randomUUID(),
        meal_planner_order_id: orderId,
        meal_type: mealTypes[(o + t) % mealTypes.length],
        menu_item_id: o % 3 === 0 ? menuIds[o % menuIds.length] : null,
        meal_item_id: o % 3 !== 0 ? mealItemIds[o % mealItemIds.length] : null,
        quantity: qty,
        custom_price: unit,
        sort_order: t,
      });
    }
    const mpTotalItems = mpLines.reduce((s, l) => s + l.quantity, 0);
    const mpTotalValue = Math.round(mpLines.reduce((s, l) => s + l.quantity * l.unit, 0) * 100) / 100;
    mpOrderRows.push({
      id: orderId,
      client_id: client.id,
      case_id: `CASE-${10000 + (o % 90000)}`,
      status: o % 7 === 0 ? 'scheduled' : 'draft',
      scheduled_delivery_date: date,
      delivery_day: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'][o % 5],
      total_value: mpTotalValue,
      total_items: Math.max(mpTotalItems, mpLines.length),
      user_modified: o % 5 === 0,
    });
    if (o % 40 === 0) {
      mpConfigRows.push({
        id: randomUUID(),
        calendar_date: date,
        client_id: client.id,
        expected_total_meals: 2 + (o % 3),
      });
    }
    mpIdx++;
  }
  for (const batch of chunk(mpOrderRows, 150)) await db.from('meal_planner_orders').insert(batch);
  for (const batch of chunk(mpItemRows, 200)) await db.from('meal_planner_order_items').insert(batch);
  for (const batch of chunk(mpConfigRows, 100)) await db.from('meal_planner_date_config').insert(batch);

  console.log('Seeding meal planner default template (meal_planner_custom_items)…');
  const templateDates = templateDatesForSeed();
  const mpCustomRows: Record<string, unknown>[] = [];
  const mpTemplateConfigRows: Record<string, unknown>[] = [];
  for (const date of templateDates) {
    mpTemplateConfigRows.push({
      id: randomUUID(),
      calendar_date: date,
      client_id: null,
      expected_total_meals: 4 + (date.charCodeAt(8) % 3),
    });
    for (let j = 0; j < 4; j++) {
      mpCustomRows.push({
        id: randomUUID(),
        client_id: null,
        calendar_date: date,
        name: menuItemName((date.charCodeAt(8) + j) % 120),
        quantity: 1 + (j % 2),
        value: 5 + (j % 8),
        sort_order: j,
      });
    }
  }
  for (const batch of chunk(mpCustomRows, 200)) await db.from('meal_planner_custom_items').insert(batch);
  for (const batch of chunk(mpTemplateConfigRows, 100)) await db.from('meal_planner_date_config').insert(batch);

  for (let i = 0; i < Math.min(500, mealClients.length); i++) {
    const c = mealClients[i]!;
    const dates = mealPlannerDateRange(i);
    const meal_planner_data = dates.map((d) => ({
      scheduledDeliveryDate: d,
      items: [
        { mealType: 'Breakfast', name: mealItemName(i), quantity: 1 },
        { mealType: 'Lunch', name: menuItemName(i), quantity: 1 },
      ],
    }));
    const { error } = await db
      .from('clients')
      .update({ meal_planner_data, updated_at: new Date().toISOString() })
      .eq('id', c.id);
    if (error) throw error;
  }

  console.log(`Seeding ${NAV_LOG_COUNT} navigator logs…`);
  const logRows = Array.from({ length: NAV_LOG_COUNT }, (_, i) => ({
    id: randomUUID(),
    navigator_id: navigatorIds[i % navigatorIds.length],
    client_id: clientIds[i % clientIds.length],
    action: 'status_change',
    details: 'Status updated after review',
    units_added: 1 + (i % 5),
    old_status: 'Pending',
    new_status: 'Active',
    created_at: new Date(Date.now() - i * 3600000).toISOString(),
  }));
  for (const batch of chunk(logRows, 200)) await db.from('navigator_logs').insert(batch);

  console.log(`Seeding ${BILLING_COUNT} billing records…`);
  if (BILLING_COUNT > 0) {
    const billRows = Array.from({ length: BILLING_COUNT }, (_, i) => {
      const orderId = billedOrderIds[i % billedOrderIds.length];
      return {
        id: randomUUID(),
        client_id: clientIds[i % clientIds.length],
        order_id: orderId ?? null,
        status: i % 5 === 0 ? 'failed' : 'success',
        amount: 20 + (i % 80),
        navigator: navigatorName(i % 12),
      };
    });
    for (const batch of chunk(billRows, 200)) await db.from('billing_records').insert(batch);
  }

  console.log(`Seeding ${PENDING_SCREENING_COUNT} pending screenings…`);
  const pendingClientIndices = Array.from({ length: PENDING_SCREENING_COUNT }, (_, i) => 50 + i * 17);
  const submissionRows = pendingClientIndices.map((ci, i) => ({
    id: randomUUID(),
    form_id: screeningFormId,
    client_id: clientIds[ci % clientIds.length],
    token: `screen-${randomUUID().replace(/-/g, '').slice(0, 16)}`,
    status: 'pending',
    created_at: new Date(Date.now() - i * 7200000).toISOString(),
  }));
  for (const batch of chunk(submissionRows, 50)) await db.from('form_submissions').insert(batch);
  for (const ci of pendingClientIndices.slice(0, 20)) {
    await db
      .from('clients')
      .update({ screening_status: 'waiting_approval', status_id: statusPending })
      .eq('id', clientIds[ci % clientIds.length]!);
  }

  console.log(`Seeding ${ORDER_HISTORY_COUNT} order history (staff changes)…`);
  const historyRows = Array.from({ length: ORDER_HISTORY_COUNT }, (_, i) => ({
    id: randomUUID(),
    client_id: clientIds[i % clientIds.length],
    who: navigatorName(i % 12),
    summary: ['Updated meal plan', 'Changed delivery day', 'Adjusted authorized units', 'Vendor assignment updated', 'Status set to Active'][i % 5],
    timestamp: new Date(Date.now() - i * 1800000).toISOString(),
    change_kind: ['meal_plan', 'delivery', 'authorization', 'vendor', 'status'][i % 5],
  }));
  for (const batch of chunk(historyRows, 200)) await db.from('order_history').insert(batch);

  console.log('Seeding drivers, curved routes, and stops…');
  const driverRows: Record<string, unknown>[] = [];
  const stopRows: Record<string, unknown>[] = [];
  const droRows: { driver_id: string; client_id: string; position: number }[] = [];
  const routeSnapshot: { driverId: string; driverName: string; color: string; stopIds: string[] }[] = [];
  const clientsPerZone = Math.floor(clientIds.length / DRIVERS_PER_DAY);
  for (let d = 0; d < DRIVERS_PER_DAY; d++) {
    const driverId = randomUUID();
    const stopIds: string[] = [];
    const color = ROUTE_PALETTE[d % ROUTE_PALETTE.length]!;
    const zoneStart = d * clientsPerZone;

    for (let s = 0; s < STOPS_PER_DRIVER; s++) {
      const clientIdx = zoneStart + (s % clientsPerZone);
      const clientId = clientIds[clientIdx]!;
      const meta = clientMeta[clientIdx]!;
      const { lat, lng } = zoneStopLatLng(d, s, STOPS_PER_DRIVER);
      const stopId = randomUUID();
      stopIds.push(stopId);
      stopRows.push({
        id: stopId,
        day: ROUTE_DAY,
        delivery_date: deliveryDate,
        client_id: clientId,
        order: s + 1,
        name: meta.full,
        address: realisticStreet(clientIdx),
        city: 'Columbus',
        state: 'OH',
        zip: String(43201 + (clientIdx % 20)),
        lat,
        lng,
        completed: s % 5 === 0,
        assigned_driver_id: driverId,
      });
      droRows.push({ driver_id: driverId, client_id: clientId, position: s + 1 });
    }

    driverRows.push({
      id: driverId,
      day: ROUTE_DAY,
      name: zoneDriverName(d),
      color,
      stop_ids: stopIds,
    });
    routeSnapshot.push({
      driverId,
      driverName: zoneDriverName(d),
      color,
      stopIds,
    });
    for (let s = 0; s < STOPS_PER_DRIVER; s++) {
      const clientIdx = zoneStart + (s % clientsPerZone);
      const { lat, lng } = zoneStopLatLng(d, s, STOPS_PER_DRIVER);
      await db.from('clients').update({ lat, lng, latitude: lat, longitude: lng }).eq('id', clientIds[clientIdx]!);
    }
  }

  for (const batch of chunk(driverRows, 20)) await db.from('drivers').insert(batch);
  for (const batch of chunk(stopRows, 120)) await db.from('stops').insert(batch);
  for (const batch of chunk(droRows, 200)) await db.from('driver_route_order').insert(batch);

  const assignedClientIds = new Set(droRows.map((r) => r.client_id));
  for (const dro of droRows) {
    const { error } = await db
      .from('clients')
      .update({ assigned_driver_id: dro.driver_id })
      .eq('id', dro.client_id);
    if (error) throw error;
  }
  console.log(`  Assigned ${assignedClientIds.size} clients to drivers for ${deliveryDate}`);

  await db.from('route_runs').insert({
    id: randomUUID(),
    day: ROUTE_DAY,
    snapshot: routeSnapshot,
  });

  console.log('Seeding AI / SMS / voice usage…');
  const supaForAi = await createSupabaseSeedDb();
  const aiUsage = await seedAiUsageData(supaForAi);
  console.log(`  usage_events: ${aiUsage.usageEvents}, SMS policies: ${aiUsage.policies}`);

  const portalFoodClientId = clientIds.find((_, i) => clientMeta[i]?.serviceType === 'Food') ?? clientIds[0];
  const portalClassicClientId = clientIds.find((_, i) => clientMeta[i]?.serviceType === 'Meal') ?? clientIds[1];

  console.log('Done. Demo seed complete.');
  console.log(`Routes: /routes — date ${deliveryDate}, day ${ROUTE_DAY} (${DRIVERS_PER_DAY} zone routes)`);
  console.log(`Portal (meal plan): /client-portal/${portalFoodClientId}`);
  console.log(`Portal (classic):   /client-portal-triangle/${portalClassicClientId}`);
  console.log('Login:', process.env.ENV_ADMIN_USERNAME || 'admin', '/', process.env.ENV_ADMIN_PASSWORD || '12345');
  if ('end' in db && typeof db.end === 'function') await db.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

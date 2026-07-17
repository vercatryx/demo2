/**
 * Seed a realistic Boxes portal catalog (categories + grocery items).
 *
 *   npx tsx --env-file=.env.local scripts/seed-box-catalog.ts
 *
 * Idempotent: reuses categories by name; replaces prior seed items tagged with
 * usp_id prefix `demo-box-`. Leaves Food vendor menu items alone.
 *
 * Also verifies getMenuItems-style pagination can return >1000 rows.
 */
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const PROTECTED_PROJECT_REFS = ['uqgbekvxvqntiptgvccw'];
const ALLOWED_DEMO_PROJECT_REFS = ['xijcvnsmmwwnpeadmsnb'];
const USP_PREFIX = 'demo-box-';

type CatSpec = {
  name: string;
  setValue: number;
  sortOrder: number;
  itemCount: number;
  brands: string[];
  products: string[];
};

/** Matches Triangle Square box portal categories + portal image name matchers. */
const CATEGORIES: CatSpec[] = [
  {
    name: 'Fruits & Vegetables',
    setValue: 56,
    sortOrder: 0,
    itemCount: 280,
    brands: ['Fresh Valley', 'Orchard Fresh', 'Green Basket', 'Harvest Co', 'Farm Direct'],
    products: [
      'Apples', 'Bananas', 'Oranges', 'Grapes', 'Strawberries', 'Blueberries', 'Raspberries',
      'Lemons', 'Limes', 'Avocados', 'Tomatoes', 'Cucumbers', 'Bell Peppers', 'Carrots',
      'Broccoli', 'Cauliflower', 'Spinach', 'Romaine Lettuce', 'Kale', 'Zucchinis',
      'Yellow Squash', 'Sweet Potatoes', 'Russet Potatoes', 'Red Onions', 'Yellow Onions',
      'Garlic', 'Ginger Root', 'Celery', 'Mushrooms', 'Corn', 'Green Beans', 'Asparagus',
      'Cabbage', 'Eggplant', 'Pineapple', 'Mangoes', 'Watermelon', 'Cantaloupe', 'Pears',
      'Plums', 'Peaches', 'Cherries', 'Kiwi', 'Cilantro', 'Parsley', 'Basil',
    ],
  },
  {
    name: 'Grain',
    setValue: 48,
    sortOrder: 1,
    itemCount: 220,
    brands: ['Golden Mill', 'Daily Bread', 'Hearth Oven', 'Pantry Staple', 'Whole Harvest'],
    products: [
      'White Bread', 'Whole Wheat Bread', 'Challah', 'Bagels', 'English Muffins', 'Pita',
      'Tortillas', 'Rice', 'Brown Rice', 'Quinoa', 'Oatmeal', 'Pasta', 'Spaghetti',
      'Penne', 'Couscous', 'Barley', 'Farro', 'Crackers', 'Matzo', 'Cereal',
      'Granola', 'Flour', 'Cornmeal', 'Breadcrumbs', 'Rice Cakes', 'Noodles',
      'Egg Noodles', 'Lasagna Sheets', 'Hamburger Buns', 'Hot Dog Buns', 'Croissants',
      'Dinner Rolls', 'Sourdough Loaf', 'Rye Bread', 'Pretzels', 'Graham Crackers',
    ],
  },
  {
    name: 'Protein',
    setValue: 48,
    sortOrder: 2,
    itemCount: 240,
    brands: ['Prime Cuts', 'Farm Protein', 'Kosher Kitchen', 'Butcher Block', 'Lean Choice'],
    products: [
      'Chicken Breast', 'Chicken Thighs', 'Whole Chicken', 'Ground Chicken', 'Turkey Breast',
      'Ground Turkey', 'Beef Stew Meat', 'Ground Beef', 'Steak', 'Roast Beef', 'Lamb Chops',
      'Salmon Fillet', 'Tilapia', 'Cod', 'Tuna Steaks', 'Eggs', 'Egg Whites', 'Tofu',
      'Hummus', 'Black Beans', 'Chickpeas', 'Lentils', 'Peanut Butter', 'Almond Butter',
      'Mixed Nuts', 'Sunflower Seeds', 'Canned Tuna', 'Canned Salmon', 'Deli Turkey',
      'Deli Roast Beef', 'Hot Dogs', 'Sausage', 'Meatballs', 'Fish Sticks', 'Shrimp',
      'Plant-Based Burger', 'Protein Bars', 'Cottage Cheese Cups',
    ],
  },
  {
    name: 'Dairy',
    setValue: 24,
    sortOrder: 3,
    itemCount: 180,
    brands: ['Creamery Lane', 'Dairy Fresh', 'Meadow Milk', 'Chill Pack', 'Table Dairy'],
    products: [
      'Whole Milk', '2% Milk', 'Skim Milk', 'Almond Milk', 'Oat Milk', 'Soy Milk',
      'Butter', 'Margarine', 'Cheddar Cheese', 'Mozzarella', 'Swiss Cheese', 'American Cheese',
      'Cream Cheese', 'Sour Cream', 'Yogurt Plain', 'Yogurt Berry', 'Greek Yogurt',
      'Cottage Cheese', 'Heavy Cream', 'Half & Half', 'Whipped Cream', 'String Cheese',
      'Shredded Cheese Blend', 'Parmesan', 'Feta', 'Ricotta', 'Ice Cream Vanilla',
      'Ice Cream Chocolate', 'Pudding Cups', 'Kefir', 'Lactose-Free Milk',
    ],
  },
  {
    name: 'Grocery',
    setValue: 24,
    sortOrder: 4,
    itemCount: 320,
    brands: ['Pantry Pro', 'Kitchen Basics', 'Value Mart', 'Home Stock', 'Everyday Goods'],
    products: [
      'Olive Oil', 'Vegetable Oil', 'Canola Oil', 'Vinegar', 'Balsamic Vinegar', 'Soy Sauce',
      'Ketchup', 'Mustard', 'Mayonnaise', 'Hot Sauce', 'BBQ Sauce', 'Salad Dressing',
      'Salt', 'Black Pepper', 'Garlic Powder', 'Paprika', 'Cinnamon', 'Sugar',
      'Brown Sugar', 'Honey', 'Maple Syrup', 'Jam Strawberry', 'Peanut Butter Crunchy',
      'Canned Corn', 'Canned Peas', 'Canned Tomatoes', 'Tomato Sauce', 'Tomato Paste',
      'Chicken Broth', 'Vegetable Broth', 'Soup Mix', 'Instant Coffee', 'Tea Bags',
      'Apple Juice', 'Orange Juice', 'Sparkling Water', 'Soda', 'Paper Towels',
      'Napkins', 'Trash Bags', 'Dish Soap', 'Hand Soap', 'Aluminum Foil', 'Plastic Wrap',
      'Ziplock Bags', 'Baking Soda', 'Baking Powder', 'Vanilla Extract', 'Chocolate Chips',
      'Canned Beans', 'Salsa', 'Pickles', 'Olives', 'Capers', 'Coconut Milk',
    ],
  },
  {
    name:
      'Random Food Box (This option is only if you dont want above custom options) Includes Protein, Carbs, Vegetables, Fruits, Dairy and More - You may only choose your protein Food box',
    setValue: 2,
    sortOrder: 5,
    itemCount: 12,
    brands: ['Triangle Packages'],
    products: [
      'Protein Choice — Chicken',
      'Protein Choice — Turkey',
      'Protein Choice — Beef',
      'Protein Choice — Fish',
      'Protein Choice — Vegetarian',
      'Protein Choice — Mixed',
    ],
  },
];

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
    throw new Error(`REFUSING SEED: project "${ref}" is production.`);
  }
  if (ref && !ALLOWED_DEMO_PROJECT_REFS.includes(ref) && !confirm) {
    throw new Error(
      `REFUSING SEED: unknown project "${ref}". Allowed: ${ALLOWED_DEMO_PROJECT_REFS.join(', ')}.`,
    );
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function itemName(brand: string, product: string, variant: number): string {
  if (variant === 0) return `${brand} ${product}`;
  const sizes = ['12 oz', '16 oz', '1 lb', '2 lb', 'Family pack', 'Value pack'];
  return `${brand} ${product} (${sizes[variant % sizes.length]})`;
}

async function main() {
  assertSafeSeedTarget();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Need NEXT_PUBLIC_SUPABASE_URL + service role key in .env.local');

  const db = createClient(url, key, { auth: { persistSession: false } });
  console.log('Seeding Boxes catalog…');

  // Remove previous demo-box seed items (usp_id prefix) so re-runs stay clean.
  {
    let deleted = 0;
    for (;;) {
      const { data, error } = await db
        .from('menu_items')
        .select('id')
        .like('usp_id', `${USP_PREFIX}%`)
        .limit(500);
      if (error) throw error;
      if (!data?.length) break;
      const ids = data.map((r) => r.id);
      const { error: delErr } = await db.from('menu_items').delete().in('id', ids);
      if (delErr) throw delErr;
      deleted += ids.length;
    }
    console.log(`Cleared ${deleted} prior ${USP_PREFIX}* items`);
  }

  const categoryIds: string[] = [];
  const existingCats = await db.from('item_categories').select('id,name');
  if (existingCats.error) throw existingCats.error;
  const byName = new Map((existingCats.data ?? []).map((c) => [c.name.trim().toLowerCase(), c.id]));

  for (const spec of CATEGORIES) {
    const keyName = spec.name.trim().toLowerCase();
    let id = byName.get(keyName);
    if (!id) {
      id = randomUUID();
      const { error } = await db.from('item_categories').insert({
        id,
        name: spec.name,
        set_value: spec.setValue,
        sort_order: spec.sortOrder,
        meal_type: 'Lunch',
      });
      if (error) throw error;
      console.log(`+ category ${spec.name}`);
    } else {
      const { error } = await db
        .from('item_categories')
        .update({
          set_value: spec.setValue,
          sort_order: spec.sortOrder,
        })
        .eq('id', id);
      if (error) throw error;
      console.log(`~ category ${spec.name}`);
    }
    categoryIds.push(id!);
  }

  // Soft-hide the old single "Prepared meals" seed category from boxes browse
  // by pushing it to the end with a high sort (keep for Food if referenced).
  const prepared = (existingCats.data ?? []).find(
    (c) => c.name.trim().toLowerCase() === 'prepared meals',
  );
  if (prepared) {
    await db.from('item_categories').update({ sort_order: 99, set_value: 10 }).eq('id', prepared.id);
  }

  const menuRows: Record<string, unknown>[] = [];
  let uspCounter = 0;
  for (let ci = 0; ci < CATEGORIES.length; ci++) {
    const spec = CATEGORIES[ci]!;
    const categoryId = categoryIds[ci]!;
    for (let i = 0; i < spec.itemCount; i++) {
      const brand = spec.brands[i % spec.brands.length]!;
      const product = spec.products[i % spec.products.length]!;
      const variant = Math.floor(i / spec.products.length);
      const name = itemName(brand, product, variant);
      const quota = spec.name.startsWith('Random Food Box') ? 1 : 1 + (i % 3);
      const price = 1.5 + (i % 12) * 0.75 + (ci % 4) * 0.25;
      uspCounter += 1;
      menuRows.push({
        id: randomUUID(),
        vendor_id: null, // box catalog items are vendor-agnostic
        name,
        value: quota,
        price_each: Math.round(price * 100) / 100,
        is_active: true,
        category_id: categoryId,
        quota_value: quota,
        minimum_order: 0,
        sort_order: i,
        usp_id: `${USP_PREFIX}${String(uspCounter).padStart(5, '0')}`,
        phaseout: false,
      });
    }
  }

  console.log(`Inserting ${menuRows.length} box grocery items…`);
  for (const batch of chunk(menuRows, 100)) {
    const { error } = await db.from('menu_items').insert(batch);
    if (error) throw error;
  }

  // Quotas for every box type × category (set_value on category also drives portal)
  const { data: boxTypes, error: btErr } = await db.from('box_types').select('id,name');
  if (btErr) throw btErr;
  for (const bt of boxTypes ?? []) {
    for (let ci = 0; ci < categoryIds.length; ci++) {
      const categoryId = categoryIds[ci]!;
      const target = CATEGORIES[ci]!.setValue;
      const { data: existing } = await db
        .from('box_quotas')
        .select('id')
        .eq('box_type_id', bt.id)
        .eq('category_id', categoryId)
        .maybeSingle();
      if (existing?.id) {
        await db.from('box_quotas').update({ target_value: target }).eq('id', existing.id);
      } else {
        await db.from('box_quotas').insert({
          id: randomUUID(),
          box_type_id: bt.id,
          category_id: categoryId,
          target_value: target,
        });
      }
    }
    console.log(`Quotas wired for box type ${bt.name}`);
  }

  // Layout order for portal sidebar
  const { error: layoutErr } = await db.from('box_menu_layout_configs').upsert(
    {
      id: 1,
      config: {
        orderedCategoryIds: categoryIds,
        subMenusByCategory: {},
        itemSubMenuByItemId: {},
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );
  if (layoutErr) {
    console.warn('box_menu_layout_configs upsert failed (table may be missing):', layoutErr.message);
  } else {
    console.log('Updated box_menu_layout_configs orderedCategoryIds');
  }

  // Point app_settings food_box_category_id at the Random Food Box category when column exists
  const foodBoxCatId = categoryIds[categoryIds.length - 1];
  const { error: settingsErr } = await db
    .from('app_settings')
    .update({ food_box_category_id: foodBoxCatId })
    .eq('id', '1');
  if (settingsErr) {
    console.warn('Could not set food_box_category_id:', settingsErr.message);
  }

  // Verify >1000 fetch via pagination (same pattern as getMenuItems)
  const PAGE = 1000;
  let from = 0;
  let total = 0;
  for (;;) {
    const { data, error } = await db
      .from('menu_items')
      .select('id')
      .order('sort_order')
      .order('name')
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const n = data?.length ?? 0;
    total += n;
    if (n < PAGE) break;
    from += PAGE;
  }
  const { count: boxCount } = await db
    .from('menu_items')
    .select('*', { count: 'exact', head: true })
    .is('vendor_id', null);

  console.log(`Done. Total menu_items (paginated fetch): ${total}`);
  console.log(`Box items (vendor_id null): ${boxCount}`);
  console.log(`Categories seeded: ${CATEGORIES.length}`);
  if (total <= 1000) {
    console.warn('WARNING: total items still ≤1000 — portal pagination fix is ready but catalog is small.');
  } else {
    console.log('OK: catalog exceeds 1000 rows; portal getMenuItems pagination will load all.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

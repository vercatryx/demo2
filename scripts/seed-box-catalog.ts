/**
 * Seed a realistic Boxes portal catalog with subdivided categories.
 *
 *   npm run seed:box-catalog
 *
 * Idempotent: reuses categories by name; replaces prior seed items tagged with
 * usp_id prefix `demo-box-`. Builds folder trees in box_menu_layout_configs so
 * the portal shows sections → subsections → products (Triangle-style).
 */
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const PROTECTED_PROJECT_REFS = ['uqgbekvxvqntiptgvccw'];
const ALLOWED_DEMO_PROJECT_REFS = ['xijcvnsmmwwnpeadmsnb'];
const USP_PREFIX = 'demo-box-';

type SubMenuNode = { id: string; name: string; children: SubMenuNode[] };

/** Product with folder path (root → leaf) for subcategory placement. */
type ProductSpec = {
  name: string;
  /** Folder trail under the category, e.g. ['Fruit', 'Fresh Fruit'] */
  path: string[];
};

type CatSpec = {
  name: string;
  setValue: number;
  sortOrder: number;
  /** Target item count (cycles products to fill). */
  itemCount: number;
  brands: string[];
  products: ProductSpec[];
};

const CATEGORIES: CatSpec[] = [
  {
    name: 'Fruits & Vegetables',
    setValue: 56,
    sortOrder: 0,
    itemCount: 280,
    brands: ['Fresh Valley', 'Orchard Fresh', 'Green Basket', 'Harvest Co', 'Farm Direct'],
    products: [
      // Fruit › Fresh Fruit
      { name: 'Apples', path: ['Fruit', 'Fresh Fruit'] },
      { name: 'Bananas', path: ['Fruit', 'Fresh Fruit'] },
      { name: 'Oranges', path: ['Fruit', 'Fresh Fruit'] },
      { name: 'Grapes', path: ['Fruit', 'Fresh Fruit'] },
      { name: 'Strawberries', path: ['Fruit', 'Fresh Fruit'] },
      { name: 'Blueberries', path: ['Fruit', 'Fresh Fruit'] },
      { name: 'Raspberries', path: ['Fruit', 'Fresh Fruit'] },
      { name: 'Lemons', path: ['Fruit', 'Fresh Fruit'] },
      { name: 'Limes', path: ['Fruit', 'Fresh Fruit'] },
      { name: 'Pears', path: ['Fruit', 'Fresh Fruit'] },
      { name: 'Peaches', path: ['Fruit', 'Fresh Fruit'] },
      { name: 'Plums', path: ['Fruit', 'Fresh Fruit'] },
      { name: 'Cherries', path: ['Fruit', 'Fresh Fruit'] },
      { name: 'Kiwi', path: ['Fruit', 'Fresh Fruit'] },
      { name: 'Mangoes', path: ['Fruit', 'Fresh Fruit'] },
      // Fruit › Melons
      { name: 'Watermelon', path: ['Fruit', 'Melons'] },
      { name: 'Cantaloupe', path: ['Fruit', 'Melons'] },
      { name: 'Honeydew', path: ['Fruit', 'Melons'] },
      // Fruit › Tropical
      { name: 'Pineapple', path: ['Fruit', 'Tropical'] },
      { name: 'Avocados', path: ['Fruit', 'Tropical'] },
      // Vegetables › Fresh Vegetables
      { name: 'Tomatoes', path: ['Vegetables', 'Fresh Vegetables'] },
      { name: 'Cucumbers', path: ['Vegetables', 'Fresh Vegetables'] },
      { name: 'Bell Peppers', path: ['Vegetables', 'Fresh Vegetables'] },
      { name: 'Carrots', path: ['Vegetables', 'Fresh Vegetables'] },
      { name: 'Broccoli', path: ['Vegetables', 'Fresh Vegetables'] },
      { name: 'Cauliflower', path: ['Vegetables', 'Fresh Vegetables'] },
      { name: 'Zucchini', path: ['Vegetables', 'Fresh Vegetables'] },
      { name: 'Yellow Squash', path: ['Vegetables', 'Fresh Vegetables'] },
      { name: 'Celery', path: ['Vegetables', 'Fresh Vegetables'] },
      { name: 'Green Beans', path: ['Vegetables', 'Fresh Vegetables'] },
      { name: 'Asparagus', path: ['Vegetables', 'Fresh Vegetables'] },
      { name: 'Cabbage', path: ['Vegetables', 'Fresh Vegetables'] },
      { name: 'Eggplant', path: ['Vegetables', 'Fresh Vegetables'] },
      { name: 'Corn', path: ['Vegetables', 'Fresh Vegetables'] },
      { name: 'Mushrooms', path: ['Vegetables', 'Fresh Vegetables'] },
      // Vegetables › Leafy Greens
      { name: 'Spinach', path: ['Vegetables', 'Leafy Greens'] },
      { name: 'Romaine Lettuce', path: ['Vegetables', 'Leafy Greens'] },
      { name: 'Kale', path: ['Vegetables', 'Leafy Greens'] },
      { name: 'Mixed Salad', path: ['Vegetables', 'Leafy Greens'] },
      // Vegetables › Roots & Onions
      { name: 'Sweet Potatoes', path: ['Vegetables', 'Roots & Onions'] },
      { name: 'Russet Potatoes', path: ['Vegetables', 'Roots & Onions'] },
      { name: 'Red Onions', path: ['Vegetables', 'Roots & Onions'] },
      { name: 'Yellow Onions', path: ['Vegetables', 'Roots & Onions'] },
      { name: 'Garlic', path: ['Vegetables', 'Roots & Onions'] },
      { name: 'Ginger Root', path: ['Vegetables', 'Roots & Onions'] },
      // Vegetables › Herbs
      { name: 'Cilantro', path: ['Vegetables', 'Herbs'] },
      { name: 'Parsley', path: ['Vegetables', 'Herbs'] },
      { name: 'Basil', path: ['Vegetables', 'Herbs'] },
      { name: 'Dill', path: ['Vegetables', 'Herbs'] },
      // Vegetables › Frozen
      { name: 'Frozen Broccoli', path: ['Vegetables', 'Frozen'] },
      { name: 'Frozen Peas', path: ['Vegetables', 'Frozen'] },
      { name: 'Frozen Mixed Vegetables', path: ['Vegetables', 'Frozen'] },
      { name: 'Frozen Corn', path: ['Vegetables', 'Frozen'] },
    ],
  },
  {
    name: 'Grain',
    setValue: 48,
    sortOrder: 1,
    itemCount: 220,
    brands: ['Golden Mill', 'Daily Bread', 'Hearth Oven', 'Pantry Staple', 'Whole Harvest'],
    products: [
      { name: 'White Bread', path: ['Bread', 'Loaves'] },
      { name: 'Whole Wheat Bread', path: ['Bread', 'Loaves'] },
      { name: 'Challah', path: ['Bread', 'Loaves'] },
      { name: 'Sourdough Loaf', path: ['Bread', 'Loaves'] },
      { name: 'Rye Bread', path: ['Bread', 'Loaves'] },
      { name: 'Bagels', path: ['Bread', 'Rolls & Bagels'] },
      { name: 'English Muffins', path: ['Bread', 'Rolls & Bagels'] },
      { name: 'Dinner Rolls', path: ['Bread', 'Rolls & Bagels'] },
      { name: 'Hamburger Buns', path: ['Bread', 'Rolls & Bagels'] },
      { name: 'Hot Dog Buns', path: ['Bread', 'Rolls & Bagels'] },
      { name: 'Pita', path: ['Bread', 'Flatbreads'] },
      { name: 'Tortillas', path: ['Bread', 'Flatbreads'] },
      { name: 'Croissants', path: ['Bread', 'Pastries'] },
      { name: 'White Rice', path: ['Rice & Grains', 'Rice'] },
      { name: 'Brown Rice', path: ['Rice & Grains', 'Rice'] },
      { name: 'Basmati Rice', path: ['Rice & Grains', 'Rice'] },
      { name: 'Quinoa', path: ['Rice & Grains', 'Specialty Grains'] },
      { name: 'Barley', path: ['Rice & Grains', 'Specialty Grains'] },
      { name: 'Farro', path: ['Rice & Grains', 'Specialty Grains'] },
      { name: 'Couscous', path: ['Rice & Grains', 'Specialty Grains'] },
      { name: 'Spaghetti', path: ['Pasta & Noodles', 'Pasta'] },
      { name: 'Penne', path: ['Pasta & Noodles', 'Pasta'] },
      { name: 'Lasagna Sheets', path: ['Pasta & Noodles', 'Pasta'] },
      { name: 'Egg Noodles', path: ['Pasta & Noodles', 'Noodles'] },
      { name: 'Rice Noodles', path: ['Pasta & Noodles', 'Noodles'] },
      { name: 'Oatmeal', path: ['Breakfast Grains', 'Hot Cereal'] },
      { name: 'Cream of Wheat', path: ['Breakfast Grains', 'Hot Cereal'] },
      { name: 'Corn Flakes', path: ['Breakfast Grains', 'Cold Cereal'] },
      { name: 'Granola', path: ['Breakfast Grains', 'Cold Cereal'] },
      { name: 'Crackers', path: ['Snacks', 'Crackers'] },
      { name: 'Matzo', path: ['Snacks', 'Crackers'] },
      { name: 'Rice Cakes', path: ['Snacks', 'Crackers'] },
      { name: 'Pretzels', path: ['Snacks', 'Savory'] },
      { name: 'Graham Crackers', path: ['Snacks', 'Sweet'] },
      { name: 'Flour', path: ['Baking', 'Flours'] },
      { name: 'Cornmeal', path: ['Baking', 'Flours'] },
      { name: 'Breadcrumbs', path: ['Baking', 'Coatings'] },
    ],
  },
  {
    name: 'Protein',
    setValue: 48,
    sortOrder: 2,
    itemCount: 240,
    brands: ['Prime Cuts', 'Farm Protein', 'Kosher Kitchen', 'Butcher Block', 'Lean Choice'],
    products: [
      { name: 'Chicken Breast', path: ['Poultry', 'Chicken'] },
      { name: 'Chicken Thighs', path: ['Poultry', 'Chicken'] },
      { name: 'Whole Chicken', path: ['Poultry', 'Chicken'] },
      { name: 'Ground Chicken', path: ['Poultry', 'Chicken'] },
      { name: 'Turkey Breast', path: ['Poultry', 'Turkey'] },
      { name: 'Ground Turkey', path: ['Poultry', 'Turkey'] },
      { name: 'Beef Stew Meat', path: ['Beef & Lamb', 'Beef'] },
      { name: 'Ground Beef', path: ['Beef & Lamb', 'Beef'] },
      { name: 'Steak', path: ['Beef & Lamb', 'Beef'] },
      { name: 'Roast Beef', path: ['Beef & Lamb', 'Beef'] },
      { name: 'Lamb Chops', path: ['Beef & Lamb', 'Lamb'] },
      { name: 'Salmon Fillet', path: ['Fish & Seafood', 'Fish'] },
      { name: 'Tilapia', path: ['Fish & Seafood', 'Fish'] },
      { name: 'Cod', path: ['Fish & Seafood', 'Fish'] },
      { name: 'Tuna Steaks', path: ['Fish & Seafood', 'Fish'] },
      { name: 'Shrimp', path: ['Fish & Seafood', 'Seafood'] },
      { name: 'Fish Sticks', path: ['Fish & Seafood', 'Prepared'] },
      { name: 'Eggs', path: ['Eggs & Dairy Protein', 'Eggs'] },
      { name: 'Egg Whites', path: ['Eggs & Dairy Protein', 'Eggs'] },
      { name: 'Cottage Cheese Cups', path: ['Eggs & Dairy Protein', 'Cheese Protein'] },
      { name: 'Tofu', path: ['Plant-Based', 'Soy'] },
      { name: 'Plant-Based Burger', path: ['Plant-Based', 'Meat Alternatives'] },
      { name: 'Hummus', path: ['Plant-Based', 'Spreads'] },
      { name: 'Black Beans', path: ['Beans & Legumes', 'Canned Beans'] },
      { name: 'Chickpeas', path: ['Beans & Legumes', 'Canned Beans'] },
      { name: 'Lentils', path: ['Beans & Legumes', 'Dry Legumes'] },
      { name: 'Peanut Butter', path: ['Nuts & Seeds', 'Nut Butters'] },
      { name: 'Almond Butter', path: ['Nuts & Seeds', 'Nut Butters'] },
      { name: 'Mixed Nuts', path: ['Nuts & Seeds', 'Nuts'] },
      { name: 'Sunflower Seeds', path: ['Nuts & Seeds', 'Seeds'] },
      { name: 'Canned Tuna', path: ['Canned Protein', 'Fish'] },
      { name: 'Canned Salmon', path: ['Canned Protein', 'Fish'] },
      { name: 'Deli Turkey', path: ['Deli', 'Sliced Meats'] },
      { name: 'Deli Roast Beef', path: ['Deli', 'Sliced Meats'] },
      { name: 'Hot Dogs', path: ['Deli', 'Prepared'] },
      { name: 'Sausage', path: ['Deli', 'Prepared'] },
      { name: 'Meatballs', path: ['Deli', 'Prepared'] },
      { name: 'Protein Bars', path: ['Snacks', 'Bars'] },
    ],
  },
  {
    name: 'Dairy',
    setValue: 24,
    sortOrder: 3,
    itemCount: 180,
    brands: ['Creamery Lane', 'Dairy Fresh', 'Meadow Milk', 'Chill Pack', 'Table Dairy'],
    products: [
      { name: 'Whole Milk', path: ['Milk', 'Cow Milk'] },
      { name: '2% Milk', path: ['Milk', 'Cow Milk'] },
      { name: 'Skim Milk', path: ['Milk', 'Cow Milk'] },
      { name: 'Lactose-Free Milk', path: ['Milk', 'Cow Milk'] },
      { name: 'Almond Milk', path: ['Milk', 'Plant Milk'] },
      { name: 'Oat Milk', path: ['Milk', 'Plant Milk'] },
      { name: 'Soy Milk', path: ['Milk', 'Plant Milk'] },
      { name: 'Cheddar Cheese', path: ['Cheese', 'Block & Sliced'] },
      { name: 'Mozzarella', path: ['Cheese', 'Block & Sliced'] },
      { name: 'Swiss Cheese', path: ['Cheese', 'Block & Sliced'] },
      { name: 'American Cheese', path: ['Cheese', 'Block & Sliced'] },
      { name: 'String Cheese', path: ['Cheese', 'Snacking'] },
      { name: 'Shredded Cheese Blend', path: ['Cheese', 'Shredded'] },
      { name: 'Parmesan', path: ['Cheese', 'Specialty'] },
      { name: 'Feta', path: ['Cheese', 'Specialty'] },
      { name: 'Ricotta', path: ['Cheese', 'Specialty'] },
      { name: 'Cream Cheese', path: ['Cheese', 'Soft Spreads'] },
      { name: 'Yogurt Plain', path: ['Yogurt', 'Cups'] },
      { name: 'Yogurt Berry', path: ['Yogurt', 'Cups'] },
      { name: 'Greek Yogurt', path: ['Yogurt', 'Cups'] },
      { name: 'Kefir', path: ['Yogurt', 'Drinks'] },
      { name: 'Butter', path: ['Butter & Cream', 'Butter'] },
      { name: 'Margarine', path: ['Butter & Cream', 'Butter'] },
      { name: 'Sour Cream', path: ['Butter & Cream', 'Cream'] },
      { name: 'Heavy Cream', path: ['Butter & Cream', 'Cream'] },
      { name: 'Half & Half', path: ['Butter & Cream', 'Cream'] },
      { name: 'Whipped Cream', path: ['Butter & Cream', 'Cream'] },
      { name: 'Cottage Cheese', path: ['Cultured', 'Cottage'] },
      { name: 'Ice Cream Vanilla', path: ['Frozen Treats', 'Ice Cream'] },
      { name: 'Ice Cream Chocolate', path: ['Frozen Treats', 'Ice Cream'] },
      { name: 'Pudding Cups', path: ['Desserts', 'Cups'] },
    ],
  },
  {
    name: 'Grocery',
    setValue: 24,
    sortOrder: 4,
    itemCount: 320,
    brands: ['Pantry Pro', 'Kitchen Basics', 'Value Mart', 'Home Stock', 'Everyday Goods'],
    products: [
      { name: 'Olive Oil', path: ['Oils & Vinegars', 'Oils'] },
      { name: 'Vegetable Oil', path: ['Oils & Vinegars', 'Oils'] },
      { name: 'Canola Oil', path: ['Oils & Vinegars', 'Oils'] },
      { name: 'Vinegar', path: ['Oils & Vinegars', 'Vinegars'] },
      { name: 'Balsamic Vinegar', path: ['Oils & Vinegars', 'Vinegars'] },
      { name: 'Soy Sauce', path: ['Condiments', 'Asian'] },
      { name: 'Ketchup', path: ['Condiments', 'Table Sauces'] },
      { name: 'Mustard', path: ['Condiments', 'Table Sauces'] },
      { name: 'Mayonnaise', path: ['Condiments', 'Table Sauces'] },
      { name: 'Hot Sauce', path: ['Condiments', 'Table Sauces'] },
      { name: 'BBQ Sauce', path: ['Condiments', 'Table Sauces'] },
      { name: 'Salad Dressing', path: ['Condiments', 'Dressings'] },
      { name: 'Salsa', path: ['Condiments', 'Salsas'] },
      { name: 'Salt', path: ['Spices & Seasonings', 'Basics'] },
      { name: 'Black Pepper', path: ['Spices & Seasonings', 'Basics'] },
      { name: 'Garlic Powder', path: ['Spices & Seasonings', 'Spices'] },
      { name: 'Paprika', path: ['Spices & Seasonings', 'Spices'] },
      { name: 'Cinnamon', path: ['Spices & Seasonings', 'Spices'] },
      { name: 'Sugar', path: ['Baking', 'Sweeteners'] },
      { name: 'Brown Sugar', path: ['Baking', 'Sweeteners'] },
      { name: 'Honey', path: ['Baking', 'Sweeteners'] },
      { name: 'Maple Syrup', path: ['Baking', 'Sweeteners'] },
      { name: 'Baking Soda', path: ['Baking', 'Leaveners'] },
      { name: 'Baking Powder', path: ['Baking', 'Leaveners'] },
      { name: 'Vanilla Extract', path: ['Baking', 'Flavorings'] },
      { name: 'Chocolate Chips', path: ['Baking', 'Mix-ins'] },
      { name: 'Jam Strawberry', path: ['Spreads', 'Jams'] },
      { name: 'Peanut Butter Crunchy', path: ['Spreads', 'Nut Butters'] },
      { name: 'Canned Corn', path: ['Canned Goods', 'Vegetables'] },
      { name: 'Canned Peas', path: ['Canned Goods', 'Vegetables'] },
      { name: 'Canned Tomatoes', path: ['Canned Goods', 'Tomatoes'] },
      { name: 'Tomato Sauce', path: ['Canned Goods', 'Tomatoes'] },
      { name: 'Tomato Paste', path: ['Canned Goods', 'Tomatoes'] },
      { name: 'Canned Beans', path: ['Canned Goods', 'Beans'] },
      { name: 'Chicken Broth', path: ['Soups & Broths', 'Broths'] },
      { name: 'Vegetable Broth', path: ['Soups & Broths', 'Broths'] },
      { name: 'Soup Mix', path: ['Soups & Broths', 'Mixes'] },
      { name: 'Coconut Milk', path: ['Canned Goods', 'Specialty'] },
      { name: 'Pickles', path: ['Jarred', 'Pickled'] },
      { name: 'Olives', path: ['Jarred', 'Olives'] },
      { name: 'Capers', path: ['Jarred', 'Specialty'] },
      { name: 'Instant Coffee', path: ['Beverages', 'Coffee & Tea'] },
      { name: 'Tea Bags', path: ['Beverages', 'Coffee & Tea'] },
      { name: 'Apple Juice', path: ['Beverages', 'Juices'] },
      { name: 'Orange Juice', path: ['Beverages', 'Juices'] },
      { name: 'Sparkling Water', path: ['Beverages', 'Water & Soda'] },
      { name: 'Soda', path: ['Beverages', 'Water & Soda'] },
      { name: 'Paper Towels', path: ['Household', 'Paper'] },
      { name: 'Napkins', path: ['Household', 'Paper'] },
      { name: 'Trash Bags', path: ['Household', 'Bags'] },
      { name: 'Ziplock Bags', path: ['Household', 'Bags'] },
      { name: 'Dish Soap', path: ['Household', 'Cleaning'] },
      { name: 'Hand Soap', path: ['Household', 'Cleaning'] },
      { name: 'Aluminum Foil', path: ['Household', 'Wraps'] },
      { name: 'Plastic Wrap', path: ['Household', 'Wraps'] },
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
      { name: 'Protein Choice — Chicken', path: ['Protein Choices'] },
      { name: 'Protein Choice — Turkey', path: ['Protein Choices'] },
      { name: 'Protein Choice — Beef', path: ['Protein Choices'] },
      { name: 'Protein Choice — Fish', path: ['Protein Choices'] },
      { name: 'Protein Choice — Vegetarian', path: ['Protein Choices'] },
      { name: 'Protein Choice — Mixed', path: ['Protein Choices'] },
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

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function folderId(catKey: string, path: string[]): string {
  return `${catKey}__${path.map(slug).join('__')}`;
}

/** Build a forest of folders from unique path trails; returns roots + map pathKey→leafId. */
function buildForest(
  catKey: string,
  paths: string[][],
): { roots: SubMenuNode[]; leafIdByPathKey: Map<string, string> } {
  type Mutable = { id: string; name: string; children: Map<string, Mutable> };
  const rootMap = new Map<string, Mutable>();
  const leafIdByPathKey = new Map<string, string>();

  for (const path of paths) {
    if (!path.length) continue;
    let level = rootMap;
    let trail: string[] = [];
    for (let i = 0; i < path.length; i++) {
      const name = path[i]!;
      trail = [...trail, name];
      const key = name.toLowerCase();
      if (!level.has(key)) {
        level.set(key, {
          id: folderId(catKey, trail),
          name,
          children: new Map(),
        });
      }
      const node = level.get(key)!;
      if (i === path.length - 1) {
        leafIdByPathKey.set(trail.map((p) => p.toLowerCase()).join('\0'), node.id);
      }
      level = node.children;
    }
  }

  function toNodes(m: Map<string, Mutable>): SubMenuNode[] {
    return [...m.values()].map((n) => ({
      id: n.id,
      name: n.name,
      children: toNodes(n.children),
    }));
  }

  return { roots: toNodes(rootMap), leafIdByPathKey };
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
  console.log('Seeding Boxes catalog with subcategories…');

  // Remove previous demo-box seed items
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
        .update({ set_value: spec.setValue, sort_order: spec.sortOrder })
        .eq('id', id);
      if (error) throw error;
      console.log(`~ category ${spec.name}`);
    }
    categoryIds.push(id!);
  }

  const prepared = (existingCats.data ?? []).find(
    (c) => c.name.trim().toLowerCase() === 'prepared meals',
  );
  if (prepared) {
    await db.from('item_categories').update({ sort_order: 99, set_value: 10 }).eq('id', prepared.id);
  }

  const subMenusByCategory: Record<string, SubMenuNode[]> = {};
  const itemSubMenuByItemId: Record<string, string> = {};
  const menuRows: Record<string, unknown>[] = [];
  let uspCounter = 0;

  for (let ci = 0; ci < CATEGORIES.length; ci++) {
    const spec = CATEGORIES[ci]!;
    const categoryId = categoryIds[ci]!;
    const catKey = `cat${ci}`;
    const { roots, leafIdByPathKey } = buildForest(
      catKey,
      spec.products.map((p) => p.path),
    );
    subMenusByCategory[categoryId] = roots;

    const folderCount = leafIdByPathKey.size;
    console.log(
      `  ${spec.name.split('(')[0]!.trim()}: ${roots.length} top sections, ${folderCount} leaf folders`,
    );

    for (let i = 0; i < spec.itemCount; i++) {
      const product = spec.products[i % spec.products.length]!;
      const brand = spec.brands[i % spec.brands.length]!;
      const variant = Math.floor(i / spec.products.length);
      const name = itemName(brand, product.name, variant);
      const quota = spec.name.startsWith('Random Food Box') ? 1 : 1 + (i % 3);
      const price = 1.5 + (i % 12) * 0.75 + (ci % 4) * 0.25;
      const id = randomUUID();
      uspCounter += 1;

      const pathKey = product.path.map((p) => p.toLowerCase()).join('\0');
      const folderIdForItem = leafIdByPathKey.get(pathKey);
      if (folderIdForItem) itemSubMenuByItemId[id] = folderIdForItem;

      menuRows.push({
        id,
        vendor_id: null,
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

  const { error: layoutErr } = await db.from('box_menu_layout_configs').upsert(
    {
      id: 1,
      config: {
        orderedCategoryIds: categoryIds,
        subMenusByCategory,
        itemSubMenuByItemId,
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );
  if (layoutErr) {
    console.warn('box_menu_layout_configs upsert failed:', layoutErr.message);
  } else {
    console.log(
      `Updated layout: ${Object.keys(subMenusByCategory).length} category trees, ${Object.keys(itemSubMenuByItemId).length} item→folder maps`,
    );
  }

  const foodBoxCatId = categoryIds[categoryIds.length - 1];
  const { error: settingsErr } = await db
    .from('app_settings')
    .update({ food_box_category_id: foodBoxCatId })
    .eq('id', '1');
  if (settingsErr) {
    console.warn('Could not set food_box_category_id:', settingsErr.message);
  }

  console.log('Done. Open Boxes portal → pick a category → you should see section folders.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

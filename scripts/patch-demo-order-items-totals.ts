/**
 * Align existing demo orders: line items with prices, total_items and total_value match sums.
 * Does not delete clients, routes, or other seed data.
 *
 *   npm run patch:demo-order-totals
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseDbApiKey } from '../lib/supabase-env';

type MenuRow = { id: string; value: number; price_each: number | null };
type MealRow = { id: string; price_each: number };

function menuPrice(m: MenuRow): number {
  return Number(m.price_each ?? m.value) || 0;
}

function mealPrice(m: MealRow): number {
  return Number(m.price_each) || 0;
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = getSupabaseDbApiKey();
  if (!supabaseUrl || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or Supabase DB key in .env.local');
    process.exit(1);
  }

  const sb = createClient(supabaseUrl, key, { auth: { persistSession: false } });

  const { data: menus } = await sb.from('menu_items').select('id, value, price_each');
  const { data: meals } = await sb.from('breakfast_items').select('id, price_each');
  if (!menus?.length) {
    console.error('No menu_items found.');
    process.exit(1);
  }

  for (const m of menus) {
    const unit = menuPrice(m as MenuRow);
    if (!m.price_each || Number(m.price_each) === 0) {
      await sb.from('menu_items').update({ price_each: unit }).eq('id', m.id);
    }
  }
  console.log(`Synced price_each on ${menus.length} menu item(s).`);

  const menuCatalog = menus as MenuRow[];
  const mealCatalog = (meals ?? []) as MealRow[];
  const defaultBoxTypeId = (
    await sb.from('box_types').select('id').limit(1).maybeSingle()
  ).data?.id as string | undefined;

  const pageSize = 500;
  let from = 0;
  let patched = 0;

  while (true) {
    const { data: orders, error } = await sb
      .from('orders')
      .select('id, service_type, vendor_id, total_items, total_value, notes')
      .order('order_number', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      console.error(error.message);
      process.exit(1);
    }
    if (!orders?.length) break;

    for (let idx = 0; idx < orders.length; idx++) {
      const order = orders[idx]!;
      const i = from + idx;
      const serviceType = order.service_type || 'Food';
      let totalItems = 0;
      let totalValue = 0;

      if (serviceType === 'Boxes') {
        const { data: box } = await sb
          .from('order_box_selections')
          .select('id, items, vendor_id, box_type_id')
          .eq('order_id', order.id)
          .maybeSingle();

        let items: Record<string, number> =
          box?.items && typeof box.items === 'object' ? (box.items as Record<string, number>) : {};

        if (Object.keys(items).length === 0) {
          items = {};
          for (let j = 0; j < 4; j++) {
            const menu = menuCatalog[(i + j) % menuCatalog.length]!;
            items[menu.id] = 1 + ((i + j) % 2);
          }
        }

        for (const [itemId, qtyRaw] of Object.entries(items)) {
          const qty = typeof qtyRaw === 'number' ? qtyRaw : Number(qtyRaw) || 1;
          const menu = menuCatalog.find((m) => m.id === itemId);
          totalItems += qty;
          totalValue += (menu ? menuPrice(menu) : 8) * qty;
        }
        totalValue = Math.max(totalValue, 45);
        totalItems = Math.max(totalItems, 4);

        if (box) {
          await sb.from('order_box_selections').update({ items }).eq('id', box.id);
        } else if (defaultBoxTypeId && order.vendor_id) {
          await sb.from('order_box_selections').insert({
            id: randomUUID(),
            order_id: order.id,
            vendor_id: order.vendor_id,
            box_type_id: defaultBoxTypeId,
            quantity: 1,
            items,
          });
        }
      } else if (serviceType === 'Equipment') {
        totalItems = 1;
        let notes: Record<string, unknown> = {};
        try {
          if (order.notes) notes = JSON.parse(order.notes);
        } catch {
          /* ignore */
        }
        totalValue = Number(notes.price) || 65;
        if (!order.notes && order.vendor_id) {
          const { data: equip } = await sb.from('equipment').select('id, name, price').limit(1).maybeSingle();
          if (equip) {
            await sb
              .from('orders')
              .update({
                notes: JSON.stringify({
                  vendorId: order.vendor_id,
                  equipmentId: equip.id,
                  equipmentName: equip.name,
                  price: equip.price,
                }),
              })
              .eq('id', order.id);
            totalValue = Number(equip.price) || totalValue;
          }
        }
      } else {
        const { data: selections } = await sb
          .from('order_vendor_selections')
          .select('id, vendor_id')
          .eq('order_id', order.id);

        let vsList = selections ?? [];
        if (vsList.length === 0 && order.vendor_id) {
          const vsId = randomUUID();
          const { error: vsErr } = await sb.from('order_vendor_selections').insert({
            id: vsId,
            order_id: order.id,
            vendor_id: order.vendor_id,
          });
          if (!vsErr) vsList = [{ id: vsId, vendor_id: order.vendor_id }];
        }

        for (const vs of vsList) {
          const { data: existingItems } = await sb
            .from('order_items')
            .select('id, menu_item_id, meal_item_id, quantity, custom_price')
            .eq('vendor_selection_id', vs.id);

          let items = existingItems ?? [];

          if (items.length === 0) {
            const lineCount = 2 + (i % 3);
            const newRows = [];
            for (let j = 0; j < lineCount; j++) {
              const qty = 1 + ((i + j) % 2);
              if (serviceType === 'Meal' && mealCatalog.length > 0) {
                const meal = mealCatalog[(i + j) % mealCatalog.length]!;
                const unit = mealPrice(meal);
                newRows.push({
                  id: randomUUID(),
                  vendor_selection_id: vs.id,
                  meal_item_id: meal.id,
                  menu_item_id: null,
                  quantity: qty,
                  custom_price: unit,
                });
                totalItems += qty;
                totalValue += unit * qty;
              } else {
                const menu = menuCatalog[(i + j) % menuCatalog.length]!;
                const unit = menuPrice(menu);
                newRows.push({
                  id: randomUUID(),
                  vendor_selection_id: vs.id,
                  menu_item_id: menu.id,
                  quantity: qty,
                  custom_price: unit,
                });
                totalItems += qty;
                totalValue += unit * qty;
              }
            }
            if (newRows.length) await sb.from('order_items').insert(newRows);
            items = newRows;
          } else {
            for (const item of items) {
              const qty = item.quantity ?? 1;
              let unit = item.custom_price != null ? Number(item.custom_price) : 0;
              if (!unit || Number.isNaN(unit)) {
                if (item.meal_item_id) {
                  const meal = mealCatalog.find((m) => m.id === item.meal_item_id);
                  unit = meal ? mealPrice(meal) : 8;
                } else {
                  const menu = menuCatalog.find((m) => m.id === item.menu_item_id);
                  unit = menu ? menuPrice(menu) : 8;
                }
                await sb.from('order_items').update({ custom_price: unit }).eq('id', item.id);
              }
              totalItems += qty;
              totalValue += unit * qty;
            }
          }
        }
        totalValue = Math.round(Math.max(totalValue, 12) * 100) / 100;
        totalItems = Math.max(totalItems, 1);
      }

      const storedItems = Number(order.total_items) || 0;
      const storedValue = Number(order.total_value) || 0;
      if (storedItems !== totalItems || Math.abs(storedValue - totalValue) > 0.01) {
        await sb
          .from('orders')
          .update({ total_items: totalItems, total_value: totalValue })
          .eq('id', order.id);
        patched++;
      }
    }

    if (orders.length < pageSize) break;
    from += pageSize;
  }

  console.log(`Done. Updated totals on ${patched} order(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

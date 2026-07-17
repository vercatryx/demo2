/**
 * Shared logic: strip inactive menu_items / breakfast_items from clients.upcoming_order JSON.
 * Used by scripts/clean-inactive-items-upcoming-orders.ts and the admin Settings UI.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllSupabaseRows } from '@/lib/supabase/fetch-all-rows';

const PAGE_SIZE = 500;

export type UpcomingOrderCleanChange = {
  clientId: string;
  menuRemoved: string[];
  mealRemoved: string[];
};

export type CleanInactiveUpcomingOrderResult =
  | {
      ok: true;
      inactiveMenuCount: number;
      inactiveMealCount: number;
      scanned: number;
      changes: UpcomingOrderCleanChange[];
      updated: number;
    }
  | { ok: false; error: string };

function removeKeysFromObject(
  obj: Record<string, unknown> | null | undefined,
  inactive: Set<string>
): string[] {
  if (!obj || typeof obj !== 'object') return [];
  const removed: string[] = [];
  for (const key of Object.keys(obj)) {
    if (inactive.has(key)) {
      delete obj[key];
      removed.push(key);
    }
  }
  return removed;
}

function cleanItemNotes(
  notes: Record<string, unknown> | null | undefined,
  removedIds: string[]
): void {
  if (!notes || typeof notes !== 'object' || removedIds.length === 0) return;
  for (const id of removedIds) {
    if (id in notes) delete notes[id];
  }
}

function cleanVendorSelection(sel: Record<string, unknown>, inactiveMenu: Set<string>): string[] {
  const all: string[] = [];

  const r1 = removeKeysFromObject(sel.items as Record<string, unknown> | undefined, inactiveMenu);
  all.push(...r1);
  if (r1.length) cleanItemNotes(sel.itemNotes as Record<string, unknown> | undefined, r1);

  const ibd = sel.itemsByDay;
  if (ibd && typeof ibd === 'object') {
    for (const day of Object.keys(ibd as object)) {
      const dayMap = (ibd as Record<string, Record<string, unknown>>)[day];
      if (dayMap && typeof dayMap === 'object') {
        const rd = removeKeysFromObject(dayMap, inactiveMenu);
        all.push(...rd);
      }
    }
  }

  const inbd = sel.itemNotesByDay;
  if (inbd && typeof inbd === 'object' && all.length) {
    const unique = [...new Set(all)];
    for (const day of Object.keys(inbd as object)) {
      const dayNotes = (inbd as Record<string, Record<string, unknown>>)[day];
      if (dayNotes && typeof dayNotes === 'object') {
        cleanItemNotes(dayNotes, unique);
      }
    }
  }

  return all;
}

function cleanVendorSelectionsArray(arr: unknown, inactiveMenu: Set<string>): string[] {
  if (!Array.isArray(arr)) return [];
  const all: string[] = [];
  for (const s of arr) {
    if (s && typeof s === 'object') {
      all.push(...cleanVendorSelection(s as Record<string, unknown>, inactiveMenu));
    }
  }
  return all;
}

function cleanDeliveryDayOrders(ddo: unknown, inactiveMenu: Set<string>): string[] {
  if (!ddo || typeof ddo !== 'object') return [];
  const all: string[] = [];
  for (const day of Object.keys(ddo as object)) {
    const dayData = (ddo as Record<string, { vendorSelections?: unknown }>)[day];
    if (dayData?.vendorSelections) {
      all.push(...cleanVendorSelectionsArray(dayData.vendorSelections, inactiveMenu));
    }
  }
  return all;
}

function cleanMealSelections(mealSel: unknown, inactiveMeal: Set<string>): string[] {
  if (!mealSel || typeof mealSel !== 'object') return [];
  const all: string[] = [];
  for (const config of Object.values(mealSel as Record<string, unknown>)) {
    if (!config || typeof config !== 'object') continue;
    const c = config as Record<string, unknown>;
    const r = removeKeysFromObject(c.items as Record<string, unknown> | undefined, inactiveMeal);
    all.push(...r);
    if (r.length && c.itemNotes && typeof c.itemNotes === 'object') {
      cleanItemNotes(c.itemNotes as Record<string, unknown>, r);
    }
  }
  return all;
}

function cleanBoxOrders(boxOrders: unknown, inactiveMenu: Set<string>): string[] {
  if (!Array.isArray(boxOrders)) return [];
  const all: string[] = [];
  for (const box of boxOrders) {
    if (!box || typeof box !== 'object') continue;
    const b = box as Record<string, unknown>;
    const r = removeKeysFromObject(b.items as Record<string, unknown> | undefined, inactiveMenu);
    all.push(...r);
    if (r.length && b.itemNotes && typeof b.itemNotes === 'object') {
      cleanItemNotes(b.itemNotes as Record<string, unknown>, r);
    }
  }
  return all;
}

export function cleanUpcomingOrderJson(
  raw: unknown,
  inactiveMenu: Set<string>,
  inactiveMeal: Set<string>
): { cleaned: unknown | null; menuRemoved: string[]; mealRemoved: string[] } {
  if (raw == null || typeof raw !== 'object') {
    return { cleaned: raw, menuRemoved: [], mealRemoved: [] };
  }
  const order = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
  const menuRemoved: string[] = [];
  const mealRemoved: string[] = [];

  if (order.vendorSelections) {
    menuRemoved.push(...cleanVendorSelectionsArray(order.vendorSelections, inactiveMenu));
  }
  if (order.deliveryDayOrders) {
    menuRemoved.push(...cleanDeliveryDayOrders(order.deliveryDayOrders, inactiveMenu));
  }
  if (order.mealSelections) {
    mealRemoved.push(...cleanMealSelections(order.mealSelections, inactiveMeal));
  }
  if (order.boxOrders) {
    menuRemoved.push(...cleanBoxOrders(order.boxOrders, inactiveMenu));
  }
  if (order.items && typeof order.items === 'object') {
    menuRemoved.push(...removeKeysFromObject(order.items as Record<string, unknown>, inactiveMenu));
  }

  return {
    cleaned: order,
    menuRemoved: [...new Set(menuRemoved)],
    mealRemoved: [...new Set(mealRemoved)],
  };
}

/** Strip all inactive menu/meal catalog ids from an upcoming_order payload (Boxes, Food, Meal). */
export async function stripInactiveCatalogFromUpcomingOrder(
  supabase: SupabaseClient,
  raw: unknown,
): Promise<{ order: unknown | null; changed: boolean }> {
  if (raw == null) return { order: raw, changed: false };
  const ids = await loadInactiveIds(supabase);
  if (!ids.ok) return { order: raw, changed: false };
  const { cleaned, menuRemoved, mealRemoved } = cleanUpcomingOrderJson(
    raw,
    ids.inactiveMenu,
    ids.inactiveMeal,
  );
  return {
    order: cleaned,
    changed: menuRemoved.length > 0 || mealRemoved.length > 0,
  };
}

/** Remove one catalog id from all places in an upcoming_order payload (food vendor lines, meal selections, box orders). */
export function stripCatalogItemFromUpcomingOrderJson(
  raw: unknown,
  kind: 'menu' | 'meal',
  itemId: string
): { cleaned: unknown; menuRemoved: string[]; mealRemoved: string[]; changed: boolean } {
  const inactiveMenu = kind === 'menu' ? new Set([itemId]) : new Set<string>();
  const inactiveMeal = kind === 'meal' ? new Set([itemId]) : new Set<string>();
  const { cleaned, menuRemoved, mealRemoved } = cleanUpcomingOrderJson(raw, inactiveMenu, inactiveMeal);
  const changed = menuRemoved.length > 0 || mealRemoved.length > 0;
  return { cleaned, menuRemoved, mealRemoved, changed };
}

function selectionVendorId(s: Record<string, unknown>): string | undefined {
  const v = s.vendorId ?? s.vendor_id;
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function stripVendorFromMealSelectionsBlock(block: unknown, vendorId: string): { next: Record<string, unknown>; changed: boolean } {
  if (!block || typeof block !== 'object') {
    return { next: {}, changed: false };
  }
  const src = block as Record<string, unknown>;
  const next: Record<string, unknown> = { ...src };
  let changed = false;
  for (const key of Object.keys(next)) {
    const cfg = next[key];
    if (!cfg || typeof cfg !== 'object') continue;
    const c = cfg as Record<string, unknown>;
    const vid = (c.vendorId ?? c.vendor_id) as string | undefined;
    if (vid === vendorId) {
      changed = true;
      const cleared = { ...c };
      delete cleared.vendorId;
      delete cleared.vendor_id;
      cleared.items = {};
      cleared.item_notes = {};
      cleared.itemNotes = {};
      next[key] = cleared;
    }
  }
  return { next, changed };
}

function stripVendorFromBoxOrdersArray(arr: unknown[], vendorId: string): boolean {
  let changed = false;
  for (let i = 0; i < arr.length; i++) {
    const box = arr[i] as Record<string, unknown>;
    if (!box || typeof box !== 'object') continue;
    const bv = (box.vendorId ?? box.vendor_id) as string | undefined;
    if (bv === vendorId) {
      changed = true;
      const nb = { ...box };
      delete nb.vendorId;
      delete nb.vendor_id;
      arr[i] = nb;
    }
  }
  return changed;
}

/**
 * Remove every reference to a vendor id from an upcoming_order payload (vendorSelections, deliveryDayOrders,
 * mealSelections / meal_selections, boxOrders / box_orders, legacy top-level vendorId).
 */
export function stripVendorFromUpcomingOrderJson(raw: unknown, vendorId: string): { cleaned: unknown; changed: boolean } {
  if (raw == null || typeof raw !== 'object') {
    return { cleaned: raw, changed: false };
  }
  const order = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
  let changed = false;

  if (Array.isArray(order.vendorSelections)) {
    const vsArr = order.vendorSelections as Record<string, unknown>[];
    const before = vsArr.length;
    const filtered = vsArr.filter((s) => selectionVendorId(s) !== vendorId);
    order.vendorSelections = filtered;
    if (filtered.length !== before) changed = true;
  }

  if (order.deliveryDayOrders && typeof order.deliveryDayOrders === 'object') {
    const ddo = order.deliveryDayOrders as Record<string, { vendorSelections?: unknown }>;
    for (const day of Object.keys(ddo)) {
      const dayData = ddo[day];
      if (!dayData?.vendorSelections || !Array.isArray(dayData.vendorSelections)) continue;
      const before = dayData.vendorSelections.length;
      const next = (dayData.vendorSelections as Record<string, unknown>[]).filter(
        (s) => selectionVendorId(s) !== vendorId,
      );
      if (next.length !== before) {
        changed = true;
        ddo[day] = { ...dayData, vendorSelections: next };
      }
    }
  }

  for (const msKey of ['mealSelections', 'meal_selections'] as const) {
    if (order[msKey]) {
      const { next, changed: c } = stripVendorFromMealSelectionsBlock(order[msKey], vendorId);
      if (c) {
        changed = true;
        order[msKey] = next;
      }
    }
  }

  if (Array.isArray(order.boxOrders)) {
    if (stripVendorFromBoxOrdersArray(order.boxOrders as unknown[], vendorId)) changed = true;
  }
  const snakeBoxes = order.box_orders;
  if (Array.isArray(snakeBoxes) && snakeBoxes !== order.boxOrders) {
    if (stripVendorFromBoxOrdersArray(snakeBoxes as unknown[], vendorId)) changed = true;
  }

  if (order.vendorId === vendorId || order.vendor_id === vendorId) {
    changed = true;
    delete order.vendorId;
    delete order.vendor_id;
  }

  return { cleaned: order, changed };
}

const INACTIVE_IDS_CACHE_TTL_MS = 120_000;

let inactiveIdsCache:
  | { inactiveMenu: Set<string>; inactiveMeal: Set<string>; expiresAt: number }
  | null = null;

async function loadInactiveIds(supabase: SupabaseClient): Promise<
  | { ok: true; inactiveMenu: Set<string>; inactiveMeal: Set<string> }
  | { ok: false; error: string }
> {
  const now = Date.now();
  if (inactiveIdsCache && inactiveIdsCache.expiresAt > now) {
    return {
      ok: true,
      inactiveMenu: inactiveIdsCache.inactiveMenu,
      inactiveMeal: inactiveIdsCache.inactiveMeal,
    };
  }

  try {
    const [menuRows, mealRows] = await Promise.all([
      fetchAllSupabaseRows((from, to) =>
        supabase.from('menu_items').select('id').eq('is_active', false).order('id').range(from, to)
      ),
      fetchAllSupabaseRows((from, to) =>
        supabase.from('breakfast_items').select('id').eq('is_active', false).order('id').range(from, to)
      ),
    ]);
    const inactiveMenu = new Set(menuRows.map((r) => r.id as string));
    const inactiveMeal = new Set(mealRows.map((r) => r.id as string));
    inactiveIdsCache = {
      inactiveMenu,
      inactiveMeal,
      expiresAt: now + INACTIVE_IDS_CACHE_TTL_MS,
    };
    return { ok: true, inactiveMenu, inactiveMeal };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to load inactive catalog items' };
  }
}

export async function runCleanInactiveUpcomingOrders(
  supabase: SupabaseClient,
  options: { dryRun: boolean; clientId?: string }
): Promise<CleanInactiveUpcomingOrderResult> {
  const ids = await loadInactiveIds(supabase);
  if (!ids.ok) return { ok: false, error: ids.error };
  const { inactiveMenu, inactiveMeal } = ids;

  if (inactiveMenu.size === 0 && inactiveMeal.size === 0) {
    return {
      ok: true,
      inactiveMenuCount: 0,
      inactiveMealCount: 0,
      scanned: 0,
      changes: [],
      updated: 0,
    };
  }

  const changes: UpcomingOrderCleanChange[] = [];
  let scanned = 0;
  let updated = 0;
  const { dryRun, clientId: clientFilter } = options;

  async function processRow(row: { id: string; upcoming_order: unknown }) {
    scanned++;
    const uo = row.upcoming_order;
    if (uo == null) return;

    const { cleaned, menuRemoved, mealRemoved } = cleanUpcomingOrderJson(uo, inactiveMenu, inactiveMeal);
    if (menuRemoved.length === 0 && mealRemoved.length === 0) return;

    changes.push({ clientId: row.id, menuRemoved, mealRemoved });

    if (!dryRun) {
      const { error: upErr } = await supabase
        .from('clients')
        .update({ upcoming_order: cleaned })
        .eq('id', row.id);
      if (upErr) {
        throw new Error(`Update failed for ${row.id}: ${upErr.message}`);
      }
      updated++;
    }
  }

  try {
    if (clientFilter) {
      const { data, error } = await supabase
        .from('clients')
        .select('id, upcoming_order')
        .eq('id', clientFilter)
        .maybeSingle();

      if (error) return { ok: false, error: error.message };
      if (!data) return { ok: false, error: `Client not found: ${clientFilter}` };
      await processRow(data as { id: string; upcoming_order: unknown });
    } else {
      let offset = 0;
      for (;;) {
        const { data, error } = await supabase
          .from('clients')
          .select('id, upcoming_order')
          .not('upcoming_order', 'is', null)
          .order('id', { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1);

        if (error) return { ok: false, error: error.message };

        const rows = (data || []) as { id: string; upcoming_order: unknown }[];
        for (const row of rows) {
          await processRow(row);
        }

        if (rows.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }

  return {
    ok: true,
    inactiveMenuCount: inactiveMenu.size,
    inactiveMealCount: inactiveMeal.size,
    scanned,
    changes,
    updated,
  };
}

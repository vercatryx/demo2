import type { MealItem, MenuItem } from '@/lib/types';
import { getItemPoints } from '@/lib/utils';
import { getTotalMealCountAllDays } from '@/lib/portal-food-order-actions';
import { getHouseholdLinkBucket } from '@/lib/client-household-link-compat';
import {
    joinDropdownInstanceNotes,
    splitDropdownInstanceNotes,
} from '@/lib/menu-item-dropdowns';

export type HouseholdOrderMember = {
    id: string;
    name: string;
    serviceType?: string;
    approvedMealsPerWeek: number;
    upcomingOrder?: unknown;
};

export type HouseholdMemberAllocation = {
    id: string;
    name: string;
    usedMeals: number;
    approvedMealsPerWeek: number;
};

type FoodLineRef = {
    kind: 'vendor-day' | 'vendor-flat' | 'meal';
    vendorIndex: number;
    day?: string;
    mealKey?: string;
    itemId: string;
    pointsPerUnit: number;
};

/** Food/Meal clients in the same link bucket may share one portal cart. */
export function isHouseholdFoodPoolingEligible(serviceType: string | null | undefined): boolean {
    return getHouseholdLinkBucket(serviceType) === 'food';
}

export function sortHouseholdOrderMembers(
    members: HouseholdOrderMember[],
    portalClientId: string,
): HouseholdOrderMember[] {
    const current = members.find((m) => m.id === portalClientId);
    const others = members
        .filter((m) => m.id !== portalClientId)
        .sort((a, b) => a.name.localeCompare(b.name));
    return current ? [current, ...others] : others;
}

function addQty(map: Record<string, number>, itemId: string, qty: number) {
    if (qty <= 0) return;
    map[itemId] = (map[itemId] || 0) + qty;
}

function mergeItemMaps(a: Record<string, number> = {}, b: Record<string, number> = {}): Record<string, number> {
    const out = { ...a };
    for (const [itemId, qty] of Object.entries(b)) {
        addQty(out, itemId, Number(qty) || 0);
    }
    return out;
}

function mergeNotes(
    a: Record<string, string> = {},
    b: Record<string, string> = {},
): Record<string, string> {
    return { ...a, ...b };
}

function mergeNotesByDay(
    a: Record<string, Record<string, string>> = {},
    b: Record<string, Record<string, string>> = {},
): Record<string, Record<string, string>> {
    const out: Record<string, Record<string, string>> = { ...a };
    for (const [day, notes] of Object.entries(b)) {
        out[day] = mergeNotes(out[day], notes);
    }
    return out;
}

function normalizeFoodConfig(config: any, fallbackServiceType: string): any {
    if (!config || typeof config !== 'object') {
        return { serviceType: fallbackServiceType, vendorSelections: [], mealSelections: {} };
    }
    const clone = JSON.parse(JSON.stringify(config));
    if (!clone.serviceType) clone.serviceType = fallbackServiceType;
    if (!Array.isArray(clone.vendorSelections)) clone.vendorSelections = [];
    if (!clone.mealSelections || typeof clone.mealSelections !== 'object') clone.mealSelections = {};
    return clone;
}

/** Combine linked members' saved orders into one editable cart. */
export function mergeFoodOrderConfigs(configs: any[], fallbackServiceType: string): any {
    const normalized = configs.map((c) => normalizeFoodConfig(c, fallbackServiceType));
    if (normalized.length === 0) return { serviceType: fallbackServiceType, vendorSelections: [], mealSelections: {} };
    if (normalized.length === 1) return normalized[0];

    const vendorById = new Map<string, any>();
    const mealSelections: Record<string, any> = {};

    for (const cfg of normalized) {
        for (const sel of cfg.vendorSelections || []) {
            if (!sel?.vendorId) continue;
            const existing = vendorById.get(sel.vendorId);
            if (!existing) {
                vendorById.set(sel.vendorId, JSON.parse(JSON.stringify(sel)));
                continue;
            }
            existing.items = mergeItemMaps(existing.items, sel.items);
            existing.selectedDeliveryDays = [
                ...new Set([
                    ...(existing.selectedDeliveryDays || []),
                    ...(sel.selectedDeliveryDays || []),
                ]),
            ];
            existing.itemNotes = mergeNotes(existing.itemNotes, sel.itemNotes);
            if (sel.itemsByDay || existing.itemsByDay) {
                const mergedByDay: Record<string, Record<string, number>> = { ...(existing.itemsByDay || {}) };
                for (const [day, items] of Object.entries(sel.itemsByDay || {})) {
                    mergedByDay[day] = mergeItemMaps(mergedByDay[day], items as Record<string, number>);
                }
                existing.itemsByDay = mergedByDay;
            }
            if (sel.itemNotesByDay || existing.itemNotesByDay) {
                existing.itemNotesByDay = mergeNotesByDay(existing.itemNotesByDay, sel.itemNotesByDay);
            }
        }

        for (const [mealKey, mealCfg] of Object.entries(cfg.mealSelections || {})) {
            const meal = mealCfg as { items?: Record<string, number>; mealType?: string };
            if (!mealSelections[mealKey]) {
                mealSelections[mealKey] = JSON.parse(JSON.stringify(meal));
                continue;
            }
            mealSelections[mealKey].items = mergeItemMaps(mealSelections[mealKey].items, meal.items);
        }
    }

    return {
        ...normalized[0],
        vendorSelections: [...vendorById.values()],
        mealSelections,
    };
}

function collectFoodLines(
    orderConfig: any,
    menuItems: MenuItem[],
    mealItems: MealItem[],
    serviceType: string,
): FoodLineRef[] {
    const lines: FoodLineRef[] = [];
    const vendorSelections = orderConfig?.vendorSelections || [];

    vendorSelections.forEach((sel: any, vendorIndex: number) => {
        if (!sel) return;
        if (sel.itemsByDay && typeof sel.itemsByDay === 'object') {
            for (const day of Object.keys(sel.itemsByDay)) {
                const dayItems = sel.itemsByDay[day] || {};
                for (const [itemId, qty] of Object.entries(dayItems)) {
                    const n = Number(qty) || 0;
                    if (n <= 0) continue;
                    const item = menuItems.find((i) => i.id === itemId);
                    for (let i = 0; i < n; i++) {
                        lines.push({
                            kind: 'vendor-day',
                            vendorIndex,
                            day,
                            itemId,
                            pointsPerUnit: getItemPoints(item),
                        });
                    }
                }
            }
        } else if (sel.items) {
            const multiplier =
                sel.selectedDeliveryDays?.length > 0
                    ? sel.selectedDeliveryDays.length
                    : 1;
            for (const [itemId, qty] of Object.entries(sel.items)) {
                const n = Number(qty) || 0;
                if (n <= 0) continue;
                const item = menuItems.find((i) => i.id === itemId);
                const perUnit = getItemPoints(item) * multiplier;
                for (let i = 0; i < n; i++) {
                    lines.push({
                        kind: 'vendor-flat',
                        vendorIndex,
                        itemId,
                        pointsPerUnit: perUnit,
                    });
                }
            }
        }
    });

    if (serviceType === 'Food' && orderConfig?.mealSelections) {
        const vendorItemIds = new Set<string>();
        for (const sel of vendorSelections) {
            if (sel?.itemsByDay) {
                for (const day of Object.keys(sel.itemsByDay)) {
                    for (const itemId of Object.keys(sel.itemsByDay[day] || {})) vendorItemIds.add(itemId);
                }
            }
            if (sel?.items) {
                for (const itemId of Object.keys(sel.items)) vendorItemIds.add(itemId);
            }
        }
        for (const mealKey of Object.keys(orderConfig.mealSelections)) {
            const meal = orderConfig.mealSelections[mealKey];
            const items = meal?.items || {};
            for (const [itemId, qty] of Object.entries(items)) {
                if (vendorItemIds.has(itemId)) continue;
                const n = Number(qty) || 0;
                if (n <= 0) continue;
                const item = mealItems.find((i) => i.id === itemId);
                for (let i = 0; i < n; i++) {
                    lines.push({
                        kind: 'meal',
                        vendorIndex: -1,
                        mealKey,
                        itemId,
                        pointsPerUnit: getItemPoints(item),
                    });
                }
            }
        }
    }

    return lines;
}

function emptyFoodConfig(template: any): any {
    return {
        serviceType: template?.serviceType || 'Food',
        caseId: template?.caseId,
        vendorSelections: (template?.vendorSelections || [])
            .filter((s: any) => s?.vendorId)
            .map((s: any) => ({
                vendorId: s.vendorId,
                items: {},
                itemsByDay: {},
                selectedDeliveryDays: Array.isArray(s.selectedDeliveryDays) ? [...s.selectedDeliveryDays] : [],
                itemNotes: {},
                itemNotesByDay: {},
            })),
        mealSelections: JSON.parse(JSON.stringify(template?.mealSelections || {})),
    };
}

function addUnitToConfig(config: any, line: FoodLineRef) {
    if (line.kind === 'vendor-day' && line.day) {
        const sel = config.vendorSelections[line.vendorIndex];
        if (!sel) return;
        if (!sel.itemsByDay) sel.itemsByDay = {};
        if (!sel.itemsByDay[line.day]) sel.itemsByDay[line.day] = {};
        sel.itemsByDay[line.day][line.itemId] = (sel.itemsByDay[line.day][line.itemId] || 0) + 1;
        if (!sel.selectedDeliveryDays?.includes(line.day)) {
            sel.selectedDeliveryDays = [...(sel.selectedDeliveryDays || []), line.day];
        }
        return;
    }
    if (line.kind === 'vendor-flat') {
        const sel = config.vendorSelections[line.vendorIndex];
        if (!sel) return;
        if (!sel.items) sel.items = {};
        sel.items[line.itemId] = (sel.items[line.itemId] || 0) + 1;
        return;
    }
    if (line.kind === 'meal' && line.mealKey) {
        if (!config.mealSelections[line.mealKey]) {
            config.mealSelections[line.mealKey] = { items: {} };
        }
        const items = config.mealSelections[line.mealKey].items || {};
        items[line.itemId] = (items[line.itemId] || 0) + 1;
        config.mealSelections[line.mealKey].items = items;
    }
}

function removeOneUnitFromConfig(config: any, line: FoodLineRef): boolean {
    if (line.kind === 'vendor-day' && line.day) {
        const sel = config.vendorSelections?.[line.vendorIndex];
        const qty = sel?.itemsByDay?.[line.day]?.[line.itemId] || 0;
        if (qty <= 0) return false;
        sel.itemsByDay[line.day][line.itemId] = qty - 1;
        if (sel.itemsByDay[line.day][line.itemId] <= 0) delete sel.itemsByDay[line.day][line.itemId];
        return true;
    }
    if (line.kind === 'vendor-flat') {
        const sel = config.vendorSelections?.[line.vendorIndex];
        const qty = sel?.items?.[line.itemId] || 0;
        if (qty <= 0) return false;
        sel.items[line.itemId] = qty - 1;
        if (sel.items[line.itemId] <= 0) delete sel.items[line.itemId];
        return true;
    }
    if (line.kind === 'meal' && line.mealKey) {
        const qty = config.mealSelections?.[line.mealKey]?.items?.[line.itemId] || 0;
        if (qty <= 0) return false;
        config.mealSelections[line.mealKey].items[line.itemId] = qty - 1;
        if (config.mealSelections[line.mealKey].items[line.itemId] <= 0) {
            delete config.mealSelections[line.mealKey].items[line.itemId];
        }
        return true;
    }
    return false;
}

function notePoolKey(vendorIndex: number, itemId: string, day?: string): string {
    return day ? `${vendorIndex}|${day}|${itemId}` : `${vendorIndex}|flat|${itemId}`;
}

/** Build consumable per-unit note queues from a cart (before qty split mutates it). */
function buildNoteInstancePools(sourceConfig: any): Map<string, string[]> {
    const pools = new Map<string, string[]>();
    const selections = sourceConfig?.vendorSelections || [];
    selections.forEach((sel: any, vendorIndex: number) => {
        if (!sel) return;
        if (sel.itemsByDay && typeof sel.itemsByDay === 'object') {
            for (const day of Object.keys(sel.itemsByDay)) {
                const dayItems = sel.itemsByDay[day] || {};
                const dayNotes = sel.itemNotesByDay?.[day] || {};
                for (const [itemId, qty] of Object.entries(dayItems)) {
                    const n = Number(qty) || 0;
                    if (n <= 0) continue;
                    const note =
                        (typeof dayNotes[itemId] === 'string' && dayNotes[itemId].trim()
                            ? dayNotes[itemId]
                            : sel.itemNotes?.[itemId]) || '';
                    pools.set(notePoolKey(vendorIndex, itemId, day), splitDropdownInstanceNotes(note, n));
                }
            }
        }
        if (sel.items && typeof sel.items === 'object') {
            for (const [itemId, qty] of Object.entries(sel.items)) {
                const n = Number(qty) || 0;
                if (n <= 0) continue;
                const key = notePoolKey(vendorIndex, itemId);
                if (pools.has(key)) continue;
                const note = sel.itemNotes?.[itemId] || '';
                pools.set(key, splitDropdownInstanceNotes(String(note), n));
            }
        }
    });
    return pools;
}

function takeNoteInstances(pools: Map<string, string[]>, key: string, qty: number): string {
    const pool = pools.get(key) || [];
    const taken = pool.splice(0, Math.max(0, qty));
    pools.set(key, pool);
    return joinDropdownInstanceNotes(taken);
}

/** Copy dropdown notes onto split member carts (qty-only waterfall used to drop them). */
function applyNotesToSplitConfigs(sourceConfig: any, split: Map<string, any>) {
    const pools = buildNoteInstancePools(sourceConfig);
    for (const [, memberConfig] of split) {
        const selections = memberConfig?.vendorSelections || [];
        selections.forEach((sel: any, vendorIndex: number) => {
            if (!sel) return;
            sel.itemNotes = sel.itemNotes || {};
            sel.itemNotesByDay = sel.itemNotesByDay || {};

            if (sel.itemsByDay && typeof sel.itemsByDay === 'object') {
                for (const day of Object.keys(sel.itemsByDay)) {
                    const dayItems = sel.itemsByDay[day] || {};
                    if (!sel.itemNotesByDay[day]) sel.itemNotesByDay[day] = {};
                    for (const [itemId, qty] of Object.entries(dayItems)) {
                        const n = Number(qty) || 0;
                        if (n <= 0) continue;
                        const note = takeNoteInstances(pools, notePoolKey(vendorIndex, itemId, day), n);
                        if (note.trim()) {
                            sel.itemNotesByDay[day][itemId] = note;
                            sel.itemNotes[itemId] = note;
                        }
                    }
                }
            }

            if (sel.items && typeof sel.items === 'object') {
                for (const [itemId, qty] of Object.entries(sel.items)) {
                    const n = Number(qty) || 0;
                    if (n <= 0) continue;
                    const note = takeNoteInstances(pools, notePoolKey(vendorIndex, itemId), n);
                    if (note.trim()) sel.itemNotes[itemId] = note;
                }
            }
        });
    }
}

/**
 * Assign cart meals in order: fill member 1 up to their weekly limit, then member 2, etc.
 */
export function splitFoodOrderWaterfall(
    unifiedConfig: any,
    members: HouseholdOrderMember[],
    menuItems: MenuItem[],
    mealItems: MealItem[],
    serviceType: string,
): Map<string, any> {
    const working = JSON.parse(JSON.stringify(unifiedConfig));
    const noteSource = JSON.parse(JSON.stringify(unifiedConfig));
    const lines = collectFoodLines(working, menuItems, mealItems, serviceType);
    const result = new Map<string, any>();

    for (const member of members) {
        const memberConfig = emptyFoodConfig(working);
        memberConfig.caseId = (member.upcomingOrder as any)?.caseId ?? memberConfig.caseId;
        let budgetLeft = Math.max(0, member.approvedMealsPerWeek || 0);

        for (let i = 0; i < lines.length && budgetLeft > 0; i++) {
            const line = lines[i];
            if (!line) continue;
            if (line.pointsPerUnit > budgetLeft) continue;
            if (!removeOneUnitFromConfig(working, line)) continue;
            addUnitToConfig(memberConfig, line);
            budgetLeft -= line.pointsPerUnit;
            lines.splice(i, 1);
            i -= 1;
        }

        result.set(member.id, memberConfig);
    }

    applyNotesToSplitConfigs(noteSource, result);
    return result;
}

export function getHouseholdPooledMealLimit(members: HouseholdOrderMember[]): number {
    return members.reduce((sum, m) => sum + Math.max(0, m.approvedMealsPerWeek || 0), 0);
}

export function computeHouseholdMemberAllocations(
    unifiedConfig: any,
    members: HouseholdOrderMember[],
    menuItems: MenuItem[],
    mealItems: MealItem[],
    serviceType: string,
): HouseholdMemberAllocation[] {
    const split = splitFoodOrderWaterfall(unifiedConfig, members, menuItems, mealItems, serviceType);
    return members.map((member) => ({
        id: member.id,
        name: member.name,
        approvedMealsPerWeek: member.approvedMealsPerWeek || 0,
        usedMeals: getTotalMealCountAllDays(
            split.get(member.id) || {},
            menuItems,
            mealItems,
            serviceType,
        ),
    }));
}

export function filterFoodOrderConfigForMember(
    unifiedConfig: any,
    memberId: string,
    members: HouseholdOrderMember[],
    menuItems: MenuItem[],
    mealItems: MealItem[],
    serviceType: string,
): any {
    const split = splitFoodOrderWaterfall(unifiedConfig, members, menuItems, mealItems, serviceType);
    return split.get(memberId) || emptyFoodConfig(unifiedConfig);
}

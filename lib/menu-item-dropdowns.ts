import type {
    MealItem,
    MenuItem,
    MenuItemDropdownGroup,
    MenuItemDropdownSubEntry,
    MenuItemDropdownSubGroup,
} from '@/lib/types';
import { areAllWeekdayLabels, sortWeekdayLabelsIfAll, sortWeekdays } from '@/lib/order-dates';

/** Separates parent option from sub-dropdown choice within one group slot (e.g. Chicken>Thigh). */
export const SUB_DROPDOWN_SEP = '>';

const MULTI_SEP = ';';

/** Separates multiple parent choices within one group slot (e.g. Monday|Thursday). */
export const MULTI_SELECT_SEP = '|';

export function isSubDropdownArray(entry: MenuItemDropdownSubEntry): entry is MenuItemDropdownSubGroup[] {
    return Array.isArray(entry);
}

/** Default 1; clamped to at least 1 and at most the number of options. */
export function getGroupMaxSelections(group: MenuItemDropdownGroup): number {
    const raw = group.maxSelections ?? 1;
    const n = Math.max(1, Math.floor(Number(raw) || 1));
    const cap = group.options?.length ?? 1;
    return Math.min(n, Math.max(1, cap));
}

export function groupSupportsMultiSelect(group: MenuItemDropdownGroup): boolean {
    if (getGroupMaxSelections(group) <= 1) return false;
    if (!group.subDropdowns || Object.keys(group.subDropdowns).length === 0) return true;
    return false;
}

export function parseGroupMultiParents(parent: string): string[] {
    const t = parent.trim();
    if (!t) return [];
    if (!t.includes(MULTI_SELECT_SEP)) return [t];
    return t
        .split(MULTI_SELECT_SEP)
        .map((s) => s.trim())
        .filter(Boolean);
}

export function formatGroupMultiParents(parents: string[]): string {
    const cleaned = parents.map((s) => s.trim()).filter(Boolean);
    if (cleaned.length === 0) return '';
    if (cleaned.length === 1) return cleaned[0];
    return cleaned.join(MULTI_SELECT_SEP);
}

/** Order multi-select picks by display option order, preserving duplicate quantities. */
export function orderMultiSelectParents(group: MenuItemDropdownGroup, picks: string[]): string[] {
    const counts = new Map<string, number>();
    for (const p of picks) {
        const t = p.trim();
        if (!t) continue;
        counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    const ordered: string[] = [];
    for (const opt of getDropdownDisplayOptions(group)) {
        const n = counts.get(opt) ?? 0;
        for (let i = 0; i < n; i++) ordered.push(opt);
        counts.delete(opt);
    }
    for (const [opt, n] of counts) {
        for (let i = 0; i < n; i++) ordered.push(opt);
    }
    return ordered;
}

/** Sort sub-dropdown array entries by weekday label when all labels are weekdays. */
export function sortSubDropdownArrayForDisplay(entry: MenuItemDropdownSubGroup[]): MenuItemDropdownSubGroup[] {
    if (!areAllWeekdayLabels(entry.map((sg) => sg.label))) return entry;
    const order = sortWeekdays(entry.map((sg) => sg.label));
    const byLabel = new Map(entry.map((sg) => [sg.label.trim(), sg] as const));
    return order.map((label) => byLabel.get(label)!).filter(Boolean);
}

/** Options list for portal UI — weekday groups sorted Monday → Sunday. */
export function getDropdownDisplayOptions(group: MenuItemDropdownGroup): string[] {
    const opts = group.options ?? [];
    return sortWeekdayLabelsIfAll(opts);
}

/** Filtered + display-ordered options for portal/admin UI. */
export function getVisibleDropdownDisplayOptions(
    group: MenuItemDropdownGroup,
    selectedLabel: string,
    hidePhaseoutUnlessOnOrder: boolean,
): string[] {
    const visible = filterDropdownOptionsForViewer(group, selectedLabel, hidePhaseoutUnlessOnOrder);
    return getDropdownDisplayOptions(group).filter((o) => visible.includes(o));
}

function normalizeMaxSelections(raw: unknown, optionCount: number): number | undefined {
    if (raw == null || raw === '') return undefined;
    const n = Math.max(1, Math.floor(Number(raw) || 1));
    return Math.min(n, Math.max(1, optionCount));
}

function normalizeDropdownGroupRow(row: Record<string, unknown>): MenuItemDropdownGroup | null {
    const label =
        String(row.label ?? row.name ?? row.title ?? row.group ?? '').trim() || 'Option';
    const options = Array.isArray(row.options)
        ? row.options.map((x) => String(x ?? '').trim()).filter((s) => s.length > 0)
        : [];
    if (options.length === 0) return null;
    const subDropdowns = parseSubDropdownsFromDb(row.subDropdowns ?? row.sub_dropdowns);
    const optionUpcs = normalizeOptionUpcs(row.optionUpcs ?? row.option_upcs);
    const optionPhaseouts = normalizeOptionPhaseouts(row.optionPhaseouts ?? row.option_phaseouts);
    const maxSelections = normalizeMaxSelections(row.maxSelections ?? row.max_selections, options.length);
    const groupRow: MenuItemDropdownGroup = { label, options };
    if (maxSelections != null && maxSelections > 1) groupRow.maxSelections = maxSelections;
    if (optionUpcs) groupRow.optionUpcs = optionUpcs;
    if (optionPhaseouts) groupRow.optionPhaseouts = optionPhaseouts;
    if (subDropdowns) groupRow.subDropdowns = subDropdowns;
    return groupRow;
}

export function normalizeOptionUpcs(raw: unknown): Record<string, string> | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const out: Record<string, string> = {};
    for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
        const k = String(key ?? '').trim();
        const v = String(val ?? '').trim();
        if (k && v) out[k] = v;
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

export function migrateOptionUpcKey(
    map: Record<string, string> | undefined,
    oldLabel: string,
    newLabel: string,
): Record<string, string> | undefined {
    if (!map) return undefined;
    const oldKey = oldLabel.trim();
    const newKey = newLabel.trim();
    if (!oldKey || oldKey === newKey || !(oldKey in map)) return map;
    const next = { ...map };
    next[newKey] = next[oldKey];
    delete next[oldKey];
    return next;
}

export function normalizeOptionPhaseouts(raw: unknown): Record<string, boolean> | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const out: Record<string, boolean> = {};
    for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
        const k = String(key ?? '').trim();
        if (k && val === true) out[k] = true;
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

export function migrateOptionPhaseoutKey(
    map: Record<string, boolean> | undefined,
    oldLabel: string,
    newLabel: string,
): Record<string, boolean> | undefined {
    if (!map) return undefined;
    const oldKey = oldLabel.trim();
    const newKey = newLabel.trim();
    if (!oldKey || oldKey === newKey || !(oldKey in map)) return map;
    const next = { ...map };
    next[newKey] = next[oldKey];
    delete next[oldKey];
    return next;
}

type DropdownOptionGroup = MenuItemDropdownGroup | MenuItemDropdownSubGroup;

export function isDropdownOptionPhasedOut(group: DropdownOptionGroup, label: string): boolean {
    const canonical = canonicalPickFromGroup(group, label);
    if (!canonical || !group.optionPhaseouts) return false;
    return group.optionPhaseouts[canonical] === true;
}

/** Whether a dropdown choice appears in client ordering UI. */
export function shouldShowDropdownOptionToViewer(
    group: DropdownOptionGroup,
    option: string,
    selectedLabel: string,
    hidePhaseoutUnlessOnOrder: boolean,
): boolean {
    if (!hidePhaseoutUnlessOnOrder) return true;
    if (!isDropdownOptionPhasedOut(group, option)) return true;
    const optCanon = canonicalPickFromGroup(group, option);
    const selectedParts = selectedLabel.includes(MULTI_SELECT_SEP)
        ? parseGroupMultiParents(selectedLabel)
        : [selectedLabel];
    return selectedParts.some((sel) => {
        const selCanon = canonicalPickFromGroup(group, sel);
        return optCanon !== '' && optCanon === selCanon;
    });
}

export function filterDropdownOptionsForViewer(
    group: DropdownOptionGroup,
    selectedLabel: string,
    hidePhaseoutUnlessOnOrder: boolean,
): string[] {
    return (group.options ?? []).filter((opt) =>
        shouldShowDropdownOptionToViewer(group, opt, selectedLabel, hidePhaseoutUnlessOnOrder),
    );
}

export function getDropdownOptionUpc(group: MenuItemDropdownGroup, label: string): string | null {
    const canonical = canonicalPickFromGroup(group, label);
    if (!canonical || !group.optionUpcs) return null;
    const upc = group.optionUpcs[canonical]?.trim();
    return upc || null;
}

export function getSubDropdownOptionUpc(subGroup: MenuItemDropdownSubGroup, label: string): string | null {
    const canonical = canonicalPickFromGroup(subGroup, label);
    if (!canonical || !subGroup.optionUpcs) return null;
    const upc = subGroup.optionUpcs[canonical]?.trim();
    return upc || null;
}

function normalizeSubGroup(raw: unknown): MenuItemDropdownSubGroup | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const row = raw as Record<string, unknown>;
    const label =
        String(row.label ?? row.name ?? row.title ?? row.group ?? '').trim() || 'Option';
    const options = Array.isArray(row.options)
        ? row.options.map((x) => String(x ?? '').trim()).filter((s) => s.length > 0)
        : [];
    if (options.length === 0) return null;
    const optionUpcs = normalizeOptionUpcs(row.optionUpcs ?? row.option_upcs);
    const optionPhaseouts = normalizeOptionPhaseouts(row.optionPhaseouts ?? row.option_phaseouts);
    const subRow: MenuItemDropdownSubGroup = { label, options };
    if (optionUpcs) subRow.optionUpcs = optionUpcs;
    if (optionPhaseouts) subRow.optionPhaseouts = optionPhaseouts;
    return subRow;
}

function normalizeSubEntry(raw: unknown): MenuItemDropdownSubEntry | null {
    if (Array.isArray(raw)) {
        const arr = raw.map(normalizeSubGroup).filter(Boolean) as MenuItemDropdownSubGroup[];
        return arr.length > 0 ? arr : null;
    }
    return normalizeSubGroup(raw);
}

function parseSubDropdownsFromDb(raw: unknown): Record<string, MenuItemDropdownSubEntry> | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const out: Record<string, MenuItemDropdownSubEntry> = {};
    for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
        const parentKey = String(key ?? '').trim();
        if (!parentKey) continue;
        const entry = normalizeSubEntry(val);
        if (!entry) continue;
        out[parentKey] = entry;
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

export function parseGroupSlot(raw: string): { parent: string; sub: string } {
    const t = raw.trim();
    const idx = t.indexOf(SUB_DROPDOWN_SEP);
    if (idx === -1) return { parent: t, sub: '' };
    return { parent: t.slice(0, idx).trim(), sub: t.slice(idx + 1).trim() };
}

export function parseGroupSlotSubs(raw: string): { parent: string; subs: string[] } {
    const { parent, sub } = parseGroupSlot(raw);
    if (!sub) return { parent, subs: [] };
    return { parent, subs: sub.split(MULTI_SEP).map((s) => s.trim()) };
}

export function formatGroupSlot(parent: string, sub?: string): string {
    const p = parent.trim();
    const s = (sub ?? '').trim();
    if (!p) return '';
    if (!s) return p;
    return `${p}${SUB_DROPDOWN_SEP}${s}`;
}

export function formatGroupSlotWithSubs(parent: string, subs: string[]): string {
    const p = parent.trim();
    if (!p) return '';
    const cleaned = subs.map((s) => s.trim());
    if (cleaned.every((s) => !s)) return p;
    return `${p}${SUB_DROPDOWN_SEP}${cleaned.join(MULTI_SEP)}`;
}

export function getSubDropdownEntryForOption(
    group: MenuItemDropdownGroup,
    parentOption: string,
): MenuItemDropdownSubEntry | undefined {
    const parent = parentOption.trim();
    if (!parent || !group.subDropdowns) return undefined;
    if (group.subDropdowns[parent]) return group.subDropdowns[parent];
    const canonical = canonicalPickFromGroup(group, parent);
    if (canonical && group.subDropdowns[canonical]) return group.subDropdowns[canonical];
    return undefined;
}

export function getSubDropdownForOption(
    group: MenuItemDropdownGroup,
    parentOption: string,
): MenuItemDropdownSubGroup | undefined {
    const entry = getSubDropdownEntryForOption(group, parentOption);
    if (!entry || isSubDropdownArray(entry)) return undefined;
    return entry;
}

function canonicalizeGroupSlot(slot: string, group: MenuItemDropdownGroup): string {
    const { parent, subs } = parseGroupSlotSubs(slot);
    const parents = parseGroupMultiParents(parent);
    if (parents.length === 0) return '';

    if (groupSupportsMultiSelect(group)) {
        const canonicalParents = parents
            .map((p) => canonicalPickFromGroup(group, p))
            .filter(Boolean);
        return formatGroupMultiParents(canonicalParents);
    }

    const c = canonicalPickFromGroup(group, parents[0] ?? parent);
    if (!c) return '';
    const subEntry = getSubDropdownEntryForOption(group, c);
    if (!subEntry) return c;
    if (isSubDropdownArray(subEntry)) {
        const sortedEntry = sortSubDropdownArrayForDisplay(subEntry);
        const canonicalSubs = sortedEntry.map((sg, i) => {
            const origIdx = subEntry.findIndex((x) => x.label.trim() === sg.label.trim());
            return canonicalPickFromGroup(sg, subs[origIdx >= 0 ? origIdx : i] ?? '') || '';
        });
        return formatGroupSlotWithSubs(c, canonicalSubs);
    }
    const subPick = canonicalPickFromGroup(subEntry, subs[0] ?? '') || '';
    return formatGroupSlot(c, subPick);
}

export function dropdownGroupsFromDb(raw: unknown): MenuItemDropdownGroup[] {
    if (raw == null) return [];
    if (!Array.isArray(raw)) return [];
    if (raw.length === 0) return [];
    // Legacy: flat string array → one unnamed group
    if (typeof raw[0] === 'string') {
        const opts = raw.map((x) => String(x ?? '').trim()).filter((s) => s.length > 0);
        return opts.length ? [{ label: 'Option', options: opts }] : [];
    }
    const out: MenuItemDropdownGroup[] = [];
    for (const row of raw) {
        if (!row || typeof row !== 'object') continue;
        const normalized = normalizeDropdownGroupRow(row as Record<string, unknown>);
        if (normalized) out.push(normalized);
    }
    return out;
}

export function getMenuItemDropdownGroups(item: MenuItem | MealItem): MenuItemDropdownGroup[] {
    const raw = (item as MenuItem & { dropdownOptions?: unknown }).dropdownOptions;
    if (raw != null) {
        const fromDb = dropdownGroupsFromDb(raw).filter(
            (g) => g && Array.isArray(g.options) && g.options.length > 0,
        );
        if (fromDb.length > 0) return fromDb;
    }

    if (!('dropdownGroups' in item)) return [];
    const groups = (item as MenuItem).dropdownGroups;
    if (!Array.isArray(groups)) return [];

    // Server may already pass fully-shaped groups (incl. sub-dropdown arrays) — keep as-is.
    const hasSubArrays = groups.some(
        (g) =>
            g?.subDropdowns &&
            Object.values(g.subDropdowns).some((entry) => isSubDropdownArray(entry)),
    );
    if (hasSubArrays) {
        return groups.filter((g) => g && Array.isArray(g.options) && g.options.length > 0);
    }

    return groups
        .filter((g) => g && Array.isArray(g.options))
        .map((g) => {
            const label =
                String((g as { label?: string; name?: string }).label ?? (g as { label?: string; name?: string }).name ?? '').trim() ||
                'Option';
            const options = g.options.map((o) => String(o).trim()).filter(Boolean);
            const subDropdowns = g.subDropdowns
                ? Object.fromEntries(
                      Object.entries(g.subDropdowns)
                          .map(([k, sub]) => {
                              const key = String(k).trim();
                              if (!key || !sub) return null;
                              if (isSubDropdownArray(sub)) {
                                  const arr = sub
                                      .map((sg) => {
                                          const subLabel = String(sg.label ?? '').trim() || 'Option';
                                          const subOpts = (sg.options ?? [])
                                              .map((o) => String(o).trim())
                                              .filter(Boolean);
                                          if (subOpts.length === 0) return null;
                                          const subRow: MenuItemDropdownSubGroup = { label: subLabel, options: subOpts };
                                          if (sg.optionUpcs && Object.keys(sg.optionUpcs).length > 0) {
                                              subRow.optionUpcs = sg.optionUpcs;
                                          }
                                          if (sg.optionPhaseouts && Object.keys(sg.optionPhaseouts).length > 0) {
                                              subRow.optionPhaseouts = sg.optionPhaseouts;
                                          }
                                          return subRow;
                                      })
                                      .filter(Boolean) as MenuItemDropdownSubGroup[];
                                  if (arr.length === 0) return null;
                                  return [key, arr] as const;
                              }
                              const subLabel = String(sub.label ?? '').trim() || 'Option';
                              const subOpts = (sub.options ?? []).map((o) => String(o).trim()).filter(Boolean);
                              if (subOpts.length === 0) return null;
                              const subRow: MenuItemDropdownSubGroup = { label: subLabel, options: subOpts };
                              if (sub.optionUpcs && Object.keys(sub.optionUpcs).length > 0) {
                                  subRow.optionUpcs = sub.optionUpcs;
                              }
                              if (sub.optionPhaseouts && Object.keys(sub.optionPhaseouts).length > 0) {
                                  subRow.optionPhaseouts = sub.optionPhaseouts;
                              }
                              return [key, subRow] as const;
                          })
                          .filter(Boolean) as Array<
                          readonly [string, MenuItemDropdownSubEntry]
                      >,
                  )
                : undefined;
            const row: MenuItemDropdownGroup = { label, options };
            if (g.maxSelections != null && g.maxSelections > 1) {
                row.maxSelections = getGroupMaxSelections(g);
            }
            if (g.optionUpcs && Object.keys(g.optionUpcs).length > 0) row.optionUpcs = g.optionUpcs;
            if (g.optionPhaseouts && Object.keys(g.optionPhaseouts).length > 0) row.optionPhaseouts = g.optionPhaseouts;
            if (subDropdowns && Object.keys(subDropdowns).length > 0) row.subDropdowns = subDropdowns;
            return row;
        })
        .filter((g) => g.options.length > 0);
}

function isGroupSelectionComplete(slot: string, group: MenuItemDropdownGroup): boolean {
    const { parent, subs } = parseGroupSlotSubs(slot);
    const parents = parseGroupMultiParents(parent);
    if (parents.length === 0) return false;

    if (groupSupportsMultiSelect(group)) {
        const max = getGroupMaxSelections(group);
        if (parents.length > max) return false;
        return parents.every((p) => Boolean(canonicalPickFromGroup(group, p)));
    }

    const canonicalParent = canonicalPickFromGroup(group, parents[0] ?? parent);
    if (!canonicalParent) return false;
    const subDef = getSubDropdownEntryForOption(group, canonicalParent);
    if (!subDef) return true;
    if (isSubDropdownArray(subDef)) {
        const sortedSubDef = sortSubDropdownArrayForDisplay(subDef);
        if (subs.length < sortedSubDef.length) return false;
        return sortedSubDef.every((sg, i) => {
            const origIdx = subDef.findIndex((x) => x.label.trim() === sg.label.trim());
            const v = (subs[origIdx >= 0 ? origIdx : i] ?? '').trim();
            return v !== '' && Boolean(canonicalPickFromGroup(sg, v));
        });
    }
    if (subDef.options.length > 0) {
        const v = (subs[0] ?? '').trim();
        if (!v) return false;
        return Boolean(canonicalPickFromGroup(subDef, v));
    }
    return true;
}

/** Separates per-unit dropdown notes when quantity > 1 (portal UI). */
export const DROPDOWN_INSTANCE_SEP = '||';

export function splitDropdownInstanceNotes(note: string, qty: number): string[] {
    const q = Math.max(0, Math.floor(qty));
    if (q === 0) return [];
    const trimmed = note.trim();
    if (!trimmed) return Array(q).fill('');
    if (!trimmed.includes(DROPDOWN_INSTANCE_SEP)) {
        if (q === 1) return [trimmed];
        const out = Array(q).fill('');
        out[0] = trimmed;
        return out;
    }
    const parts = trimmed.split(DROPDOWN_INSTANCE_SEP).map((p) => p.trim());
    const out: string[] = [];
    for (let i = 0; i < q; i++) out.push(parts[i] ?? '');
    return out;
}

export function joinDropdownInstanceNotes(instances: string[]): string {
    if (instances.length === 0) return '';
    if (instances.length === 1) return instances[0].trim();
    return instances.map((s) => s.trim()).join(DROPDOWN_INSTANCE_SEP);
}

/** True when every ordered unit has a complete dropdown note (qty defaults to 1). */
export function isDropdownInstancesComplete(
    note: string,
    groups: MenuItemDropdownGroup[],
    qty = 1,
): boolean {
    const g = nonemptyDropdownGroups(groups);
    if (g.length === 0) return true;
    const q = Math.max(1, Math.floor(qty));
    const instances = splitDropdownInstanceNotes(note, q);
    return instances.every((inst) => isDropdownNoteComplete(inst, g));
}

export function nonemptyDropdownGroups(groups: MenuItemDropdownGroup[]): MenuItemDropdownGroup[] {
    return groups.filter((gr) => Array.isArray(gr.options) && gr.options.length > 0);
}

/** One-based option index within a single dropdown group (phone keypad + catalog PDF). */
export type NumberedDropdownOption = { optionNumber: number; label: string };

export function numberedDropdownOptions(options: string[]): NumberedDropdownOption[] {
    return options.map((label, i) => ({ optionNumber: i + 1, label }));
}

/** Catalog / print label, e.g. "3. Lemon Honey". */
export function formatNumberedDropdownOption(optionNumber: number, label: string): string {
    return `${optionNumber}. ${label}`;
}

/** Short IVR hint — numbers only; names live in the menu catalog PDF. */
export function dropdownOptionKeypadHint(optionCount: number): string {
    if (optionCount <= 0) return '';
    if (optionCount === 1) return 'Press 1.';
    if (optionCount === 2) return 'Press 1 or 2.';
    if (optionCount <= 5) {
        const nums = Array.from({ length: optionCount }, (_, i) => String(i + 1));
        const last = nums.pop()!;
        return `Press ${nums.join(', ')}, or ${last}.`;
    }
    return `Press 1 through ${optionCount}.`;
}

/** True when every group exposes the same options list (e.g. 14 identical juice slots). */
function groupsAllShareIdenticalOptions(groups: MenuItemDropdownGroup[]): boolean {
    if (groups.length <= 1) return false;
    const key = JSON.stringify(groups[0].options);
    return groups.every((g) => JSON.stringify(g.options) === key);
}

/**
 * Map user/model text to the exact option string from the DB list (case-insensitive, light disambiguation).
 */
export function canonicalPickFromGroup(group: MenuItemDropdownGroup, raw: string): string {
    const p = raw.trim();
    if (!p) return '';
    if (group.options.includes(p)) return p;
    const low = p.toLowerCase();
    const ciExact = group.options.find((o) => o.toLowerCase() === low);
    if (ciExact) return ciExact;

    const words = low.split(/\s+/).filter((w) => w.length >= 2);
    if (words.length > 1) {
        const hits = group.options.filter((o) => {
            const ol = o.toLowerCase();
            return words.every((w) => ol.includes(w));
        });
        if (hits.length === 1) return hits[0];
    }

    if (words.length >= 1) {
        const w = words[0];
        const starts = group.options.filter((o) => o.toLowerCase().startsWith(low));
        if (starts.length === 1) return starts[0];
        const startsWord = group.options.filter((o) => o.toLowerCase().startsWith(w));
        if (startsWord.length === 1) return startsWord[0];
        const contains = group.options.filter((o) => o.toLowerCase().includes(low));
        if (contains.length === 1) return contains[0];
        const containsWord = group.options.filter((o) => o.toLowerCase().includes(w));
        if (containsWord.length === 1) return containsWord[0];
    }

    return '';
}

/**
 * Parse one note segment as an optional count + option name, for items where every slot shares the
 * same options (e.g. 14 identical juice slots). Accepts "Apple cooler x2", "2 Apple cooler",
 * "2x Apple cooler", "Apple cooler 2". Returns null when the text doesn't map to a known option.
 */
function parseCountedOption(group: MenuItemDropdownGroup, raw: string): { option: string; count: number } | null {
    const t = raw.trim();
    if (!t) return null;
    // trailing "Name x12" / "Name *12" / "Name ×12"
    let m = t.match(/^(.*\S)\s*[x×*]\s*(\d+)$/i);
    if (m) {
        const opt = canonicalPickFromGroup(group, m[1]);
        if (opt) return { option: opt, count: parseInt(m[2], 10) };
    }
    // leading "12 Name" / "12x Name"
    m = t.match(/^(\d+)\s*[x×*]?\s+(\S.*)$/i);
    if (m) {
        const opt = canonicalPickFromGroup(group, m[2]);
        if (opt) return { option: opt, count: parseInt(m[1], 10) };
    }
    // trailing bare number "Name 12" (option names never contain digits)
    m = t.match(/^(.*\S)\s+(\d+)$/);
    if (m) {
        const opt = canonicalPickFromGroup(group, m[1]);
        if (opt) return { option: opt, count: parseInt(m[2], 10) };
    }
    // bare option, implicit count 1
    const opt = canonicalPickFromGroup(group, t);
    if (opt) return { option: opt, count: 1 };
    return null;
}

/**
 * For items where every slot shares the same options, allow a compact count note such as
 * "Apple cooler x2; Lemon Honey x12" whose counts sum to the slot count. Returns the expanded
 * per-slot array (length n), or null when the note is not an unambiguous count list summing to n.
 */
function tryExpandIdenticalSlotCounts(parts: string[], group: MenuItemDropdownGroup, n: number): string[] | null {
    if (!parts.some((p) => /\d/.test(p))) return null; // only when at least one explicit count is present
    const parsed = parts.map((p) => parseCountedOption(group, p));
    if (parsed.some((x) => x == null)) return null;
    const total = (parsed as Array<{ count: number }>).reduce((sum, x) => sum + x.count, 0);
    if (total !== n) return null;
    const out: string[] = [];
    for (const x of parsed as Array<{ option: string; count: number }>) {
        for (let i = 0; i < x.count; i++) out.push(x.option);
    }
    return out.length === n ? out : null;
}

function stripGroupLabel(raw: string, group: MenuItemDropdownGroup): string {
    const label = group.label.trim();
    const t = raw.trim();
    if (!label) return t;
    const prefix = `${label}:`;
    if (t.toLowerCase().startsWith(prefix.toLowerCase())) {
        return t.slice(prefix.length).trimStart();
    }
    return t;
}

function isTopLevelLabelBoundaryAt(
    text: string,
    idx: number,
    groups: MenuItemDropdownGroup[],
): boolean {
    for (const gr of groups) {
        const label = gr.label.trim();
        const prefix = `${label}:`;
        if (idx < 0 || idx + prefix.length > text.length) continue;
        if (text.slice(idx, idx + prefix.length).toLowerCase() !== prefix.toLowerCase()) continue;
        if (idx === 0 || text[idx - 1] === MULTI_SEP) return true;
    }
    return false;
}

/** All top-level `{label}: value` segments for one group (supports repeated labels for multi-select). */
function extractAllLabeledValuesForGroup(
    raw: string,
    group: MenuItemDropdownGroup,
    groups: MenuItemDropdownGroup[],
): string[] {
    const label = group.label.trim();
    const prefix = `${label}:`;
    const trimmed = raw.trim();
    const values: string[] = [];

    let search = 0;
    while (search < trimmed.length) {
        const idx = trimmed.toLowerCase().indexOf(prefix.toLowerCase(), search);
        if (idx === -1) break;
        if (trimmed.slice(idx, idx + prefix.length).toLowerCase() !== prefix.toLowerCase()) {
            search = idx + 1;
            continue;
        }
        if (idx !== 0 && trimmed[idx - 1] !== MULTI_SEP) {
            search = idx + 1;
            continue;
        }

        let valueStart = idx + prefix.length;
        while (valueStart < trimmed.length && trimmed[valueStart] === ' ') valueStart++;

        let valueEnd = trimmed.length;
        for (let scan = valueStart; scan < trimmed.length; ) {
            const semi = trimmed.indexOf(MULTI_SEP, scan);
            if (semi === -1) break;
            if (isTopLevelLabelBoundaryAt(trimmed, semi + 1, groups)) {
                valueEnd = semi;
                break;
            }
            scan = semi + 1;
        }

        const value = stripRepeatedGroupLabel(trimmed.slice(valueStart, valueEnd).trim(), group);
        if (value.trim()) values.push(value.trim());
        search = valueEnd < trimmed.length ? valueEnd + 1 : trimmed.length;
    }
    return values;
}

function mergeMultiSelectValuesFromLabeledSegments(
    values: string[],
    group: MenuItemDropdownGroup,
): string {
    const picks: string[] = [];
    for (const v of values) {
        const stripped = stripRepeatedGroupLabel(v, group);
        const { parent } = parseGroupSlotSubs(stripped);
        for (const p of parseGroupMultiParents(parent || stripped)) {
            const c = canonicalPickFromGroup(group, p);
            if (c) picks.push(c);
        }
    }
    const ordered = orderMultiSelectParents(group, picks);
    return formatGroupMultiParents(ordered.length > 0 ? ordered : picks);
}

function extractFirstLabeledValueForGroup(
    raw: string,
    group: MenuItemDropdownGroup,
    groups: MenuItemDropdownGroup[],
): string {
    const values = extractAllLabeledValuesForGroup(raw, group, groups);
    return values[0] ?? '';
}

/** Remove accidental repeated `{label}:` prefixes left inside a slot value after bad relabel passes. */
function stripRepeatedGroupLabel(raw: string, group: MenuItemDropdownGroup): string {
    let t = stripGroupLabel(raw, group);
    const label = group.label.trim();
    if (!label) return t;
    const prefix = `${label}:`;
    while (t.toLowerCase().startsWith(prefix.toLowerCase())) {
        t = t.slice(prefix.length).trimStart();
    }
    return t;
}

/** True when the note uses `{groupLabel}: {value}` prefixes for the first dropdown group. */
export function isLabeledDropdownNote(note: string, groups: MenuItemDropdownGroup[]): boolean {
    const g = nonemptyDropdownGroups(groups);
    if (!note.trim() || g.length === 0) return false;
    const firstLabel = g[0].label.trim();
    if (!firstLabel) return false;
    return note.trim().toLowerCase().startsWith(`${firstLabel.toLowerCase()}:`);
}

/** True when `label:` appears more than once as a top-level segment boundary. */
export function hasDuplicateLabeledGroupSegments(note: string, groups: MenuItemDropdownGroup[]): boolean {
    const g = nonemptyDropdownGroups(groups);
    const trimmed = note.trim();
    if (!trimmed || g.length === 0) return false;

    for (const gr of g) {
        if (groupSupportsMultiSelect(gr)) continue;
        const prefix = `${gr.label.trim()}:`;
        let count = 0;
        let search = 0;
        while (search < trimmed.length) {
            const idx = trimmed.toLowerCase().indexOf(prefix.toLowerCase(), search);
            if (idx === -1) break;
            if (idx === 0 || trimmed[idx - 1] === MULTI_SEP) count++;
            search = idx + 1;
        }
        if (count > 1) return true;
    }
    return false;
}

/** True when a decoded slot still embeds another group's `label:` text (parser bleed). */
export function hasEmbeddedLabeledGroupSegments(note: string, groups: MenuItemDropdownGroup[]): boolean {
    const g = nonemptyDropdownGroups(groups);
    if (!note.trim() || g.length < 2) return false;
    const slots = splitLabeledTopLevelSlots(note, g);
    for (let i = 0; i < slots.length; i++) {
        const slot = slots[i] ?? '';
        if (!slot.trim()) continue;
        for (let j = 0; j < g.length; j++) {
            if (i === j) continue;
            const other = `${g[j].label.trim()}:`;
            if (other && slot.toLowerCase().includes(other.toLowerCase())) return true;
        }
    }
    return false;
}

export function isCorruptedLabeledDropdownNote(note: string, groups: MenuItemDropdownGroup[]): boolean {
    const trimmed = note.trim();
    if (!trimmed) return false;
    if (trimmed.length > 2000) return true;
    if (hasDuplicateLabeledGroupSegments(trimmed, groups)) return true;
    if (hasEmbeddedLabeledGroupSegments(trimmed, groups)) return true;
    if (/([A-Za-z0-9 /#]+:)\s*\1/.test(trimmed)) return true;
    return false;
}

/** For repair: best top-level value per group label (merges repeated labels for multi-select). */
function extractBestLabeledSlotValues(raw: string, groups: MenuItemDropdownGroup[]): string[] {
    const g = nonemptyDropdownGroups(groups);
    return g.map((gr) => {
        if (groupSupportsMultiSelect(gr)) {
            const vals = extractAllLabeledValuesForGroup(raw, gr, g);
            return vals.length > 0 ? mergeMultiSelectValuesFromLabeledSegments(vals, gr) : '';
        }
        return extractFirstLabeledValueForGroup(raw, gr, g);
    });
}

/**
 * Parse labeled notes in catalog order. Multi-select groups merge repeated `{label}:` segments.
 */
function splitLabeledTopLevelSlots(raw: string, groups: MenuItemDropdownGroup[]): string[] {
    const g = nonemptyDropdownGroups(groups);
    if (g.length === 0) return [];
    if (g.length === 1) {
        const gr = g[0];
        if (groupSupportsMultiSelect(gr)) {
            const vals = extractAllLabeledValuesForGroup(raw, gr, g);
            if (vals.length === 0) return [''];
            return [mergeMultiSelectValuesFromLabeledSegments(vals, gr)];
        }
        return [stripGroupLabel(raw, gr)];
    }

    return g.map((gr) => {
        if (groupSupportsMultiSelect(gr)) {
            const vals = extractAllLabeledValuesForGroup(raw, gr, g);
            return vals.length > 0 ? mergeMultiSelectValuesFromLabeledSegments(vals, gr) : '';
        }
        return extractFirstLabeledValueForGroup(raw, gr, g);
    });
}

/** Stored note for multi-dropdown items; semicolon-separated group slots. When groups are provided, each slot is prefixed with the group label (e.g. "Side Dish: Chicken Finger Mixed"). Multi-select groups repeat the label per choice (e.g. "Bakery: Bread; Bakery: Roll"). */
export function encodeDropdownSelections(
    selections: string[],
    groups?: MenuItemDropdownGroup[],
): string {
    const n = selections.length;
    if (n === 0) return '';
    const trimmed = selections.map((s) => s.trim());
    if (trimmed.every((s) => !s)) return '';

    const g = groups ? nonemptyDropdownGroups(groups) : [];
    const useLabels = g.length > 0 && g.length === trimmed.length;

    const segments: string[] = [];
    for (let i = 0; i < trimmed.length; i++) {
        const slot = trimmed[i].trim();
        if (!slot) continue;

        if (useLabels) {
            const label = g[i].label.trim() || 'Option';
            if (groupSupportsMultiSelect(g[i])) {
                const { parent } = parseGroupSlotSubs(slot);
                const picks = parseGroupMultiParents(parent || slot);
                for (const pick of picks) {
                    const canon = canonicalPickFromGroup(g[i], pick);
                    if (canon) segments.push(`${label}: ${canon}`);
                }
                continue;
            }
            segments.push(`${label}: ${slot}`);
            continue;
        }

        if (slot) segments.push(slot);
    }

    if (useLabels) {
        if (segments.length === 0) return '';
        return segments.join(MULTI_SEP);
    }

    if (segments.every((s) => !s)) return '';
    if (segments.length === 1) return segments[0];
    return segments.join(MULTI_SEP);
}

/** If the note contains `;`, use semicolon slots (current). Otherwise split on comma for legacy orders. */
function splitMultiDropdownNote(raw: string): string[] {
    return raw.includes(MULTI_SEP)
        ? raw.split(MULTI_SEP).map((p) => p.trim())
        : raw.split(',').map((p) => p.trim());
}

/** Split top-level group slots when sub-selections also use semicolons (e.g. Monday>a;b;c;Friday>d;e). */
export function splitTopLevelGroupSlots(raw: string, groupCount: number): string[] {
    if (!raw.includes(SUB_DROPDOWN_SEP)) return splitMultiDropdownNote(raw);

    const slots: string[] = [];
    let i = 0;
    while (slots.length < groupCount && i < raw.length) {
        const gt = raw.indexOf(SUB_DROPDOWN_SEP, i);
        if (gt === -1) {
            slots.push(raw.slice(i).trim());
            break;
        }
        let end = raw.length;
        let j = gt + 1;
        while (j < raw.length) {
            const semi = raw.indexOf(MULTI_SEP, j);
            if (semi === -1) break;
            const nextGt = raw.indexOf(SUB_DROPDOWN_SEP, semi + 1);
            if (nextGt === -1) break;
            const between = raw.slice(semi + 1, nextGt);
            if (!between.includes(MULTI_SEP)) {
                end = semi;
                break;
            }
            j = semi + 1;
        }
        slots.push(raw.slice(i, end).trim());
        i = end < raw.length ? end + 1 : raw.length;
    }
    while (slots.length < groupCount) slots.push('');
    return slots.slice(0, groupCount);
}

function resolveGroupSlot(slot: string, group: MenuItemDropdownGroup): string {
    const raw = slot.trim();
    if (!raw) return '';
    const canonical = canonicalizeGroupSlot(raw, group);
    return canonical || raw;
}

export function decodeDropdownSelections(note: string, groups: MenuItemDropdownGroup[]): string[] {
    const g = nonemptyDropdownGroups(groups);
    const n = g.length;
    if (n === 0) return [];
    const raw = note.trim();
    if (/^;+$/.test(raw)) return Array(n).fill('');

    if (n === 1) {
        if (!raw) return [''];
        if (isLabeledDropdownNote(raw, g)) {
            if (groupSupportsMultiSelect(g[0])) {
                const vals = extractAllLabeledValuesForGroup(raw, g[0], g);
                if (vals.length === 0) return [''];
                return [resolveGroupSlot(mergeMultiSelectValuesFromLabeledSegments(vals, g[0]), g[0])];
            }
            const slot = stripGroupLabel(raw, g[0]);
            return [resolveGroupSlot(slot, g[0])];
        }
        return [resolveGroupSlot(raw, g[0])];
    }

    if (!raw) return Array(n).fill('');

    const parts = isLabeledDropdownNote(raw, g)
        ? splitLabeledTopLevelSlots(raw, g)
        : raw.includes(SUB_DROPDOWN_SEP)
          ? splitTopLevelGroupSlots(raw, n)
          : splitMultiDropdownNote(raw);

    // Compact count form for identical slots, e.g. "Apple cooler x2; Lemon Honey x12" → 14 picks.
    // Cheaper for the model to write and far less error-prone than repeating a value 14 times.
    if (groupsAllShareIdenticalOptions(g)) {
        const counted = tryExpandIdenticalSlotCounts(parts, g[0], n);
        if (counted) return counted;
    }

    // Model sometimes sends extra segments (e.g. marketing "14 juices" vs fewer JSON slots). If the first
    // N segments each map to a valid option for slot i, or all segments match one option on identical slot menus, trim.
    if (parts.length > n) {
        const head = parts.slice(0, n);
        const decHead = head.map((p, i) => canonicalPickFromGroup(g[i], p));
        if (decHead.every(Boolean)) {
            return decHead as string[];
        }
        if (groupsAllShareIdenticalOptions(g)) {
            const c0 = canonicalPickFromGroup(g[0], parts[0] ?? '');
            if (c0 && parts.every((p) => canonicalPickFromGroup(g[0], p) === c0)) {
                return Array(n).fill(c0);
            }
        }
    }

    // Same options for every slot (e.g. 14 juice picks): one value repeats for all groups.
    if (groupsAllShareIdenticalOptions(g) && parts.length === 1) {
        const c = canonicalPickFromGroup(g[0], parts[0] ?? '');
        if (c) return Array(n).fill(c);
    }

    if (parts.length === n) {
        return g.map((gr, i) => resolveGroupSlot(parts[i] ?? '', gr));
    }

    const out = Array(n).fill('');
    for (let i = 0; i < Math.min(n, parts.length); i++) {
        out[i] = resolveGroupSlot(parts[i] ?? '', g[i]);
    }
    return out;
}

/** True when `note` encodes one valid choice for every non-empty dropdown group (same rules as the portal). */
export function isDropdownNoteComplete(note: string, groups: MenuItemDropdownGroup[]): boolean {
    const g = groups.filter((gr) => Array.isArray(gr.options) && gr.options.length > 0);
    if (g.length === 0) return true;
    const parts = decodeDropdownSelections(note, g);
    return g.every((gr, i) => isGroupSelectionComplete(parts[i] ?? '', gr));
}

/** Normalize a `menu_items` DB row → portal-shaped `dropdown_groups` (empty if dropdown off). */
export function dropdownGroupsForDbMenuRow(row: {
    id?: string;
    dropdown_enabled?: boolean | null;
    dropdown_options?: unknown;
}): MenuItemDropdownGroup[] {
    if (!row.dropdown_enabled) return [];
    const synthetic = {
        id: row.id ?? '',
        vendorId: '',
        name: '',
        value: 1,
        isActive: true,
        dropdownOptions: row.dropdown_options ?? null,
        dropdownGroups: dropdownGroupsFromDb(row.dropdown_options),
    } as MenuItem;
    return getMenuItemDropdownGroups(synthetic);
}

/** Enforce complete dropdown notes for vendor food lines before save (SMS + Retell). */
export function validateVendorLineItemDropdownNotes(args: {
    items: Record<string, number>;
    noteByItemId: Record<string, string>;
    itemDropdownGroups: Map<string, MenuItemDropdownGroup[]>;
    itemNameById: Map<string, string>;
}): { ok: true } | { ok: false; message: string } {
    for (const itemId of Object.keys(args.items)) {
        const qty = args.items[itemId] ?? 0;
        if (qty <= 0) continue;
        const groups = nonemptyDropdownGroups(args.itemDropdownGroups.get(itemId) ?? []);
        if (groups.length === 0) continue;
        const note = args.noteByItemId[itemId] ?? '';
        if (!isDropdownInstancesComplete(note, groups, qty)) {
            const n = args.itemNameById.get(itemId) ?? 'That item';
            const ordered = groups.map((g, i) => `${i + 1}) "${g.label}"`).join('; ');
            const sameOpts = groupsAllShareIdenticalOptions(groups);
            const hint = sameOpts
                ? ` When every slot shares the same option list, you do NOT have to repeat a value ${groups.length} times: send one choice once (no semicolons) to apply it to every slot, OR send counts that add up to ${groups.length}, e.g. "Apple cooler x2; Lemon Honey x12". The "deliver N twice weekly" cadence in the name is NOT the slot count — the slot count is exactly ${groups.length}. Each value must match one option string from the tool JSON (spelling/casing can be normalized).`
                : '';
            return {
                ok: false,
                message: `${n} has ${groups.length} named dropdown group(s) in this exact order: ${ordered}. The customer must pick one allowed option per group. The line note must include each group label followed by the chosen option, separated by semicolons in that same order (e.g. Side Dish: Chicken Finger Mixed;Vegetable: Grilled Vegetables), unless every slot shares the same options list (then one repeated value is allowed). Each value must match one of that group's options from the tool JSON.${hint}`,
            };
        }
    }
    return { ok: true };
}

function labelDropdownInstance(inst: string, groups: MenuItemDropdownGroup[]): string {
    const raw = inst.trim();
    const g = nonemptyDropdownGroups(groups);
    if (!raw || g.length === 0) return raw;

    if (isLabeledDropdownNote(raw, g)) {
        const decoded = decodeDropdownSelections(raw, g);
        return encodeDropdownSelections(decoded, g);
    }

    const parts = raw.includes(SUB_DROPDOWN_SEP)
        ? splitTopLevelGroupSlots(raw, g.length)
        : splitMultiDropdownNote(raw);

    if (parts.length === g.length) {
        const cleaned = parts.map((part, i) => stripRepeatedGroupLabel(stripGroupLabel(part, g[i]), g[i]));
        return encodeDropdownSelections(cleaned, g);
    }

    const decoded = decodeDropdownSelections(raw, g);
    const merged = g.map((_, i) => {
        const fromDecode = stripRepeatedGroupLabel(decoded[i] ?? '', g[i]);
        if (fromDecode) return fromDecode;
        return stripRepeatedGroupLabel(stripGroupLabel(parts[i] ?? '', g[i]), g[i]);
    });
    return encodeDropdownSelections(merged, g);
}

/**
 * Rewrite dropdown note to canonical option spelling with group labels on each slot.
 * Supports legacy unlabeled notes and is idempotent on already-labeled notes.
 * Preserves raw slot text when option strings do not exactly match the catalog (e.g. "Chicken Nuggets").
 */
export function labelDropdownNoteForStorage(
    note: string,
    groups: MenuItemDropdownGroup[],
    qty = 1,
): string {
    const g = nonemptyDropdownGroups(groups);
    const trimmed = note.trim();
    if (!trimmed || g.length === 0) return trimmed;
    const q = Math.max(1, Math.floor(qty));
    const instances = splitDropdownInstanceNotes(trimmed, q);
    return joinDropdownInstanceNotes(instances.map((inst) => labelDropdownInstance(inst, g)));
}

/**
 * After validation passes, rewrite the note to canonical option spelling and labeled semicolon encoding
 * (e.g. expand one pick across identical multi-slot dropdowns).
 */
/** Re-encode a labeled dropdown note using first-hit parsing (drops duplicate top-level segments). */
export function repairCorruptedDropdownNote(
    note: string,
    groups: MenuItemDropdownGroup[],
    qty = 1,
): string {
    const g = nonemptyDropdownGroups(groups);
    const trimmed = note.trim();
    if (!trimmed || g.length === 0) return trimmed;
    const q = Math.max(1, Math.floor(qty));
    const instances = splitDropdownInstanceNotes(trimmed, q);
    const repaired = instances.map((inst) => {
        const part = inst.trim();
        if (!part) return '';
        const slots = isCorruptedLabeledDropdownNote(part, g)
            ? extractBestLabeledSlotValues(part, g)
            : splitLabeledTopLevelSlots(part, g);
        return encodeDropdownSelections(slots, g);
    });
    return joinDropdownInstanceNotes(repaired);
}

export function normalizeDropdownNoteForStorage(
    note: string,
    groups: MenuItemDropdownGroup[],
    qty = 1,
): string {
    const trimmed = note.trim();
    if (!trimmed) return trimmed;
    const g = nonemptyDropdownGroups(groups);
    const q = Math.max(1, Math.floor(qty));
    const candidate =
        isCorruptedLabeledDropdownNote(trimmed, g) ? repairCorruptedDropdownNote(trimmed, g, q) : trimmed;
    if (!isDropdownInstancesComplete(candidate, g, q)) return candidate;
    return labelDropdownNoteForStorage(candidate, g, q);
}

export type DropdownDeliveryLine = {
    upc: string | null;
    description: string;
    qty: number;
    note: string;
};

function formatDeliveryContextNote(
    parentItemName: string,
    groupLabel: string,
    parentChoice?: string,
    subGroupLabel?: string,
): string {
    const parts = [parentItemName.trim(), groupLabel.trim()];
    if (parentChoice?.trim()) parts.push(parentChoice.trim());
    if (subGroupLabel?.trim()) parts.push(subGroupLabel.trim());
    return parts.filter(Boolean).join(' > ');
}

/**
 * Expand a dropdown order note into per-selection delivery lines for vendor JSON export.
 * UPCs are resolved from catalog optionUpcs; order notes stay label-only.
 */
export function expandDropdownNoteToDeliveryLines(
    note: string,
    groups: MenuItemDropdownGroup[],
    parentItemName: string,
    lineQty = 1,
): DropdownDeliveryLine[] {
    const g = nonemptyDropdownGroups(groups);
    if (g.length === 0) return [];
    const qty = Math.max(1, Math.floor(lineQty) || 1);
    const selections = decodeDropdownSelections(note, g);
    const lines: DropdownDeliveryLine[] = [];

    for (let gi = 0; gi < g.length; gi++) {
        const group = g[gi];
        const slot = (selections[gi] ?? '').trim();
        if (!slot) continue;
        const groupLabel = group.label.trim() || 'Option';
        const { parent, subs } = parseGroupSlotSubs(slot);
        const parents = groupSupportsMultiSelect(group)
            ? parseGroupMultiParents(parent)
            : [parent].filter(Boolean);

        for (const parentPick of parents) {
            const parentChoice = canonicalPickFromGroup(group, parentPick);
            if (!parentChoice) continue;

            const subEntry = getSubDropdownEntryForOption(group, parentChoice);

            if (subEntry && isSubDropdownArray(subEntry)) {
                const sortedSubEntry = sortSubDropdownArrayForDisplay(subEntry);
                for (let si = 0; si < sortedSubEntry.length; si++) {
                    const subGroup = sortedSubEntry[si];
                    const origIdx = subEntry.findIndex((x) => x.label.trim() === subGroup.label.trim());
                    const subPick = (subs[origIdx >= 0 ? origIdx : si] ?? '').trim();
                    if (!subPick) continue;
                    const subLabel = canonicalPickFromGroup(subGroup, subPick);
                    if (!subLabel) continue;
                    lines.push({
                        upc: getSubDropdownOptionUpc(subGroup, subLabel),
                        description: subLabel,
                        qty,
                        note: formatDeliveryContextNote(
                            parentItemName,
                            groupLabel,
                            parentChoice,
                            subGroup.label,
                        ),
                    });
                }
                continue;
            }

            if (subEntry && !isSubDropdownArray(subEntry)) {
                const subPick = (subs[0] ?? '').trim();
                if (subPick) {
                    const subLabel = canonicalPickFromGroup(subEntry, subPick);
                    if (subLabel) {
                        lines.push({
                            upc: getSubDropdownOptionUpc(subEntry, subLabel),
                            description: subLabel,
                            qty,
                            note: formatDeliveryContextNote(parentItemName, groupLabel, parentChoice),
                        });
                        continue;
                    }
                }
                lines.push({
                    upc: getDropdownOptionUpc(group, parentChoice),
                    description: parentChoice,
                    qty,
                    note: formatDeliveryContextNote(parentItemName, groupLabel),
                });
                continue;
            }

            lines.push({
                upc: getDropdownOptionUpc(group, parentChoice),
                description: parentChoice,
                qty,
                note: formatDeliveryContextNote(parentItemName, groupLabel),
            });
        }
    }

    return lines;
}

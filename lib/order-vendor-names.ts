import type { SupabaseClient } from '@supabase/supabase-js';

function addVendorName(
    names: Set<string>,
    vendorIds: Set<string>,
    name: string | null | undefined,
    vendorId: string | null | undefined,
) {
    const trimmed = (name ?? '').trim();
    if (trimmed) {
        names.add(trimmed);
        return;
    }
    if (vendorId) vendorIds.add(vendorId);
}

function collectVendorRows(
    names: Set<string>,
    vendorIds: Set<string>,
    rows: Array<{ vendor_id: string | null; vendors?: { name: string | null } | { name: string | null }[] | null }> | null,
) {
    for (const row of rows ?? []) {
        const vendor = Array.isArray(row.vendors) ? row.vendors[0] : row.vendors;
        addVendorName(names, vendorIds, vendor?.name, row.vendor_id);
    }
}

function vendorIdFromNotes(notes: unknown): string | null {
    if (!notes) return null;
    try {
        const parsed = typeof notes === 'string' ? JSON.parse(notes) : notes;
        const vid = parsed?.vendorId ?? parsed?.vendor_id;
        return typeof vid === 'string' && vid.trim() ? vid.trim() : null;
    } catch {
        return null;
    }
}

function vendorNameFromNotes(notes: unknown): string | null {
    if (!notes) return null;
    try {
        const parsed = typeof notes === 'string' ? JSON.parse(notes) : notes;
        const name = parsed?.vendorName ?? parsed?.vendor_name;
        return typeof name === 'string' && name.trim() ? name.trim() : null;
    } catch {
        return null;
    }
}

async function resolveVendorIds(supabase: SupabaseClient, vendorIds: Set<string>): Promise<string[]> {
    if (vendorIds.size === 0) return [];
    const { data: vendors } = await supabase.from('vendors').select('id, name').in('id', Array.from(vendorIds));
    return (vendors ?? []).map((v) => (v.name ?? '').trim()).filter(Boolean);
}

/** Sorted unique vendor display names for an order (food, boxes, equipment). */
export async function fetchOrderVendorNames(supabase: SupabaseClient, orderId: string): Promise<string[]> {
    const names = new Set<string>();
    const unresolvedVendorIds = new Set<string>();

    const [{ data: ovs }, { data: obs }, { data: order }] = await Promise.all([
        supabase.from('order_vendor_selections').select('vendor_id, vendors(name)').eq('order_id', orderId),
        supabase.from('order_box_selections').select('vendor_id, vendors(name)').eq('order_id', orderId),
        supabase.from('orders').select('notes').eq('id', orderId).maybeSingle(),
    ]);

    collectVendorRows(names, unresolvedVendorIds, ovs);
    collectVendorRows(names, unresolvedVendorIds, obs);

    const notesVendorName = vendorNameFromNotes(order?.notes);
    if (notesVendorName) names.add(notesVendorName);
    const notesVendorId = vendorIdFromNotes(order?.notes);
    if (notesVendorId) unresolvedVendorIds.add(notesVendorId);

    if (names.size === 0) {
        const { data: upcoming } = await supabase
            .from('upcoming_orders')
            .select('id')
            .eq('processed_order_id', orderId)
            .maybeSingle();

        const upcomingOrderIds = upcoming?.id ? [upcoming.id] : [];
        if (upcomingOrderIds.length > 0) {
            const [{ data: uovs }, { data: uobs }] = await Promise.all([
                supabase
                    .from('upcoming_order_vendor_selections')
                    .select('vendor_id, vendors(name)')
                    .in('upcoming_order_id', upcomingOrderIds),
                supabase
                    .from('upcoming_order_box_selections')
                    .select('vendor_id, vendors(name)')
                    .in('upcoming_order_id', upcomingOrderIds),
            ]);
            collectVendorRows(names, unresolvedVendorIds, uovs);
            collectVendorRows(names, unresolvedVendorIds, uobs);
        }
    }

    for (const name of await resolveVendorIds(supabase, unresolvedVendorIds)) {
        names.add(name);
    }

    return [...names].sort();
}

export function formatVendorLabel(vendorNames: string[]): string | null {
    const unique = [...new Set(vendorNames.map((n) => n.trim()).filter(Boolean))].sort();
    return unique.length > 0 ? unique.join(', ') : null;
}

/** Spoken phrase for IVR / voice, e.g. " vendor FISHPOND" or " vendor A and B". */
export function spokenVendorPhrase(vendorNames: string[]): string {
    const label = formatVendorLabel(vendorNames);
    return label ? ` vendor ${label}` : '';
}

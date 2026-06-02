import { NextResponse } from 'next/server';
import { requireAdminMessaging } from '@/lib/messaging/require-admin';
import { getMessagingSupabase } from '@/lib/messaging/supabase-admin';
import type { MessagingCatalog } from '@/lib/messaging/types';

export async function GET() {
    const auth = await requireAdminMessaging();
    if (!auth.ok) {
        return NextResponse.json({ error: auth.msg }, { status: auth.status });
    }

    try {
        const supabase = getMessagingSupabase();

        const [vendorsRes, menuItemsRes, breakfastRes, boxItemsRes] = await Promise.all([
            supabase.from('vendors').select('id, name').order('name'),
            supabase.from('menu_items').select('id, name, vendor_id, vendors(name)').eq('is_active', true).order('name'),
            supabase.from('breakfast_items').select('id, name').order('name'),
            supabase
                .from('menu_items')
                .select('id, name, item_number')
                .is('vendor_id', null)
                .eq('is_active', true)
                .order('name'),
        ]);

        if (vendorsRes.error) throw vendorsRes.error;
        if (menuItemsRes.error) throw menuItemsRes.error;
        if (breakfastRes.error) throw breakfastRes.error;
        if (boxItemsRes.error) throw boxItemsRes.error;

        const vendorNameById = new Map((vendorsRes.data ?? []).map((v) => [v.id, v.name]));

        const catalog: MessagingCatalog = {
            vendors: (vendorsRes.data ?? []).map((v) => ({ id: v.id, name: v.name })),
            menuItems: (menuItemsRes.data ?? []).map((mi) => {
                const vendorJoin = mi.vendors as { name?: string } | { name?: string }[] | null;
                const vendorName = Array.isArray(vendorJoin)
                    ? vendorJoin[0]?.name
                    : vendorJoin?.name ?? vendorNameById.get(mi.vendor_id) ?? 'Unknown';
                return {
                    id: mi.id,
                    name: mi.name,
                    vendorId: mi.vendor_id,
                    vendorName: vendorName ?? 'Unknown',
                };
            }),
            breakfastItems: (breakfastRes.data ?? []).map((bi) => ({ id: bi.id, name: bi.name })),
            boxItems: (boxItemsRes.data ?? []).map((bi) => ({
                id: bi.id,
                name: bi.name,
                itemNumber: bi.item_number ?? null,
            })),
        };

        return NextResponse.json(catalog);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Failed to load catalog';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

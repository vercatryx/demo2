'use server';

import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { supabase } from './supabase';
import type { DemoBoxLayoutConfig as BoxMenuLayoutConfig } from '@/components/admin/box-selector-demo/constants';

function handleError(error: { message: string; code?: string } | null) {
    if (error) throw new Error(error.message);
}

function getBoxMenuLayoutDbClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return supabase;
    return createClient(url, key, { auth: { persistSession: false } });
}

export async function getBoxMenuLayoutConfig(): Promise<BoxMenuLayoutConfig | null> {
    const db = getBoxMenuLayoutDbClient();
    const { data, error } = await db.from('box_menu_layout_configs').select('config').eq('id', 1).maybeSingle();
    handleError(error);
    return (data?.config as BoxMenuLayoutConfig | null) ?? null;
}

export async function upsertBoxMenuLayoutConfig(config: BoxMenuLayoutConfig): Promise<void> {
    const db = getBoxMenuLayoutDbClient();
    const payload: BoxMenuLayoutConfig = {
        orderedCategoryIds: Array.isArray(config?.orderedCategoryIds) ? config.orderedCategoryIds : [],
        subMenusByCategory: config?.subMenusByCategory && typeof config.subMenusByCategory === 'object' ? config.subMenusByCategory : {},
        itemSubMenuByItemId:
            config?.itemSubMenuByItemId && typeof config.itemSubMenuByItemId === 'object' ? config.itemSubMenuByItemId : {},
    };
    const { error } = await db.from('box_menu_layout_configs').upsert(
        { id: 1, config: payload, updated_at: new Date().toISOString() },
        { onConflict: 'id' }
    );
    handleError(error);
    revalidatePath('/admin');
}

/** Demo: no global locations table — return empty for Assign Vendors UI. */
export async function getGlobalLocations(): Promise<{ id: string; name: string }[]> {
    return [];
}

export async function massAssignVendorToBoxOrders(
    assignments: { clientId: string; mealTypeKeys: string[] }[],
    vendorId: string
): Promise<{ success: boolean; results?: { clientId: string; success: boolean; error?: string }[]; error?: string }> {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return { success: false, error: 'Database not configured' };
    const { getSession } = await import('./session');
    const session = await getSession();
    if (!session) return { success: false, error: 'Unauthorized' };

    const supabaseAdmin = createClient(url, key, { auth: { persistSession: false } });
    const results: { clientId: string; success: boolean; error?: string }[] = [];

    for (const { clientId, mealTypeKeys } of assignments) {
        try {
            const { data: client, error: fetchError } = await supabaseAdmin
                .from('clients')
                .select('upcoming_order')
                .eq('id', clientId)
                .single();

            if (fetchError || !client) {
                results.push({ clientId, success: false, error: 'Client not found' });
                continue;
            }

            const upcomingOrder = client.upcoming_order as Record<string, unknown> | null;
            if (!upcomingOrder) {
                results.push({ clientId, success: false, error: 'No upcoming order' });
                continue;
            }

            let updated = false;

            if (upcomingOrder.serviceType === 'Boxes' && Array.isArray(upcomingOrder.boxOrders)) {
                upcomingOrder.boxOrders = (upcomingOrder.boxOrders as Record<string, unknown>[]).map((bo) => {
                    updated = true;
                    return { ...bo, vendorId };
                });
            }

            if (upcomingOrder.mealSelections && mealTypeKeys.length > 0) {
                const mealSelections = upcomingOrder.mealSelections as Record<string, { vendorId?: string }>;
                for (const mealType of mealTypeKeys) {
                    if (mealSelections[mealType]) {
                        mealSelections[mealType].vendorId = vendorId;
                        updated = true;
                    }
                }
            }

            if (!updated) {
                results.push({ clientId, success: true });
                continue;
            }

            const { error: updateError } = await supabaseAdmin
                .from('clients')
                .update({ upcoming_order: upcomingOrder, updated_at: new Date().toISOString() })
                .eq('id', clientId);

            if (updateError) {
                results.push({ clientId, success: false, error: updateError.message });
            } else {
                results.push({ clientId, success: true });
            }
        } catch (err: unknown) {
            results.push({
                clientId,
                success: false,
                error: err instanceof Error ? err.message : 'Unknown error',
            });
        }
    }

    revalidatePath('/clients');
    revalidatePath('/assign-vendors');
    return { success: true, results };
}

export async function stripCatalogItemFromAllClientsUpcomingOrders(
    _itemId: string,
    _kind: 'menu' | 'meal'
): Promise<{ success: true; clientsScanned: number; clientsUpdated: number } | { success: false; error: string }> {
    return { success: true, clientsScanned: 0, clientsUpdated: 0 };
}

export async function stripVendorFromAllClientsUpcomingOrders(
    _vendorId: string
): Promise<{ success: true; clientsScanned: number; clientsUpdated: number } | { success: false; error: string }> {
    return { success: true, clientsScanned: 0, clientsUpdated: 0 };
}

export async function deleteOrder(orderId: string): Promise<{ success: boolean; message?: string }> {
    if (!orderId) return { success: false, message: 'Order ID is required' };
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return { success: false, message: 'Database not configured' };
    const admin = createClient(url, key, { auth: { persistSession: false } });

    const { data: vendorSelections } = await admin.from('order_vendor_selections').select('id').eq('order_id', orderId);
    if (vendorSelections?.length) {
        const vsIds = vendorSelections.map((vs) => vs.id);
        await admin.from('order_items').delete().in('vendor_selection_id', vsIds);
        await admin.from('order_vendor_selections').delete().eq('order_id', orderId);
    }
    await admin.from('order_box_selections').delete().eq('order_id', orderId);
    const { error } = await admin.from('orders').delete().eq('id', orderId);
    if (error) return { success: false, message: error.message };
    revalidatePath('/orders');
    return { success: true };
}

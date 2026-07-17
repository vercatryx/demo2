'use server';

/**
 * Server actions needed by Portal v2 that don't already live in `lib/actions.ts`
 * or `lib/merge-triangle-actions.ts`. Kept in a separate file (rather than the
 * ~14k-line `lib/actions.ts`) to minimize merge risk. Import directly from this
 * module (not re-exported from `lib/actions.ts` — see note in that file).
 */

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { getSupabaseServerSecretKey } from './supabase-env';
import { getSession } from './session';
import {
    normalizeFoodMenuLayoutConfig,
    type FoodMenuLayoutConfig,
} from './food/food-menu-layout';
import { withDefaultPortalHomeBlocks, parsePortalHomeBlocks, type PortalHomeBlock } from './portal-home-blocks';
import { parsePortalFeaturedSectionNames, type PortalFeaturedSectionNames } from './portal-featured-items';
import { parsePortalHomeLayoutOrder, type PortalHomeLayoutOrder } from './portal-home-layout';
import { resolveClientLoginMaintenanceMessage } from './client-login-maintenance';
import { normalizeUpcomingOrder, normalizeUpcomingOrderJson } from './upcoming-order-converter';
import { getPortalSaveSeq } from './portal-save-seq';
import type { OrderHistorySource } from './order-history-source';

function handleError(error: { message: string } | null): void {
    if (error) throw new Error(error.message);
}

function getServiceSupabaseClient(): SupabaseClient {
    const serviceKey = getSupabaseServerSecretKey();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (url && serviceKey) {
        return createClient(url, serviceKey, { auth: { persistSession: false } });
    }
    return supabase as unknown as SupabaseClient;
}

// --- Food menu layout (submenus / hero images / vendor ordering) ---

export async function getFoodMenuLayoutConfig(): Promise<FoodMenuLayoutConfig | null> {
    const db = getServiceSupabaseClient();
    const { data, error } = await db
        .from('food_menu_layout_configs')
        .select('config')
        .eq('id', 1)
        .maybeSingle();
    if (error) {
        console.error('[getFoodMenuLayoutConfig]', error.message);
        return null;
    }
    return normalizeFoodMenuLayoutConfig((data?.config as FoodMenuLayoutConfig | null) ?? null);
}

export async function upsertFoodMenuLayoutConfig(config: FoodMenuLayoutConfig): Promise<void> {
    const db = getServiceSupabaseClient();
    const normalized = normalizeFoodMenuLayoutConfig(config);
    const payload: FoodMenuLayoutConfig = normalized ?? {
        orderedVendorIds: [],
        subMenusByVendor: {},
        itemSubMenuByItemId: {},
        sectionHeroImages: {},
    };
    const { error } = await db
        .from('food_menu_layout_configs')
        .upsert(
            { id: 1, config: payload, updated_at: new Date().toISOString() },
            { onConflict: 'id' },
        );
    handleError(error);
    revalidatePath('/admin');
}

// --- Portal autosave: save-token probe + best-effort history sync ---

/**
 * Lightweight probe the portal polls to detect whether a newer save has already
 * landed (so a slow in-flight autosave doesn't clobber it). Reads the save-seq
 * token embedded in `clients.upcoming_order` by `lib/portal-save-seq.ts`.
 */
export async function getPortalSaveProbe(
    clientId: string,
): Promise<{ saveSeq: number; updatedAt: string | null }> {
    const { data, error } = await supabase
        .from('clients')
        .select('updated_at, upcoming_order')
        .eq('id', clientId)
        .maybeSingle();
    handleError(error);
    const row = data as { updated_at?: string | null; upcoming_order?: unknown } | null;
    const seq = getPortalSaveSeq(row?.upcoming_order);
    return {
        saveSeq: seq > 0 ? seq : 0,
        updatedAt: row?.updated_at ?? null,
    };
}

/**
 * demo-food has no `clients.order_history` JSONB snapshot column (Triangle's rich
 * order-history mechanism) — it uses a separate lightweight `order_history` audit
 * table instead (id, client_id, who, summary, timestamp, change_kind). This syncs
 * that table with a one-line summary whenever the saved upcoming_order actually
 * changed, so portal autosave / session-end flushes still leave an audit trail,
 * without requiring a schema fork of the richer Triangle shape.
 */
export async function syncOrderHistoryIfStale(
    clientId: string,
    upcomingOrder: unknown,
    options?: {
        portalSession?: boolean;
        savedFrom?: OrderHistorySource;
    },
): Promise<boolean> {
    if (!clientId) return false;
    const normalized = normalizeUpcomingOrderJson(normalizeUpcomingOrder(upcomingOrder as any));
    if (!normalized || typeof normalized !== 'object') return false;

    try {
        const { data: lastRows } = await supabase
            .from('order_history')
            .select('summary')
            .eq('client_id', clientId)
            .order('timestamp', { ascending: false })
            .limit(1);
        const lastSummary = lastRows?.[0]?.summary as string | undefined;

        const serviceType = ((normalized as Record<string, unknown>).serviceType || 'Food') as string;
        const portalSession = options?.portalSession === true;
        const summary = portalSession
            ? `Client portal session saved (${serviceType})`
            : `Client portal saved (${serviceType})`;

        // Without a stored snapshot to diff against, fall back to summary-string
        // dedupe so rapid portal autosaves don't spam the audit trail.
        if (lastSummary && lastSummary === summary) return false;

        const session = await getSession();
        const who = portalSession
            ? `${session?.name || 'Client'} (portal session)`
            : `${session?.name || 'Client'} (portal)`;

        const { error } = await supabase.from('order_history').insert([
            {
                id: randomUUID(),
                client_id: clientId,
                who,
                summary,
                timestamp: new Date().toISOString(),
                change_kind: 'client_updated',
            },
        ]);
        if (error) {
            console.warn('[syncOrderHistoryIfStale] insert failed:', error.message);
            return false;
        }
        return true;
    } catch (err) {
        console.warn('[syncOrderHistoryIfStale] failed:', err);
        return false;
    }
}

// --- Portal home config (blocks / featured sections / layout order / login maintenance) ---

// Not exported: Next's "use server" action-manifest builder tries to register every
// module-level export (even type-only ones) as a callable action id, which breaks
// the build. Nothing outside this file currently needs this type by name.
type ClientPortalAdminSettings = {
    clientLoginMaintenanceMode: boolean;
    enablePasswordlessLogin: boolean;
    clientLoginMaintenanceMessage: string;
};

export async function getClientPortalHomeConfig() {
    const { data, error } = await supabase
        .from('app_settings')
        .select(
            'portal_home_blocks, portal_featured_section_names, portal_home_layout_order, client_login_maintenance_mode, enable_passwordless_login, client_login_maintenance_message',
        )
        .single();

    if (error || !data) {
        return {
            portalHomeBlocks: withDefaultPortalHomeBlocks([]),
            portalFeaturedSectionNames: { food: [], box: [] } as PortalFeaturedSectionNames,
            portalHomeLayoutOrder: { food: [], boxes: [] } as PortalHomeLayoutOrder,
            clientLoginMaintenanceMode: false,
            enablePasswordlessLogin: false,
            clientLoginMaintenanceMessage: resolveClientLoginMaintenanceMessage(null),
        };
    }

    const row = data as {
        portal_home_blocks?: unknown;
        portal_featured_section_names?: unknown;
        portal_home_layout_order?: unknown;
        client_login_maintenance_mode?: boolean | null;
        enable_passwordless_login?: boolean | null;
        client_login_maintenance_message?: string | null;
    };

    return {
        portalHomeBlocks: withDefaultPortalHomeBlocks(parsePortalHomeBlocks(row.portal_home_blocks)),
        portalFeaturedSectionNames: parsePortalFeaturedSectionNames(row.portal_featured_section_names),
        portalHomeLayoutOrder: parsePortalHomeLayoutOrder(row.portal_home_layout_order),
        clientLoginMaintenanceMode: row.client_login_maintenance_mode === true,
        enablePasswordlessLogin: row.enable_passwordless_login === true,
        clientLoginMaintenanceMessage: resolveClientLoginMaintenanceMessage(
            row.client_login_maintenance_message,
        ),
    };
}

export async function saveClientPortalAdminConfig(config: {
    blocks: PortalHomeBlock[];
    featuredSectionNames: PortalFeaturedSectionNames;
    homeLayoutOrder: PortalHomeLayoutOrder;
    settings: ClientPortalAdminSettings;
}): Promise<void> {
    const normalizedBlocks = parsePortalHomeBlocks(config.blocks);
    const normalizedNames = parsePortalFeaturedSectionNames(config.featuredSectionNames);
    const normalizedLayout = parsePortalHomeLayoutOrder(config.homeLayoutOrder);

    const { error } = await supabase
        .from('app_settings')
        .update({
            portal_home_blocks: normalizedBlocks,
            portal_featured_section_names: normalizedNames,
            portal_home_layout_order: normalizedLayout,
            client_login_maintenance_mode: config.settings.clientLoginMaintenanceMode === true,
            enable_passwordless_login: config.settings.enablePasswordlessLogin === true,
            client_login_maintenance_message: config.settings.clientLoginMaintenanceMessage.trim() || null,
        })
        .neq('id', '00000000-0000-0000-0000-000000000000');

    handleError(error);
    revalidatePath('/admin');
    revalidatePath('/clients');
    revalidatePath('/login');
    revalidatePath('/client-portal-triangle', 'layout');
}

export async function updatePortalHomeBlocks(blocks: PortalHomeBlock[]): Promise<void> {
    const normalized = parsePortalHomeBlocks(blocks);
    const { error } = await supabase
        .from('app_settings')
        .update({ portal_home_blocks: normalized })
        .neq('id', '00000000-0000-0000-0000-000000000000');

    handleError(error);
    revalidatePath('/admin');
    revalidatePath('/clients');
}

export async function updatePortalFeaturedSectionNames(names: PortalFeaturedSectionNames): Promise<void> {
    const normalized = parsePortalFeaturedSectionNames(names);
    const { error } = await supabase
        .from('app_settings')
        .update({ portal_featured_section_names: normalized })
        .neq('id', '00000000-0000-0000-0000-000000000000');

    handleError(error);
    revalidatePath('/admin');
    revalidatePath('/clients');
}

export async function updatePortalHomeLayoutOrder(order: PortalHomeLayoutOrder): Promise<void> {
    const normalized = parsePortalHomeLayoutOrder(order);
    const { error } = await supabase
        .from('app_settings')
        .update({ portal_home_layout_order: normalized })
        .neq('id', '00000000-0000-0000-0000-000000000000');

    handleError(error);
    revalidatePath('/admin');
    revalidatePath('/clients');
}

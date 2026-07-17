/**
 * Client row mapper and generic Supabase error helper, used by both `lib/actions.ts`
 * and Portal v2 helpers ported from Triangle (e.g. `lib/actions-read.ts`).
 *
 * These live outside `lib/actions.ts` on purpose: that file has a top-level
 * `'use server'` directive, and Next's "use server" file checker requires every
 * export from such a file to be an async function (or a type-only re-export).
 * `handleError` and `mapClientFromDB` are plain synchronous helpers, so exporting
 * them directly from `lib/actions.ts` breaks the production Turbopack build.
 */

import { isConnectionError, getConnectionErrorHelp } from './supabase';
import { fromStoredUpcomingOrder } from './upcoming-order-schema';
import { composeUniteUsUrl } from './utils';
import type { ClientProfile, ServiceType } from './types';

export function handleError(error: any, context?: string) {
    if (error) {
        const contextMsg = context ? `[${context}] ` : '';
        console.error(`Supabase Error ${contextMsg}:`, {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            fullError: error
        });

        // Check for DNS/connection errors first (most critical)
        if (isConnectionError(error)) {
            console.error(getConnectionErrorHelp(error));
            return; // Don't show other error messages if it's a connection issue
        }

        // Check for DNS/connection errors first (most critical)
        if (isConnectionError(error)) {
            console.error(getConnectionErrorHelp(error));
            throw new Error(error.message);
        }

        // Check for RLS/permission errors
        if (error.code === 'PGRST301' || error.message?.includes('permission denied') || error.message?.includes('RLS') || error.message?.includes('row-level security')) {
            console.error('⚠️  RLS (Row Level Security) may be blocking this query. Consider:');
            console.error('   1. Setting SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY)');
            console.error('   2. Running sql/disable-rls.sql to disable RLS');
            console.error('   3. Running sql/enable-permissive-rls.sql to add permissive policies');
        }

        // Check for schema permission errors (42501)
        if (error.code === '42501' || (error.message?.includes('permission denied for schema') && error.message?.includes('public'))) {
            console.error('⚠️  Database schema permission error (42501) detected!');
            console.error('   This means the database roles don\'t have proper permissions on the public schema.');
            console.error('   SOLUTION: Run the SQL script sql/fix-schema-permissions.sql in your Supabase SQL Editor.');
            console.error('   This will grant the necessary permissions to anon, authenticated, and service_role roles.');
            console.error('   See: https://supabase.com/docs/guides/troubleshooting/database-api-42501-errors');
        }

        // Postgres value-too-long (often Unite Us URL in case_id_external varchar(100))
        if (error.code === '22001' || /value too long for type character varying/i.test(error.message || '')) {
            throw new Error(
                `${error.message}. A field exceeds the database column length (commonly Unite Us URL in case_id_external). Run sql/widen_case_id_external_for_unite_us_urls.sql.`
            );
        }

        throw new Error(error.message);
    }
}

export function mapClientFromDB(c: any): ClientProfile {
    // Supabase automatically handles JSON fields, so we can use them directly
    const rawActiveOrder = c.upcoming_order || {};
    const serviceType = (c.service_type || 'Food') as ServiceType;
    // Hydrate stored payload to UI OrderConfiguration shape (handles legacy and schema-only payloads)
    const activeOrder = fromStoredUpcomingOrder(rawActiveOrder, serviceType) ?? (Object.keys(rawActiveOrder).length > 0 ? rawActiveOrder : undefined);
    const billings = c.billings || null;
    const visits = c.visits || null;

    return {
        id: c.id,
        fullName: c.full_name,
        email: c.email || '',
        address: c.address || '',
        phoneNumber: c.phone_number || '',
        secondaryPhoneNumber: c.secondary_phone_number || null,
        navigatorId: c.navigator_id || '',
        endDate: c.end_date || '',
        screeningTookPlace: c.screening_took_place,
        screeningSigned: c.screening_signed,
        screeningStatus: c.screening_status || 'not_started',
        notes: c.notes || '',
        statusId: c.status_id || '',
        serviceType: c.service_type as any,
        approvedMealsPerWeek: c.approved_meals_per_week,
        parentClientId: c.parent_client_id || null,
        dob: c.dob || null,
        cin: c.cin ?? null,
        authorizedAmount: c.authorized_amount ?? null,
        voucherAmount: c.voucher_amount ?? null,
        expirationDate: c.expiration_date || null,
        activeOrder: activeOrder ?? undefined,
        upcomingOrder: activeOrder ?? undefined,
        // New fields from dietfantasy
        firstName: c.first_name || null,
        lastName: c.last_name || null,
        apt: c.apt || null,
        city: c.city || null,
        state: c.state || null,
        zip: c.zip || null,
        county: c.county || null,
        // Single Unite Us link: store full URL in case_id_external; normalize when reading (legacy had separate case + client ids)
        clientIdExternal: null,
        caseIdExternal: (c.case_id_external && String(c.case_id_external).startsWith('http'))
            ? c.case_id_external
            : composeUniteUsUrl(c.case_id_external || null, c.client_id_external || null) || c.case_id_external || null,
        medicaid: c.medicaid ?? false,
        paused: c.paused ?? false,
        complex: c.complex ?? false,
        bill: c.bill ?? true,
        delivery: c.delivery ?? true,
        doNotText: c.do_not_text ?? false,
        doNotTextReason: c.do_not_text_reason || null,
        doNotTextNumbers: c.do_not_text_numbers || {},
        dislikes: c.dislikes || null,
        latitude: c.latitude ?? null,
        longitude: c.longitude ?? null,
        lat: c.lat ?? null,
        lng: c.lng ?? null,
        geocodedAt: c.geocoded_at || null,
        billings: billings,
        visits: visits,
        signToken: c.sign_token || null,
        assignedDriverId: c.assigned_driver_id || null,
        produceVendorId: c.produce_vendor_id || null,
        produceRosterEffectiveAt: c.produce_roster_effective_at ?? null,
        mealPlannerData: c.meal_planner_data ?? null,
        uniteAccount: c.unite_account || null,
        history: c.history || null,
        archivedAt: c.archived_at ?? null,
        createdAt: c.created_at,
        updatedAt: c.updated_at
    };
}

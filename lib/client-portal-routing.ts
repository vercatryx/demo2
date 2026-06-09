import type { SupabaseClient } from '@supabase/supabase-js';
import { isProduceServiceType } from './isProduceServiceType';
import { householdHasFoodOrMealPortalMember } from './meal-dependant-portal-login';

/** Food primary, or Produce household head managing Food/Meal dependants — day-based meal plan portal. */
export function usesMealPlanClientPortal(
    serviceType: string | null | undefined,
    hasFoodMealHouseholdMembers = false
): boolean {
    if (serviceType === 'Food') return true;
    if (isProduceServiceType(serviceType) && hasFoodMealHouseholdMembers) return true;
    return false;
}

export function getMealPlanClientPortalPath(clientId: string): string {
    return `/client-portal/${clientId}`;
}

export function getClassicClientPortalPath(clientId: string): string {
    return `/client-portal-triangle/${clientId}`;
}

/** Admin client shelf / staff preview — Triangle classic (upcoming order), not day-based meal plan. */
export function getStaffClientShelfPortalPath(
    clientId: string,
    serviceType: string | null | undefined
): string {
    if (serviceType === 'Food') return getClassicClientPortalPath(clientId);
    return getClientPortalPathForServiceType(clientId, serviceType);
}

export function getClientPortalPathForServiceType(
    clientId: string,
    serviceType: string | null | undefined,
    hasFoodMealHouseholdMembers = false
): string {
    return usesMealPlanClientPortal(serviceType, hasFoodMealHouseholdMembers)
        ? getMealPlanClientPortalPath(clientId)
        : getClassicClientPortalPath(clientId);
}

/** Roles that may open `/client-portal-triangle/*` for Food (day-based meal plan) clients. */
export function canStaffPreviewClassicTrianglePortal(role: string | null | undefined): boolean {
    return role === 'admin' || role === 'super-admin' || role === 'navigator' || role === 'brooklyn_admin';
}

/**
 * Food (and Produce+Food household) clients normally use the meal-plan portal.
 * On `/client-portal-triangle/*`, only signed-in clients are redirected away; staff keep the Triangle classic UI.
 */
export function shouldRedirectMealPlanPortalFromClassicRoute(
    serviceType: string | null | undefined,
    hasFoodMealHouseholdMembers: boolean,
    viewerRole: string | null | undefined
): boolean {
    if (!usesMealPlanClientPortal(serviceType, hasFoodMealHouseholdMembers)) return false;
    return viewerRole === 'client';
}

/** Resolve the portal URL for a client row (checks Produce household when needed). */
export async function resolveClientPortalPath(
    supabase: SupabaseClient,
    clientId: string,
    serviceType: string | null | undefined
): Promise<string> {
    const hasHousehold =
        isProduceServiceType(serviceType) &&
        (await householdHasFoodOrMealPortalMember(supabase, clientId));
    return getClientPortalPathForServiceType(clientId, serviceType, hasHousehold);
}

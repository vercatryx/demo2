import type { SupabaseClient } from '@supabase/supabase-js';

export const REPORT_IDS = [
    'food_under_meal_allowance',
    'active_two_weeks_no_orders',
    'billing_pending_over_two_weeks',
    'expiration_passed_not_expired_status',
    'vendors_orders_down_vs_last_week',
    'menu_items_with_dropdown',
] as const;

export type ReportId = (typeof REPORT_IDS)[number];

export type ReportSheet = {
    /** Excel sheet name (31 char max in Excel; we keep short). */
    name: string;
    /** Human title for README / UI. */
    title: string;
    /** Optional methodology blurb for README sheet. */
    methodology?: string;
    rows: Record<string, unknown>[];
};

export type ReportBundle = {
    generatedAt: string;
    timezoneNote: string;
    sheets: ReportSheet[];
};

export type ReportRunner = (supabase: SupabaseClient) => Promise<ReportSheet[]>;

export function assertReportId(id: string): ReportId | null {
    return (REPORT_IDS as readonly string[]).includes(id) ? (id as ReportId) : null;
}

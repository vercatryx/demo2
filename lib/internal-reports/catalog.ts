import { REPORT_IDS, type ReportId } from '@/lib/internal-reports/types';

/** Short catalog for UI + LLM tool descriptions. */
export const REPORT_CATALOG: { id: ReportId; title: string; summary: string }[] = [
    {
        id: 'food_under_meal_allowance',
        title: 'Food clients under weekly meal allowance',
        summary:
            'Food clients (effective service type) with approved_meals_per_week > 0 who are not using the full allowance in clients.upcoming_order (same math as SMS menu tool).',
    },
    {
        id: 'active_two_weeks_no_orders',
        title: 'Active primary clients 14+ days with no orders ever',
        summary:
            'Primary clients, deliveries_allowed status, not expired by expiration_date (NY), created_at at least 14 days ago, zero rows in orders.',
    },
    {
        id: 'billing_pending_over_two_weeks',
        title: 'Billing / proof pipeline stale > 14 days',
        summary: 'Orders in billing_pending or waiting_for_proof with last_updated older than 14 days (UTC).',
    },
    {
        id: 'expiration_passed_not_expired_status',
        title: 'Past expiration_date but not Expired status',
        summary:
            'expiration_date ≤ today (America/New_York calendar) but client_status is not the row named Expired (ilike).',
    },
    {
        id: 'vendors_orders_down_vs_last_week',
        title: 'Vendors with fewer orders this Sun–Sat week vs prior week',
        summary:
            'Distinct orders per vendor via order_vendor_selections; scheduled_delivery_date in each Sun–Sat window; cancelled excluded; only vendors where this_week < last_week and last_week > 0.',
    },
    {
        id: 'menu_items_with_dropdown',
        title: 'Menu + breakfast items with dropdown enabled',
        summary:
            'Placeholder on Demo Food (no dropdown DB columns). Sheets are empty; use Data Copilot ad-hoc SQL on upcoming_order if needed.',
    },
];

export function catalogMarkdown(): string {
    return REPORT_CATALOG.map((r) => `### ${r.id}\n**${r.title}**\n${r.summary}\n`).join('\n');
}

export function reportIdEnumForSchema(): string[] {
    return [...REPORT_IDS];
}

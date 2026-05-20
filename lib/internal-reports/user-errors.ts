/** Shown to staff in chat — no infrastructure or env details. */
export const DATA_COPILOT_SUPPORT_MESSAGE =
    "I can't pull that up right now. Please contact support.";

const INFRA_PATTERN =
    /tenant or user not found|password authentication failed|internal_reports_postgres|database_url|supabase_database|supabase_secret|openai_api_key|anthropic_api_key|\.env\.local|connection string|pooler\.supabase|postgresql:\/\//i;

const SQL_HINT_PATTERN = /does not exist|undefined column|syntax error|permission denied for/i;

/** True when the raw message should not be shown to end users. */
export function isInfrastructureReportsError(message: string): boolean {
    return INFRA_PATTERN.test(message);
}

function modelRetryHint(raw: string): string | undefined {
    if (isInfrastructureReportsError(raw)) return undefined;
    if (!SQL_HINT_PATTERN.test(raw)) return undefined;
    let hint = raw.slice(0, 400);
    if (/delivery_days/i.test(hint) && /menu_items/i.test(hint)) {
        hint += ' Reminder: delivery_days is on vendors, not menu_items — join vendors v ON v.id = menu_items.vendor_id.';
    }
    if (/billing_notes/i.test(hint)) {
        hint += ' Reminder: orders use notes, not billing_notes.';
    }
    if (/dropdown_enabled|dropdown_options/i.test(hint)) {
        hint +=
            ' Reminder: Demo Food has no dropdown_enabled/dropdown_options columns on menu_items or breakfast_items.';
    }
    if (/active_order/i.test(hint) && /clients/i.test(hint)) {
        hint += ' Reminder: clients store the cart in upcoming_order (JSONB), not active_order.';
    }
    if (/billing_week_start_sunday/i.test(hint)) {
        hint +=
            ' Reminder: no billing_week_start_sunday RPC on Demo Food — use Sunday week math in America/New_York (see lib/produce-roster-week.ts).';
    }
    return hint;
}

/** Log details server-side; return a safe message for the UI and LLM. */
export function toUserFacingReportsError(raw: string, logLabel?: string): string {
    if (logLabel) {
        console.error(`[internal-reports] ${logLabel}:`, raw);
    }
    return DATA_COPILOT_SUPPORT_MESSAGE;
}

/** Tool payload: user_message for staff; model_hint for silent SQL retry (never repeat hint to user). */
export function toolUnavailablePayload(logLabel: string, raw: string): string {
    const modelHint = modelRetryHint(raw);
    if (logLabel) {
        console.error(`[internal-reports] ${logLabel}:`, raw);
    }
    const body: { ok: false; user_message: string; model_hint?: string } = {
        ok: false,
        user_message: DATA_COPILOT_SUPPORT_MESSAGE,
    };
    if (modelHint) body.model_hint = modelHint;
    return JSON.stringify(body, null, 2);
}

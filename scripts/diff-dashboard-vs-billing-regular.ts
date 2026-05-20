/**
 * Explains why client counts differ between the dashboard list (getClientsPaginated-style)
 * and GET /api/bill?account=regular (getBillHouseholdRows).
 *
 * Usage:
 *   npx tsx scripts/diff-dashboard-vs-billing-regular.ts
 *
 * Reads .env.local for Supabase. Does not modify data.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase URL/key in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
});

type Row = {
    id: string;
    full_name: string | null;
    parent_client_id: string | null;
    unite_account: string | null;
    bill: boolean | null;
};

async function fetchAllRows<T>(pageSize = 1000): Promise<T[]> {
    const all: T[] = [];
    let from = 0;
    while (true) {
        const to = from + pageSize - 1;
        const { data, error } = await supabase
            .from('clients')
            .select('id, full_name, parent_client_id, unite_account, bill')
            .is('archived_at', null)
            .order('id')
            .range(from, to);
        if (error) throw error;
        const chunk = (data || []) as T[];
        if (chunk.length === 0) break;
        all.push(...(chunk as T[]));
        if (chunk.length < pageSize) break;
        from += pageSize;
    }
    return all;
}

/** Same as billing PostgREST filter for account=regular (does NOT match empty string). */
function matchesBillingRegularSql(ua: string | null | undefined): boolean {
    return ua === null || ua === undefined || ua === 'Regular';
}

/** Same as clientMatchesAccountFilter(..., 'regular') in bill-household-rows.ts */
function matchesBillingRegularJs(ua: string | null | undefined): boolean {
    if (ua === 'Regular' || ua == null) return true;
    return String(ua).trim() === '';
}

function classifyParentExcludedFromBilling(p: Row): string | null {
    if (p.parent_client_id != null) return null;
    if (p.bill === false) return 'bill=false (no billing / unchecked in app)';
    if (!matchesBillingRegularSql(p.unite_account)) {
        const ua = p.unite_account;
        if (ua === 'Brooklyn') return "unite_account='Brooklyn' (use ?account=brooklyn or ?account=both)";
        if (ua != null && String(ua).trim() === '')
            return "unite_account is empty string '' (billing SQL only allows Regular or NULL — not picked up unless supplement path)";
        if (typeof ua === 'string' && ua !== 'Regular' && ua.toLowerCase() === 'regular')
            return "unite_account casing e.g. 'regular' (billing uses exact 'Regular')";
        return `unite_account=${JSON.stringify(ua)} (not Regular and not null)`;
    }
    return null;
}

async function main() {
    const cols = 'id, full_name, parent_client_id, unite_account, bill';
    const rows = await fetchAllRows<Row>();

    const dependents = rows.filter((r) => r.parent_client_id != null && String(r.parent_client_id).length > 0);
    const parents = rows.filter((r) => r.parent_client_id == null || r.parent_client_id === '');

    const billingParentsSql = parents.filter((p) => p.bill !== false && matchesBillingRegularSql(p.unite_account));
    const billingParentsJsWouldInclude = parents.filter((p) => p.bill !== false && matchesBillingRegularJs(p.unite_account));

    const excluded: { row: Row; reason: string }[] = [];
    for (const p of parents) {
        const reason = classifyParentExcludedFromBilling(p);
        if (reason) excluded.push({ row: p, reason });
    }

    const emptyStringNotInSql = parents.filter(
        (p) => p.bill !== false && p.unite_account != null && String(p.unite_account).trim() === '' && !matchesBillingRegularSql(p.unite_account)
    );

    console.log('=== Dashboard vs billing (account=regular) ===\n');
    console.log('Dashboard default list = ALL active client rows (parents + dependants),');
    console.log('no bill filter, no unite_account filter (unless Brooklyn-only mode).\n');
    console.log('Billing regular = parent rows only, archived_at null, bill !== false,');
    console.log("unite_account IS NULL OR unite_account = 'Regular' (PostgREST .or filter).\n");

    console.log('--- Counts ---');
    console.log('Active rows (all):', rows.length);
    console.log('  └ dependant rows:', dependents.length);
    console.log('  └ parent rows:', parents.length);
    console.log('');
    console.log('Billing-equivalent parent count (SQL Regular|null, bill≠false):', billingParentsSql.length);
    console.log('Parents that pass JS “regular” filter but NOT SQL (e.g. empty string UA):', billingParentsJsWouldInclude.length - billingParentsSql.length);
    if (emptyStringNotInSql.length > 0) {
        console.log('  (empty-string unite_account parents:', emptyStringNotInSql.length, ')');
    }
    console.log('');
    console.log('--- Parents on dashboard but NOT on regular billing (by reason) ---');
    const byReason = new Map<string, Row[]>();
    for (const { row, reason } of excluded) {
        if (!byReason.has(reason)) byReason.set(reason, []);
        byReason.get(reason)!.push(row);
    }
    const reasons = [...byReason.keys()].sort((a, b) => (byReason.get(b)!.length - byReason.get(a)!.length));
    for (const reason of reasons) {
        const list = byReason.get(reason)!;
        console.log(`\n[${list.length}] ${reason}`);
        for (const r of list.slice(0, 15)) {
            console.log(`  - ${r.id}  ${(r.full_name || '').trim() || '(no name)'}`);
        }
        if (list.length > 15) console.log(`  ... and ${list.length - 15} more`);
    }

    console.log('\n--- Reconcile row total vs billing ---');
    console.log(`If your dashboard total is ${rows.length} rows, billing parents (regular SQL) is ${billingParentsSql.length}.`);
    console.log(`Rough gap explained by dependant rows alone: ${rows.length} - ${dependents.length} = ${rows.length - dependents.length} parent rows;`);
    console.log(`billing uses ${billingParentsSql.length} of those ${parents.length} parents.`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseServiceOrAnonKey } from '@/lib/supabase-env';
import { parseUniteUsUrl } from '@/lib/utils';
import { orderRowProofUrls, primaryProofUrl } from '@/lib/proof-of-delivery-urls';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = getSupabaseServiceOrAnonKey()!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const CLIENT_SELECT =
    'id, full_name, service_type, case_id_external, client_id_external, parent_client_id, status_id, authorized_amount, phone_number, paused, bill, delivery, created_at, unite_account';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function extensionAuth(request: NextRequest): { ok: true } | { ok: false; response: NextResponse } {
    const apiKey = process.env.EXTENSION_API_KEY;
    if (!apiKey) {
        return {
            ok: false,
            response: NextResponse.json(
                { success: false, error: 'API key not configured on server' },
                { status: 500, headers: corsHeaders }
            ),
        };
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return {
            ok: false,
            response: NextResponse.json(
                { success: false, error: 'Missing or invalid authorization header' },
                { status: 401, headers: corsHeaders }
            ),
        };
    }

    const providedKey = authHeader.substring(7);
    if (providedKey !== apiKey) {
        return {
            ok: false,
            response: NextResponse.json(
                { success: false, error: 'Invalid API key' },
                { status: 401, headers: corsHeaders }
            ),
        };
    }

    return { ok: true };
}

function applyUniteAccountFilter<T extends { eq: (col: string, val: string) => T; or: (filter: string) => T }>(
    query: T,
    uniteAccount: string | null
): T {
    if (uniteAccount === 'Brooklyn') {
        return query.eq('unite_account', 'Brooklyn');
    }
    if (uniteAccount === 'Regular') {
        return query.or('unite_account.eq.Regular,unite_account.is.null');
    }
    return query;
}

function clientMatchesUniteAccount(client: any, uniteAccount: string | null): boolean {
    if (!uniteAccount) return true;
    const ua = client.unite_account;
    if (uniteAccount === 'Brooklyn') return ua === 'Brooklyn';
    if (uniteAccount === 'Regular') return ua === 'Regular' || ua == null;
    return true;
}

function normalizeCaseUrl(raw: string): string {
    return raw.trim().replace(/\/+$/, '');
}

function pickClientByCaseUrl(clients: any[], caseUrl: string, parsed: { caseId: string; clientId: string } | null) {
    const normalized = normalizeCaseUrl(caseUrl);
    const exact = clients.find((c) => normalizeCaseUrl(String(c.case_id_external || '')) === normalized);
    if (exact) return exact;

    if (parsed) {
        const withBoth = clients.find((c) => {
            const stored = String(c.case_id_external || '');
            return stored.includes(parsed.caseId) && stored.includes(parsed.clientId);
        });
        if (withBoth) return withBoth;

        const byContact = clients.find((c) => String(c.client_id_external || '') === parsed.clientId);
        if (byContact) return byContact;
    }

    return clients[0] ?? null;
}

async function findClientByCaseUrl(caseUrl: string, uniteAccount: string | null) {
    const trimmed = caseUrl.trim();
    const parsed = parseUniteUsUrl(trimmed);

    let exactQuery = supabase
        .from('clients')
        .select(CLIENT_SELECT)
        .eq('case_id_external', trimmed)
        .is('archived_at', null)
        .limit(1);

    exactQuery = applyUniteAccountFilter(exactQuery, uniteAccount);

    const { data: exactMatch, error: exactError } = await exactQuery.maybeSingle();
    if (exactError) throw new Error(exactError.message);
    if (exactMatch) return exactMatch;

    if (parsed) {
        let fuzzyQuery = supabase
            .from('clients')
            .select(CLIENT_SELECT)
            .or(`case_id_external.ilike.%${parsed.caseId}%,client_id_external.eq.${parsed.clientId}`)
            .is('archived_at', null)
            .limit(10);

        fuzzyQuery = applyUniteAccountFilter(fuzzyQuery, uniteAccount);

        const { data: fuzzyMatches, error: fuzzyError } = await fuzzyQuery;
        if (fuzzyError) throw new Error(fuzzyError.message);
        if (fuzzyMatches?.length) {
            return pickClientByCaseUrl(fuzzyMatches, trimmed, parsed);
        }
    }

    return null;
}

async function findClientById(clientId: string, uniteAccount: string | null) {
    let query = supabase
        .from('clients')
        .select(CLIENT_SELECT)
        .eq('id', clientId)
        .is('archived_at', null)
        .limit(1);

    query = applyUniteAccountFilter(query, uniteAccount);

    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    if (!clientMatchesUniteAccount(data, uniteAccount)) return null;
    return data;
}

function effectiveOrderDate(row: any): string {
    return row.actual_delivery_date || row.scheduled_delivery_date || row.created_at || '';
}

async function loadOrdersForClient(client: any, limit: number) {
    const clientIds = [client.id];
    const { data: dependents } = await supabase
        .from('clients')
        .select('id, full_name')
        .eq('parent_client_id', client.id)
        .is('archived_at', null);

    const dependentNames: Record<string, string> = {};
    (dependents || []).forEach((dep: any) => {
        clientIds.push(dep.id);
        dependentNames[dep.id] = dep.full_name || 'Dependent';
    });

    const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('id, client_id, order_number, status, service_type, scheduled_delivery_date, actual_delivery_date, created_at, total_value, proof_of_delivery_url, proof_of_delivery_image, notes')
        .in('client_id', clientIds)
        .order('created_at', { ascending: false })
        .limit(limit * 3);

    if (ordersError) throw new Error(ordersError.message);

    const sortedOrders = (orders || [])
        .slice()
        .sort((a, b) => {
            const da = effectiveOrderDate(a);
            const db = effectiveOrderDate(b);
            return db.localeCompare(da);
        })
        .slice(0, limit)
        .map((row: any) => {
            const proofUrls = orderRowProofUrls(row);
            const primary = primaryProofUrl(row) || '';

            return {
                id: row.id,
                clientId: row.client_id,
                clientName: row.client_id === client.id
                    ? client.full_name
                    : (dependentNames[row.client_id] || client.full_name),
                orderNumber: row.order_number,
                status: row.status,
                serviceType: row.service_type,
                scheduledDeliveryDate: row.scheduled_delivery_date,
                actualDeliveryDate: row.actual_delivery_date,
                createdAt: row.created_at,
                totalValue: row.total_value != null ? Number(row.total_value) : null,
                proofUrl: primary || null,
                proofUrls: proofUrls.filter(Boolean),
                notes: row.notes || null,
            };
        });

    return {
        orders: sortedOrders,
        dependentCount: (dependents || []).length,
    };
}

function formatClientResponse(client: any) {
    return {
        id: client.id,
        fullName: client.full_name,
        serviceType: client.service_type,
        caseIdExternal: client.case_id_external,
        phoneNumber: client.phone_number,
        authorizedAmount: client.authorized_amount != null ? Number(client.authorized_amount) : null,
        paused: !!client.paused,
        bill: client.bill !== false,
        delivery: client.delivery !== false,
        uniteAccount: client.unite_account || null,
    };
}

export async function OPTIONS() {
    return new NextResponse(null, { status: 200, headers: corsHeaders });
}

/**
 * GET /api/extension/client-orders?caseUrl=<url>|clientId=<id>&uniteAccount=Brooklyn&limit=25
 */
export async function GET(request: NextRequest) {
    try {
        const auth = extensionAuth(request);
        if (auth.ok === false) return auth.response;

        const caseUrl = request.nextUrl.searchParams.get('caseUrl')?.trim() || '';
        const clientId = request.nextUrl.searchParams.get('clientId')?.trim() || '';
        const uniteAccount = request.nextUrl.searchParams.get('uniteAccount')?.trim() || null;
        const limitRaw = request.nextUrl.searchParams.get('limit');
        const limit = Math.min(Math.max(parseInt(limitRaw || '25', 10) || 25, 1), 50);

        if (!caseUrl && !clientId) {
            return NextResponse.json(
                { success: false, error: 'Provide caseUrl or clientId.' },
                { status: 400, headers: corsHeaders }
            );
        }

        let client: any = null;
        if (clientId) {
            client = await findClientById(clientId, uniteAccount);
        } else {
            client = await findClientByCaseUrl(caseUrl, uniteAccount);
        }

        if (!client) {
            const accountHint = uniteAccount === 'Brooklyn' ? ' (Brooklyn clients only)' : '';
            return NextResponse.json(
                { success: false, error: `No client found${accountHint}. Try searching by name.` },
                { status: 404, headers: corsHeaders }
            );
        }

        const { orders, dependentCount } = await loadOrdersForClient(client, limit);

        return NextResponse.json(
            {
                success: true,
                client: formatClientResponse(client),
                orders,
                dependentCount,
            },
            { status: 200, headers: corsHeaders }
        );
    } catch (error: any) {
        console.error('Error in client-orders API:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Internal Server Error' },
            { status: 500, headers: corsHeaders }
        );
    }
}

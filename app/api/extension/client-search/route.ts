import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseServiceOrAnonKey } from '@/lib/supabase-env';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = getSupabaseServiceOrAnonKey()!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

/** Escape `%`, `_`, and `\` for safe use inside a PostgREST ilike pattern. */
function escapeIlikePattern(raw: string): string {
    return raw.replace(/[%_\\]/g, '\\$&');
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

export async function OPTIONS() {
    return new NextResponse(null, { status: 200, headers: corsHeaders });
}

/**
 * GET /api/extension/client-search?q=<name>&uniteAccount=Brooklyn&limit=30
 *
 * Server-side name search (ilike) — does not scan the full clients table.
 */
export async function GET(request: NextRequest) {
    try {
        const auth = extensionAuth(request);
        if (auth.ok === false) return auth.response;

        const q = request.nextUrl.searchParams.get('q')?.trim() || '';
        const externalId = request.nextUrl.searchParams.get('externalId')?.trim() || '';
        const uniteAccount = request.nextUrl.searchParams.get('uniteAccount')?.trim() || null;
        const limitRaw = request.nextUrl.searchParams.get('limit');
        const limit = Math.min(Math.max(parseInt(limitRaw || '30', 10) || 30, 1), 50);

        if (!externalId && q.length < 2) {
            return NextResponse.json(
                { success: false, error: 'Search query must be at least 2 characters.' },
                { status: 400, headers: corsHeaders }
            );
        }

        let query = supabase
            .from('clients')
            .select('id, full_name, service_type, phone_number, case_id_external, client_id_external, unite_account')
            .is('archived_at', null)
            .is('parent_client_id', null)
            .order('full_name', { ascending: true })
            .limit(limit);

        if (externalId) {
            query = query.eq('client_id_external', externalId);
        } else {
            const pattern = `%${escapeIlikePattern(q)}%`;
            query = query.ilike('full_name', pattern);
        }

        query = applyUniteAccountFilter(query, uniteAccount);

        const { data, error } = await query;
        if (error) throw new Error(error.message);

        const clients = (data || []).map((row: any) => ({
            id: row.id,
            fullName: row.full_name || '',
            serviceType: row.service_type || '',
            phoneNumber: row.phone_number || null,
            caseIdExternal: row.case_id_external || null,
            clientIdExternal: row.client_id_external || null,
            uniteAccount: row.unite_account || null,
        }));

        return NextResponse.json(
            { success: true, clients },
            { status: 200, headers: corsHeaders }
        );
    } catch (error: any) {
        console.error('Error in client-search API:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Internal Server Error' },
            { status: 500, headers: corsHeaders }
        );
    }
}

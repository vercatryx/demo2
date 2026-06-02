import { NextRequest, NextResponse } from 'next/server';
import { requireAdminMessaging } from '@/lib/messaging/require-admin';
import { getMessagingSupabase } from '@/lib/messaging/supabase-admin';

function statusNameFromRow(row: {
    client_statuses: { name?: string } | { name?: string }[] | null;
}): string | null {
    const statusRow = row.client_statuses;
    if (Array.isArray(statusRow)) return statusRow[0]?.name ?? null;
    return statusRow?.name ?? null;
}

function isApprovedStatus(name: string | null): boolean {
    return (name ?? '').trim().toLowerCase() === 'approved';
}

/** Search clients for manual pick — queries DB so test / non-approved clients are findable. */
export async function GET(request: NextRequest) {
    const auth = await requireAdminMessaging();
    if (!auth.ok) {
        return NextResponse.json({ error: auth.msg }, { status: auth.status });
    }

    try {
        const { searchParams } = new URL(request.url);
        const q = (searchParams.get('q') ?? '').trim();
        const approvedOnly = searchParams.get('approvedOnly') !== 'false';
        const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '100', 10) || 100, 1), 200);
        const includeIds = (searchParams.get('includeIds') ?? '')
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean);

        const supabase = getMessagingSupabase();

        let query = supabase
            .from('clients')
            .select('id, full_name, client_statuses(name)')
            .order('full_name')
            .limit(limit);

        if (q.length >= 1) {
            const escaped = q.replace(/[%_]/g, '\\$&');
            query = query.or(`full_name.ilike.%${escaped}%,id.ilike.%${escaped}%`);
        } else if (includeIds.length === 0) {
            return NextResponse.json({
                clients: [],
                hint: 'Type a name or client ID to search',
            });
        } else {
            query = supabase
                .from('clients')
                .select('id, full_name, client_statuses(name)')
                .in('id', includeIds);
        }

        const { data, error } = await query;
        if (error) throw error;

        let clients = (data ?? []).map((c) => ({
            id: c.id,
            fullName: c.full_name?.trim() || c.id,
            statusName: statusNameFromRow(c),
        }));

        if (approvedOnly) {
            clients = clients.filter((c) => isApprovedStatus(c.statusName));
        }

        const seen = new Set(clients.map((c) => c.id));

        if (includeIds.length > 0) {
            const missingIds = includeIds.filter((id) => !seen.has(id));
            if (missingIds.length > 0) {
                const { data: extra, error: extraErr } = await supabase
                    .from('clients')
                    .select('id, full_name, client_statuses(name)')
                    .in('id', missingIds);
                if (extraErr) throw extraErr;
                for (const c of extra ?? []) {
                    const row = {
                        id: c.id,
                        fullName: c.full_name?.trim() || c.id,
                        statusName: statusNameFromRow(c),
                    };
                    if (approvedOnly && !isApprovedStatus(row.statusName)) continue;
                    clients.unshift(row);
                    seen.add(row.id);
                }
            }
        }

        return NextResponse.json({
            clients,
            hint: q.length === 0 ? 'Type a name or client ID to search' : undefined,
        });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Search failed';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/**
 * SMS usage aggregated by peer phone from usage_events (demo-safe; no Postgres RPC).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { adminSupabase } from '@/lib/supabase-admin';
import { applyUsageFilters } from '@/lib/billing/usage-admin-query';
import { normalizePhone } from '@/lib/phone-utils';

const PAGE = 1000;

type PeerBucket = {
  peerNumber: string;
  totalCount: number;
  inboundCount: number;
  outboundCount: number;
  firstMessageAt: string;
  lastMessageAt: string;
  clientId: string | null;
  clientName: string | null;
};

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin' && session.role !== 'super-admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const params = {
    from: sp.get('from'),
    to: sp.get('to'),
    client_id: sp.get('client_id'),
    phone: sp.get('phone'),
  };

  const supabase = adminSupabase();
  const buckets = new Map<string, PeerBucket>();
  let offset = 0;

  for (;;) {
    let q = supabase
      .from('usage_events')
      .select('occurred_at, sms_direction, client_id, phone_e164, sms_segments')
      .eq('kind', 'sms_message');
    q = applyUsageFilters(q, params, []);
    q = q.order('occurred_at', { ascending: true }).range(offset, offset + PAGE - 1);

    const { data: batch, error } = await q;
    if (error) {
      return NextResponse.json({ error: error.message, hint: 'usage_events query failed' }, { status: 500 });
    }
    if (!batch?.length) break;

    for (const r of batch) {
      const at = String(r.occurred_at);
      const dir = r.sms_direction === 'inbound' ? 'inbound' : 'outbound';
      const weight = Math.max(1, Number(r.sms_segments) || 1);
      const clientId = (r.client_id as string) || null;
      const rawPeer =
        (r.phone_e164 && String(r.phone_e164).trim()) ||
        (clientId ? `client:${clientId}` : 'unknown');
      let bucket = buckets.get(rawPeer);
      if (!bucket) {
        bucket = {
          peerNumber: rawPeer,
          totalCount: 0,
          inboundCount: 0,
          outboundCount: 0,
          firstMessageAt: at,
          lastMessageAt: at,
          clientId,
          clientName: null,
        };
        buckets.set(rawPeer, bucket);
      }
      bucket.totalCount += weight;
      if (dir === 'inbound') bucket.inboundCount += weight;
      else bucket.outboundCount += weight;
      if (at < bucket.firstMessageAt) bucket.firstMessageAt = at;
      if (at > bucket.lastMessageAt) bucket.lastMessageAt = at;
      if (clientId && !bucket.clientId) bucket.clientId = clientId;
    }

    if (batch.length < PAGE) break;
    offset += PAGE;
  }

  const clientIds = [...new Set([...buckets.values()].map(b => b.clientId).filter(Boolean))] as string[];
  let clientsById: Record<string, { full_name: string; phone_number: string | null }> = {};
  if (clientIds.length > 0) {
    for (let i = 0; i < clientIds.length; i += 200) {
      const slice = clientIds.slice(i, i + 200);
      const { data: cm } = await supabase.from('clients').select('id, full_name, phone_number').in('id', slice);
      for (const c of cm ?? []) {
        clientsById[c.id as string] = {
          full_name: c.full_name as string,
          phone_number: c.phone_number as string | null,
        };
      }
    }
  }

  const rows = [...buckets.values()]
    .map(b => {
      const c = b.clientId ? clientsById[b.clientId] : undefined;
      const peer =
        b.peerNumber.startsWith('client:') && c?.phone_number
          ? normalizePhone(c.phone_number) || c.phone_number
          : b.peerNumber;
      return {
        ...b,
        peerNumber: peer,
        clientName: c?.full_name ?? b.clientName,
      };
    })
    .sort((a, b) => b.totalCount - a.totalCount);

  return NextResponse.json({ rows });
}

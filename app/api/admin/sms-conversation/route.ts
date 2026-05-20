/**
 * Per-number SMS thread for AI Usage drawer.
 * Prefers sms_conversations (role/content); falls back to usage_events metadata.body.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { adminSupabase } from '@/lib/supabase-admin';
import { appTzDateKeysToUtcIsoRangeInclusive } from '@/lib/timezone';
import { normalizePhone } from '@/lib/phone-utils';

type ConvMsg = {
  id: string;
  direction: 'inbound' | 'outbound';
  body: string;
  created_at: string;
  from_number: string;
  to_number: string;
};

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || (session.role !== 'admin' && session.role !== 'super-admin')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const phone = searchParams.get('phone')?.trim();
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const limit = Math.min(500, Math.max(1, Number(searchParams.get('limit')) || 300));

  if (!phone) {
    return NextResponse.json({ error: 'Missing phone' }, { status: 400 });
  }

  const normalized = normalizePhone(phone) || phone.replace(/\D/g, '');
  if (!normalized) {
    return NextResponse.json({ messages: [] });
  }

  let startIso: string | undefined;
  let endIso: string | undefined;
  if (from && to) {
    try {
      const fromKey = from.slice(0, 10);
      const toKey = to.slice(0, 10);
      ({ startIso, endIso } = appTzDateKeysToUtcIsoRangeInclusive(fromKey, toKey));
    } catch {
      return NextResponse.json({ error: 'Invalid from/to' }, { status: 400 });
    }
  }

  const supabase = adminSupabase();

  let q = supabase
    .from('sms_conversations')
    .select('id, phone_number, role, content, created_at')
    .eq('phone_number', normalized)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (startIso) q = q.gte('created_at', startIso);
  if (endIso) q = q.lte('created_at', endIso);

  const { data, error } = await q;

  if (!error && data?.length) {
    const messages: ConvMsg[] = data.map(row => {
      const inbound = row.role === 'user';
      return {
        id: row.id as string,
        direction: inbound ? 'inbound' : 'outbound',
        body: (row.content as string) || '',
        created_at: row.created_at as string,
        from_number: inbound ? normalized : '',
        to_number: inbound ? '' : normalized,
      };
    });
    return NextResponse.json({ messages });
  }

  if (error && !error.message?.includes('does not exist') && error.code !== '42P01' && error.code !== 'PGRST205') {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let uq = supabase
    .from('usage_events')
    .select('id, occurred_at, sms_direction, metadata, phone_e164')
    .eq('kind', 'sms_message')
    .eq('phone_e164', normalized)
    .order('occurred_at', { ascending: true })
    .limit(limit);

  if (startIso) uq = uq.gte('occurred_at', startIso);
  if (endIso) uq = uq.lte('occurred_at', endIso);

  const { data: usageRows, error: usageErr } = await uq;
  if (usageErr) {
    return NextResponse.json({ error: usageErr.message }, { status: 500 });
  }

  const messages: ConvMsg[] = (usageRows ?? []).map(row => {
    const inbound = row.sms_direction === 'inbound';
    const meta = row.metadata as { body?: string } | null;
    const body =
      (meta?.body && String(meta.body).trim()) ||
      (inbound ? '(Inbound SMS)' : '(Outbound SMS)');
    return {
      id: row.id as string,
      direction: inbound ? 'inbound' : 'outbound',
      body,
      created_at: row.occurred_at as string,
      from_number: inbound ? normalized : '',
      to_number: inbound ? '' : normalized,
    };
  });

  return NextResponse.json({ messages });
}

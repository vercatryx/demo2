import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { patchDemoSmsPolicy } from '@/lib/demo-sms-peer-policy-store';

async function requireAdmin() {
  const session = await getSession();
  if (!session?.userId) return null;
  if (session.role !== 'admin' && session.role !== 'super-admin') return null;
  return session;
}

export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = await req.json();
    const n = body?.max_inbound_sms_per_hour;
    if (typeof n !== 'number' || !Number.isFinite(n)) {
      return NextResponse.json({ error: 'max_inbound_sms_per_hour required' }, { status: 400 });
    }
    const data = await patchDemoSmsPolicy({ global_max_inbound_sms_per_hour: Math.floor(n) });
    return NextResponse.json({
      ok: true,
      max_inbound_sms_per_hour: data.global_max_inbound_sms_per_hour,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

/**
 * SMS peer blocking / rate limits — persisted in settings for demo (no sms_peer_policy table).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import {
  loadDemoSmsPolicies,
  patchDemoSmsPolicy,
  postDemoSmsPolicy,
} from '@/lib/demo-sms-peer-policy-store';

async function requireAdmin() {
  const session = await getSession();
  if (!session?.userId) return null;
  if (session.role !== 'admin' && session.role !== 'super-admin') return null;
  return session;
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const data = await loadDemoSmsPolicies();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = await req.json();
    const data = await patchDemoSmsPolicy(body);
    return NextResponse.json({ ok: true, ...data });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = await req.json();
    const data = await postDemoSmsPolicy(body);
    return NextResponse.json({ ok: true, ...data });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

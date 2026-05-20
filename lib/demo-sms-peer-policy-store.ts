import { randomUUID } from 'crypto';
import { adminSupabase } from '@/lib/supabase-admin';
import { normalizePhone } from '@/lib/phone-utils';
import { DEMO_SMS_POLICY_SETTINGS, type DemoSmsPolicy } from '@/lib/demo-seed-ai-usage';

export async function loadDemoSmsPolicies(): Promise<{
  policies: DemoSmsPolicy[];
  global_max_inbound_sms_per_hour: number;
}> {
  const supabase = adminSupabase();
  const { data } = await supabase
    .from('settings')
    .select('key, value')
    .in('key', [DEMO_SMS_POLICY_SETTINGS.policiesKey, DEMO_SMS_POLICY_SETTINGS.globalCapKey]);

  let policies: DemoSmsPolicy[] = [];
  let globalCap = 100;
  for (const row of data ?? []) {
    if (row.key === DEMO_SMS_POLICY_SETTINGS.policiesKey) {
      try {
        policies = JSON.parse(String(row.value)) as DemoSmsPolicy[];
      } catch {
        policies = [];
      }
    }
    if (row.key === DEMO_SMS_POLICY_SETTINGS.globalCapKey) {
      const n = Number(row.value);
      if (Number.isFinite(n) && n >= 1) globalCap = Math.floor(n);
    }
  }
  return { policies, global_max_inbound_sms_per_hour: globalCap };
}

async function saveDemoSmsPolicies(policies: DemoSmsPolicy[], globalCap?: number) {
  const supabase = adminSupabase();
  const { data: existing } = await supabase
    .from('settings')
    .select('id, key')
    .in('key', [DEMO_SMS_POLICY_SETTINGS.policiesKey, DEMO_SMS_POLICY_SETTINGS.globalCapKey]);

  const byKey = Object.fromEntries((existing ?? []).map(r => [r.key as string, r.id as string]));
  const upserts: { id: string; key: string; value: string }[] = [];

  const policiesId = byKey[DEMO_SMS_POLICY_SETTINGS.policiesKey] ?? randomUUID();
  upserts.push({
    id: policiesId,
    key: DEMO_SMS_POLICY_SETTINGS.policiesKey,
    value: JSON.stringify(policies),
  });

  if (globalCap != null) {
    const capId = byKey[DEMO_SMS_POLICY_SETTINGS.globalCapKey] ?? randomUUID();
    upserts.push({
      id: capId,
      key: DEMO_SMS_POLICY_SETTINGS.globalCapKey,
      value: String(globalCap),
    });
  }

  for (const row of upserts) {
    const { error } = await supabase.from('settings').upsert(row, { onConflict: 'key' });
    if (error) throw error;
  }
}

function normalizePolicyPhone(raw: string): string {
  return normalizePhone(raw) || raw.replace(/\D/g, '');
}

export async function patchDemoSmsPolicy(body: {
  phone_key?: string;
  sms_blocked?: boolean;
  admin_override_unblock?: boolean;
  max_inbound_sms_per_hour?: number | null;
  clear_block?: boolean;
  global_max_inbound_sms_per_hour?: number;
}) {
  const { policies, global_max_inbound_sms_per_hour } = await loadDemoSmsPolicies();

  if (typeof body.global_max_inbound_sms_per_hour === 'number') {
    const g = Math.min(10000, Math.max(1, Math.floor(body.global_max_inbound_sms_per_hour)));
    await saveDemoSmsPolicies(policies, g);
    return { policies, global_max_inbound_sms_per_hour: g };
  }

  const key = body.phone_key ? normalizePolicyPhone(body.phone_key) : '';
  if (!key) throw new Error('phone_key required');

  const idx = policies.findIndex(p => p.phone_key === key);
  const now = new Date().toISOString();
  const cur: DemoSmsPolicy =
    idx >= 0
      ? { ...policies[idx]! }
      : {
          phone_key: key,
          sms_blocked: false,
          block_reason: null,
          blocked_at: null,
          blocked_source: null,
          admin_override_unblock: false,
          max_inbound_sms_per_hour: null,
          blocked_notice_sent_at: null,
          updated_at: now,
          client_id: null,
          client_name: null,
        };

  if (body.clear_block) {
    cur.sms_blocked = false;
    cur.block_reason = null;
    cur.blocked_at = null;
    cur.blocked_source = null;
    cur.admin_override_unblock = false;
    cur.blocked_notice_sent_at = null;
  } else {
    if (typeof body.sms_blocked === 'boolean') cur.sms_blocked = body.sms_blocked;
    if (typeof body.admin_override_unblock === 'boolean') cur.admin_override_unblock = body.admin_override_unblock;
    if (body.max_inbound_sms_per_hour !== undefined) cur.max_inbound_sms_per_hour = body.max_inbound_sms_per_hour;
    if (body.sms_blocked && !cur.blocked_at) {
      cur.blocked_at = now;
      cur.blocked_source = 'admin';
    }
  }
  cur.updated_at = now;

  if (idx >= 0) policies[idx] = cur;
  else policies.push(cur);

  await saveDemoSmsPolicies(policies);
  return loadDemoSmsPolicies();
}

export async function postDemoSmsPolicy(body: {
  action?: string;
  phone?: string;
  reason?: string;
  max_inbound_sms_per_hour?: number;
}) {
  const phone = body.phone ? normalizePolicyPhone(body.phone) : '';
  if (!phone) throw new Error('phone required');

  const { policies } = await loadDemoSmsPolicies();
  const now = new Date().toISOString();
  let cur = policies.find(p => p.phone_key === phone);
  if (!cur) {
    cur = {
      phone_key: phone,
      sms_blocked: false,
      block_reason: null,
      blocked_at: null,
      blocked_source: null,
      admin_override_unblock: false,
      max_inbound_sms_per_hour: null,
      blocked_notice_sent_at: null,
      updated_at: now,
      client_id: null,
      client_name: null,
    };
    policies.push(cur);
  }

  if (body.action === 'block') {
    cur.sms_blocked = true;
    cur.block_reason = body.reason?.trim() || 'Blocked by admin';
    cur.blocked_at = now;
    cur.blocked_source = 'admin';
    cur.admin_override_unblock = false;
    cur.blocked_notice_sent_at = now;
  } else if (body.action === 'set_limit') {
    cur.sms_blocked = false;
    cur.max_inbound_sms_per_hour =
      typeof body.max_inbound_sms_per_hour === 'number' ? Math.floor(body.max_inbound_sms_per_hour) : 100;
  }
  cur.updated_at = now;

  await saveDemoSmsPolicies(policies);
  return loadDemoSmsPolicies();
}

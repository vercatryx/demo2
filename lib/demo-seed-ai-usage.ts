/**
 * Demo AI / SMS / voice usage data for /admin/ai-usage.
 * Uses valid usage_events channels: admin_sms_tester (LLM), sms, voice.
 */
import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizePhone } from '@/lib/phone-utils';

export type AiUsageSeedDb = Pick<SupabaseClient, 'from'>;

const DEMO_POLICIES_KEY = 'demo_sms_peer_policies';
const DEMO_GLOBAL_CAP_KEY = 'demo_sms_global_inbound_cap';

const INBOUND_SMS = [
  'Can I add extra meals for Thursday?',
  'What is on my menu this week?',
  'Please skip delivery tomorrow.',
  'I need to change my address.',
  'Is my order confirmed for Friday?',
  'Can you send the portal link again?',
  'Add one more breakfast slot please.',
  'Who is my assigned driver?',
];

const OUTBOUND_SMS = [
  'I can help update your meal plan — which day should we change?',
  'Your next delivery is scheduled. Reply YES to confirm.',
  'I saved those items to your upcoming order.',
  'You can also manage orders at the customer portal.',
  'Got it — I removed that day from your schedule.',
  'Thanks! Your note was added for the kitchen.',
];

const LLM_MODELS = ['claude-haiku-4-5', 'claude-sonnet-4-5', 'gpt-4o-mini'];

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function phoneKey(raw: string): string {
  return normalizePhone(raw) || raw.replace(/\D/g, '');
}

export type DemoSmsPolicy = {
  phone_key: string;
  sms_blocked: boolean;
  block_reason: string | null;
  blocked_at: string | null;
  blocked_source: string | null;
  admin_override_unblock: boolean;
  max_inbound_sms_per_hour: number | null;
  blocked_notice_sent_at: string | null;
  updated_at: string;
  client_id: string | null;
  client_name: string | null;
};

export async function seedAiUsageData(db: AiUsageSeedDb): Promise<{ usageEvents: number; policies: number }> {
  const { data: clients, error: clientErr } = await db
    .from('clients')
    .select('id, full_name, phone_number')
    .not('phone_number', 'is', null)
    .limit(80);
  if (clientErr) throw clientErr;

  const withPhone = (clients ?? []).filter(c => c.phone_number && String(c.phone_number).trim());
  if (withPhone.length < 5) {
    throw new Error('Need clients with phone_number — run full demo seed first.');
  }

  await db.from('usage_events').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  const usageRows: Record<string, unknown>[] = [];
  const now = Date.now();
  const days = 30;

  for (let day = 0; day < days; day++) {
    const dayMs = now - day * 86400000;
    const eventsPerDay = day < 7 ? 22 : 12;

    for (let e = 0; e < eventsPerDay; e++) {
      const client = withPhone[(day * 3 + e) % withPhone.length]!;
      const e164 = phoneKey(String(client.phone_number));
      const at = new Date(dayMs - e * 47 * 60 * 1000).toISOString();
      const roll = (day + e) % 10;

      if (roll <= 4) {
        const model = LLM_MODELS[(day + e) % LLM_MODELS.length]!;
        usageRows.push({
          id: randomUUID(),
          kind: 'llm_completion',
          channel: 'admin_sms_tester',
          provider: 'anthropic',
          model,
          client_id: client.id,
          phone_e164: e164,
          input_tokens: 8_000 + (e % 5) * 4_200 + day * 120,
          output_tokens: 1_200 + (e % 4) * 380,
          occurred_at: at,
          metadata: {},
        });
      } else if (roll <= 8) {
        const inbound = e % 2 === 0;
        const bodies = inbound ? INBOUND_SMS : OUTBOUND_SMS;
        usageRows.push({
          id: randomUUID(),
          kind: 'sms_message',
          channel: 'sms',
          provider: 'telnyx',
          client_id: client.id,
          phone_e164: e164,
          sms_segments: 1 + (e % 3),
          sms_direction: inbound ? 'inbound' : 'outbound',
          occurred_at: at,
          metadata: { body: bodies[(day + e) % bodies.length]! },
        });
      } else {
        usageRows.push({
          id: randomUUID(),
          kind: 'voice_call',
          channel: 'voice',
          provider: 'retell',
          client_id: client.id,
          phone_e164: e164,
          duration_seconds: 45 + (e % 6) * 30,
          retell_call_id: `demo_call_${day}_${e}_${randomUUID().slice(0, 8)}`,
          occurred_at: at,
          metadata: {},
        });
      }
    }
  }

  // Extra SMS threads for transcript drawer (dense back-and-forth on top peers)
  const threadClients = withPhone.slice(0, 18);
  for (let t = 0; t < threadClients.length; t++) {
    const client = threadClients[t]!;
    const e164 = phoneKey(String(client.phone_number));
    for (let m = 0; m < 6; m++) {
      const inbound = m % 2 === 0;
      usageRows.push({
        id: randomUUID(),
        kind: 'sms_message',
        channel: 'sms',
        provider: 'telnyx',
        client_id: client.id,
        phone_e164: e164,
        sms_segments: 1,
        sms_direction: inbound ? 'inbound' : 'outbound',
        occurred_at: new Date(now - t * 3600000 - m * 180000).toISOString(),
        metadata: { body: (inbound ? INBOUND_SMS : OUTBOUND_SMS)[(t + m) % 8] },
      });
    }
  }

  for (const batch of chunk(usageRows, 80)) {
    const { error } = await db.from('usage_events').insert(batch);
    if (error) throw error;
  }

  const policyClients = withPhone.slice(0, 6);
  const policies: DemoSmsPolicy[] = [
    {
      phone_key: phoneKey(String(policyClients[0]!.phone_number)),
      sms_blocked: true,
      block_reason: 'Repeated spam after opt-out',
      blocked_at: new Date(now - 5 * 86400000).toISOString(),
      blocked_source: 'admin',
      admin_override_unblock: false,
      max_inbound_sms_per_hour: null,
      blocked_notice_sent_at: new Date(now - 5 * 86400000).toISOString(),
      updated_at: new Date(now - 86400000).toISOString(),
      client_id: policyClients[0]!.id as string,
      client_name: policyClients[0]!.full_name as string,
    },
    {
      phone_key: phoneKey(String(policyClients[1]!.phone_number)),
      sms_blocked: false,
      block_reason: null,
      blocked_at: null,
      blocked_source: null,
      admin_override_unblock: false,
      max_inbound_sms_per_hour: 25,
      blocked_notice_sent_at: null,
      updated_at: new Date(now - 2 * 86400000).toISOString(),
      client_id: policyClients[1]!.id as string,
      client_name: policyClients[1]!.full_name as string,
    },
    {
      phone_key: phoneKey(String(policyClients[2]!.phone_number)),
      sms_blocked: true,
      block_reason: 'Wrong number — not a client',
      blocked_at: new Date(now - 12 * 86400000).toISOString(),
      blocked_source: 'auto_rate_limit',
      admin_override_unblock: true,
      max_inbound_sms_per_hour: null,
      blocked_notice_sent_at: null,
      updated_at: new Date(now - 3 * 86400000).toISOString(),
      client_id: policyClients[2]!.id as string,
      client_name: policyClients[2]!.full_name as string,
    },
    {
      phone_key: phoneKey(String(policyClients[3]!.phone_number)),
      sms_blocked: false,
      block_reason: null,
      blocked_at: null,
      blocked_source: null,
      admin_override_unblock: false,
      max_inbound_sms_per_hour: 50,
      blocked_notice_sent_at: null,
      updated_at: new Date(now - 86400000).toISOString(),
      client_id: policyClients[3]!.id as string,
      client_name: policyClients[3]!.full_name as string,
    },
    {
      phone_key: '+15558675309',
      sms_blocked: true,
      block_reason: 'Manual block — abusive language',
      blocked_at: new Date(now - 86400000).toISOString(),
      blocked_source: 'admin',
      admin_override_unblock: false,
      max_inbound_sms_per_hour: null,
      blocked_notice_sent_at: new Date(now - 86400000).toISOString(),
      updated_at: new Date().toISOString(),
      client_id: null,
      client_name: null,
    },
  ];

  await db.from('settings').delete().in('key', [DEMO_POLICIES_KEY, DEMO_GLOBAL_CAP_KEY]);
  await db.from('settings').insert([
    { id: randomUUID(), key: DEMO_POLICIES_KEY, value: JSON.stringify(policies) },
    { id: randomUUID(), key: DEMO_GLOBAL_CAP_KEY, value: '100' },
  ]);

  return { usageEvents: usageRows.length, policies: policies.length };
}

export const DEMO_SMS_POLICY_SETTINGS = {
  policiesKey: DEMO_POLICIES_KEY,
  globalCapKey: DEMO_GLOBAL_CAP_KEY,
} as const;

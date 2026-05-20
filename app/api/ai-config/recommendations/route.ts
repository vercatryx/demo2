/**
 * Admin-only: generate AI recommendations for the current instruction text.
 *
 * Returns a list of small, actionable suggestions that can be applied as
 * string replacements (find -> replace).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { callLLM, type LlmProvider } from '@/lib/ai/llm';

const LOG = '[ai-config:recommendations]';

async function requireAdmin() {
  const session = await getSession();
  if (!session?.userId) return { ok: false as const, status: 401, msg: 'Not authenticated' };
  if (session.role !== 'admin' && session.role !== 'super-admin') return { ok: false as const, status: 403, msg: 'Admins only' };
  return { ok: true as const };
}

type Recommendation = {
  id: string;
  title: string;
  reason: string;
  severity: 'blocker' | 'high' | 'medium';
  op: 'replace' | 'insert_before' | 'insert_after';
  /**
   * For replace: exact substring to locate in the input prompt.
   * For insert: anchor substring to insert around.
   */
  anchor: string;
  /**
   * For replace: replacement text.
   * For insert: text to insert.
   */
  content: string;
};

function safeJsonParse(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractJson(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) return trimmed;
  const fence = trimmed.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fence?.[1]) return fence[1].trim();
  const anyFence = trimmed.match(/```\s*([\s\S]*?)\s*```/);
  if (anyFence?.[1]) return anyFence[1].trim();
  return null;
}

function normalizeRecommendations(raw: unknown): Recommendation[] {
  const arr = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' && Array.isArray((raw as any).recommendations) ? (raw as any).recommendations : []);
  const out: Recommendation[] = [];
  for (const r of arr as any[]) {
    if (!r || typeof r !== 'object') continue;
    const id = typeof r.id === 'string' && r.id.trim() ? r.id.trim() : `rec_${out.length + 1}`;
    const title = typeof r.title === 'string' ? r.title.trim() : '';
    const reason = typeof r.reason === 'string' ? r.reason.trim() : '';

    const severityRaw = typeof r.severity === 'string' ? r.severity.trim().toLowerCase() : 'medium';
    const severity: Recommendation['severity'] =
      severityRaw === 'blocker' ? 'blocker' : severityRaw === 'high' ? 'high' : 'medium';

    const opRaw = typeof r.op === 'string' ? r.op.trim().toLowerCase() : 'replace';
    const op: Recommendation['op'] =
      opRaw === 'insert_before' ? 'insert_before' : opRaw === 'insert_after' ? 'insert_after' : 'replace';

    // Backwards compatible with {find, replace}.
    const anchor = typeof r.anchor === 'string' ? r.anchor : (typeof r.find === 'string' ? r.find : '');
    const content = typeof r.content === 'string' ? r.content : (typeof r.replace === 'string' ? r.replace : '');

    if (!title || !anchor || !content) continue;
    out.push({ id, title, reason, severity, op, anchor, content });
  }
  return out.slice(0, 12);
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.msg }, { status: auth.status });

  let body: { text?: string; provider?: LlmProvider; model?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const text = typeof body.text === 'string' ? body.text : '';
  if (!text.trim()) return NextResponse.json({ ok: true, recommendations: [] as Recommendation[] });

  const provider: LlmProvider = body.provider === 'openai' ? 'openai' : 'anthropic';
  // Always use a "best quality" model for prompt review recommendations.
  // (This is intentionally independent of the SMS model dropdown.)
  const model = provider === 'openai' ? 'gpt-4o' : 'claude-sonnet-4-5';

  const system = [
    'You are a conservative prompt reviewer for a production voice+SMS assistant.',
    'Suggest changes when they will materially improve user experience, safety, or tool reliability — including large fixes if the prompt would otherwise fail.',
    'Do NOT suggest changes for writing style, tone, grammar, or "better English" unless it changes meaning or prevents real errors.',
    'If the prompt is already good enough, return an empty array [] (this is preferred over nitpicking).',
    '',
    'Output MUST be valid JSON: an array of objects with fields:',
    '- id (string)',
    '- title (string)',
    '- reason (string)',
    "- severity (\"blocker\" | \"high\" | \"medium\")",
    "- op (\"replace\" | \"insert_before\" | \"insert_after\")",
    '- anchor (string)  // exact substring to locate in the input prompt (copy/paste)',
    '- content (string) // replacement or insertion text',
    '',
    'Rules:',
    '- Make at most 8 recommendations.',
    "- Each recommendation's anchor must exist verbatim in the input prompt (use copy/paste).",
    '- Prefer smaller patches, but if a large change is required to avoid failure, propose it as a single recommendation (severity=blocker).',
    '- Prefer: tool-call guardrails (require client_id before order tools), resolving contradictions, adding missing "ask a clarifying question" steps, preventing order-modification mistakes, and privacy/compliance constraints.',
    '- Avoid: reformatting, rewriting large sections, or "wordsmithing".',
    '- Do not invent function/tool names; keep any [[tool_tokens]] intact unless recommending a specific change to those tokens.',
  ].join('\n');

  try {
    const out = await callLLM({
      provider,
      model,
      system,
      messages: [{ role: 'user', content: text }],
      maxTokens: 900,
    });

    const jsonText = extractJson(out.text) ?? out.text;
    const parsed = safeJsonParse(jsonText);
    const recs = normalizeRecommendations(parsed);
    return NextResponse.json({ ok: true, recommendations: recs });
  } catch (e) {
    console.error(LOG, 'failed', e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}


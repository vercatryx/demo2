'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Download, RefreshCw, Save, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { CATEGORIES, type CatalogEntry, type FunctionCategory } from '@/lib/ai/functions-catalog';

type ServerState = {
  config: {
    id: string | null;
    general_instructions: string;
    llm_provider: 'anthropic' | 'openai';
    llm_model: string;
    compiled_prompt: string | null;
    updated_at: string | null;
    updated_by: string | null;
  };
  catalog: CatalogEntry[];
};

export function AiBuilderClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [general, setGeneral] = useState('');
  const [provider, setProvider] = useState<'anthropic' | 'openai'>('anthropic');
  const [model, setModel] = useState('claude-haiku-4-5');
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [recommendationsPanelOpen, setRecommendationsPanelOpen] = useState(false);
  const [looksGood, setLooksGood] = useState(false);
  const [recommendations, setRecommendations] = useState<
    Array<{
      id: string;
      title: string;
      reason: string;
      severity: 'blocker' | 'high' | 'medium';
      op: 'replace' | 'insert_before' | 'insert_after';
      anchor: string;
      content: string;
    }>
  >([]);
  const [initialHash, setInitialHash] = useState('');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [expandedFns, setExpandedFns] = useState<Record<string, boolean>>({});

  const editorRef = useRef<HTMLDivElement | null>(null);
  const lastRenderedHtmlRef = useRef<string>('');
  const looksGoodCloseTimerRef = useRef<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/ai-config', { cache: 'no-store' });
        if (!res.ok) throw new Error(`GET ${res.status}`);
        const data = (await res.json()) as ServerState;
        setCatalog(data.catalog ?? []);
        setGeneral(data.config.general_instructions ?? '');
        setProvider(data.config.llm_provider ?? 'anthropic');
        setModel(data.config.llm_model ?? 'claude-haiku-4-5');
        setRecommendations([]);
        setLastSavedAt(data.config.updated_at);
        setInitialHash(hashState(data.config.general_instructions ?? '', data.config.llm_provider ?? 'anthropic', data.config.llm_model ?? 'claude-haiku-4-5'));
      } catch (e) {
        console.error(e);
        toast.error('Failed to load AI config');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const effectiveModel = model;
  const dirty = hashState(general, provider, effectiveModel) !== initialHash;
  const showRecommendations = recommendationsPanelOpen;

  function insertFunctionChip(fn: CatalogEntry) {
    const root = editorRef.current;
    if (!root) return;

    const sel = window.getSelection();
    // If user hasn't focused the editor yet, insert at end.
    // (Otherwise it feels like "nothing happens" when clicking Insert.)
    if (!sel || sel.rangeCount === 0) {
      root.focus();
      const range = document.createRange();
      range.selectNodeContents(root);
      range.collapse(false);
      const s = window.getSelection();
      if (s) {
        s.removeAllRanges();
        s.addRange(range);
      }
    }

    const range = (window.getSelection()?.rangeCount ?? 0) > 0 ? window.getSelection()!.getRangeAt(0) : null;
    if (!range) return;
    if (!root.contains(range.commonAncestorContainer)) {
      root.focus();
      const r = document.createRange();
      r.selectNodeContents(root);
      r.collapse(false);
      const s = window.getSelection();
      if (s) {
        s.removeAllRanges();
        s.addRange(r);
      }
    }

    const chip = document.createElement('span');
    chip.setAttribute('data-fn', fn.name);
    chip.setAttribute('contenteditable', 'false');

    const meta = CATEGORIES[fn.category];
    chip.style.display = 'inline-flex';
    chip.style.alignItems = 'center';
    chip.style.gap = '6px';
    chip.style.padding = '1px 8px';
    chip.style.borderRadius = '999px';
    chip.style.border = `1px solid ${meta.border}`;
    chip.style.background = meta.accentSoft;
    chip.style.color = meta.accent;
    chip.style.fontWeight = '800';
    chip.style.whiteSpace = 'nowrap';
    chip.textContent = fn.label;
    // Insert with surrounding spaces so it reads naturally.
    const beforeSpace = document.createTextNode(' ');
    const afterSpace = document.createTextNode(' ');
    const activeRange = window.getSelection() && window.getSelection()!.rangeCount > 0 ? window.getSelection()!.getRangeAt(0) : null;
    if (!activeRange) return;
    activeRange.deleteContents();
    activeRange.insertNode(afterSpace);
    activeRange.insertNode(chip);
    activeRange.insertNode(beforeSpace);

    // Move caret after the inserted chip.
    const newRange = document.createRange();
    newRange.setStartAfter(afterSpace);
    newRange.collapse(true);
    const s2 = window.getSelection();
    if (s2) {
      s2.removeAllRanges();
      s2.addRange(newRange);
    }

    setGeneral(serializeEditor(root));
  }

  async function getRecommendations() {
    setRecommendationsPanelOpen(true);
    setLooksGood(false);
    if (looksGoodCloseTimerRef.current) {
      window.clearTimeout(looksGoodCloseTimerRef.current);
      looksGoodCloseTimerRef.current = null;
    }
    setRecommendationsLoading(true);
    try {
      const res = await fetch('/api/ai-config/recommendations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: general, provider, model: effectiveModel }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const err = (data as { error?: string } | null)?.error;
        throw new Error(err || `HTTP ${res.status}`);
      }
      const recs = (data as { recommendations?: unknown } | null)?.recommendations;
      const normalized = normalizeRecs(recs);
      setRecommendations(normalized);
      if (normalized.length === 0) {
        setLooksGood(true);
        // Show "Looks good" briefly, then close the panel.
        looksGoodCloseTimerRef.current = window.setTimeout(() => {
          setRecommendationsPanelOpen(false);
          setLooksGood(false);
          looksGoodCloseTimerRef.current = null;
        }, 2200);
      }
      toast.success('Recommendations generated');
    } catch (e) {
      console.error(e);
      toast.error(`Recommendations failed: ${(e as Error).message}`);
    } finally {
      setRecommendationsLoading(false);
    }
  }

  function applyRecommendation(rec: { id: string; op: string; anchor: string; content: string }) {
    if (!rec.anchor) return;
    clearEditorHighlight(editorRef.current);
    const idx = general.indexOf(rec.anchor);
    if (idx === -1) {
      toast.error('Could not find the target text to replace (prompt changed).');
      return;
    }
    let next = general;
    if (rec.op === 'insert_before') {
      next = general.slice(0, idx) + rec.content + general.slice(idx);
    } else if (rec.op === 'insert_after') {
      next = general.slice(0, idx + rec.anchor.length) + rec.content + general.slice(idx + rec.anchor.length);
    } else {
      next = general.slice(0, idx) + rec.content + general.slice(idx + rec.anchor.length);
    }
    setGeneral(next);
    setRecommendations(prev => prev.filter(r => r.id !== rec.id));
    toast.success('Applied recommendation');
  }

  function rejectRecommendation(id: string) {
    clearEditorHighlight(editorRef.current);
    setRecommendations(prev => prev.filter(r => r.id !== id));
    toast.success('Rejected recommendation');
  }

  useEffect(() => {
    return () => {
      if (looksGoodCloseTimerRef.current) {
        window.clearTimeout(looksGoodCloseTimerRef.current);
        looksGoodCloseTimerRef.current = null;
      }
    };
  }, []);

  // Render rich editor HTML when state changes externally (avoid cursor jumps while focused).
  useEffect(() => {
    const root = editorRef.current;
    if (!root) return;
    const isFocused = document.activeElement === root || root.contains(document.activeElement);
    if (isFocused) return;

    const html = renderEditorHtml(general, catalog);
    if (html !== lastRenderedHtmlRef.current) {
      root.innerHTML = html;
      lastRenderedHtmlRef.current = html;
    }
  }, [general, catalog]);

  async function save(sync: boolean) {
    setSaving(true);
    try {
      const res = await fetch('/api/ai-config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          general_instructions: general,
          llm_provider: provider,
          llm_model: effectiveModel,
          sync,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data as { message?: string })?.message || `HTTP ${res.status}`);

      setLastSavedAt(new Date().toISOString());
      setInitialHash(hashState(general, provider, effectiveModel));

      toast.success('Saved');
    } catch (e) {
      console.error(e);
      toast.error(`Save failed: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={{ padding: 24, color: 'var(--text-secondary)' }}>Loading AI config...</div>;

  return (
    <div style={{ padding: 'var(--spacing-md)', maxWidth: 1500, margin: '0 auto' }}>
      <Header
        dirty={dirty}
        saving={saving}
        lastSavedAt={lastSavedAt}
        provider={provider}
        setProvider={setProvider}
        model={model}
        setModel={setModel}
        onSave={() => save(false)}
        onGetRecommendations={getRecommendations}
        recommendationsLoading={recommendationsLoading}
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: showRecommendations ? '360px 1fr 420px' : '360px 1fr',
          gap: 'var(--spacing-md)',
        }}
      >
        <FunctionSidebar
          catalog={catalog}
          expandedFns={expandedFns}
          setExpandedFns={setExpandedFns}
          onInsert={insertFunctionChip}
        />

        <div>
          <Section title="AI instructions" subtitle="Single textbox. Use the sidebar to insert function blocks directly into the text.">
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              data-placeholder="Write your system prompt here. Use the sidebar to insert colored function chips."
              onInput={() => {
                const root = editorRef.current;
                if (!root) return;
                clearEditorHighlight(root);
                setGeneral(serializeEditor(root));
              }}
              style={{
                width: '100%',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                padding: '0.9rem 1rem',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                fontSize: '0.9rem',
                lineHeight: 1.55,
                height: '70vh',
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                outline: 'none',
              }}
              aria-label="AI instructions editor"
            />
          </Section>
        </div>

        {showRecommendations ? (
          <div style={{ position: 'sticky', top: 12, alignSelf: 'start' }}>
            <Section title="Recommendations" subtitle="Click “Get recommendations” to generate critiques + one-click fixes.">
              <div
                style={{
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-surface)',
                  padding: 12,
                  height: '70vh',
                  overflow: 'auto',
                }}
              >
                {recommendationsLoading ? (
                  <div style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>Generating…</div>
                ) : (
                  recommendations.length === 0 ? (
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 700 }}>
                      {looksGood ? 'Looks good.' : 'No recommendations.'}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {recommendations.map(rec => (
                        <div key={rec.id} style={{ border: '1px solid var(--border-color)', borderRadius: 10, padding: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                            <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{rec.title}</div>
                            <span
                              style={{
                                fontSize: '0.6875rem',
                                fontWeight: 900,
                                padding: '2px 8px',
                                borderRadius: 999,
                                border: '1px solid var(--border-color)',
                                background: rec.severity === 'blocker' ? '#fee2e2' : rec.severity === 'high' ? '#ffedd5' : '#e0f2fe',
                                color: rec.severity === 'blocker' ? '#991b1b' : rec.severity === 'high' ? '#9a3412' : '#075985',
                                whiteSpace: 'nowrap',
                              }}
                              title={rec.severity}
                            >
                              {rec.severity.toUpperCase()}
                            </span>
                          </div>
                          {rec.reason ? (
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', marginTop: 4 }}>
                              {rec.reason}
                            </div>
                          ) : null}
                          <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
                          <details
                            onToggle={e => {
                              const open = (e.currentTarget as HTMLDetailsElement).open;
                              if (!open) return;
                              // Highlight and scroll to the anchor in the editor.
                              highlightEditorAnchor(editorRef.current, rec.anchor);
                            }}
                          >
                              <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>Show change</summary>
                              <div style={{ marginTop: 6 }}>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: 4 }}>
                                  {rec.op === 'insert_before' ? 'Insert before anchor:' : rec.op === 'insert_after' ? 'Insert after anchor:' : 'Replace:'}
                                </div>
                                <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0, padding: 8, borderRadius: 8, border: '1px solid var(--border-color)' }}>{rec.anchor}</pre>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', margin: '8px 0 4px' }}>
                                  {rec.op === 'replace' ? 'With:' : 'Insert:'}
                                </div>
                                <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0, padding: 8, borderRadius: 8, border: '1px solid var(--border-color)' }}>{rec.content}</pre>
                              </div>
                            </details>
                          </div>
                          <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button className="btn btn-secondary" type="button" onClick={() => rejectRecommendation(rec.id)}>
                              Reject
                            </button>
                            <button className="btn btn-primary" type="button" onClick={() => applyRecommendation(rec)}>
                              Accept
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            </Section>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function normalizeRecs(
  raw: unknown,
): Array<{ id: string; title: string; reason: string; severity: 'blocker' | 'high' | 'medium'; op: 'replace' | 'insert_before' | 'insert_after'; anchor: string; content: string }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ id: string; title: string; reason: string; severity: 'blocker' | 'high' | 'medium'; op: 'replace' | 'insert_before' | 'insert_after'; anchor: string; content: string }> = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const id = typeof (r as any).id === 'string' && (r as any).id ? (r as any).id : `rec_${out.length + 1}`;
    const title = typeof (r as any).title === 'string' ? String((r as any).title) : '';
    const reason = typeof (r as any).reason === 'string' ? String((r as any).reason) : '';
    const severityRaw = typeof (r as any).severity === 'string' ? String((r as any).severity).toLowerCase() : 'medium';
    const severity = severityRaw === 'blocker' ? 'blocker' : severityRaw === 'high' ? 'high' : 'medium';
    const opRaw = typeof (r as any).op === 'string' ? String((r as any).op).toLowerCase() : 'replace';
    const op = opRaw === 'insert_before' ? 'insert_before' : opRaw === 'insert_after' ? 'insert_after' : 'replace';
    const anchor =
      typeof (r as any).anchor === 'string'
        ? String((r as any).anchor)
        : typeof (r as any).find === 'string'
          ? String((r as any).find)
          : '';
    const content =
      typeof (r as any).content === 'string'
        ? String((r as any).content)
        : typeof (r as any).replace === 'string'
          ? String((r as any).replace)
          : '';
    if (!title || !anchor || !content) continue;
    out.push({ id, title, reason, severity, op, anchor, content });
  }
  return out;
}

function clearEditorHighlight(root: HTMLElement | null) {
  if (!root) return;
  const marks = Array.from(root.querySelectorAll('[data-rec-highlight="true"]'));
  for (const m of marks) {
    const parent = m.parentNode;
    if (!parent) continue;
    parent.replaceChild(document.createTextNode(m.textContent ?? ''), m);
    parent.normalize();
  }
}

function highlightEditorAnchor(root: HTMLElement | null, anchor: string) {
  if (!root) return;
  clearEditorHighlight(root);
  const needle = (anchor ?? '').trim();
  if (!needle) return;

  const found = findTextRange(root, needle);
  if (!found) {
    toast.error('Could not locate that text in the editor.');
    return;
  }

  const mark = document.createElement('mark');
  mark.setAttribute('data-rec-highlight', 'true');
  mark.style.background = '#fef08a';
  mark.style.borderRadius = '6px';
  mark.style.padding = '0 2px';
  mark.style.boxShadow = 'inset 0 0 0 1px rgba(0,0,0,0.08)';

  try {
    found.surroundContents(mark);
  } catch {
    // Fallback: if the range crosses nodes we can't surround, just select and scroll.
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(found);
    }
    const el = found.startContainer instanceof Element ? found.startContainer : found.startContainer.parentElement;
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return;
  }

  mark.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function findTextRange(root: HTMLElement, needle: string): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      // Skip empty or whitespace-only text nodes.
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      // Skip any text inside function chips (contenteditable=false spans)
      const el = node.parentElement;
      if (el && el.closest('[contenteditable="false"]')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  // Build a map from concatenated plain text -> text nodes.
  const nodes: Array<{ node: Text; start: number; end: number }> = [];
  let text = '';
  let n = walker.nextNode();
  while (n) {
    const t = n as Text;
    const start = text.length;
    text += t.nodeValue ?? '';
    const end = text.length;
    nodes.push({ node: t, start, end });
    n = walker.nextNode();
  }

  const idx = text.indexOf(needle);
  if (idx === -1) return null;
  const endIdx = idx + needle.length;

  const startNode = nodes.find(x => idx >= x.start && idx < x.end);
  const endNode = nodes.find(x => endIdx > x.start && endIdx <= x.end);
  if (!startNode || !endNode) return null;

  const range = document.createRange();
  range.setStart(startNode.node, idx - startNode.start);
  range.setEnd(endNode.node, endIdx - endNode.start);
  return range;
}

function Header({
  dirty,
  saving,
  lastSavedAt,
  provider,
  setProvider,
  model,
  setModel,
  onSave,
  onGetRecommendations,
  recommendationsLoading,
}: {
  dirty: boolean;
  saving: boolean;
  lastSavedAt: string | null;
  provider: 'anthropic' | 'openai';
  setProvider: (v: 'anthropic' | 'openai') => void;
  model: string;
  setModel: (v: string) => void;
  onSave: () => void;
  onGetRecommendations: () => void;
  recommendationsLoading: boolean;
}) {
  const modelOptions =
    provider === 'anthropic'
      ? ([
          { id: 'claude-haiku-4-5', label: 'Haiku 4.5 — Fast & efficient' },
          { id: 'claude-sonnet-4-5', label: 'Sonnet 4.5 — Best quality' },
          { id: 'claude-3-5-haiku-latest', label: 'Haiku 3.5 — Fast & efficient' },
          { id: 'claude-3-5-sonnet-latest', label: 'Sonnet 3.5 — Best quality' },
          { id: 'claude-3-haiku-20240307', label: 'Haiku 3 — Legacy' },
          { id: 'claude-3-sonnet-20240229', label: 'Sonnet 3 — Legacy' },
          { id: 'claude-3-opus-20240229', label: 'Opus 3 — Legacy' },
        ] as const)
      : ([
          { id: 'gpt-4o-mini', label: 'GPT-4o mini — Fast & efficient' },
          { id: 'gpt-4o', label: 'GPT-4o — Best quality' },
          { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini — Fast & efficient' },
          { id: 'gpt-4.1', label: 'GPT-4.1 — Best quality' },
          { id: 'gpt-4-turbo', label: 'GPT-4 Turbo — Legacy' },
        ] as const);

  return (
    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--spacing-md)', flexWrap: 'wrap', gap: 'var(--spacing-sm)' }}>
      <div style={{ minWidth: 320 }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>AI Instructions Builder</h1>
        <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0' }}>Local demo — edits are saved to the database only (no voice or SMS providers).</p>
        <p style={{ color: 'var(--text-tertiary)', margin: '4px 0 0', fontSize: '0.8125rem' }}>
          {lastSavedAt ? `Last saved ${new Date(lastSavedAt).toLocaleString()}` : 'Not yet saved'}
          {dirty ? <span style={{ color: '#f59e0b', marginLeft: 8 }}>• Unsaved changes</span> : null}
        </p>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select className="input" value={provider} onChange={e => setProvider(e.target.value as any)} style={{ minWidth: 140 }}>
          <option value="anthropic">Anthropic</option>
          <option value="openai">OpenAI</option>
        </select>
          <select className="input" value={model} onChange={e => setModel(e.target.value)} style={{ minWidth: 320 }}>
          {modelOptions.map(m => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
        </div>
        <button onClick={onGetRecommendations} disabled={saving || recommendationsLoading} className="btn btn-secondary" title="Generate AI recommendations for this prompt">
          {recommendationsLoading ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
          <span style={{ marginLeft: 6 }}>Get recommendations</span>
        </button>
        <button onClick={onSave} disabled={!dirty || saving} className="btn btn-primary">
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
          <span style={{ marginLeft: 6 }}>Save</span>
        </button>
      </div>
    </header>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', fontWeight: 700 }}>{label}</span>
      {children}
      {hint ? <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{hint}</span> : null}
    </label>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 'var(--spacing-md)' }}>
      <h2 style={{ fontSize: '1.0625rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>{title}</h2>
      {subtitle ? <p style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)', margin: '2px 0 10px' }}>{subtitle}</p> : null}
      {children}
    </section>
  );
}

function FunctionSidebar({
  catalog,
  expandedFns,
  setExpandedFns,
  onInsert,
}: {
  catalog: CatalogEntry[];
  expandedFns: Record<string, boolean>;
  setExpandedFns: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  onInsert: (fn: CatalogEntry) => void;
}) {
  const order: FunctionCategory[] = ['read', 'write', 'call-control'];
  const grouped = useMemo(() => {
    const g: Record<FunctionCategory, CatalogEntry[]> = { read: [], write: [], 'call-control': [] };
    for (const c of catalog) g[c.category].push(c);
    return g;
  }, [catalog]);

  return (
    <div style={{ position: 'sticky', top: 12, alignSelf: 'start' }}>
      <Section title="Functions" subtitle="Click a function to see details, then insert it into the prompt.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {order.map(cat => {
            const meta = CATEGORIES[cat];
            return (
              <div key={cat} style={{ border: `1px solid ${meta.border}`, borderRadius: 'var(--radius-md)', padding: 10, background: meta.accentSoft }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: meta.accent, fontWeight: 900, fontSize: '0.9rem' }}>
                  {meta.label}
                </div>
                <p style={{ margin: '2px 0 10px', color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>{meta.description}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {grouped[cat].map(fn => {
                    const isOpen = !!expandedFns[fn.name];
                    return (
                      <div key={fn.name} style={{ border: `1px solid ${meta.border}`, borderRadius: 10, background: 'var(--bg-surface)' }}>
                        <button
                          type="button"
                          onClick={() => setExpandedFns(s => ({ ...s, [fn.name]: !s[fn.name] }))}
                          style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 8,
                            padding: '10px 10px',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--text-primary)',
                          }}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            <span style={{ fontWeight: 900, fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {fn.label}
                            </span>
                            <span style={{ fontSize: '0.65rem', color: meta.accent, background: meta.accentSoft, padding: '1px 6px', borderRadius: 999, border: `1px solid ${meta.border}`, fontWeight: 900, letterSpacing: 0.3 }}>
                              {meta.badge}
                            </span>
                          </span>
                        </button>
                        {isOpen ? (
                          <div style={{ padding: '0 10px 10px' }}>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                              <div style={{ marginBottom: 6 }}><strong>What it does:</strong> {fn.description}</div>
                              <div style={{ marginBottom: 6 }}><strong>Arguments:</strong> {fn.paramsSummary}</div>
                              <div style={{ marginBottom: 6 }}><strong>Required data:</strong> {fn.requiredData.join('; ')}</div>
                              <div style={{ marginBottom: 10 }}><strong>Default guidance:</strong> {fn.defaultWhenToCall}</div>
                            </div>
                            <button type="button" className="btn btn-secondary" onClick={() => onInsert(fn)}>
                              <Copy size={14} /> Insert into prompt
                            </button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

function renderEditorHtml(text: string, catalog: CatalogEntry[]): string {
  const byName = new Map(catalog.map(c => [c.name, c]));
  const escape = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#039;');

  const tokenRe = /\[\[([a-z0-9_]+)\]\]/gi;
  let out = '';
  let last = 0;
  for (const m of text.matchAll(tokenRe)) {
    const idx = m.index ?? 0;
    const name = String(m[1] ?? '');
    out += escape(text.slice(last, idx));
    const entry = byName.get(name);
    if (entry) {
      const meta = CATEGORIES[entry.category];
      out += `<span data-fn="${escape(entry.name)}" contenteditable="false" style="display:inline-flex;align-items:center;padding:1px 8px;border-radius:999px;border:1px solid ${meta.border};background:${meta.accentSoft};color:${meta.accent};font-weight:800;white-space:nowrap;">${escape(entry.label)}</span>`;
    } else {
      out += escape(m[0] ?? '');
    }
    last = idx + (m[0]?.length ?? 0);
  }
  out += escape(text.slice(last));
  // If empty, show a placeholder (purely visual, not serialized).
  const html = out.replace(/\n/g, '<br/>');
  return html.trim().length === 0
    ? `<span style="color:var(--text-tertiary);">${escape('Write your system prompt here. Use the sidebar to insert colored function chips.')}</span>`
    : html;
}

function serializeEditor(root: HTMLElement): string {
  const parts: string[] = [];

  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent ?? '');
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;

    if (el.tagName === 'BR') {
      parts.push('\n');
      return;
    }
    const fn = el.getAttribute('data-fn');
    if (fn) {
      parts.push(`[[${fn}]]`);
      return;
    }

    for (const child of Array.from(el.childNodes)) walk(child);
  }

  walk(root);
  return parts.join('');
}

function hashState(general: string, provider: string, model: string) {
  return JSON.stringify({ general, provider, model });
}


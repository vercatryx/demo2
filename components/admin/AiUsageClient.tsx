'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BarChart3, MessageSquare, PieChart, RefreshCw, Settings2, ShieldAlert, X } from 'lucide-react';
import { toast } from 'sonner';
import { formatUsdEstimate } from '@/lib/billing/format-usd-estimate';
import s from '@/components/admin/AiUsageClient.module.css';

type UsageEvent = {
    id: string;
    occurred_at: string;
    kind: string;
    channel: string;
    provider: string | null;
    phone_e164: string | null;
    client_id: string | null;
    client_name: string | null;
    model: string | null;
    input_tokens: number | null;
    output_tokens: number | null;
    sms_segments: number | null;
    sms_direction: string | null;
    duration_seconds: number | null;
    retell_call_id: string | null;
    estimated_usd: number;
};

type Summary = {
    totalRows: number;
    inputTokens: number;
    outputTokens: number;
    smsSegmentsInbound: number;
    smsSegmentsOutbound: number;
    voiceSeconds: number;
    estimatedUsdSum: number;
    llmByModel: Record<string, { input: number; output: number; completions: number }>;
    pricingConfigured?: boolean;
};

type SmsPeerRow = {
    peerNumber: string;
    totalCount: number;
    inboundCount: number;
    outboundCount: number;
    firstMessageAt: string;
    lastMessageAt: string;
    clientId: string | null;
    clientName: string | null;
};

type RateRow = {
    id: string;
    dimension: string;
    model_key: string;
    usd_per_unit: number;
    label: string | null;
    updated_at: string;
};

type ConvMsg = {
    id: string;
    direction: 'inbound' | 'outbound';
    body: string;
    created_at: string;
    from_number: string;
    to_number: string;
};

type PolicyRow = {
    phone_key: string;
    sms_blocked: boolean;
    block_reason: string | null;
    blocked_at: string | null;
    blocked_source: string | null;
    admin_override_unblock: boolean;
    /** null = use global default */
    max_inbound_sms_per_hour: number | null;
    blocked_notice_sent_at: string | null;
    updated_at: string;
    client_id: string | null;
    client_name: string | null;
};

const LIMIT = 50;

function fmtTs(iso: string): string {
    try {
        return new Date(iso).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        });
    } catch {
        return iso;
    }
}

function formatPhoneDisplay(peer: string): string {
    const d = peer.replace(/\D/g, '');
    if (d.length === 10) return `+1 (${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
    if (d.length === 11 && d.startsWith('1')) return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
    return peer;
}

function isoDayStart(day: string): string {
    return new Date(day + 'T00:00:00.000Z').toISOString();
}

function isoDayEnd(day: string): string {
    return new Date(day + 'T23:59:59.999Z').toISOString();
}

export function AiUsageClient() {
    const [tab, setTab] = useState<'overview' | 'sms' | 'rules' | 'events' | 'rates'>('overview');
    const [smsSub, setSmsSub] = useState<'by_number' | 'by_client'>('by_number');

    const defaultFrom = useMemo(() => {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        return d.toISOString().slice(0, 10);
    }, []);
    const defaultTo = useMemo(() => new Date().toISOString().slice(0, 10), []);

    const [from, setFrom] = useState(defaultFrom);
    const [to, setTo] = useState(defaultTo);
    const [kind, setKind] = useState('all');
    const [channel, setChannel] = useState('all');
    const [clientId, setClientId] = useState('');
    const [phone, setPhone] = useState('');
    const [model, setModel] = useState('');
    const [provider, setProvider] = useState('');
    const [smsDirection, setSmsDirection] = useState('all');
    const [q, setQ] = useState('');

    const [sort, setSort] = useState('occurred_at');
    const [order, setOrder] = useState<'asc' | 'desc'>('desc');
    const [offset, setOffset] = useState(0);

    const [events, setEvents] = useState<UsageEvent[]>([]);
    const [total, setTotal] = useState(0);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [loading, setLoading] = useState(false);
    const [rates, setRates] = useState<RateRow[]>([]);
    const [rateEdits, setRateEdits] = useState<Record<string, string>>({});
    const [savingRates, setSavingRates] = useState(false);

    const [smsRows, setSmsRows] = useState<SmsPeerRow[]>([]);
    const [smsLoading, setSmsLoading] = useState(false);
    const [smsRpcHint, setSmsRpcHint] = useState<string | null>(null);

    const [drawerPeer, setDrawerPeer] = useState<string | null>(null);
    const [convMsgs, setConvMsgs] = useState<ConvMsg[]>([]);
    const [convLoading, setConvLoading] = useState(false);

    const [policies, setPolicies] = useState<PolicyRow[]>([]);
    const [policyLoading, setPolicyLoading] = useState(false);
    const [policySavingKey, setPolicySavingKey] = useState<string | null>(null);
    const [policyEdits, setPolicyEdits] = useState<Record<string, { max: string; blocked: boolean; override: boolean }>>({});

    const [manualPhone, setManualPhone] = useState('');
    const [manualNote, setManualNote] = useState('');
    const [rateOnlyPhone, setRateOnlyPhone] = useState('');
    const [rateOnlyMaxHr, setRateOnlyMaxHr] = useState('100');
    const [manualBusy, setManualBusy] = useState(false);

    const [globalInboundCap, setGlobalInboundCap] = useState(100);
    const [globalInboundEdit, setGlobalInboundEdit] = useState('100');
    const [globalInboundSaving, setGlobalInboundSaving] = useState(false);

    const rangeParams = useMemo(() => {
        const p = new URLSearchParams();
        if (from) p.set('from', isoDayStart(from));
        if (to) p.set('to', isoDayEnd(to));
        return p;
    }, [from, to]);

    const usageQueryString = useCallback(() => {
        const p = new URLSearchParams(rangeParams);
        if (kind !== 'all') p.set('kind', kind);
        if (channel !== 'all') p.set('channel', channel);
        if (clientId.trim()) p.set('client_id', clientId.trim());
        if (phone.trim()) p.set('phone', phone.trim());
        if (model.trim()) p.set('model', model.trim());
        if (provider.trim()) p.set('provider', provider.trim());
        if (smsDirection !== 'all') p.set('sms_direction', smsDirection);
        if (q.trim()) p.set('q', q.trim());
        return p.toString();
    }, [rangeParams, kind, channel, clientId, phone, model, provider, smsDirection, q]);

    const loadUsage = useCallback(async () => {
        setLoading(true);
        try {
            const base = usageQueryString();
            const evParams = new URLSearchParams(base);
            evParams.set('sort', sort);
            evParams.set('order', order);
            evParams.set('limit', String(LIMIT));
            evParams.set('offset', String(offset));

            const [evRes, sumRes] = await Promise.all([
                fetch(`/api/admin/usage-events?${evParams.toString()}`, { credentials: 'include' }),
                fetch(`/api/admin/usage-summary?${base}`, { credentials: 'include' }),
            ]);
            if (!evRes.ok) {
                toast.error('Failed to load usage events');
                return;
            }
            if (!sumRes.ok) {
                toast.error('Failed to load summary');
                return;
            }
            const evJson = await evRes.json();
            const sumJson = await sumRes.json();
            setEvents(evJson.events ?? []);
            setTotal(evJson.total ?? 0);
            setSummary(sumJson);
        } finally {
            setLoading(false);
        }
    }, [usageQueryString, sort, order, offset]);

    const loadSms = useCallback(async () => {
        setSmsLoading(true);
        setSmsRpcHint(null);
        try {
            const p = new URLSearchParams(rangeParams);
            if (phone.trim()) p.set('phone', phone.trim());
            if (clientId.trim()) p.set('client_id', clientId.trim());
            const res = await fetch(`/api/admin/sms-usage-by-peer?${p.toString()}`, { credentials: 'include' });
            const j = await res.json();
            if (!res.ok) {
                setSmsRows([]);
                setSmsRpcHint(j.hint ?? j.message ?? 'SMS aggregates unavailable');
                return;
            }
            setSmsRpcHint(null);
            setSmsRows(j.rows ?? []);
        } catch {
            toast.error('Failed to load SMS usage');
            setSmsRows([]);
            setSmsRpcHint('Network error');
        } finally {
            setSmsLoading(false);
        }
    }, [rangeParams, phone, clientId]);

    const loadRates = useCallback(async () => {
        const res = await fetch('/api/admin/usage-pricing', { credentials: 'include' });
        if (!res.ok) {
            toast.error('Failed to load rates');
            return;
        }
        const j = await res.json();
        const list = (j.rates ?? []) as RateRow[];
        setRates(list);
        const edits: Record<string, string> = {};
        for (const r of list) {
            edits[r.id] = String(r.usd_per_unit);
        }
        setRateEdits(edits);
    }, []);

    const loadPolicies = useCallback(async () => {
        setPolicyLoading(true);
        try {
            const res = await fetch('/api/admin/sms-peer-policy', { credentials: 'include' });
            const j = await res.json();
            setPolicies((j.policies ?? []) as PolicyRow[]);
            const g = (j as { global_max_inbound_sms_per_hour?: unknown }).global_max_inbound_sms_per_hour;
            if (typeof g === 'number' && Number.isFinite(g)) {
                const gn = Math.min(10000, Math.max(1, Math.floor(g)));
                setGlobalInboundCap(gn);
                setGlobalInboundEdit(String(gn));
            }
        } catch {
            toast.error('Failed to load SMS policies');
            setPolicies([]);
        } finally {
            setPolicyLoading(false);
        }
    }, []);

    useEffect(() => {
        if (tab === 'overview' || tab === 'events') void loadUsage();
    }, [tab, loadUsage]);

    useEffect(() => {
        if (tab === 'sms' || tab === 'overview') void loadSms();
    }, [tab, loadSms]);

    useEffect(() => {
        if (tab === 'rates') void loadRates();
    }, [tab, loadRates]);

    useEffect(() => {
        if (tab === 'rules') void loadPolicies();
    }, [tab, loadPolicies]);

    useEffect(() => {
        const next: Record<string, { max: string; blocked: boolean; override: boolean }> = {};
        for (const p of policies) {
            next[p.phone_key] = {
                max: p.max_inbound_sms_per_hour == null ? '' : String(p.max_inbound_sms_per_hour),
                blocked: p.sms_blocked,
                override: p.admin_override_unblock,
            };
        }
        setPolicyEdits(next);
    }, [policies]);

    useEffect(() => {
        if (!drawerPeer) {
            setConvMsgs([]);
            return;
        }
        let cancelled = false;
        (async () => {
            setConvLoading(true);
            try {
                const p = new URLSearchParams(rangeParams);
                p.set('phone', drawerPeer);
                p.set('limit', '300');
                const res = await fetch(`/api/admin/sms-conversation?${p}`, { credentials: 'include' });
                if (!res.ok) throw new Error(String(res.status));
                const j = await res.json();
                if (!cancelled) setConvMsgs(j.messages ?? []);
            } catch {
                if (!cancelled) {
                    setConvMsgs([]);
                    toast.error('Could not load conversation');
                }
            } finally {
                if (!cancelled) setConvLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [drawerPeer, rangeParams]);

    const onSort = (col: string) => {
        if (sort === col) setOrder(o => (o === 'asc' ? 'desc' : 'asc'));
        else {
            setSort(col);
            setOrder('desc');
        }
        setOffset(0);
    };

    const applyPreset = (preset: '7d' | '30d' | 'month' | 'all') => {
        const now = new Date();
        const toStr = now.toISOString().slice(0, 10);
        setTo(toStr);
        if (preset === 'all') {
            setFrom('');
            setTo('');
            setOffset(0);
            return;
        }
        const d = new Date();
        if (preset === '7d') d.setDate(d.getDate() - 7);
        else if (preset === '30d') d.setDate(d.getDate() - 30);
        else if (preset === 'month') d.setDate(1);
        setFrom(d.toISOString().slice(0, 10));
        setTo(toStr);
        setOffset(0);
    };

    const saveRates = async () => {
        setSavingRates(true);
        try {
            const updates = rates.map(r => ({
                id: r.id,
                usd_per_unit: Number(rateEdits[r.id]),
            }));
            if (updates.some(u => !Number.isFinite(u.usd_per_unit))) {
                toast.error('Invalid number in rates');
                return;
            }
            const res = await fetch('/api/admin/usage-pricing', {
                method: 'PATCH',
                credentials: 'include',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ updates }),
            });
            if (!res.ok) {
                toast.error('Save failed');
                return;
            }
            const j = await res.json();
            setRates((j.rates ?? []) as RateRow[]);
            toast.success('Rates saved');
            void loadUsage();
        } finally {
            setSavingRates(false);
        }
    };

    const voiceMin = summary ? summary.voiceSeconds / 60 : 0;

    const smsTotals = useMemo(() => {
        let inb = 0;
        let out = 0;
        for (const r of smsRows) {
            inb += r.inboundCount;
            out += r.outboundCount;
        }
        return { inb, out, threads: smsRows.length };
    }, [smsRows]);

    const smsByClient = useMemo(() => {
        type Agg = {
            clientId: string | null;
            clientName: string;
            peers: Set<string>;
            inbound: number;
            outbound: number;
            total: number;
            lastMessageAt: string;
        };
        const m = new Map<string, Agg>();
        for (const r of smsRows) {
            const key = r.clientId ?? `__u:${r.peerNumber}`;
            const cur =
                m.get(key) ??
                ({
                    clientId: r.clientId,
                    clientName: r.clientName ?? (r.clientId ? 'Client' : 'No linked client'),
                    peers: new Set<string>(),
                    inbound: 0,
                    outbound: 0,
                    total: 0,
                    lastMessageAt: r.lastMessageAt,
                } as Agg);
            cur.peers.add(r.peerNumber);
            cur.inbound += r.inboundCount;
            cur.outbound += r.outboundCount;
            cur.total += r.totalCount;
            if (new Date(r.lastMessageAt) > new Date(cur.lastMessageAt)) cur.lastMessageAt = r.lastMessageAt;
            if (!r.clientId) cur.clientName = 'No linked client';
            else if (r.clientName) cur.clientName = r.clientName;
            m.set(key, cur);
        }
        return [...m.values()].sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
    }, [smsRows]);

    const sortedPolicies = useMemo(() => {
        return [...policies].sort((a, b) => {
            if (a.sms_blocked !== b.sms_blocked) return a.sms_blocked ? -1 : 1;
            return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        });
    }, [policies]);

    const saveGlobalInbound = async () => {
        const n = Number(globalInboundEdit);
        if (!Number.isFinite(n) || n < 1 || n > 10000) {
            toast.error('Global max must be 1–10000');
            return;
        }
        setGlobalInboundSaving(true);
        try {
            const res = await fetch('/api/admin/sms-global-settings', {
                method: 'PATCH',
                credentials: 'include',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ max_inbound_sms_per_hour: Math.floor(n) }),
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error((j as { error?: string }).error ?? 'Save failed');
                return;
            }
            const saved = (j as { max_inbound_sms_per_hour?: number }).max_inbound_sms_per_hour;
            if (typeof saved === 'number' && Number.isFinite(saved)) {
                const gn = Math.min(10000, Math.max(1, Math.floor(saved)));
                setGlobalInboundCap(gn);
                setGlobalInboundEdit(String(gn));
            }
            toast.success('Default hourly limit updated for everyone');
        } finally {
            setGlobalInboundSaving(false);
        }
    };

    const savePolicyRow = async (phoneKey: string) => {
        const ed = policyEdits[phoneKey];
        if (!ed) return;
        const blockedEff = ed.blocked && !ed.override;
        let maxPayload: number | null;
        if (blockedEff) {
            maxPayload = null;
        } else {
            const raw = ed.max.trim();
            if (raw === '') maxPayload = null;
            else {
                const n = Number(raw);
                if (!Number.isFinite(n) || n < 1 || n > 10000) {
                    toast.error('Max messages/hour must be 1–10000, or leave blank for the everyone default');
                    return;
                }
                maxPayload = Math.floor(n);
            }
        }
        setPolicySavingKey(phoneKey);
        try {
            const res = await fetch('/api/admin/sms-peer-policy', {
                method: 'PATCH',
                credentials: 'include',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    phone_key: phoneKey,
                    sms_blocked: ed.blocked,
                    admin_override_unblock: ed.override,
                    max_inbound_sms_per_hour: maxPayload,
                }),
            });
            if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                toast.error((j as { error?: string }).error ?? 'Save failed');
                return;
            }
            toast.success('Policy saved');
            await loadPolicies();
        } finally {
            setPolicySavingKey(null);
        }
    };

    const clearPolicyBlock = async (phoneKey: string) => {
        setPolicySavingKey(phoneKey);
        try {
            const res = await fetch('/api/admin/sms-peer-policy', {
                method: 'PATCH',
                credentials: 'include',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ phone_key: phoneKey, clear_block: true }),
            });
            if (!res.ok) {
                toast.error('Clear failed');
                return;
            }
            toast.success('Block cleared');
            await loadPolicies();
        } finally {
            setPolicySavingKey(null);
        }
    };

    const submitManualBlock = async () => {
        const digits = manualPhone.replace(/\D/g, '');
        if (digits.length < 10) {
            toast.error('Enter a full phone number');
            return;
        }
        setManualBusy(true);
        try {
            const res = await fetch('/api/admin/sms-peer-policy', {
                method: 'POST',
                credentials: 'include',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    action: 'block',
                    phone: manualPhone,
                    reason: manualNote.trim() || undefined,
                }),
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error((j as { error?: string }).error ?? 'Block failed');
                return;
            }
            toast.success('Number blocked');
            setManualPhone('');
            setManualNote('');
            await loadPolicies();
        } finally {
            setManualBusy(false);
        }
    };

    const submitRateLimitOnly = async () => {
        const digits = rateOnlyPhone.replace(/\D/g, '');
        if (digits.length < 10) {
            toast.error('Enter a full phone number');
            return;
        }
        const maxN = Number(rateOnlyMaxHr);
        if (!Number.isFinite(maxN) || maxN < 1 || maxN > 10000) {
            toast.error('Max SMS per hour must be between 1 and 10000');
            return;
        }
        setManualBusy(true);
        try {
            const res = await fetch('/api/admin/sms-peer-policy', {
                method: 'POST',
                credentials: 'include',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    action: 'set_limit',
                    phone: rateOnlyPhone,
                    max_inbound_sms_per_hour: Math.floor(maxN),
                }),
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error((j as { error?: string }).error ?? 'Save failed');
                return;
            }
            toast.success('Hourly limit saved (number is not blocked)');
            setRateOnlyPhone('');
            setRateOnlyMaxHr('100');
            await loadPolicies();
        } finally {
            setManualBusy(false);
        }
    };

    const applyFilters = () => {
        setOffset(0);
        void loadUsage();
        void loadSms();
        if (tab === 'rules') void loadPolicies();
    };

    return (
        <div className={s.wrap}>
            <header className={s.hero}>
                <h1 className={s.title}>Usage &amp; conversations</h1>
                <p className={s.lede}>
                    Measured usage from <code className={s.mono}>usage_events</code> (LLM tokens, carrier SMS segments, voice) plus a
                    live read of saved <code className={s.mono}>sms_messages</code> transcripts. Parenthetical dollars use your rate
                    card — configure non-zero rates so estimates are meaningful; small amounts are shown with full precision instead of
                    rounding to <code className={s.mono}>$0.00</code>.
                </p>
            </header>

            <div className={s.tabRow}>
                <button type="button" className={`${s.tab} ${tab === 'overview' ? s.tabActive : ''}`} onClick={() => setTab('overview')}>
                    <PieChart size={16} aria-hidden />
                    Overview
                </button>
                <button type="button" className={`${s.tab} ${tab === 'sms' ? s.tabActive : ''}`} onClick={() => setTab('sms')}>
                    <MessageSquare size={16} aria-hidden />
                    SMS log
                </button>
                <button type="button" className={`${s.tab} ${tab === 'rules' ? s.tabActive : ''}`} onClick={() => setTab('rules')}>
                    <ShieldAlert size={16} aria-hidden />
                    SMS blocking
                </button>
                <button type="button" className={`${s.tab} ${tab === 'events' ? s.tabActive : ''}`} onClick={() => setTab('events')}>
                    <BarChart3 size={16} aria-hidden />
                    AI &amp; voice
                </button>
                <button type="button" className={`${s.tab} ${tab === 'rates' ? s.tabActive : ''}`} onClick={() => setTab('rates')}>
                    <Settings2 size={16} aria-hidden />
                    Rate card
                </button>
            </div>

            <section className={s.filterCard} aria-label="Filters">
                <div className={s.presetRow}>
                    <span className={s.muted} style={{ fontWeight: 600 }}>
                        Range
                    </span>
                    <button type="button" className={s.preset} onClick={() => applyPreset('7d')}>
                        Last 7 days
                    </button>
                    <button type="button" className={s.preset} onClick={() => applyPreset('30d')}>
                        Last 30 days
                    </button>
                    <button type="button" className={s.preset} onClick={() => applyPreset('month')}>
                        This month
                    </button>
                    <button type="button" className={s.preset} onClick={() => applyPreset('all')}>
                        All time
                    </button>
                </div>
                <div className={s.filterGrid}>
                    <div>
                        <div className={s.label}>From</div>
                        <input type="date" className={s.input} value={from} onChange={e => setFrom(e.target.value)} />
                    </div>
                    <div>
                        <div className={s.label}>To</div>
                        <input type="date" className={s.input} value={to} onChange={e => setTo(e.target.value)} />
                    </div>
                    <div>
                        <div className={s.label}>Client UUID</div>
                        <input
                            className={s.input}
                            value={clientId}
                            onChange={e => setClientId(e.target.value)}
                            placeholder="Optional filter"
                        />
                    </div>
                    <div>
                        <div className={s.label}>Phone contains</div>
                        <input className={s.input} value={phone} onChange={e => setPhone(e.target.value)} placeholder="Digits" />
                    </div>
                    {tab === 'events' && (
                        <>
                            <div>
                                <div className={s.label}>Kind</div>
                                <select
                                    className={s.select}
                                    value={kind}
                                    onChange={e => {
                                        setKind(e.target.value);
                                        setOffset(0);
                                    }}
                                >
                                    <option value="all">All</option>
                                    <option value="llm_completion">LLM</option>
                                    <option value="sms_message">SMS</option>
                                    <option value="voice_call">Voice</option>
                                </select>
                            </div>
                            <div>
                                <div className={s.label}>Channel</div>
                                <select
                                    className={s.select}
                                    value={channel}
                                    onChange={e => {
                                        setChannel(e.target.value);
                                        setOffset(0);
                                    }}
                                >
                                    <option value="all">All</option>
                                    <option value="sms">SMS (Telnyx)</option>
                                    <option value="admin_sms_tester">SMS tester</option>
                                    <option value="voice">Voice</option>
                                </select>
                            </div>
                            <div>
                                <div className={s.label}>Model</div>
                                <input className={s.input} value={model} onChange={e => setModel(e.target.value)} />
                            </div>
                            <div>
                                <div className={s.label}>Provider</div>
                                <input className={s.input} value={provider} onChange={e => setProvider(e.target.value)} />
                            </div>
                            <div>
                                <div className={s.label}>SMS direction</div>
                                <select className={s.select} value={smsDirection} onChange={e => setSmsDirection(e.target.value)}>
                                    <option value="all">All</option>
                                    <option value="inbound">Inbound</option>
                                    <option value="outbound">Outbound</option>
                                </select>
                            </div>
                            <div className={s.filterWide}>
                                <div className={s.label}>Search (phone, Retell id, client name)</div>
                                <input className={s.input} value={q} onChange={e => setQ(e.target.value)} placeholder="Apply to refresh" />
                            </div>
                        </>
                    )}
                </div>
                <div style={{ marginTop: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <button type="button" className="btn btn-primary" onClick={() => applyFilters()} disabled={loading || smsLoading || policyLoading}>
                        Apply to all tabs
                    </button>
                    <button type="button" className={s.btnGhost} onClick={() => void loadUsage()} disabled={loading}>
                        <RefreshCw size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                        Refresh usage
                    </button>
                    <button type="button" className={s.btnGhost} onClick={() => void loadSms()} disabled={smsLoading}>
                        Refresh SMS
                    </button>
                    <button type="button" className={s.btnGhost} onClick={() => void loadPolicies()} disabled={policyLoading}>
                        Refresh blocking list
                    </button>
                </div>
            </section>

            {tab === 'overview' && loading && !summary && (
                <div className={s.muted} style={{ padding: '2rem', textAlign: 'center' }}>
                    Loading overview…
                </div>
            )}
            {tab === 'overview' && summary && (
                <>
                    {summary.pricingConfigured === false && (
                        <div className={s.banner}>
                            All rate-card values are still zero — dollar estimates will read <strong>$0</strong> until you set non-zero
                            rates in the <strong>Rate card</strong> tab.
                        </div>
                    )}
                    {smsRpcHint && (
                        <div className={s.banner}>
                            SMS aggregates could not load ({smsRpcHint}).
                        </div>
                    )}
                    <div className={s.statGrid}>
                        <div className={s.statCard}>
                            <div className={s.statLabel}>LLM tokens</div>
                            <div className={s.statValue}>
                                {summary.inputTokens.toLocaleString()} in · {summary.outputTokens.toLocaleString()} out
                            </div>
                            <div className={s.statHint}>
                                Est. {formatUsdEstimate(summary.estimatedUsdSum)} total
                                <span className={s.muted}> (filtered events)</span>
                            </div>
                        </div>
                        <div className={s.statCard}>
                            <div className={s.statLabel}>SMS segments (usage log)</div>
                            <div className={s.statValue}>
                                {summary.smsSegmentsInbound.toLocaleString()} in · {summary.smsSegmentsOutbound.toLocaleString()} out
                            </div>
                            <div className={s.statHint}>From billing-style segment counts on the SMS path.</div>
                        </div>
                        <div className={s.statCard}>
                            <div className={s.statLabel}>Saved SMS messages</div>
                            <div className={s.statValue}>
                                {smsTotals.inb + smsTotals.out} msgs · {smsTotals.threads} numbers
                            </div>
                            <div className={s.statHint}>
                                In {smsTotals.inb.toLocaleString()} / out {smsTotals.out.toLocaleString()} in selected range
                            </div>
                        </div>
                        <div className={s.statCard}>
                            <div className={s.statLabel}>Voice</div>
                            <div className={s.statValue}>{voiceMin.toFixed(1)} min</div>
                            <div className={s.statHint}>{summary.voiceSeconds.toLocaleString()} seconds on record</div>
                        </div>
                        <div className={s.statCard}>
                            <div className={s.statLabel}>Usage rows</div>
                            <div className={s.statValue}>{summary.totalRows.toLocaleString()}</div>
                            <div className={s.statHint}>Matching current filters on the AI &amp; voice tab.</div>
                        </div>
                    </div>
                </>
            )}

            {tab === 'rules' && (
                <>
                    <section className={s.simpleCard}>
                        <h2>Everyone (default)</h2>
                        <p>
                            Max inbound SMS per rolling hour for <strong>all numbers</strong> that do not have their own override below. Blocked numbers do
                            not use this cap — they get a single &ldquo;you are blocked&rdquo; text once, then we never reply again (inbounds are still
                            logged).
                        </p>
                        <div className={s.simpleRow2}>
                            <div>
                                <div className={s.label}>Default max inbound SMS / hour</div>
                                <input
                                    type="number"
                                    className={s.input}
                                    min={1}
                                    max={10000}
                                    value={globalInboundEdit}
                                    onChange={e => setGlobalInboundEdit(e.target.value)}
                                />
                            </div>
                            <div style={{ alignSelf: 'flex-end' }}>
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    disabled={globalInboundSaving}
                                    onClick={() => void saveGlobalInbound()}
                                >
                                    Save default
                                </button>
                            </div>
                        </div>
                    </section>

                    <section className={s.simpleCard}>
                        <h2>Block a number</h2>
                        <p>
                            Stops the SMS bot from replying to this phone. We still store inbound messages. The first text after a block triggers one short
                            notice; after that we send nothing (they can text as much as they want).
                        </p>
                        <div className={s.simpleRow}>
                            <div>
                                <div className={s.label}>Phone number</div>
                                <input
                                    className={s.input}
                                    value={manualPhone}
                                    onChange={e => setManualPhone(e.target.value)}
                                    placeholder="e.g. +1 (555) 123-4567"
                                    autoComplete="tel"
                                />
                            </div>
                            <div>
                                <div className={s.label}>Optional note</div>
                                <input
                                    className={s.input}
                                    value={manualNote}
                                    onChange={e => setManualNote(e.target.value)}
                                    placeholder="Why they are blocked"
                                />
                            </div>
                        </div>
                        <div className={s.simpleActions}>
                            <button type="button" className="btn btn-primary" disabled={manualBusy} onClick={() => void submitManualBlock()}>
                                Block this number
                            </button>
                        </div>
                    </section>

                    <section className={s.simpleCard}>
                        <h2>Per-number override only (do not block)</h2>
                        <p>
                            Sets a different hourly inbound cap for one number. Leave other numbers on the everyone default ({globalInboundCap}/hour). Bot
                            replies continue until they hit this cap or you block them.
                        </p>
                        <div className={s.simpleRow2}>
                            <div>
                                <div className={s.label}>Phone number</div>
                                <input
                                    className={s.input}
                                    value={rateOnlyPhone}
                                    onChange={e => setRateOnlyPhone(e.target.value)}
                                    placeholder="e.g. +1 (555) 123-4567"
                                    autoComplete="tel"
                                />
                            </div>
                            <div>
                                <div className={s.label}>Max inbound SMS per hour</div>
                                <input
                                    type="number"
                                    className={s.input}
                                    min={1}
                                    max={10000}
                                    value={rateOnlyMaxHr}
                                    onChange={e => setRateOnlyMaxHr(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className={s.simpleActions}>
                            <button type="button" className="btn btn-primary" disabled={manualBusy} onClick={() => void submitRateLimitOnly()}>
                                Save hourly limit
                            </button>
                        </div>
                    </section>

                    <section className={s.simpleCard}>
                        <h2>Numbers on file</h2>
                        <p>
                            Rows appear after you use the forms above, when someone hits their hourly cap, or when the system blocks a &ldquo;cannot receive
                            texts&rdquo; auto-reply. <strong>Allow SMS anyway</strong> sends again even if blocked. Max column: leave blank to use the
                            everyone default ({globalInboundCap}/hour).
                        </p>
                        <div className={s.tableCard} style={{ marginTop: 'var(--spacing-md)', border: 'none', boxShadow: 'none' }}>
                            <div className={s.tableScroll}>
                                <table className={s.table}>
                                    <thead>
                                        <tr>
                                            <th>Number</th>
                                            <th>Client</th>
                                            <th style={{ minWidth: '11rem' }}>Max inbound / hour</th>
                                            <th>Status</th>
                                            <th>Details</th>
                                            <th style={{ minWidth: '10rem' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {policyLoading && (
                                            <tr>
                                                <td colSpan={6} className={s.muted} style={{ padding: '2rem', textAlign: 'center' }}>
                                                    Loading…
                                                </td>
                                            </tr>
                                        )}
                                        {!policyLoading && sortedPolicies.length === 0 && (
                                            <tr>
                                                <td colSpan={6} className={s.muted} style={{ padding: '2rem', textAlign: 'center' }}>
                                                    No rows yet — use &ldquo;Block a number&rdquo; or &ldquo;Per-number override only&rdquo; above.
                                                </td>
                                            </tr>
                                        )}
                                        {!policyLoading &&
                                            sortedPolicies.map(row => {
                                                const ed = policyEdits[row.phone_key];
                                                if (!ed) return null;
                                                const blocked = row.sms_blocked && !row.admin_override_unblock;
                                                const overridden = row.sms_blocked && row.admin_override_unblock;
                                                const showMaxEdit = !blocked || overridden;
                                                return (
                                                    <tr key={row.phone_key}>
                                                        <td className={s.mono}>{formatPhoneDisplay(row.phone_key)}</td>
                                                        <td>{row.client_name ?? <span className={s.muted}>—</span>}</td>
                                                        <td>
                                                            {showMaxEdit ? (
                                                                <input
                                                                    type="number"
                                                                    className={s.input}
                                                                    min={1}
                                                                    max={10000}
                                                                    style={{ width: '8rem' }}
                                                                    placeholder={`${globalInboundCap}`}
                                                                    value={ed.max}
                                                                    onChange={e =>
                                                                        setPolicyEdits(prev => ({
                                                                            ...prev,
                                                                            [row.phone_key]: { ...ed, max: e.target.value },
                                                                        }))
                                                                    }
                                                                />
                                                            ) : (
                                                                <span className={s.muted}>—</span>
                                                            )}
                                                        </td>
                                                        <td>
                                                            {overridden && (
                                                                <span style={{ color: 'var(--color-success)', fontWeight: 700 }}>Override on — SMS allowed</span>
                                                            )}
                                                            {blocked && <span style={{ color: 'var(--color-danger)', fontWeight: 700 }}>Blocked</span>}
                                                            {!row.sms_blocked && <span className={s.muted}>Not blocked</span>}
                                                        </td>
                                                        <td>
                                                            <div className={s.muted} style={{ fontSize: '0.78rem', maxWidth: '16rem' }}>
                                                                {row.block_reason ?? '—'}
                                                                {row.blocked_source ? (
                                                                    <div style={{ marginTop: '0.25rem' }}>
                                                                        <em>Source:</em> {row.blocked_source}
                                                                    </div>
                                                                ) : null}
                                                            </div>
                                                            <label
                                                                style={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '0.35rem',
                                                                    marginTop: '0.5rem',
                                                                    fontSize: '0.8125rem',
                                                                    cursor: 'pointer',
                                                                }}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={ed.override}
                                                                    onChange={e =>
                                                                        setPolicyEdits(prev => ({
                                                                            ...prev,
                                                                            [row.phone_key]: { ...ed, override: e.target.checked },
                                                                        }))
                                                                    }
                                                                />
                                                                Allow SMS anyway (override block)
                                                            </label>
                                                            <label
                                                                style={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '0.35rem',
                                                                    marginTop: '0.35rem',
                                                                    fontSize: '0.8125rem',
                                                                    cursor: 'pointer',
                                                                }}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={ed.blocked}
                                                                    onChange={e =>
                                                                        setPolicyEdits(prev => ({
                                                                            ...prev,
                                                                            [row.phone_key]: { ...ed, blocked: e.target.checked },
                                                                        }))
                                                                    }
                                                                />
                                                                Blocked
                                                            </label>
                                                        </td>
                                                        <td>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-primary"
                                                                    style={{ fontSize: '0.8125rem', padding: '0.4rem 0.75rem' }}
                                                                    disabled={policySavingKey === row.phone_key}
                                                                    onClick={() => void savePolicyRow(row.phone_key)}
                                                                >
                                                                    Save changes
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className={s.btnGhost}
                                                                    style={{ fontSize: '0.8125rem' }}
                                                                    disabled={policySavingKey === row.phone_key}
                                                                    onClick={() => void clearPolicyBlock(row.phone_key)}
                                                                >
                                                                    Unblock completely
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </section>
                </>
            )}

            {tab === 'sms' && (
                <>
                    <div className={s.subTabs}>
                        <button
                            type="button"
                            className={`${s.subTab} ${smsSub === 'by_number' ? s.subTabActive : ''}`}
                            onClick={() => setSmsSub('by_number')}
                        >
                            By number
                        </button>
                        <button
                            type="button"
                            className={`${s.subTab} ${smsSub === 'by_client' ? s.subTabActive : ''}`}
                            onClick={() => setSmsSub('by_client')}
                        >
                            By client
                        </button>
                    </div>
                    {smsRpcHint && <div className={s.banner}>{smsRpcHint}</div>}
                    {smsSub === 'by_number' && (
                        <div className={s.tableCard}>
                            <div className={s.tableScroll}>
                                <table className={s.table}>
                                    <thead>
                                        <tr>
                                            <th>Number</th>
                                            <th>Client</th>
                                            <th className={s.right}>Inbound</th>
                                            <th className={s.right}>Outbound</th>
                                            <th className={s.right}>Total</th>
                                            <th>Last activity</th>
                                            <th />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {smsLoading && (
                                            <tr>
                                                <td colSpan={7} className={s.muted} style={{ padding: '2rem', textAlign: 'center' }}>
                                                    Loading…
                                                </td>
                                            </tr>
                                        )}
                                        {!smsLoading &&
                                            smsRows.map(row => (
                                                <tr key={row.peerNumber}>
                                                    <td className={s.mono}>{formatPhoneDisplay(row.peerNumber)}</td>
                                                    <td>{row.clientName ?? <span className={s.muted}>—</span>}</td>
                                                    <td className={s.right}>{row.inboundCount.toLocaleString()}</td>
                                                    <td className={s.right}>{row.outboundCount.toLocaleString()}</td>
                                                    <td className={s.right}>{row.totalCount.toLocaleString()}</td>
                                                    <td>{fmtTs(row.lastMessageAt)}</td>
                                                    <td>
                                                        <button type="button" className={s.linkish} onClick={() => setDrawerPeer(row.peerNumber)}>
                                                            Transcript
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        {!smsLoading && smsRows.length === 0 && (
                                            <tr>
                                                <td colSpan={7} className={s.muted} style={{ padding: '2rem', textAlign: 'center' }}>
                                                    No messages in this range.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                    {smsSub === 'by_client' && (
                        <div>
                            {smsByClient.map(agg => (
                                <div key={`${agg.clientId ?? 'un'}-${[...agg.peers].sort().join('|')}`} className={s.clientGroup}>
                                    <div className={s.clientGroupHead}>
                                        <span>{agg.clientName}</span>
                                        <span className={s.muted}>
                                            {agg.total.toLocaleString()} msgs · {agg.peers.size} number{agg.peers.size === 1 ? '' : 's'}
                                        </span>
                                    </div>
                                    <div className={s.clientGroupBody}>
                                        <div className={s.tableScroll}>
                                            <table className={s.table}>
                                                <thead>
                                                    <tr>
                                                        <th>Number</th>
                                                        <th className={s.right}>In</th>
                                                        <th className={s.right}>Out</th>
                                                        <th />
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {smsRows
                                                        .filter(r =>
                                                            agg.clientId ? r.clientId === agg.clientId : !r.clientId && agg.peers.has(r.peerNumber)
                                                        )
                                                        .map(r => (
                                                            <tr key={r.peerNumber}>
                                                                <td className={s.mono}>{formatPhoneDisplay(r.peerNumber)}</td>
                                                                <td className={s.right}>{r.inboundCount.toLocaleString()}</td>
                                                                <td className={s.right}>{r.outboundCount.toLocaleString()}</td>
                                                                <td>
                                                                    <button type="button" className={s.linkish} onClick={() => setDrawerPeer(r.peerNumber)}>
                                                                        Transcript
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {!smsLoading && smsByClient.length === 0 && (
                                <p className={s.muted} style={{ padding: '2rem', textAlign: 'center' }}>
                                    No data.
                                </p>
                            )}
                        </div>
                    )}
                </>
            )}

            {tab === 'events' && (
                <>
                    {summary && summary.pricingConfigured === false && (
                        <div className={s.banner}>Rate card is all zeros — estimates show as $0 until you configure pricing.</div>
                    )}
                    <div className={s.tableCard}>
                        <div className={s.tableScroll}>
                            <table className={s.table}>
                                <thead>
                                    <tr>
                                        <th className={s.sortable} onClick={() => onSort('occurred_at')}>
                                            Time {sort === 'occurred_at' ? (order === 'desc' ? '↓' : '↑') : ''}
                                        </th>
                                        <th className={s.sortable} onClick={() => onSort('kind')}>
                                            Kind
                                        </th>
                                        <th className={s.sortable} onClick={() => onSort('channel')}>
                                            Channel
                                        </th>
                                        <th>Details</th>
                                        <th className={s.right}>Est. USD</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading && (
                                        <tr>
                                            <td colSpan={5} className={s.muted} style={{ padding: '2rem', textAlign: 'center' }}>
                                                Loading…
                                            </td>
                                        </tr>
                                    )}
                                    {!loading &&
                                        events.map(ev => (
                                            <tr key={ev.id}>
                                                <td className={s.mono}>{fmtTs(ev.occurred_at)}</td>
                                                <td>{ev.kind}</td>
                                                <td>{ev.channel}</td>
                                                <td>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                                        {ev.kind === 'llm_completion' && (
                                                            <>
                                                                <span>
                                                                    {ev.model} ({ev.provider})
                                                                </span>
                                                                <span className={s.muted}>
                                                                    in {ev.input_tokens?.toLocaleString() ?? 0} / out {ev.output_tokens?.toLocaleString() ?? 0}{' '}
                                                                    tokens
                                                                </span>
                                                            </>
                                                        )}
                                                        {ev.kind === 'sms_message' && (
                                                            <>
                                                                <span>
                                                                    {ev.sms_direction} · {ev.sms_segments ?? 0} seg
                                                                </span>
                                                                <span className={s.muted}>{ev.phone_e164}</span>
                                                            </>
                                                        )}
                                                        {ev.kind === 'voice_call' && (
                                                            <>
                                                                <span>{ev.duration_seconds}s</span>
                                                                <span className={`${s.muted} ${s.mono}`}>{ev.retell_call_id}</span>
                                                            </>
                                                        )}
                                                        {(ev.client_name || ev.client_id) && (
                                                            <span style={{ color: 'var(--color-accent)', fontWeight: 600 }}>
                                                                {ev.client_name ?? ev.client_id}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className={`${s.right} ${s.mono}`}>{formatUsdEstimate(ev.estimated_usd)}</td>
                                            </tr>
                                        ))}
                                    {!loading && events.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className={s.muted} style={{ padding: '2rem', textAlign: 'center' }}>
                                                No rows — widen filters or date range.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div className={s.pager}>
                        <span>
                            Showing {events.length} of {total.toLocaleString()} (offset {offset})
                        </span>
                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                            <button
                                type="button"
                                className={s.btnGhost}
                                disabled={offset === 0 || loading}
                                onClick={() => setOffset(o => Math.max(0, o - LIMIT))}
                            >
                                Previous
                            </button>
                            <button
                                type="button"
                                className={s.btnGhost}
                                disabled={offset + LIMIT >= total || loading}
                                onClick={() => setOffset(o => o + LIMIT)}
                            >
                                Next
                            </button>
                        </div>
                    </div>
                    {summary && Object.keys(summary.llmByModel).length > 0 && (
                        <div style={{ marginTop: '2rem' }}>
                            <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', fontWeight: 800 }}>LLM by model (filtered)</h2>
                            <div className={s.tableCard}>
                                <div className={s.tableScroll}>
                                    <table className={s.table}>
                                        <thead>
                                            <tr>
                                                <th>Model</th>
                                                <th className={s.right}>Completions</th>
                                                <th className={s.right}>In tokens</th>
                                                <th className={s.right}>Out tokens</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {Object.entries(summary.llmByModel).map(([m, v]) => (
                                                <tr key={m}>
                                                    <td>{m}</td>
                                                    <td className={s.right}>{v.completions}</td>
                                                    <td className={s.right}>{v.input.toLocaleString()}</td>
                                                    <td className={s.right}>{v.output.toLocaleString()}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}

            {tab === 'rates' && (
                <div>
                    <p className={s.muted} style={{ marginBottom: '1rem', maxWidth: '48rem', lineHeight: 1.55 }}>
                        LLM rows use <code className={s.mono}>$ / 1M tokens</code> for input/output. SMS uses <code className={s.mono}>$ / segment</code>. Voice uses{' '}
                        <code className={s.mono}>$ / minute</code>. Add model-specific LLM rows in Supabase if needed (dimension + model_key); this table lists all
                        rows.
                    </p>
                    <div className={s.tableCard}>
                        <div className={s.tableScroll}>
                            <table className={s.table}>
                                <thead>
                                    <tr>
                                        <th>Dimension</th>
                                        <th>Model key</th>
                                        <th>Label</th>
                                        <th className={s.right}>USD / unit</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rates.map(r => (
                                        <tr key={r.id}>
                                            <td className={s.mono}>{r.dimension}</td>
                                            <td className={s.mono}>{r.model_key || '∅ default'}</td>
                                            <td>{r.label}</td>
                                            <td className={s.right}>
                                                <input
                                                    className={s.input}
                                                    style={{ maxWidth: '9rem', marginLeft: 'auto', textAlign: 'right' }}
                                                    value={rateEdits[r.id] ?? ''}
                                                    onChange={ev => setRateEdits(prev => ({ ...prev, [r.id]: ev.target.value }))}
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div style={{ marginTop: '1rem' }}>
                        <button type="button" className="btn btn-primary" onClick={() => void saveRates()} disabled={savingRates}>
                            Save rates
                        </button>
                    </div>
                </div>
            )}

            {drawerPeer && (
                <div
                    className={s.drawerOverlay}
                    role="presentation"
                    onClick={e => {
                        if (e.target === e.currentTarget) setDrawerPeer(null);
                    }}
                >
                    <aside className={s.drawerPanel} role="dialog" aria-modal="true" aria-labelledby="usage-drawer-title">
                        <div className={s.drawerHead}>
                            <div>
                                <div id="usage-drawer-title" className={s.drawerTitle}>
                                    {formatPhoneDisplay(drawerPeer)}
                                </div>
                                <div className={s.muted} style={{ marginTop: '0.35rem' }}>
                                    Saved messages in range
                                </div>
                                <div style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                    <Link href={`/admin/sms-testing?phone=${encodeURIComponent(drawerPeer)}`} className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}>
                                        Open in SMS tester
                                    </Link>
                                </div>
                            </div>
                            <button type="button" className={s.btnGhost} aria-label="Close" onClick={() => setDrawerPeer(null)}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className={s.drawerBody}>
                            {convLoading && <p className={s.muted}>Loading transcript…</p>}
                            {!convLoading &&
                                convMsgs.map(msg => (
                                    <div key={msg.id} className={`${s.bubble} ${msg.direction === 'inbound' ? s.bubbleIn : s.bubbleOut}`}>
                                        <div className={s.bubbleMeta}>{msg.direction === 'inbound' ? 'Inbound' : 'Outbound'} · {fmtTs(msg.created_at)}</div>
                                        {msg.body}
                                    </div>
                                ))}
                            {!convLoading && convMsgs.length === 0 && <p className={s.muted}>No messages in this date range.</p>}
                        </div>
                    </aside>
                </div>
            )}
        </div>
    );
}

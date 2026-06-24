'use client';

import { useMemo, useState, useCallback } from 'react';
import type { MealPlannerOrderResult } from '@/lib/meal-planner-utils';

type EditItem = { id?: string; name: string; quantity: number; value: number | null };

type Props = {
    clientId: string;
    fullName: string;
    apiKey: string;
    initialOrders: MealPlannerOrderResult[];
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dateKey(year: number, month: number, day: number): string {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function todayKey(): string {
    const d = new Date();
    return dateKey(d.getFullYear(), d.getMonth(), d.getDate());
}

export function MealPlanCalendarWidget({ clientId, fullName, apiKey, initialOrders }: Props) {
    const [orders, setOrders] = useState<MealPlannerOrderResult[]>(initialOrders);
    const [monthDate, setMonthDate] = useState(() => {
        const first = initialOrders[0]?.scheduledDeliveryDate;
        if (first) {
            const [y, m] = first.split('-').map(Number);
            return new Date(y, m - 1, 1);
        }
        const t = new Date();
        return new Date(t.getFullYear(), t.getMonth(), 1);
    });
    const [selectedDate, setSelectedDate] = useState<string | null>(initialOrders[0]?.scheduledDeliveryDate ?? null);
    const [items, setItems] = useState<EditItem[]>(() => toEditItems(initialOrders[0]));
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

    const ordersByDate = useMemo(() => {
        const map = new Map<string, MealPlannerOrderResult>();
        for (const o of orders) if (o.scheduledDeliveryDate) map.set(o.scheduledDeliveryDate, o);
        return map;
    }, [orders]);

    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const monthLabel = monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const cells = useMemo(() => {
        const firstWeekday = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const out: (number | null)[] = [];
        for (let i = 0; i < firstWeekday; i++) out.push(null);
        for (let d = 1; d <= daysInMonth; d++) out.push(d);
        return out;
    }, [year, month]);

    const selectDate = useCallback(
        (key: string) => {
            setSelectedDate(key);
            setItems(toEditItems(ordersByDate.get(key)));
            setDirty(false);
            setMessage(null);
        },
        [ordersByDate]
    );

    function updateItem(idx: number, patch: Partial<EditItem>) {
        setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
        setDirty(true);
    }
    function addItem() {
        setItems((prev) => [...prev, { name: '', quantity: 1, value: null }]);
        setDirty(true);
    }
    function removeItem(idx: number) {
        setItems((prev) => prev.filter((_, i) => i !== idx));
        setDirty(true);
    }

    async function save() {
        if (!selectedDate) return;
        const payloadItems = items
            .map((it) => ({ ...it, name: it.name.trim() }))
            .filter((it) => it.name.length > 0);
        setSaving(true);
        setMessage(null);
        try {
            const res = await fetch(
                `/api/public/clients/${encodeURIComponent(clientId)}/meal-plan?key=${encodeURIComponent(apiKey)}`,
                {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ date: selectedDate, items: payloadItems }),
                }
            );
            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data?.error || `Save failed (${res.status})`);
            }
            setOrders(data.orders ?? []);
            const refreshed = (data.orders as MealPlannerOrderResult[] | undefined)?.find(
                (o) => o.scheduledDeliveryDate === selectedDate
            );
            setItems(toEditItems(refreshed));
            setDirty(false);
            setMessage({ kind: 'ok', text: 'Saved' });
        } catch (e) {
            setMessage({ kind: 'err', text: e instanceof Error ? e.message : 'Save failed' });
        } finally {
            setSaving(false);
        }
    }

    const today = todayKey();

    return (
        <div style={S.root}>
            <div style={S.header}>
                <div>
                    <div style={S.title}>{fullName}</div>
                    <div style={S.subtitle}>Meal plan calendar</div>
                </div>
            </div>

            <div style={S.body}>
                <div style={S.calendarPanel}>
                    <div style={S.monthNav}>
                        <button style={S.navBtn} onClick={() => setMonthDate(new Date(year, month - 1, 1))} aria-label="Previous month">‹</button>
                        <div style={S.monthLabel}>{monthLabel}</div>
                        <button style={S.navBtn} onClick={() => setMonthDate(new Date(year, month + 1, 1))} aria-label="Next month">›</button>
                    </div>
                    <div style={S.weekRow}>
                        {WEEKDAYS.map((w) => (
                            <div key={w} style={S.weekday}>{w}</div>
                        ))}
                    </div>
                    <div style={S.grid}>
                        {cells.map((d, i) => {
                            if (d == null) return <div key={`e-${i}`} style={S.emptyCell} />;
                            const key = dateKey(year, month, d);
                            const order = ordersByDate.get(key);
                            const hasItems = !!order && order.items.some((it) => (it.quantity ?? 0) > 0);
                            const isSelected = key === selectedDate;
                            const isToday = key === today;
                            return (
                                <button
                                    key={key}
                                    onClick={() => selectDate(key)}
                                    style={{
                                        ...S.dayCell,
                                        ...(hasItems ? S.dayHasItems : {}),
                                        ...(isToday ? S.dayToday : {}),
                                        ...(isSelected ? S.daySelected : {}),
                                    }}
                                >
                                    <span>{d}</span>
                                    {hasItems && <span style={S.dot} />}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div style={S.editPanel}>
                    {!selectedDate ? (
                        <div style={S.placeholder}>Select a date on the calendar to view and edit that day&apos;s meals.</div>
                    ) : (
                        <>
                            <div style={S.editHeader}>
                                <div style={S.editDate}>{formatLongDate(selectedDate)}</div>
                                <button style={S.addBtn} onClick={addItem}>+ Add item</button>
                            </div>

                            <div style={S.itemList}>
                                {items.length === 0 && <div style={S.placeholder}>No items for this day yet. Add one below.</div>}
                                {items.map((it, idx) => (
                                    <div key={idx} style={S.itemRow}>
                                        <input
                                            style={S.nameInput}
                                            value={it.name}
                                            placeholder="Item name"
                                            onChange={(e) => updateItem(idx, { name: e.target.value })}
                                        />
                                        <div style={S.qtyGroup}>
                                            <button style={S.qtyBtn} onClick={() => updateItem(idx, { quantity: Math.max(0, it.quantity - 1) })}>−</button>
                                            <input
                                                style={S.qtyInput}
                                                type="number"
                                                min={0}
                                                value={it.quantity}
                                                onChange={(e) => updateItem(idx, { quantity: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                                            />
                                            <button style={S.qtyBtn} onClick={() => updateItem(idx, { quantity: it.quantity + 1 })}>+</button>
                                        </div>
                                        <button style={S.removeBtn} onClick={() => removeItem(idx)} aria-label="Remove item">✕</button>
                                    </div>
                                ))}
                            </div>

                            <div style={S.footer}>
                                {message && (
                                    <span style={{ ...S.msg, color: message.kind === 'ok' ? '#15803d' : '#b91c1c' }}>{message.text}</span>
                                )}
                                <button
                                    style={{ ...S.saveBtn, ...(saving || !dirty ? S.saveBtnDisabled : {}) }}
                                    onClick={save}
                                    disabled={saving || !dirty}
                                >
                                    {saving ? 'Saving…' : 'Save changes'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

function toEditItems(order: MealPlannerOrderResult | undefined): EditItem[] {
    if (!order) return [];
    return order.items.map((it) => ({
        id: it.id,
        name: it.name,
        quantity: Math.max(0, Number(it.quantity) || 0),
        value: it.value ?? null,
    }));
}

function formatLongDate(key: string): string {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    });
}

const S: Record<string, React.CSSProperties> = {
    root: {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
        color: '#0f172a',
        background: '#f8fafc',
        minHeight: '100vh',
        boxSizing: 'border-box',
        padding: 16,
    },
    header: { marginBottom: 16 },
    title: { fontSize: 18, fontWeight: 700 },
    subtitle: { fontSize: 13, color: '#64748b' },
    body: { display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' },
    calendarPanel: {
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 12,
        padding: 14,
        flex: '1 1 320px',
        minWidth: 300,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    },
    monthNav: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    monthLabel: { fontWeight: 600, fontSize: 15 },
    navBtn: { border: '1px solid #e2e8f0', background: '#fff', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 18, lineHeight: 1 },
    weekRow: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 },
    weekday: { textAlign: 'center', fontSize: 11, color: '#94a3b8', fontWeight: 600, padding: '2px 0' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 },
    emptyCell: { aspectRatio: '1 / 1' },
    dayCell: {
        position: 'relative',
        aspectRatio: '1 / 1',
        border: '1px solid #e2e8f0',
        background: '#fff',
        borderRadius: 8,
        cursor: 'pointer',
        fontSize: 14,
        color: '#334155',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    dayHasItems: { background: '#ecfdf5', borderColor: '#a7f3d0', fontWeight: 600, color: '#065f46' },
    dayToday: { borderColor: '#0ea5e9' },
    daySelected: { background: '#0ea5e9', borderColor: '#0ea5e9', color: '#fff' },
    dot: { position: 'absolute', bottom: 5, width: 5, height: 5, borderRadius: '50%', background: 'currentColor' },
    editPanel: {
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 12,
        padding: 16,
        flex: '1 1 340px',
        minWidth: 300,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    },
    editHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    editDate: { fontWeight: 600, fontSize: 15 },
    addBtn: { border: '1px solid #cbd5e1', background: '#f8fafc', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontSize: 13, fontWeight: 500 },
    itemList: { display: 'flex', flexDirection: 'column', gap: 8, minHeight: 60 },
    placeholder: { color: '#94a3b8', fontSize: 14, padding: '12px 0' },
    itemRow: { display: 'flex', alignItems: 'center', gap: 8 },
    nameInput: { flex: 1, minWidth: 0, border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', fontSize: 14 },
    qtyGroup: { display: 'flex', alignItems: 'center', gap: 4 },
    qtyBtn: { border: '1px solid #e2e8f0', background: '#f8fafc', borderRadius: 8, width: 30, height: 32, cursor: 'pointer', fontSize: 16, lineHeight: 1 },
    qtyInput: { width: 48, textAlign: 'center', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 4px', fontSize: 14 },
    removeBtn: { border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: 14, padding: 6 },
    footer: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, marginTop: 16 },
    msg: { fontSize: 13, fontWeight: 500 },
    saveBtn: { border: 'none', background: '#0ea5e9', color: '#fff', borderRadius: 8, padding: '9px 18px', cursor: 'pointer', fontSize: 14, fontWeight: 600 },
    saveBtnDisabled: { opacity: 0.5, cursor: 'not-allowed' },
};

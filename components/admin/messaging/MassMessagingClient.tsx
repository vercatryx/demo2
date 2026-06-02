'use client';

import { sanitizeUserFacingText } from '@/lib/user-facing-text';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Circle, Download, Loader2, Mail, MessageSquare, Phone, X } from 'lucide-react';
import { toast } from 'sonner';
import type { MessagingCatalog, MessagingChannel, MessagingRecipient, RecipientFilter } from '@/lib/messaging/types';
import { RichTextEditor } from './RichTextEditor';
import styles from './MassMessaging.module.css';

type FilterMode = RecipientFilter['mode'];

type SendStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'skipped';

type ProgressRow = MessagingRecipient & {
    sendStatus: SendStatus;
    sendError?: string;
    selected: boolean;
};

type ManualPickClient = {
    id: string;
    fullName: string;
    statusName: string | null;
};

const DEFAULT_EMAIL_HTML =
    '<p>Dear {{name}},</p><p>We hope you are doing well.</p><p>Please log in to review your upcoming order.</p><p>Thank you.</p><p><strong>The Client Food Service Team</strong></p>';

const DEFAULT_CALL_SCRIPT =
    'Hello {{name}}. This is Client Food Service. Please log in to review your upcoming order. Thank you.';

const DEFAULT_SMS_TEXT =
    'Hi {{name}}, please log in to review your upcoming order. Thank you. — Client Food Service';

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeCsvCell(value: string | number | boolean | null | undefined): string {
    const s = value == null ? '' : String(value);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}

function sendStatusLabel(status: SendStatus): string {
    switch (status) {
        case 'sending':
            return 'Sending';
        case 'sent':
            return 'Sent';
        case 'failed':
            return 'Failed';
        case 'skipped':
            return 'Skipped';
        default:
            return 'Pending';
    }
}

export function MassMessagingClient() {
    const [channel, setChannel] = useState<MessagingChannel>('email');
    const [filterMode, setFilterMode] = useState<FilterMode>('everyone');
    const [approvedOnly, setApprovedOnly] = useState(true);
    const [catalog, setCatalog] = useState<MessagingCatalog | null>(null);
    const [loadingCatalog, setLoadingCatalog] = useState(true);

    const [selectedVendorIds, setSelectedVendorIds] = useState<string[]>([]);
    const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
    const [selectedBoxItemIds, setSelectedBoxItemIds] = useState<string[]>([]);
    const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
    const [clientSearch, setClientSearch] = useState('');
    const [itemSearch, setItemSearch] = useState('');
    const [boxItemSearch, setBoxItemSearch] = useState('');
    const [manualPickClients, setManualPickClients] = useState<ManualPickClient[]>([]);
    const [manualPickLoading, setManualPickLoading] = useState(false);
    const [manualPickHint, setManualPickHint] = useState('Type a name or client ID to search');

    const [recipients, setRecipients] = useState<ProgressRow[]>([]);
    const [previewed, setPreviewed] = useState(false);
    const [previewLoading, setPreviewLoading] = useState(false);

    const [subject, setSubject] = useState('Message from Client Food Service');
    const [bodyHtml, setBodyHtml] = useState(DEFAULT_EMAIL_HTML);
    const [bodyText, setBodyText] = useState(DEFAULT_SMS_TEXT);
    const [callScript, setCallScript] = useState(DEFAULT_CALL_SCRIPT);

    const [testTo, setTestTo] = useState('');
    const [testLoading, setTestLoading] = useState(false);
    const [sendLoading, setSendLoading] = useState(false);
    const [sendComplete, setSendComplete] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/admin/messaging/catalog', { cache: 'no-store' });
                if (!res.ok) throw new Error('Failed to load catalog');
                const data = (await res.json()) as MessagingCatalog;
                setCatalog(data);
            } catch (e) {
                console.error(e);
                toast.error('Failed to load messaging catalog');
            } finally {
                setLoadingCatalog(false);
            }
        })();
    }, []);

    useEffect(() => {
        if (filterMode !== 'manual') return;

        const timer = window.setTimeout(async () => {
            setManualPickLoading(true);
            try {
                const params = new URLSearchParams({
                    q: clientSearch.trim(),
                    approvedOnly: approvedOnly ? 'true' : 'false',
                    limit: '100',
                });
                if (selectedClientIds.length > 0) {
                    params.set('includeIds', selectedClientIds.join(','));
                }
                const res = await fetch(`/api/admin/messaging/search-clients?${params.toString()}`, {
                    cache: 'no-store',
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Search failed');
                setManualPickClients(data.clients ?? []);
                setManualPickHint(
                    data.hint ??
                        (clientSearch.trim()
                            ? `Showing ${(data.clients ?? []).length} match(es)`
                            : 'Type a name or client ID to search')
                );
            } catch (e) {
                console.error(e);
                setManualPickClients([]);
                setManualPickHint('Search failed — try again');
            } finally {
                setManualPickLoading(false);
            }
        }, 300);

        return () => window.clearTimeout(timer);
    }, [filterMode, clientSearch, approvedOnly, selectedClientIds]);

    const buildFilter = useCallback((): RecipientFilter => {
        switch (filterMode) {
            case 'vendor':
                return { mode: 'vendor', vendorIds: selectedVendorIds };
            case 'foodItem':
                return { mode: 'foodItem', itemIds: selectedItemIds };
            case 'boxItem':
                return { mode: 'boxItem', itemIds: selectedBoxItemIds };
            case 'manual':
                return { mode: 'manual', clientIds: selectedClientIds };
            default:
                return { mode: 'everyone' };
        }
    }, [filterMode, selectedVendorIds, selectedItemIds, selectedBoxItemIds, selectedClientIds]);

    const filterValid = useMemo(() => {
        if (filterMode === 'vendor') return selectedVendorIds.length > 0;
        if (filterMode === 'foodItem') return selectedItemIds.length > 0;
        if (filterMode === 'boxItem') return selectedBoxItemIds.length > 0;
        if (filterMode === 'manual') return selectedClientIds.length > 0;
        return true;
    }, [filterMode, selectedVendorIds, selectedItemIds, selectedBoxItemIds, selectedClientIds]);

    const composeValid = useMemo(() => {
        if (channel === 'email') {
            return subject.trim().length > 0 && bodyHtml.replace(/<[^>]+>/g, '').trim().length > 0;
        }
        if (channel === 'call') {
            return callScript.trim().length > 0;
        }
        return bodyText.trim().length > 0;
    }, [channel, subject, bodyHtml, bodyText, callScript]);

    const selectedSendCount = useMemo(
        () => recipients.filter((r) => r.selected && r.canSend).length,
        [recipients]
    );

    const handlePreview = async () => {
        if (!filterValid) {
            setError('Select at least one filter option before previewing recipients.');
            return;
        }
        setError(null);
        setPreviewLoading(true);
        setSendComplete(false);
        try {
            const res = await fetch('/api/admin/messaging/resolve-recipients', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    channel,
                    filter: buildFilter(),
                    approvedOnly,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Preview failed');

            const rows: ProgressRow[] = (data.recipients as MessagingRecipient[]).map((r) => ({
                ...r,
                selected: true,
                sendStatus: r.canSend ? 'pending' : 'skipped',
                sendError: r.skipReason,
            }));
            setRecipients(rows);
            setPreviewed(true);
            toast.success(`Found ${data.summary.total} recipients (${data.summary.willSend} can receive)`);
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Preview failed';
            setError(msg);
            toast.error(sanitizeUserFacingText(msg));
        } finally {
            setPreviewLoading(false);
        }
    };

    const toggleRecipient = (clientId: string) => {
        setRecipients((prev) =>
            prev.map((r) => (r.clientId === clientId ? { ...r, selected: !r.selected } : r))
        );
    };

    const handleDownloadRecipients = () => {
        const contactHeader = channel === 'email' ? 'Email' : 'Phone';
        const headers = [
            'Selected',
            'Name',
            'Client ID',
            'Status',
            contactHeader,
            'Can send',
            'Skip reason',
            'Send status',
            'Send error',
        ];
        const rows = recipients.map((row) => [
            row.selected ? 'Yes' : 'No',
            row.fullName,
            row.clientId,
            row.statusName ?? '',
            channel === 'email' ? row.email ?? '' : row.phone ?? '',
            row.canSend ? 'Yes' : 'No',
            row.skipReason ?? '',
            sendStatusLabel(row.sendStatus),
            row.sendError ?? '',
        ]);
        const csv = [headers.map(escapeCsvCell).join(','), ...rows.map((r) => r.map(escapeCsvCell).join(','))].join(
            '\r\n'
        );
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mass-messaging-recipients-${channel}-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(`Downloaded ${recipients.length} recipients`);
    };

    const togglePickerId = (ids: string[], setIds: (v: string[]) => void, id: string) => {
        setIds(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
        setPreviewed(false);
    };

    const handleTestSend = async () => {
        if (!testTo.trim()) {
            toast.error(
                channel === 'email'
                    ? 'Enter a test email address'
                    : 'Enter a test phone number'
            );
            return;
        }
        if (!composeValid) {
            toast.error('Complete the message before sending a test');
            return;
        }
        setTestLoading(true);
        setError(null);
        try {
            const sampleName = recipients.find((r) => r.canSend)?.fullName ?? 'Sample Client';
            const res = await fetch('/api/admin/messaging/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    channel,
                    testTo: testTo.trim(),
                    sampleName,
                    subject,
                    bodyHtml,
                    bodyText: channel === 'call' ? callScript : bodyText,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Test send failed');
            toast.success(`Test ${channel === 'email' ? 'email' : channel === 'call' ? 'call' : 'SMS'} sent`);
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Test send failed';
            setError(msg);
            toast.error(sanitizeUserFacingText(msg));
        } finally {
            setTestLoading(false);
        }
    };

    const handleBulkSend = async () => {
        if (!previewed || selectedSendCount === 0) return;
        if (!composeValid) {
            toast.error('Complete the message before sending');
            return;
        }
        if (!window.confirm(`Send ${channel === 'email' ? 'email' : channel === 'call' ? 'call' : 'SMS'} to ${selectedSendCount} recipients?`)) {
            return;
        }

        setSendLoading(true);
        setSendComplete(false);
        setError(null);

        const queue = recipients.filter((r) => r.selected && r.canSend);
        setRecipients((prev) =>
            prev.map((r) =>
                queue.some((q) => q.clientId === r.clientId) ? { ...r, sendStatus: 'pending', sendError: undefined } : r
            )
        );

        let sent = 0;
        let failed = 0;

        for (const recipient of queue) {
            setRecipients((prev) =>
                prev.map((r) => (r.clientId === recipient.clientId ? { ...r, sendStatus: 'sending' } : r))
            );

            try {
                const res = await fetch('/api/admin/messaging/send-one', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        channel,
                        clientId: recipient.clientId,
                        subject,
                        bodyHtml,
                        bodyText: channel === 'call' ? callScript : bodyText,
                    }),
                });
                const data = await res.json();
                if (!res.ok || !data.success) {
                    throw new Error(data.error || 'Send failed');
                }
                sent++;
                setRecipients((prev) =>
                    prev.map((r) => (r.clientId === recipient.clientId ? { ...r, sendStatus: 'sent' } : r))
                );
            } catch (e) {
                failed++;
                const msg = e instanceof Error ? e.message : 'Send failed';
                setRecipients((prev) =>
                    prev.map((r) =>
                        r.clientId === recipient.clientId ? { ...r, sendStatus: 'failed', sendError: msg } : r
                    )
                );
            }

            if (channel === 'sms' || channel === 'call') {
                await sleep(channel === 'call' ? 2000 : 300);
            }
        }

        setSendLoading(false);
        setSendComplete(true);
        toast.success(`Done. Sent: ${sent}, failed: ${failed}`);
    };

    const foodItems = useMemo(() => {
        if (!catalog) return [];
        const combined = [
            ...catalog.menuItems.map((i) => ({ id: i.id, label: `${i.name} (${i.vendorName})`, kind: 'menu' as const })),
            ...catalog.breakfastItems.map((i) => ({ id: i.id, label: `${i.name} (meal package)`, kind: 'breakfast' as const })),
        ];
        const q = itemSearch.trim().toLowerCase();
        if (!q) return combined;
        return combined.filter((i) => i.label.toLowerCase().includes(q));
    }, [catalog, itemSearch]);

    const boxItems = useMemo(() => {
        if (!catalog) return [];
        const items = catalog.boxItems.map((i) => ({
            id: i.id,
            label: i.itemNumber != null ? `${i.name} (#${i.itemNumber})` : i.name,
        }));
        const q = boxItemSearch.trim().toLowerCase();
        if (!q) return items;
        return items.filter((i) => i.label.toLowerCase().includes(q));
    }, [catalog, boxItemSearch]);

    const renderStatusIcon = (row: ProgressRow) => {
        if (row.sendStatus === 'sending') return <Loader2 size={16} className={`${styles.statusIcon} ${styles.statusSending}`} />;
        if (row.sendStatus === 'sent') return <Check size={16} className={`${styles.statusIcon} ${styles.statusSent}`} />;
        if (row.sendStatus === 'failed') return <X size={16} className={`${styles.statusIcon} ${styles.statusFailed}`} />;
        if (row.sendStatus === 'skipped') return <Circle size={14} className={`${styles.statusIcon} ${styles.statusPending}`} />;
        return <Circle size={14} className={`${styles.statusIcon} ${styles.statusPending}`} />;
    };

    if (loadingCatalog) {
        return (
            <div className={styles.container}>
                <p>Loading…</p>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h1 className={styles.title}>Mass Messaging</h1>
                <p className={styles.subtitle}>
                    Send branded emails or SMS to clients. Use {'{{name}}'} or &lt;name&gt; to personalize.
                </p>
            </header>

            {error && <div className={styles.errorMessage}>{error}</div>}
            {sendComplete && (
                <div className={styles.successBanner}>
                    Send complete. Review the list below for per-recipient status.
                </div>
            )}

            <div className={styles.channelTabs}>
                <button
                    type="button"
                    className={`${styles.channelTab} ${channel === 'email' ? styles.channelTabActive : ''}`}
                    onClick={() => {
                        setChannel('email');
                        setPreviewed(false);
                        setRecipients([]);
                    }}
                >
                    <Mail size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
                    Email
                </button>
                <button
                    type="button"
                    className={`${styles.channelTab} ${channel === 'sms' ? styles.channelTabActive : ''}`}
                    onClick={() => {
                        setChannel('sms');
                        setPreviewed(false);
                        setRecipients([]);
                    }}
                >
                    <MessageSquare size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
                    SMS
                </button>
                <button
                    type="button"
                    className={`${styles.channelTab} ${channel === 'call' ? styles.channelTabActive : ''}`}
                    onClick={() => {
                        setChannel('call');
                        setPreviewed(false);
                        setRecipients([]);
                    }}
                >
                    <Phone size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
                    Call
                </button>
            </div>

            <section className={styles.card}>
                <div className={styles.cardHeader}>Recipients</div>
                <div className={styles.cardBody}>
                    <label className={styles.toggleRow}>
                        <input
                            type="checkbox"
                            checked={approvedOnly}
                            onChange={(e) => {
                                setApprovedOnly(e.target.checked);
                                setPreviewed(false);
                            }}
                        />
                        Approved clients only
                    </label>

                    <div className={styles.radioGroup}>
                        {(
                            [
                                ['everyone', 'Everyone with contact info'],
                                ['vendor', 'By vendor (upcoming order)'],
                                ['foodItem', 'By food / meal item (upcoming order)'],
                                ['boxItem', 'By box item (upcoming order)'],
                                ['manual', 'Pick from client list'],
                            ] as const
                        ).map(([mode, label]) => (
                            <label key={mode} className={styles.radioLabel}>
                                <input
                                    type="radio"
                                    name="filterMode"
                                    checked={filterMode === mode}
                                    onChange={() => {
                                        setFilterMode(mode);
                                        setPreviewed(false);
                                    }}
                                />
                                {label}
                            </label>
                        ))}
                    </div>

                    {filterMode === 'vendor' && catalog && (
                        <div className={styles.pickerBox}>
                            {catalog.vendors.map((v) => (
                                <label key={v.id} className={styles.pickerItem}>
                                    <input
                                        type="checkbox"
                                        checked={selectedVendorIds.includes(v.id)}
                                        onChange={() => togglePickerId(selectedVendorIds, setSelectedVendorIds, v.id)}
                                    />
                                    {v.name}
                                </label>
                            ))}
                        </div>
                    )}

                    {filterMode === 'foodItem' && catalog && (
                        <>
                            <input
                                className={styles.searchInput}
                                placeholder="Search food / meal items…"
                                value={itemSearch}
                                onChange={(e) => setItemSearch(e.target.value)}
                            />
                            <div className={styles.pickerBox}>
                                {foodItems.map((item) => (
                                    <label key={item.id} className={styles.pickerItem}>
                                        <input
                                            type="checkbox"
                                            checked={selectedItemIds.includes(item.id)}
                                            onChange={() => togglePickerId(selectedItemIds, setSelectedItemIds, item.id)}
                                        />
                                        {item.label}
                                    </label>
                                ))}
                            </div>
                        </>
                    )}

                    {filterMode === 'boxItem' && catalog && (
                        <>
                            <input
                                className={styles.searchInput}
                                placeholder="Search box items…"
                                value={boxItemSearch}
                                onChange={(e) => setBoxItemSearch(e.target.value)}
                            />
                            <div className={styles.pickerBox}>
                                {boxItems.map((item) => (
                                    <label key={item.id} className={styles.pickerItem}>
                                        <input
                                            type="checkbox"
                                            checked={selectedBoxItemIds.includes(item.id)}
                                            onChange={() =>
                                                togglePickerId(selectedBoxItemIds, setSelectedBoxItemIds, item.id)
                                            }
                                        />
                                        {item.label}
                                    </label>
                                ))}
                            </div>
                        </>
                    )}

                    {filterMode === 'manual' && (
                        <>
                            <input
                                className={styles.searchInput}
                                placeholder="Search clients by name or ID (e.g. Test Client)…"
                                value={clientSearch}
                                onChange={(e) => {
                                    setClientSearch(e.target.value);
                                    setPreviewed(false);
                                }}
                            />
                            <p className={styles.hint}>
                                {manualPickLoading ? 'Searching…' : manualPickHint}
                                {!approvedOnly ? ' · Including non-approved clients' : ' · Approved clients only'}
                            </p>
                            <div className={styles.pickerBox}>
                                {manualPickClients.length === 0 && !manualPickLoading && (
                                    <p className={styles.hint} style={{ margin: '0.5rem' }}>
                                        No clients to show. Search by name or ID.
                                    </p>
                                )}
                                {manualPickClients.map((c) => (
                                    <label key={c.id} className={styles.pickerItem}>
                                        <input
                                            type="checkbox"
                                            checked={selectedClientIds.includes(c.id)}
                                            onChange={() => togglePickerId(selectedClientIds, setSelectedClientIds, c.id)}
                                        />
                                        <span>
                                            {c.fullName}
                                            <div className={styles.pickerItemMeta}>
                                                {c.id}
                                                {c.statusName ? ` · ${c.statusName}` : ''}
                                            </div>
                                        </span>
                                    </label>
                                ))}
                            </div>
                            {selectedClientIds.length > 0 && (
                                <p className={styles.hint}>{selectedClientIds.length} client(s) selected</p>
                            )}
                        </>
                    )}

                    <div className={styles.actions}>
                        <button
                            type="button"
                            className={styles.secondaryBtn}
                            onClick={handlePreview}
                            disabled={previewLoading || !filterValid}
                        >
                            {previewLoading && <span className={styles.spinner} />}
                            Preview recipients
                        </button>
                    </div>

                    {previewed && (
                        <div className={styles.summaryRow}>
                            <span className={styles.summaryBadge}>Total: {recipients.length}</span>
                            <span className={styles.summaryBadge}>
                                Will send: {recipients.filter((r) => r.selected && r.canSend).length}
                            </span>
                            <span className={styles.summaryBadge}>
                                Skipped: {recipients.filter((r) => !r.canSend).length}
                            </span>
                        </div>
                    )}
                </div>
            </section>

            <section className={styles.card}>
                <div className={styles.cardHeader}>Compose</div>
                <div className={styles.cardBody}>
                    {channel === 'email' ? (
                        <>
                            <label className={styles.fieldLabel}>Subject</label>
                            <input
                                className={styles.textInput}
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                                placeholder="Email subject"
                            />
                            <label className={styles.fieldLabel}>Body</label>
                            <RichTextEditor html={bodyHtml} onChange={setBodyHtml} />
                            <p className={styles.hint}>
                                Logo is added automatically and centered. Use {'{{name}}'} or &lt;name&gt; for the client&apos;s name.
                            </p>
                        </>
                    ) : channel === 'sms' ? (
                        <>
                            <label className={styles.fieldLabel}>Message</label>
                            <textarea
                                className={styles.textarea}
                                value={bodyText}
                                onChange={(e) => setBodyText(e.target.value)}
                                placeholder="SMS message"
                            />
                            <p className={styles.hint}>Use {'{{name}}'} or &lt;name&gt; for the client&apos;s name.</p>
                        </>
                    ) : (
                        <>
                            <label className={styles.fieldLabel}>Spoken script</label>
                            <textarea
                                className={styles.textarea}
                                value={callScript}
                                onChange={(e) => setCallScript(e.target.value)}
                                placeholder="What the caller will hear when they answer"
                            />
                            <p className={styles.hint}>
                                Read aloud when the client answers. Use {'{{name}}'} or &lt;name&gt; for personalization.
                            </p>
                        </>
                    )}
                </div>
            </section>

            <section className={styles.card}>
                <div className={styles.cardHeader}>Test send</div>
                <div className={styles.cardBody}>
                    <label className={styles.fieldLabel}>
                        {channel === 'email' ? 'Test email address' : 'Test phone number'}
                    </label>
                    <input
                        className={styles.textInput}
                        value={testTo}
                        onChange={(e) => setTestTo(e.target.value)}
                        placeholder={channel === 'email' ? 'you@example.com' : '8455551234'}
                    />
                    <div className={styles.actions}>
                        <button
                            type="button"
                            className={styles.secondaryBtn}
                            onClick={handleTestSend}
                            disabled={testLoading}
                        >
                            {testLoading && <span className={styles.spinner} />}
                            Send test
                        </button>
                    </div>
                </div>
            </section>

            <section className={styles.card}>
                <div className={styles.cardHeader}>Send</div>
                <div className={styles.cardBody}>
                    <div className={styles.actions}>
                        <button
                            type="button"
                            className={styles.primaryBtn}
                            onClick={handleBulkSend}
                            disabled={sendLoading || !previewed || selectedSendCount === 0 || !composeValid}
                        >
                            {sendLoading && <span className={styles.spinner} />}
                            Send to {selectedSendCount || '…'} recipients
                        </button>
                    </div>
                </div>
            </section>

            {previewed && recipients.length > 0 && (
                <section className={styles.card}>
                    <div className={styles.cardHeaderRow}>
                        <div className={styles.cardHeader}>Recipient list</div>
                        <button
                            type="button"
                            className={styles.secondaryBtn}
                            onClick={handleDownloadRecipients}
                            disabled={sendLoading}
                        >
                            <Download size={16} />
                            Download list
                        </button>
                    </div>
                    <div className={styles.cardBody}>
                        <div className={styles.recipientList}>
                            {recipients.map((row) => (
                                <div key={row.clientId} className={styles.recipientRow}>
                                    <label className={styles.pickerItem} style={{ margin: 0 }}>
                                        <input
                                            type="checkbox"
                                            checked={row.selected}
                                            disabled={sendLoading}
                                            onChange={() => toggleRecipient(row.clientId)}
                                        />
                                    </label>
                                    <div>
                                        <div className={styles.recipientName}>{row.fullName}</div>
                                        <div className={styles.recipientMeta}>
                                            {row.clientId}
                                            {row.statusName ? ` · ${row.statusName}` : ''}
                                            {' · '}
                                            {channel === 'email' ? row.email || 'no email' : row.phone || 'no phone'}
                                            {row.sendError ? ` · ${sanitizeUserFacingText(row.sendError)}` : ''}
                                        </div>
                                    </div>
                                    {renderStatusIcon(row)}
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            )}
        </div>
    );
}

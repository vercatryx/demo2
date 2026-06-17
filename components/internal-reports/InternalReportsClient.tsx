'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AlertTriangle, Database, Loader2, Mic, Square, Upload } from 'lucide-react';
import type { LlmMessage } from '@/lib/ai/llm';
import { AlertBox, EmptyState, PageHeader, Switch } from '@/components/ui';
import styles from './InternalReportsClient.module.css';

/** Microsoft Excel mark (Simple Icons, CC0). Green tile reads clearly on brand yellow buttons. */
function ExcelLogoMark({ size = 22 }: { size?: number }) {
    return (
        <span
            aria-hidden
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                width: size + 4,
                height: size + 4,
                borderRadius: 5,
                background: '#fff',
                boxShadow: 'inset 0 0 0 1px rgba(15,23,42,0.08)',
            }}
        >
            <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path
                    fill="#217346"
                    d="M23 1.5q.41 0 .7.3.3.29.3.7v19q0 .41-.3.7-.29.3-.7.3H7q-.41 0-.7-.3-.3-.29-.3-.7V18H1q-.41 0-.7-.3-.3-.29-.3-.7V7q0-.41.3-.7Q.58 6 1 6h5V2.5q0-.41.3-.7.29-.3.7-.3zM6 13.28l1.42 2.66h2.14l-2.38-3.87 2.34-3.8H7.46l-1.3 2.4-.05.08-.04.09-.64-1.28-.66-1.29H2.59l2.27 3.82-2.48 3.85h2.16zM14.25 21v-3H7.5v3zm0-4.5v-3.75H12v3.75zm0-5.25V7.5H12v3.75zm0-5.25V3H7.5v3zm8.25 15v-3h-6.75v3zm0-4.5v-3.75h-6.75v3.75zm0-5.25V7.5h-6.75v3.75zm0-5.25V3h-6.75v3Z"
                />
            </svg>
        </span>
    );
}

const STREAM_URL = '/api/internal-reports/chat/stream';
const TRANSCRIBE_URL = '/api/internal-reports/transcribe';
const COMMIT_WRITES_URL = '/api/internal-reports/commit-writes';
const COMMIT_MESSAGES_URL = '/api/internal-reports/commit-messages';
const EDITING_SESSION_URL = '/api/internal-reports/editing-session';
const UPLOAD_SPREADSHEET_URL = '/api/internal-reports/upload-spreadsheet';

type SpreadsheetColumnProfile = {
    name: string;
    nonEmptyCount: number;
    emptyCount: number;
    inferredType: string;
    sampleValues: string[];
};

type SpreadsheetStructurePayload = {
    filename: string;
    sheetName: string;
    rowCount: number;
    columnCount: number;
    columns: SpreadsheetColumnProfile[];
    detectedProfiles: string[];
    suggestedActions: string[];
    boxesOrgDetected: boolean;
};

type SpreadsheetUploadPayload = {
    filename: string;
    sheetName: string;
    columns: string[];
    rowCount: number;
    rows: Record<string, unknown>[];
    truncatedForModel: boolean;
};

type AttachedSpreadsheet = {
    upload: SpreadsheetUploadPayload;
    structure: SpreadsheetStructurePayload;
    hint?: string;
};
const EDITING_SESSION_STORAGE_KEY = 'demo-food-ir-editing-session';
const HDR_EDITING_SESSION = 'X-Internal-Reports-Editing-Session';

/** Append `?key=` when the page was opened with `?key=` (INTERNAL_REPORTS_REQUIRE_AUTH). */
function internalReportsApiPath(path: string): string {
    if (typeof window === 'undefined') return path;
    const key = new URLSearchParams(window.location.search).get('key')?.trim();
    if (!key) return path;
    const sep = path.includes('?') ? '&' : '?';
    return `${path}${sep}key=${encodeURIComponent(key)}`;
}

type ExportRow = { url: string; filename: string; rowCount: number; truncated: boolean };

type PendingWritesProposal = {
    pendingId: string;
    summary: string;
    operationCount: number;
    totalImpactRows: number;
    downloadUrl: string;
    filename: string;
    operations: { title: string; impactRowCount: number; sampleRows: Record<string, unknown>[] }[];
};

type PendingMessagesProposal = {
    pendingId: string;
    summary: string;
    channel: 'email' | 'sms' | 'call';
    recipientCount: number;
    willSendCount: number;
    skippedCount: number;
    downloadUrl: string;
    filename: string;
    sampleRows: Record<string, unknown>[];
};

function channelLabel(channel: PendingMessagesProposal['channel']): string {
    if (channel === 'email') return 'Email';
    if (channel === 'call') return 'Phone call';
    return 'SMS';
}

type StreamEvent =
    | { type: 'turn'; turn: number; maxTurns: number }
    | { type: 'llm_start' }
    | { type: 'llm_end'; toolCallCount: number; textLength: number }
    | { type: 'tool_start'; name: string; callId: string }
    | { type: 'tool_end'; name: string; callId: string; summary: string }
    | { type: 'export_ready'; url: string; filename: string; rowCount: number; truncated: boolean }
    | {
          type: 'pending_writes_ready';
          pendingId: string;
          summary: string;
          operationCount: number;
          totalImpactRows: number;
          downloadUrl: string;
          filename: string;
          operations: { title: string; impactRowCount: number; sampleRows: Record<string, unknown>[] }[];
      }
    | {
          type: 'pending_messages_ready';
          pendingId: string;
          summary: string;
          channel: 'email' | 'sms' | 'call';
          recipientCount: number;
          willSendCount: number;
          skippedCount: number;
          downloadUrl: string;
          filename: string;
          sampleRows: Record<string, unknown>[];
      }
    | { type: 'assistant_chunk'; text: string }
    | { type: 'done'; messages: LlmMessage[] }
    | { type: 'error'; message: string }
    | { type: 'spreadsheet_upload_offered'; label: string; hint?: string };

function toAbsoluteDownloadUrl(path: string): string {
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    if (typeof window === 'undefined') return path;
    return `${window.location.origin}${path.startsWith('/') ? path : `/${path}`}`;
}

function parseSseBuffer(buffer: string): { events: StreamEvent[]; rest: string } {
    const events: StreamEvent[] = [];
    let rest = buffer;
    let idx: number;
    while ((idx = rest.indexOf('\n\n')) !== -1) {
        const block = rest.slice(0, idx);
        rest = rest.slice(idx + 2);
        for (const line of block.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
                events.push(JSON.parse(line.slice(6)) as StreamEvent);
            } catch {
                /* ignore */
            }
        }
    }
    return { events, rest };
}

function toolActivityLabel(name: string): string {
    if (name === 'run_select_query') return 'Looking that up in the database…';
    if (name === 'export_select_to_xlsx') return 'Building your Excel file…';
    if (name === 'propose_batch_writes') return 'Preparing change review (impact rows + dry-run)…';
    if (name === 'propose_mass_messages') return 'Building message preview (recipients + Excel)…';
    if (name === 'offer_spreadsheet_reupload') return 'Ready for your spreadsheet upload…';
    return 'Working on it…';
}

const reportMarkdownComponents: Components = {
    p: (props) => <p {...props} />,
    ul: (props) => <ul {...props} />,
    ol: (props) => <ol {...props} />,
    li: (props) => <li {...props} />,
    h1: (props) => <h1 {...props} />,
    h2: (props) => <h2 {...props} />,
    h3: (props) => <h3 {...props} />,
    strong: (props) => <strong {...props} />,
    a: ({ href, children, ...rest }) => (
        <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
            {children}
        </a>
    ),
    code: ({ className, children, ...rest }) => {
        const inline = !className;
        if (inline) {
            return (
                <code {...rest}>
                    {children}
                </code>
            );
        }
        return (
            <pre>
                <code className={className} {...rest}>
                    {children}
                </code>
            </pre>
        );
    },
    blockquote: (props) => <blockquote {...props} />,
    hr: () => <hr />,
    table: (props) => (
        <div className={styles.mdTableWrap}>
            <table {...props} />
        </div>
    ),
    th: (props) => <th {...props} />,
    td: (props) => <td {...props} />,
};

function AssistantBody({
    text,
    exportsBelow,
}: {
    text: string;
    exportsBelow?: ExportRow[];
}) {
    return (
        <div>
            <div className={`internal-reports-md ${styles.md}`}>
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={reportMarkdownComponents}>
                    {text}
                </ReactMarkdown>
            </div>
            {exportsBelow && exportsBelow.length > 0 ? (
                <div className={styles.exportBlock}>
                    {exportsBelow.map((ex, i) => (
                        <a
                            key={i}
                            href={toAbsoluteDownloadUrl(ex.url)}
                            download={ex.filename}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`btn btn-primary ${styles.exportLink}`}
                        >
                            <ExcelLogoMark size={20} />
                            <span style={{ fontWeight: 600 }}>Download Excel</span>
                            <span className={styles.exportMeta}>
                                ({ex.rowCount.toLocaleString()} rows{ex.truncated ? ', truncated' : ''})
                            </span>
                        </a>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

function LiveActivityStrip({ text }: { text: string }) {
    return <span className={styles.liveActivity}>{text}</span>;
}

export function InternalReportsClient() {
    const [chatInput, setChatInput] = useState('');
    const [chatLlm, setChatLlm] = useState<LlmMessage[]>([]);
    const [chatBusy, setChatBusy] = useState(false);
    const [error, setError] = useState('');
    const [liveActivity, setLiveActivity] = useState<string | null>(null);
    const [streamingText, setStreamingText] = useState('');
    const [voicePhase, setVoicePhase] = useState<'idle' | 'recording' | 'transcribing'>('idle');
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const mediaChunksRef = useRef<Blob[]>([]);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const [exportByMessageIndex, setExportByMessageIndex] = useState<Record<number, ExportRow[]>>({});
    const [pendingWrites, setPendingWrites] = useState<PendingWritesProposal | null>(null);
    const [pendingMessages, setPendingMessages] = useState<PendingMessagesProposal | null>(null);
    const [successBanner, setSuccessBanner] = useState('');
    const [commitModalOpen, setCommitModalOpen] = useState(false);
    const [commitAckDanger, setCommitAckDanger] = useState(false);
    const [commitPhrase, setCommitPhrase] = useState('');
    const [commitBusy, setCommitBusy] = useState(false);
    const [commitModalError, setCommitModalError] = useState('');
    const [messagesModalOpen, setMessagesModalOpen] = useState(false);
    const [messagesCommitAck, setMessagesCommitAck] = useState(false);
    const [messagesCommitPhrase, setMessagesCommitPhrase] = useState('');
    const [messagesCommitError, setMessagesCommitError] = useState('');
    const [messagesCommitBusy, setMessagesCommitBusy] = useState(false);
    const [editingSessionToken, setEditingSessionToken] = useState<string | null>(null);
    const [editingMintBusy, setEditingMintBusy] = useState(false);
    const [editingMintError, setEditingMintError] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);
    const exportsRef = useRef<ExportRow[]>([]);
    const streamAbortRef = useRef<AbortController | null>(null);
    const spreadsheetInputRef = useRef<HTMLInputElement>(null);
    const [spreadsheetBusy, setSpreadsheetBusy] = useState(false);
    const [attachedSpreadsheet, setAttachedSpreadsheet] = useState<AttachedSpreadsheet | null>(null);

    const visibleTurns = useMemo(() => {
        return chatLlm
            .map((m, idx) => ({ m, idx }))
            .filter(({ m }) => {
                if (m.role === 'user') return true;
                if (m.role === 'assistant') {
                    const a = m as { content?: string; toolCalls?: { length: number } };
                    const c = (a.content ?? '').trim();
                    if (a.toolCalls && a.toolCalls.length > 0 && !c) return false;
                    return true;
                }
                return false;
            });
    }, [chatLlm]);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, [chatLlm, streamingText, liveActivity, chatBusy, exportByMessageIndex, pendingWrites, successBanner, editingMintError]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const raw = sessionStorage.getItem(EDITING_SESSION_STORAGE_KEY);
                if (!raw) return;
                const res = await fetch(internalReportsApiPath(EDITING_SESSION_URL), {
                    method: 'GET',
                    headers: { [HDR_EDITING_SESSION]: raw },
                });
                const data = (await res.json().catch(() => ({}))) as { valid?: boolean };
                if (cancelled) return;
                if (data.valid) {
                    setEditingSessionToken(raw);
                } else {
                    sessionStorage.removeItem(EDITING_SESSION_STORAGE_KEY);
                }
            } catch {
                sessionStorage.removeItem(EDITING_SESSION_STORAGE_KEY);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const onEditingToggle = useCallback(async (wantOn: boolean) => {
        setEditingMintError('');
        if (wantOn) {
            setEditingMintBusy(true);
            try {
                const res = await fetch(internalReportsApiPath(EDITING_SESSION_URL), { method: 'POST' });
                const data = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
                if (!res.ok) {
                    setEditingMintError(data.error || `Could not enable editing (${res.status})`);
                    return;
                }
                if (!data.token) {
                    setEditingMintError('Server did not return an editing token.');
                    return;
                }
                sessionStorage.setItem(EDITING_SESSION_STORAGE_KEY, data.token);
                setEditingSessionToken(data.token);
            } catch (e: unknown) {
                setEditingMintError(e instanceof Error ? e.message : String(e));
            } finally {
                setEditingMintBusy(false);
            }
        } else {
            sessionStorage.removeItem(EDITING_SESSION_STORAGE_KEY);
            setEditingSessionToken(null);
            setPendingWrites(null);
            setCommitModalOpen(false);
            setCommitAckDanger(false);
            setCommitPhrase('');
            setCommitModalError('');
        }
    }, []);

    const newConversation = useCallback(() => {
        streamAbortRef.current?.abort();
        streamAbortRef.current = null;
        mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
        const r = mediaRecorderRef.current;
        if (r && r.state !== 'inactive') {
            try {
                r.stop();
            } catch {
                /* ignore */
            }
        }
        mediaRecorderRef.current = null;
        mediaChunksRef.current = [];
        setVoicePhase('idle');
        setChatLlm([]);
        setExportByMessageIndex({});
        setPendingWrites(null);
        setPendingMessages(null);
        setSuccessBanner('');
        setCommitModalOpen(false);
        setCommitAckDanger(false);
        setCommitPhrase('');
        setCommitModalError('');
        setMessagesModalOpen(false);
        setMessagesCommitAck(false);
        setMessagesCommitPhrase('');
        setMessagesCommitError('');
        setLiveActivity(null);
        setStreamingText('');
        setError('');
        setChatInput('');
        setChatBusy(false);
        setAttachedSpreadsheet(null);
        exportsRef.current = [];
    }, []);

    const runChatStream = useCallback(
        async (
            llmMessages: LlmMessage[],
            opts?: {
                spreadsheetUpload?: SpreadsheetUploadPayload;
                spreadsheetStructure?: SpreadsheetStructurePayload;
                spreadsheetUploadHint?: string;
            }
        ) => {
            setChatBusy(true);
            setError('');
            setSuccessBanner('');
            setLiveActivity(null);
            setStreamingText('');
            exportsRef.current = [];

            streamAbortRef.current?.abort();
            const ac = new AbortController();
            streamAbortRef.current = ac;

            try {
                const res = await fetch(internalReportsApiPath(STREAM_URL), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        messages: llmMessages,
                        ...(editingSessionToken ? { editingSessionToken } : {}),
                        ...(opts?.spreadsheetUpload ? { spreadsheetUpload: opts.spreadsheetUpload } : {}),
                        ...(opts?.spreadsheetStructure ? { spreadsheetStructure: opts.spreadsheetStructure } : {}),
                        ...(opts?.spreadsheetUploadHint
                            ? { spreadsheetUploadHint: opts.spreadsheetUploadHint }
                            : {}),
                    }),
                    signal: ac.signal,
                });
            if (!res.ok) {
                const t = await res.text();
                setError(t || `HTTP ${res.status}`);
                setChatBusy(false);
                return;
            }
            if (!res.body) {
                setError('No response body');
                setChatBusy(false);
                return;
            }

            const reader = res.body.getReader();
            const dec = new TextDecoder();
            let carry = '';

            const applyEvent = (ev: StreamEvent) => {
                if (ev.type === 'turn') {
                    /* omit — avoids noisy “step / max” history */
                } else if (ev.type === 'llm_start') {
                    setLiveActivity('Thinking through your question…');
                } else if (ev.type === 'llm_end') {
                    if (ev.toolCallCount === 0) {
                        setLiveActivity(null);
                    } else {
                        setLiveActivity('Carrying out the next step…');
                    }
                } else if (ev.type === 'tool_start') {
                    setLiveActivity(toolActivityLabel(ev.name));
                } else if (ev.type === 'tool_end') {
                    /* keep the current-step label until the next llm_start / tool_start or completion */
                } else if (ev.type === 'export_ready') {
                    const row = {
                        url: ev.url,
                        filename: ev.filename,
                        rowCount: ev.rowCount,
                        truncated: ev.truncated,
                    };
                    exportsRef.current = [...exportsRef.current, row];
                } else if (ev.type === 'pending_writes_ready') {
                    setPendingWrites({
                        pendingId: ev.pendingId,
                        summary: ev.summary,
                        operationCount: ev.operationCount,
                        totalImpactRows: ev.totalImpactRows,
                        downloadUrl: ev.downloadUrl,
                        filename: ev.filename,
                        operations: ev.operations,
                    });
                    setCommitModalOpen(false);
                    setCommitAckDanger(false);
                    setCommitPhrase('');
                    setCommitModalError('');
                } else if (ev.type === 'pending_messages_ready') {
                    setPendingMessages({
                        pendingId: ev.pendingId,
                        summary: ev.summary,
                        channel: ev.channel,
                        recipientCount: ev.recipientCount,
                        willSendCount: ev.willSendCount,
                        skippedCount: ev.skippedCount,
                        downloadUrl: ev.downloadUrl,
                        filename: ev.filename,
                        sampleRows: ev.sampleRows,
                    });
                    setMessagesModalOpen(false);
                    setMessagesCommitAck(false);
                    setMessagesCommitPhrase('');
                    setMessagesCommitError('');
                } else if (ev.type === 'assistant_chunk') {
                    setStreamingText((t) => t + ev.text);
                } else if (ev.type === 'spreadsheet_upload_offered') {
                    /* Upload Excel is always visible; optional hint from copilot is ignored for UI gating */
                } else if (ev.type === 'error') {
                    setError(
                        /contact support/i.test(ev.message)
                            ? ev.message
                            : "I can't pull that up right now. Please contact support."
                    );
                } else if (ev.type === 'done') {
                    const finalMsgs = ev.messages ?? llmMessages;
                    const lastIdx = finalMsgs.length - 1;
                    const snap = exportsRef.current;
                    if (snap.length > 0) {
                        setExportByMessageIndex((prev) => ({ ...prev, [lastIdx]: snap }));
                    }
                    exportsRef.current = [];
                    setChatLlm(finalMsgs);
                    setStreamingText('');
                    setLiveActivity(null);
                }
            };

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                carry += dec.decode(value, { stream: true });
                const { events, rest } = parseSseBuffer(carry);
                carry = rest;
                for (const ev of events) applyEvent(ev);
            }
            const tail = dec.decode();
            const { events: tailEvents } = parseSseBuffer(carry + tail);
            for (const ev of tailEvents) applyEvent(ev);
        } catch (e: unknown) {
            if (e instanceof DOMException && e.name === 'AbortError') {
                return;
            }
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            streamAbortRef.current = null;
            setChatBusy(false);
        }
        },
        [editingSessionToken]
    );

    const spreadsheetStreamOpts = useCallback(
        (att: AttachedSpreadsheet | null) =>
            att
                ? {
                      spreadsheetUpload: att.upload,
                      spreadsheetStructure: att.structure,
                      spreadsheetUploadHint: att.hint,
                  }
                : undefined,
        []
    );

    const sendChat = useCallback(async () => {
        const trimmed = chatInput.trim();
        if (!trimmed || chatBusy || spreadsheetBusy) return;

        const userMsg: LlmMessage = { role: 'user', content: trimmed };
        const llmMessages: LlmMessage[] = [...chatLlm, userMsg];
        setChatLlm(llmMessages);
        setChatInput('');
        await runChatStream(llmMessages, spreadsheetStreamOpts(attachedSpreadsheet) ?? undefined);
    }, [chatLlm, chatBusy, chatInput, spreadsheetBusy, runChatStream, attachedSpreadsheet, spreadsheetStreamOpts]);

    const onSpreadsheetFile = useCallback(
        async (file: File) => {
            if (spreadsheetBusy || chatBusy) return;
            setSpreadsheetBusy(true);
            setError('');
            setSuccessBanner('');
            setEditingMintError('');

            const hint = chatInput.trim();

            try {
                const fd = new FormData();
                fd.set('file', file);
                if (hint) fd.set('hint', hint);
                const res = await fetch(internalReportsApiPath(UPLOAD_SPREADSHEET_URL), {
                    method: 'POST',
                    body: fd,
                });
                const data = (await res.json().catch(() => ({}))) as {
                    ok?: boolean;
                    user_message?: string;
                    upload?: SpreadsheetUploadPayload;
                    structure?: SpreadsheetStructurePayload;
                    structure_user_message?: string;
                    user_hint?: string;
                };

                if (!res.ok || !data.ok || !data.upload || !data.structure) {
                    const msg = data.user_message?.trim();
                    setError(
                        msg && /contact support/i.test(msg)
                            ? msg
                            : msg || "I can't pull that up right now. Please contact support."
                    );
                    return;
                }

                const attachment: AttachedSpreadsheet = {
                    upload: data.upload,
                    structure: data.structure,
                    hint: data.user_hint ?? (hint || undefined),
                };
                setAttachedSpreadsheet(attachment);

                const userContent =
                    data.structure_user_message?.trim() ||
                    `Uploaded **${file.name}** (${data.upload.rowCount} rows). What can we do with this file?`;

                const userMsg: LlmMessage = { role: 'user', content: userContent };
                const llmMessages: LlmMessage[] = [...chatLlm, userMsg];
                setChatLlm(llmMessages);
                setChatInput('');
                await runChatStream(llmMessages, {
                    spreadsheetUpload: attachment.upload,
                    spreadsheetStructure: attachment.structure,
                    spreadsheetUploadHint: attachment.hint,
                });
            } catch (e: unknown) {
                setError(e instanceof Error ? e.message : String(e));
            } finally {
                setSpreadsheetBusy(false);
                if (spreadsheetInputRef.current) spreadsheetInputRef.current.value = '';
            }
        },
        [spreadsheetBusy, chatBusy, chatInput, chatLlm, runChatStream]
    );

    useEffect(() => {
        return () => {
            mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
            const r = mediaRecorderRef.current;
            if (r && r.state !== 'inactive') {
                try {
                    r.stop();
                } catch {
                    /* ignore */
                }
            }
        };
    }, []);

    const onVoiceButton = useCallback(async () => {
        if (chatBusy || voicePhase === 'transcribing') return;

        if (voicePhase === 'idle') {
            setError('');
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaStreamRef.current = stream;
                mediaChunksRef.current = [];
                const mime =
                    typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                        ? 'audio/webm;codecs=opus'
                        : typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm')
                          ? 'audio/webm'
                          : typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/mp4')
                            ? 'audio/mp4'
                            : '';
                const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
                mediaRecorderRef.current = rec;
                rec.ondataavailable = (ev) => {
                    if (ev.data.size > 0) mediaChunksRef.current.push(ev.data);
                };
                rec.start(200);
                setVoicePhase('recording');
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                setError(
                    msg.toLowerCase().includes('permission') || msg.includes('NotAllowed')
                        ? 'Microphone access was denied. Allow the mic for this site and try again.'
                        : `Could not start recording: ${msg}`
                );
            }
            return;
        }

        const rec = mediaRecorderRef.current;
        if (!rec || rec.state === 'inactive') {
            setVoicePhase('idle');
            mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
            mediaStreamRef.current = null;
            return;
        }

        setVoicePhase('transcribing');
        const mimeType = rec.mimeType || 'audio/webm';
        await new Promise<void>((resolve) => {
            rec.addEventListener('stop', () => resolve(), { once: true });
            try {
                rec.stop();
            } catch {
                resolve();
            }
        });
        mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;

        const blob = new Blob(mediaChunksRef.current, { type: mimeType });
        mediaChunksRef.current = [];
        if (blob.size === 0) {
            setError('No audio captured. Try speaking a bit longer, or check your microphone.');
            setVoicePhase('idle');
            return;
        }

        const ext = mimeType.includes('mp4') ? 'm4a' : 'webm';
        const fd = new FormData();
        fd.append('file', blob, `recording.${ext}`);

        const url = internalReportsApiPath(TRANSCRIBE_URL);

        try {
            const res = await fetch(url, { method: 'POST', body: fd });
            const payload = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
            if (!res.ok) {
                setError(payload.error || `Transcription failed (${res.status})`);
                setVoicePhase('idle');
                return;
            }
            const text = (payload.text ?? '').trim();
            if (!text) {
                setError('No speech detected. Try again a little closer to the mic.');
                setVoicePhase('idle');
                return;
            }
            setChatInput((prev) => {
                const p = prev.trim();
                return p ? `${p} ${text}` : text;
            });
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setVoicePhase('idle');
        }
    }, [chatBusy, voicePhase]);

    const onComposerKeyDown = useCallback(
        (e: KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key !== 'Enter' || e.shiftKey) return;
            e.preventDefault();
            void sendChat();
        },
        [sendChat]
    );

    const dismissPendingWrites = useCallback(() => {
        setPendingWrites(null);
        setPendingMessages(null);
        setCommitModalOpen(false);
        setCommitAckDanger(false);
        setCommitPhrase('');
        setCommitModalError('');
        setMessagesModalOpen(false);
        setMessagesCommitAck(false);
        setMessagesCommitPhrase('');
        setMessagesCommitError('');
    }, []);

    const dismissPendingMessages = useCallback(() => {
        setPendingMessages(null);
        setMessagesModalOpen(false);
        setMessagesCommitAck(false);
        setMessagesCommitPhrase('');
        setMessagesCommitError('');
    }, []);

    const submitCommitWrites = useCallback(async () => {
        if (!pendingWrites) return;
        setCommitModalError('');
        if (!commitAckDanger) {
            setCommitModalError('Check the box to acknowledge that these changes may be destructive or irreversible.');
            return;
        }
        if (commitPhrase.trim() !== 'APPLY') {
            setCommitModalError('Type APPLY in all caps to confirm.');
            return;
        }
        setCommitBusy(true);
        try {
            const res = await fetch(internalReportsApiPath(COMMIT_WRITES_URL), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pendingId: pendingWrites.pendingId,
                    confirmationPhrase: 'APPLY',
                    editingSessionToken: editingSessionToken ?? '',
                }),
            });
            const data = (await res.json().catch(() => ({}))) as {
                ok?: boolean;
                error?: string;
                rows_affected_per_operation?: { title: string; rows_affected: number }[];
            };
            if (!res.ok || data.ok === false) {
                setCommitModalError(data.error || `Request failed (${res.status})`);
                return;
            }
            const parts = (data.rows_affected_per_operation ?? [])
                .map((r) => `${r.title}: ${r.rows_affected.toLocaleString()} row(s)`)
                .join(' · ');
            setSuccessBanner(parts ? `Applied. ${parts}` : 'Applied successfully.');
            dismissPendingWrites();
        } catch (e: unknown) {
            setCommitModalError(e instanceof Error ? e.message : String(e));
        } finally {
            setCommitBusy(false);
        }
    }, [pendingWrites, commitAckDanger, commitPhrase, dismissPendingWrites, editingSessionToken]);

    const submitCommitMessages = useCallback(async () => {
        if (!pendingMessages) return;
        setMessagesCommitError('');
        if (!messagesCommitAck) {
            setMessagesCommitError('Check the box to confirm you reviewed the message list.');
            return;
        }
        if (messagesCommitPhrase.trim() !== 'SEND') {
            setMessagesCommitError('Type SEND in all caps to confirm.');
            return;
        }
        setMessagesCommitBusy(true);
        try {
            const res = await fetch(internalReportsApiPath(COMMIT_MESSAGES_URL), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pendingId: pendingMessages.pendingId,
                    confirmationPhrase: 'SEND',
                }),
            });
            const data = (await res.json().catch(() => ({}))) as {
                ok?: boolean;
                error?: string;
                sent?: number;
                failed?: number;
                skipped?: number;
            };
            if (!res.ok || data.ok === false) {
                setMessagesCommitError(data.error || `Request failed (${res.status})`);
                return;
            }
            const parts = [
                data.sent != null ? `${data.sent.toLocaleString()} sent` : null,
                data.failed ? `${data.failed.toLocaleString()} failed` : null,
                data.skipped ? `${data.skipped.toLocaleString()} skipped` : null,
            ]
                .filter(Boolean)
                .join(' · ');
            setSuccessBanner(parts ? `Messages queued. ${parts}` : 'Messages sent successfully.');
            dismissPendingMessages();
        } catch (e: unknown) {
            setMessagesCommitError(e instanceof Error ? e.message : String(e));
        } finally {
            setMessagesCommitBusy(false);
        }
    }, [pendingMessages, messagesCommitAck, messagesCommitPhrase, dismissPendingMessages]);

    const lastUserVisibleIdx = visibleTurns.map((x) => x.m.role).lastIndexOf('user');

    return (
        <div className={styles.page}>
            <PageHeader
                title="Data Copilot"
                subtitle="Ask questions about your data, export to Excel, or upload spreadsheets for bulk changes."
                actions={
                    <div className={styles.headerActions}>
                        <Switch
                            checked={Boolean(editingSessionToken)}
                            disabled={editingMintBusy}
                            onChange={(checked) => void onEditingToggle(checked)}
                            label="Enable editing"
                        />
                        {editingMintBusy ? <Loader2 size={18} className="animate-spin" aria-hidden /> : null}
                    </div>
                }
            />
            <p className={styles.editingHint}>
                Turn on editing to allow packaged bulk writes (review workbook + confirmation). Reads and exports work either way.
            </p>
            {editingMintError ? (
                <AlertBox tone="error">{editingMintError}</AlertBox>
            ) : null}

            <div className={`card ${styles.chatCard}`}>
                <div ref={scrollRef} className={styles.chatScroll}>
                    {visibleTurns.length === 0 && !streamingText && !chatBusy ? (
                        <EmptyState
                            icon={<Database size={22} strokeWidth={1.6} />}
                            title="What would you like to know?"
                            body={
                                <>
                                    Ask anything about your data, or upload an Excel file below. The copilot inspects column
                                    structure — not every row — and stays in chat until you ask to apply changes.
                                </>
                            }
                        />
                    ) : null}

                    {visibleTurns.map(({ m, idx }, i) => {
                        const ex = exportByMessageIndex[idx];
                        const isUser = m.role === 'user';
                        return (
                            <div key={`${idx}-${i}`} className={styles.messageBlock}>
                                <div
                                    className={`${styles.messageRow} ${isUser ? styles.messageRowUser : styles.messageRowAssistant}`}
                                >
                                    <div
                                        className={`${styles.messageBubble} ${isUser ? styles.messageUser : styles.messageAssistant}`}
                                    >
                                        {m.role === 'assistant' ? (
                                            <AssistantBody text={(m as { content?: string }).content ?? ''} exportsBelow={ex} />
                                        ) : (
                                            <div className={styles.messageUserText}>{(m as { content: string }).content}</div>
                                        )}
                                    </div>
                                </div>

                                {isUser && i === lastUserVisibleIdx && chatBusy ? (
                                    <>
                                        <div className={styles.liveActivity}>
                                            {liveActivity ? (
                                                <LiveActivityStrip text={liveActivity} />
                                            ) : (
                                                <span>Connecting…</span>
                                            )}
                                        </div>
                                        {streamingText ? (
                                            <div className={`${styles.messageRow} ${styles.messageRowAssistant}`}>
                                                <div className={`${styles.messageBubble} ${styles.messageStreaming}`}>
                                                    <AssistantBody text={streamingText} />
                                                    <span className={styles.cursor}>▍</span>
                                                </div>
                                            </div>
                                        ) : null}
                                    </>
                                ) : null}
                            </div>
                        );
                    })}
                </div>

                {pendingWrites ? (
                    <div className={`${styles.pendingPanel} ${styles.pendingPanelWrites}`}>
                        <div className={styles.pendingLabel}>Pending database changes</div>
                        <p className={styles.pendingTitle}>{pendingWrites.summary}</p>
                        <p className={styles.pendingBody}>
                            {pendingWrites.totalImpactRows.toLocaleString()} row(s) across{' '}
                            {pendingWrites.operationCount} step(s). Download the workbook for the full audit trail
                            (one sheet per step). Nothing has been written yet.
                        </p>
                        <ul className={styles.pendingList}>
                            {pendingWrites.operations.map((op, i) => (
                                <li key={i}>
                                    <strong>{op.title}</strong> — {op.impactRowCount.toLocaleString()} row(s)
                                </li>
                            ))}
                        </ul>
                        <a
                            href={toAbsoluteDownloadUrl(pendingWrites.downloadUrl)}
                            download={pendingWrites.filename}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`btn btn-secondary ${styles.downloadLink}`}
                        >
                            <ExcelLogoMark size={18} />
                            <span style={{ fontWeight: 600 }}>Download review workbook</span>
                        </a>
                        <div className={styles.pendingActions}>
                            <button type="button" className="btn btn-secondary" onClick={dismissPendingWrites}>
                                Dismiss
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                disabled={!editingSessionToken}
                                title={
                                    editingSessionToken
                                        ? undefined
                                        : 'Turn on Enable editing to apply changes to the database.'
                                }
                                onClick={() => {
                                    setCommitModalOpen(true);
                                    setCommitAckDanger(false);
                                    setCommitPhrase('');
                                    setCommitModalError('');
                                }}
                            >
                                Review and apply…
                            </button>
                        </div>
                    </div>
                ) : null}

                {pendingMessages ? (
                    <div className={`${styles.pendingPanel} ${styles.pendingPanelMessages}`}>
                        <div className={styles.pendingLabel}>
                            Pending {channelLabel(pendingMessages.channel).toLowerCase()} messages
                        </div>
                        <p className={styles.pendingTitle}>{pendingMessages.summary}</p>
                        <p className={styles.pendingBody}>
                            {pendingMessages.willSendCount.toLocaleString()} will send ·{' '}
                            {pendingMessages.skippedCount.toLocaleString()} skipped ·{' '}
                            {pendingMessages.recipientCount.toLocaleString()} total in preview. Download the workbook
                            to review each person&apos;s message. Nothing has been sent yet.
                        </p>
                        <a
                            href={toAbsoluteDownloadUrl(pendingMessages.downloadUrl)}
                            download={pendingMessages.filename}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`btn btn-secondary ${styles.downloadLink}`}
                        >
                            <ExcelLogoMark size={18} />
                            <span style={{ fontWeight: 600 }}>Download message preview</span>
                        </a>
                        <div className={styles.pendingActions}>
                            <button type="button" className="btn btn-secondary" onClick={dismissPendingMessages}>
                                Dismiss
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={() => {
                                    setMessagesModalOpen(true);
                                    setMessagesCommitAck(false);
                                    setMessagesCommitPhrase('');
                                    setMessagesCommitError('');
                                }}
                            >
                                Review and send…
                            </button>
                        </div>
                    </div>
                ) : null}

                <div className={styles.composer}>
                    <input
                        ref={spreadsheetInputRef}
                        type="file"
                        accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                        hidden
                        onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void onSpreadsheetFile(f);
                        }}
                    />
                    <div className={styles.uploadRow}>
                        <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={chatBusy || spreadsheetBusy}
                            onClick={() => spreadsheetInputRef.current?.click()}
                        >
                            {spreadsheetBusy ? (
                                <Loader2 size={16} className="animate-spin" aria-hidden />
                            ) : (
                                <Upload size={16} aria-hidden />
                            )}
                            Upload Excel
                        </button>
                        <span className={styles.uploadHint}>
                            Inspects columns and shape — keeps chatting without dumping every row.
                        </span>
                    </div>
                    {attachedSpreadsheet ? (
                        <div className={styles.attachmentBar}>
                            <span>
                                Attached: <strong>{attachedSpreadsheet.upload.filename}</strong> (
                                {attachedSpreadsheet.structure.rowCount} rows,{' '}
                                {attachedSpreadsheet.structure.detectedProfiles[0] ?? 'tabular'})
                            </span>
                            <button
                                type="button"
                                className={`btn btn-secondary ${styles.attachmentRemove}`}
                                disabled={chatBusy || spreadsheetBusy}
                                onClick={() => setAttachedSpreadsheet(null)}
                            >
                                Remove
                            </button>
                        </div>
                    ) : null}
                    <div className={styles.composerInputWrap}>
                        <textarea
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            onKeyDown={onComposerKeyDown}
                            rows={3}
                            disabled={chatBusy || voicePhase === 'transcribing'}
                            placeholder="Ask me anything about your data"
                            className={styles.composerInput}
                        />
                        <button
                            type="button"
                            className={`btn btn-secondary ${styles.voiceBtn}`}
                            disabled={chatBusy}
                            onClick={() => void onVoiceButton()}
                            aria-label={
                                voicePhase === 'recording'
                                    ? 'Stop recording and transcribe'
                                    : voicePhase === 'transcribing'
                                      ? 'Transcribing…'
                                      : 'Record voice'
                            }
                            title={
                                voicePhase === 'recording'
                                    ? 'Stop and transcribe into the box (then press Send)'
                                    : voicePhase === 'transcribing'
                                      ? 'Transcribing…'
                                      : 'Speak your question (tap again to stop and transcribe)'
                            }
                        >
                            {voicePhase === 'transcribing' ? (
                                <Loader2 size={18} className="animate-spin" aria-hidden />
                            ) : voicePhase === 'recording' ? (
                                <Square size={14} fill="currentColor" aria-hidden />
                            ) : (
                                <Mic size={18} strokeWidth={2} aria-hidden />
                            )}
                        </button>
                    </div>
                    <div className={styles.composerFooter}>
                        <button type="button" className="btn btn-ghost" onClick={newConversation}>
                            New conversation
                        </button>
                        <button
                            type="button"
                            className="btn btn-primary"
                            disabled={chatBusy || spreadsheetBusy || voicePhase !== 'idle'}
                            onClick={sendChat}
                        >
                            {chatBusy || spreadsheetBusy ? 'Working…' : 'Send'}
                        </button>
                    </div>
                </div>
            </div>

            <div className={styles.bannerStack}>
                {successBanner ? <AlertBox tone="success">{successBanner}</AlertBox> : null}
                {error ? <AlertBox tone="error">{error}</AlertBox> : null}
            </div>

            {commitModalOpen && pendingWrites ? (
                <div
                    className={styles.modalOverlay}
                    role="presentation"
                    onClick={(e) => {
                        if (e.target === e.currentTarget && !commitBusy) setCommitModalOpen(false);
                    }}
                >
                    <div
                        className={styles.modalPanel}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="commit-writes-title"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className={styles.modalHeader}>
                            <AlertTriangle size={22} className={styles.modalIconDanger} aria-hidden />
                            <div>
                                <h2 id="commit-writes-title" className={styles.modalTitle}>
                                    Confirm destructive changes
                                </h2>
                                <p className={styles.modalSubtitle}>
                                    Applying runs all steps <strong>in one transaction</strong> on the live database.
                                    Updates may overwrite data; deletes cannot be undone from here.
                                </p>
                            </div>
                        </div>
                        <p className={styles.modalSummary}>
                            <strong>Summary:</strong> {pendingWrites.summary}
                        </p>
                        <label className={styles.modalCheckLabel}>
                            <input
                                type="checkbox"
                                checked={commitAckDanger}
                                onChange={(e) => setCommitAckDanger(e.target.checked)}
                            />
                            <span>I understand these actions may be destructive or irreversible.</span>
                        </label>
                        <label className={styles.modalFieldLabel}>Type APPLY to confirm</label>
                        <input
                            type="text"
                            autoComplete="off"
                            value={commitPhrase}
                            onChange={(e) => setCommitPhrase(e.target.value)}
                            placeholder="APPLY"
                            disabled={commitBusy}
                            className={styles.modalInput}
                        />
                        {commitModalError ? <p className={styles.modalError}>{commitModalError}</p> : null}
                        <div className={styles.modalActions}>
                            <button
                                type="button"
                                className="btn btn-secondary"
                                disabled={commitBusy}
                                onClick={() => !commitBusy && setCommitModalOpen(false)}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn btn-danger"
                                disabled={commitBusy}
                                onClick={() => void submitCommitWrites()}
                            >
                                {commitBusy ? 'Applying…' : 'Apply changes'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {messagesModalOpen && pendingMessages ? (
                <div
                    className={styles.modalOverlay}
                    role="presentation"
                    onClick={(e) => {
                        if (e.target === e.currentTarget && !messagesCommitBusy) setMessagesModalOpen(false);
                    }}
                >
                    <div
                        className={styles.modalPanel}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="commit-messages-title"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className={styles.modalHeader}>
                            <AlertTriangle size={22} className={styles.modalIconInfo} aria-hidden />
                            <div>
                                <h2 id="commit-messages-title" className={styles.modalTitle}>
                                    Confirm send
                                </h2>
                                <p className={styles.modalSubtitle}>
                                    This will send {channelLabel(pendingMessages.channel).toLowerCase()} messages to{' '}
                                    <strong>{pendingMessages.willSendCount.toLocaleString()}</strong> recipient(s).
                                    Review the Excel preview first.
                                </p>
                            </div>
                        </div>
                        <p className={styles.modalSummary}>
                            <strong>Summary:</strong> {pendingMessages.summary}
                        </p>
                        <label className={styles.modalCheckLabel}>
                            <input
                                type="checkbox"
                                checked={messagesCommitAck}
                                onChange={(e) => setMessagesCommitAck(e.target.checked)}
                            />
                            <span>I reviewed the message preview and each recipient looks correct.</span>
                        </label>
                        <label className={styles.modalFieldLabel}>Type SEND to confirm</label>
                        <input
                            type="text"
                            autoComplete="off"
                            value={messagesCommitPhrase}
                            onChange={(e) => setMessagesCommitPhrase(e.target.value)}
                            placeholder="SEND"
                            disabled={messagesCommitBusy}
                            className={styles.modalInput}
                        />
                        {messagesCommitError ? <p className={styles.modalError}>{messagesCommitError}</p> : null}
                        <div className={styles.modalActions}>
                            <button
                                type="button"
                                className="btn btn-secondary"
                                disabled={messagesCommitBusy}
                                onClick={() => !messagesCommitBusy && setMessagesModalOpen(false)}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                disabled={messagesCommitBusy}
                                onClick={() => void submitCommitMessages()}
                            >
                                {messagesCommitBusy ? 'Sending…' : `Send ${pendingMessages.willSendCount} messages`}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

import { buildQueryExportWorkbook } from '@/lib/internal-reports/build-adhoc-xlsx';
import { putExportXlsx } from '@/lib/internal-reports/export-token-cache';
import { createPendingMessagesToken, type PendingMessageRecipient } from '@/lib/internal-reports/pending-messages-store';
import { tryPublishXlsxPublicUrl } from '@/lib/internal-reports/publish-export-r2';
import { validateReadonlySelect, runReadonlySelectForExport } from '@/lib/internal-reports/read-sql';
import { toolUnavailablePayload } from '@/lib/internal-reports/user-errors';
import { htmlToPlainText, personalizeText } from '@/lib/messaging/render-message';
import type { MessagingChannel } from '@/lib/messaging/types';

const MAX_RECIPIENTS = 500;
const MAX_ROWS_QUERY = 25_000;
const SAMPLE_ROWS_FOR_UI = 5;

export type ProposeMassMessagesInput = {
    summary: string;
    channel: MessagingChannel;
    subject?: string;
    message_template?: string;
    message_column?: string;
    recipients_select_sql: string;
};

export type PendingMessagesReadyPayload = {
    pendingId: string;
    summary: string;
    channel: MessagingChannel;
    recipientCount: number;
    willSendCount: number;
    skippedCount: number;
    downloadUrl: string;
    filename: string;
    sampleRows: Record<string, unknown>[];
};

function sanitizeProposalFilenameBase(summary: string): string {
    let s = summary
        .replace(/[\x00-\x1f<>:"/\\|?*]+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    s = s.replace(/^\.+|\.+$/g, '');
    if (!s) s = 'Mass message preview';
    if (s.length > 80) s = s.slice(0, 80).trim();
    return s;
}

function buildProposalXlsxFilename(summary: string, channel: MessagingChannel): string {
    const base = sanitizeProposalFilenameBase(summary);
    const dateStr = new Date().toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'America/New_York',
    });
    const channelLabel = channel === 'email' ? 'Email' : channel === 'call' ? 'Call' : 'SMS';
    return `Message preview — ${channelLabel} — ${base} — ${dateStr}.xlsx`;
}

function pickString(row: Record<string, unknown>, keys: string[]): string {
    const lowerMap = new Map<string, unknown>();
    for (const [k, v] of Object.entries(row)) {
        lowerMap.set(k.toLowerCase(), v);
    }
    for (const key of keys) {
        const v = lowerMap.get(key.toLowerCase());
        if (v != null && String(v).trim()) return String(v).trim();
    }
    return '';
}

function plainToHtml(text: string): string {
    const trimmed = text.trim();
    if (!trimmed) return '<p></p>';
    if (/<[a-z][\s\S]*>/i.test(trimmed)) return trimmed;
    return trimmed
        .split(/\n{2,}/)
        .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
        .join('');
}

function buildRecipient(
    row: Record<string, unknown>,
    channel: MessagingChannel,
    globalSubject: string,
    messageTemplate: string,
    messageColumn?: string
): PendingMessageRecipient {
    const clientId = pickString(row, ['client_id', 'clientid', 'id']);
    const fullName = pickString(row, ['full_name', 'fullname', 'name', 'client_name']) || clientId;
    const email = pickString(row, ['email', 'email_address']);
    const phone = pickString(row, ['phone', 'phone_number', 'phonenumber', 'primary_phone', 'mobile']);
    const rowSubject = pickString(row, ['subject', 'email_subject']);
    const subject = rowSubject || globalSubject;

    let rawMessage = '';
    if (messageColumn) {
        rawMessage = pickString(row, [messageColumn]);
    }
    if (!rawMessage) {
        rawMessage = pickString(row, ['message', 'body', 'body_text', 'message_body', 'sms_body', 'script']);
    }
    if (!rawMessage && messageTemplate) {
        rawMessage = personalizeText(messageTemplate, fullName);
    } else if (rawMessage && messageTemplate && rawMessage === messageTemplate) {
        rawMessage = personalizeText(messageTemplate, fullName);
    } else if (rawMessage && /\{\{name\}\}|<name>/i.test(rawMessage)) {
        rawMessage = personalizeText(rawMessage, fullName);
    }

    let canSend = false;
    let skipReason: string | undefined;
    let to = '';

    if (channel === 'email') {
        to = email;
        if (email && rawMessage.trim() && subject.trim()) canSend = true;
        else if (!email) skipReason = 'No email on file';
        else if (!subject.trim()) skipReason = 'Missing subject';
        else skipReason = 'Empty message';
    } else {
        to = phone;
        if (phone && rawMessage.trim()) canSend = true;
        else if (!phone) skipReason = 'No phone on file';
        else skipReason = 'Empty message';
    }

    const bodyText = channel === 'email' ? htmlToPlainText(rawMessage) : rawMessage.trim();
    const bodyHtml = channel === 'email' ? plainToHtml(rawMessage) : undefined;

    return {
        clientId: clientId || fullName,
        fullName,
        to,
        subject: channel === 'email' ? subject : undefined,
        bodyText,
        bodyHtml,
        canSend,
        skipReason,
    };
}

function reviewRow(r: PendingMessageRecipient, channel: MessagingChannel): Record<string, unknown> {
    return {
        client_id: r.clientId,
        full_name: r.fullName,
        contact: r.to || '',
        ...(channel === 'email' ? { subject: r.subject ?? '' } : {}),
        message: r.bodyText,
        will_send: r.canSend ? 'Yes' : 'No',
        skip_reason: r.skipReason ?? '',
    };
}

export async function runProposeMassMessagesTool(
    input: unknown,
    onReady: (payload: PendingMessagesReadyPayload) => void | Promise<void>
): Promise<string> {
    const body = (input ?? {}) as ProposeMassMessagesInput;
    const summary = String(body.summary ?? '').trim();
    const channelRaw = String(body.channel ?? 'email').toLowerCase();
    const channel: MessagingChannel =
        channelRaw === 'sms' ? 'sms' : channelRaw === 'call' ? 'call' : 'email';
    const globalSubject = String(body.subject ?? '').trim();
    const messageTemplate = String(body.message_template ?? '').trim();
    const messageColumn = String(body.message_column ?? '').trim() || undefined;
    const sql = String(body.recipients_select_sql ?? '').trim();

    if (!summary) {
        return JSON.stringify({ ok: false, error: '`summary` is required (plain-language description of who gets what).' }, null, 2);
    }
    if (!sql) {
        return JSON.stringify({ ok: false, error: '`recipients_select_sql` is required.' }, null, 2);
    }
    if (!messageTemplate && !messageColumn) {
        return JSON.stringify(
            {
                ok: false,
                error: 'Provide `message_template` (with {{name}}) and/or a per-row `message_column` from your SELECT.',
            },
            null,
            2
        );
    }

    const iv = validateReadonlySelect(sql);
    if (!iv.ok) {
        return JSON.stringify({ ok: false, error: `recipients_select_sql: ${iv.error}` }, null, 2);
    }

    let rows: Record<string, unknown>[];
    try {
        const r = await runReadonlySelectForExport(iv.sql, MAX_ROWS_QUERY);
        rows = r.rows;
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return toolUnavailablePayload('propose_mass_messages', msg);
    }

    if (rows.length === 0) {
        return JSON.stringify(
            { ok: false, error: 'Recipients query returned zero rows. Adjust filters or confirm data.' },
            null,
            2
        );
    }
    if (rows.length > MAX_RECIPIENTS) {
        return JSON.stringify(
            {
                ok: false,
                error: `Too many recipients (${rows.length.toLocaleString()}). Max ${MAX_RECIPIENTS} per batch — narrow your SQL.`,
            },
            null,
            2
        );
    }

    const recipients = rows.map((row) =>
        buildRecipient(row, channel, globalSubject, messageTemplate, messageColumn)
    );
    const willSendCount = recipients.filter((r) => r.canSend).length;
    const skippedCount = recipients.length - willSendCount;

    if (willSendCount === 0) {
        return JSON.stringify(
            {
                ok: false,
                error: 'No recipients can receive this message (missing contact info or empty message). Adjust SQL or content.',
                skipped_count: skippedCount,
            },
            null,
            2
        );
    }

    let pendingId: string;
    try {
        pendingId = createPendingMessagesToken({ summary, channel, recipients });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return JSON.stringify({ ok: false, error: msg }, null, 2);
    }

    const reviewRows = recipients.map((r) => reviewRow(r, channel));
    const sampleRows = reviewRows.slice(0, SAMPLE_ROWS_FOR_UI);

    let buf: Buffer;
    try {
        buf = buildQueryExportWorkbook(reviewRows, 'Messages');
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return JSON.stringify({ ok: false, error: `Failed to build review workbook: ${msg}` }, null, 2);
    }

    const fname = buildProposalXlsxFilename(summary, channel);
    let downloadUrl: string;
    try {
        const publicUrl = await tryPublishXlsxPublicUrl(buf, fname);
        downloadUrl =
            publicUrl ??
            (() => {
                const token = putExportXlsx(buf, fname);
                return `/api/internal-reports/download?token=${token}`;
            })();
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return JSON.stringify({ ok: false, error: `Failed to publish review workbook: ${msg}` }, null, 2);
    }

    const payload: PendingMessagesReadyPayload = {
        pendingId,
        summary,
        channel,
        recipientCount: recipients.length,
        willSendCount,
        skippedCount,
        downloadUrl,
        filename: fname,
        sampleRows,
    };
    await onReady(payload);

    const channelLabel = channel === 'email' ? 'email' : channel === 'call' ? 'phone call' : 'SMS';

    return JSON.stringify(
        {
            ok: true,
            pending_id: pendingId,
            instruction:
                'In your reply: (1) Summarize who will receive what (channel, count). (2) Show a **small** markdown table from `sample_rows` (client, contact, message excerpt). (3) Say the full list with every message is in the Excel file in the UI — **nothing is sent** until they review and confirm with SEND. Do not paste the raw download URL.',
            summary,
            channel: channelLabel,
            recipient_count: recipients.length,
            will_send_count: willSendCount,
            skipped_count: skippedCount,
            sample_rows: sampleRows,
        },
        null,
        2
    );
}

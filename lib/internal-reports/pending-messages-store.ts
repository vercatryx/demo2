import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { MessagingChannel } from '@/lib/messaging/types';
import { internalReportsSigningSecret } from '@/lib/internal-reports/signing-secret';

export type PendingMessageRecipient = {
    clientId: string;
    fullName: string;
    to: string;
    subject?: string;
    bodyText: string;
    bodyHtml?: string;
    canSend: boolean;
    skipReason?: string;
};

export type PendingMessagesPayload = {
    summary: string;
    channel: MessagingChannel;
    recipients: PendingMessageRecipient[];
    createdAt: number;
};

const TTL_MS = 30 * 60 * 1000;
const V = 1;

type WireEnvelope = {
    v: number;
    createdAt: number;
    summary: string;
    channel: MessagingChannel;
    recipients: PendingMessageRecipient[];
    jti: string;
};

function signingSecret(): string {
    return internalReportsSigningSecret();
}

export function createPendingMessagesToken(payload: {
    summary: string;
    channel: MessagingChannel;
    recipients: PendingMessageRecipient[];
}): string {
    const secret = signingSecret();
    const wire: WireEnvelope = {
        v: V,
        createdAt: Date.now(),
        summary: payload.summary,
        channel: payload.channel,
        recipients: payload.recipients,
        jti: randomBytes(16).toString('hex'),
    };
    const inner = JSON.stringify(wire);
    if (inner.length > 1_800_000) {
        throw new Error('Proposal is too large; narrow the recipient list (max ~500 people per batch).');
    }
    const sig = createHmac('sha256', secret).update(inner, 'utf8').digest('hex');
    const outer = JSON.stringify({ inner, sig });
    return Buffer.from(outer, 'utf8').toString('base64url');
}

export function parsePendingMessagesToken(token: string): PendingMessagesPayload | null {
    const secret = signingSecret();
    let outerRaw: string;
    try {
        outerRaw = Buffer.from(token, 'base64url').toString('utf8');
    } catch {
        return null;
    }
    let outer: { inner?: string; sig?: string };
    try {
        outer = JSON.parse(outerRaw) as { inner?: string; sig?: string };
    } catch {
        return null;
    }
    if (typeof outer.inner !== 'string' || typeof outer.sig !== 'string') return null;
    const expected = createHmac('sha256', secret).update(outer.inner, 'utf8').digest('hex');
    try {
        const a = Buffer.from(outer.sig, 'utf8');
        const b = Buffer.from(expected, 'utf8');
        if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    } catch {
        return null;
    }
    let wire: WireEnvelope;
    try {
        wire = JSON.parse(outer.inner) as WireEnvelope;
    } catch {
        return null;
    }
    if (typeof wire.summary !== 'string' || !wire.summary.trim()) return null;
    if (wire.channel !== 'email' && wire.channel !== 'sms' && wire.channel !== 'call') return null;
    if (!Array.isArray(wire.recipients) || wire.recipients.length === 0) return null;
    for (const r of wire.recipients) {
        if (
            !r ||
            typeof r.clientId !== 'string' ||
            typeof r.fullName !== 'string' ||
            typeof r.to !== 'string' ||
            typeof r.bodyText !== 'string' ||
            typeof r.canSend !== 'boolean'
        ) {
            return null;
        }
    }
    if (Date.now() - wire.createdAt > TTL_MS) return null;
    return {
        summary: wire.summary,
        channel: wire.channel,
        recipients: wire.recipients,
        createdAt: wire.createdAt,
    };
}

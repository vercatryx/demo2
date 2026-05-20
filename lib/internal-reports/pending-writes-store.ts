import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { internalReportsSigningSecret } from '@/lib/internal-reports/signing-secret';

export type PendingWriteOp = { title: string; write_sql: string };

export type PendingWritesPayload = {
    summary: string;
    operations: PendingWriteOp[];
    createdAt: number;
};

const TTL_MS = 30 * 60 * 1000;
const V = 1;

type WireEnvelope = {
    v: number;
    createdAt: number;
    summary: string;
    operations: PendingWriteOp[];
    /** Unique id (audit); token remains valid until TTL — avoid re-posting the same token if possible). */
    jti: string;
};

function signingSecret(): string {
    return internalReportsSigningSecret();
}

/**
 * Encodes a pending proposal into a signed token (stateless, works across serverless instances).
 * Uses INTERNAL_REPORTS_WRITE_SIGNING_SECRET or INTERNAL_REPORTS_SECRET when set; otherwise a built-in signing key.
 */
export function createPendingWritesToken(payload: { summary: string; operations: PendingWriteOp[] }): string {
    const secret = signingSecret();
    const wire: WireEnvelope = {
        v: V,
        createdAt: Date.now(),
        summary: payload.summary,
        operations: payload.operations,
        jti: randomBytes(16).toString('hex'),
    };
    const inner = JSON.stringify(wire);
    if (inner.length > 1_200_000) {
        throw new Error('Proposal is too large to encode; reduce operations or SQL length.');
    }
    const sig = createHmac('sha256', secret).update(inner, 'utf8').digest('hex');
    const outer = JSON.stringify({ inner, sig });
    return Buffer.from(outer, 'utf8').toString('base64url');
}

export function parsePendingWritesToken(token: string): PendingWritesPayload | null {
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
    if (!Array.isArray(wire.operations) || wire.operations.length === 0) return null;
    for (const op of wire.operations) {
        if (!op || typeof (op as PendingWriteOp).title !== 'string' || typeof (op as PendingWriteOp).write_sql !== 'string') {
            return null;
        }
    }
    if (Date.now() - wire.createdAt > TTL_MS) return null;
    return {
        summary: wire.summary,
        operations: wire.operations,
        createdAt: wire.createdAt,
    };
}

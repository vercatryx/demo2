import { createHmac, timingSafeEqual } from 'crypto';
import { internalReportsSigningSecret } from '@/lib/internal-reports/signing-secret';

const SESSION_V = 1;
const TTL_MS = 8 * 60 * 60 * 1000;

type WireEditing = {
    typ: 'ir-editing';
    v: number;
    /** ms epoch when token was minted */
    iat: number;
};

function parseVerifiedEditingWire(token: string): WireEditing | null {
    if (!token || typeof token !== 'string' || token.length > 2_000_000) return null;
    const secret = internalReportsSigningSecret();
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
    let wire: WireEditing;
    try {
        wire = JSON.parse(outer.inner) as WireEditing;
    } catch {
        return null;
    }
    if (wire.typ !== 'ir-editing' || wire.v !== SESSION_V || typeof wire.iat !== 'number') return null;
    if (Date.now() - wire.iat > TTL_MS) return null;
    return wire;
}

export function createEditingSessionToken(): string {
    const secret = internalReportsSigningSecret();
    const wire: WireEditing = {
        typ: 'ir-editing',
        v: SESSION_V,
        iat: Date.now(),
    };
    const inner = JSON.stringify(wire);
    const sig = createHmac('sha256', secret).update(inner, 'utf8').digest('hex');
    const outer = JSON.stringify({ inner, sig });
    return Buffer.from(outer, 'utf8').toString('base64url');
}

export function validateEditingSessionToken(token: string | undefined | null): boolean {
    if (!token) return false;
    return parseVerifiedEditingWire(token) !== null;
}

export function editingSessionExpiresAt(token: string | undefined | null): number | null {
    const wire = token ? parseVerifiedEditingWire(token) : null;
    if (!wire) return null;
    return wire.iat + TTL_MS;
}

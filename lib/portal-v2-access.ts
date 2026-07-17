/**
 * Portal v2 is the default for Food and Boxes clients.
 * Opt out to legacy v1 via URL (?portal=v1 or ?legacy=1), localStorage, or env (dev).
 */

const LEGACY_PORTAL_STORAGE_KEY = 'triangle_portal_legacy_v1';

const DEV_PORTAL_V2_CLIENT_IDS = ['CLIENT-4485'] as const;

function parseClientIdList(raw: string | undefined): string[] {
    if (!raw?.trim()) return [];
    return raw
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
}

/** True when this client was on the dev/env allowlist (legacy helper; v2 is default now). */
export function isPortalV2ClientAllowlisted(clientId: string): boolean {
    const normalized = clientId.trim().toUpperCase();
    if (!normalized) return false;

    const fromEnv = parseClientIdList(process.env.PORTAL_V2_CLIENT_IDS);
    if (fromEnv.includes(normalized)) return true;

    if (process.env.NODE_ENV === 'development') {
        return DEV_PORTAL_V2_CLIENT_IDS.some((id) => id.toUpperCase() === normalized);
    }

    return false;
}

function envForcesLegacyPortal(): boolean {
    return process.env.PORTAL_LEGACY_V1 === '1' || process.env.PORTAL_FORCE_V1 === '1';
}

/** True when the viewer opted out of portal v2 (legacy v1). Client-only; returns false on server. */
export function isPortalLegacyOptOut(): boolean {
    if (envForcesLegacyPortal()) return true;
    if (typeof window === 'undefined') return false;
    try {
        return localStorage.getItem(LEGACY_PORTAL_STORAGE_KEY) === '1';
    } catch {
        return false;
    }
}

export function setPortalLegacyOptOut(enabled: boolean): void {
    if (typeof window === 'undefined') return;
    try {
        if (enabled) localStorage.setItem(LEGACY_PORTAL_STORAGE_KEY, '1');
        else localStorage.removeItem(LEGACY_PORTAL_STORAGE_KEY);
    } catch {
        /* ignore quota / private mode */
    }
}

export function readPortalLegacyOptOut(): boolean {
    return isPortalLegacyOptOut();
}

/** Apply ?portal=v1|v2 or ?legacy=1 from the current portal URL (client-only). */
export function applyPortalVersionFromUrl(searchParams: URLSearchParams): void {
    const portal = searchParams.get('portal')?.trim().toLowerCase();
    if (portal === 'v1' || searchParams.get('legacy') === '1') {
        setPortalLegacyOptOut(true);
        return;
    }
    if (portal === 'v2') {
        setPortalLegacyOptOut(false);
    }
}

/**
 * Food and Boxes clients use portal v2 unless explicitly opted out to legacy v1.
 * `globalPortalV2Enabled` is ignored (kept for call-site compatibility; no DB migration).
 */
export function shouldUsePortalV2(
    clientId: string,
    serviceType: string,
    _globalPortalV2Enabled?: boolean,
): boolean {
    void clientId;
    void _globalPortalV2Enabled;
    if (serviceType !== 'Food' && serviceType !== 'Boxes') return false;
    if (isPortalLegacyOptOut()) return false;
    return true;
}

/** Monotonic token embedded in upcoming_order so stale in-flight portal writes cannot overwrite newer ones. */

export const PORTAL_SAVE_SEQ_KEY = '_portalSaveSeq';

export function getPortalSaveSeq(order: unknown): number {
    if (!order || typeof order !== 'object') return 0;
    const n = Number((order as Record<string, unknown>)[PORTAL_SAVE_SEQ_KEY]);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

export function withPortalSaveSeq<T extends Record<string, unknown>>(order: T, seq: number): T {
    return { ...order, [PORTAL_SAVE_SEQ_KEY]: seq };
}

/**
 * Next save token: strictly increasing within the session AND always greater than
 * any seq persisted by earlier sessions (timestamp-based). A plain per-session
 * counter restarts at 1 on reload and the server would reject every save as stale.
 */
export function nextPortalSaveSeq(prevSeq: number): number {
    return Math.max(prevSeq + 1, Date.now());
}

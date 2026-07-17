/** Local backup of portal cart so we can escalate failed saves to the team. */

export type PortalCartDraft = {
    clientId: string;
    fullName: string;
    serviceType: string;
    savedAt: string;
    orderConfig: unknown;
};

function storageKey(clientId: string): string {
    return `triangle:portal-cart-draft:${clientId}`;
}

export function writePortalCartDraft(draft: PortalCartDraft): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(storageKey(draft.clientId), JSON.stringify(draft));
    } catch {
        // Quota / private mode — ignore; in-memory cart still used for escalate.
    }
}

export function readPortalCartDraft(clientId: string): PortalCartDraft | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(storageKey(clientId));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as PortalCartDraft;
        if (!parsed || parsed.clientId !== clientId || !parsed.orderConfig) return null;
        return parsed;
    } catch {
        return null;
    }
}

export function clearPortalCartDraft(clientId: string): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.removeItem(storageKey(clientId));
    } catch {
        // ignore
    }
}

export function normalizeSearchText(...parts: (string | number | null | undefined)[]): string {
    return parts
        .filter((p) => p !== null && p !== undefined && String(p).trim() !== '')
        .join(' ')
        .toLowerCase();
}

/** True when the user is typing an item number (optional leading #). */
export function isItemNumberSearchQuery(query: string): boolean {
    const digits = query.trim().replace(/^#/, '');
    return digits.length > 0 && /^\d+$/.test(digits);
}

export function itemNumberQueryDigits(query: string): string {
    return query.trim().replace(/^#/, '');
}

export function itemMatchesItemNumberQuery(itemNumber: number | null, digits: string): boolean {
    if (itemNumber == null || !digits) return false;
    const n = String(itemNumber);
    return n === digits || n.startsWith(digits);
}

function itemExactItemNumberMatch(itemNumber: number | null, digits: string): boolean {
    if (itemNumber == null || !digits) return false;
    return String(itemNumber) === digits;
}

function itemPrefixItemNumberMatch(itemNumber: number | null, digits: string): boolean {
    if (itemNumber == null || !digits) return false;
    const n = String(itemNumber);
    return n !== digits && n.startsWith(digits);
}

export function sortSearchHitsByQuery<T extends { label: string; tokens: string; itemNumber?: number | null }>(
    hits: T[],
    q: string,
    limit: number,
): T[] {
    const rank = (h: T) => {
        const labelLower = h.label.toLowerCase();
        const starts = labelLower.startsWith(q) || h.tokens.startsWith(q);
        if (h.itemNumber != null) {
            const num = String(h.itemNumber);
            const digits = itemNumberQueryDigits(q);
            if (digits && (num === digits || num.startsWith(digits))) return 0;
        }
        return starts ? 1 : 2;
    };
    return [...hits].sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label)).slice(0, limit);
}

export function filterCatalogHitsByQuery<T extends { label: string; tokens: string; itemNumber?: number | null }>(
    hits: T[],
    query: string,
    limit = 24,
): T[] {
    const raw = query.trim();
    if (!raw) return [];

    if (isItemNumberSearchQuery(raw)) {
        const digits = itemNumberQueryDigits(raw);

        const exactIdMatches = hits.filter(
            (h) => h.itemNumber != null && itemExactItemNumberMatch(h.itemNumber, digits),
        );
        if (exactIdMatches.length > 0) {
            return sortSearchHitsByQuery(exactIdMatches, digits, limit);
        }

        const prefixIdMatches = hits.filter(
            (h) => h.itemNumber != null && itemPrefixItemNumberMatch(h.itemNumber, digits),
        );
        if (prefixIdMatches.length > 0) {
            return sortSearchHitsByQuery(prefixIdMatches, digits, limit);
        }

        // Numeric query with no Item # hit — search names/labels only (not UUIDs in tokens).
        const q = raw.toLowerCase();
        const matched = hits.filter((h) => h.label.toLowerCase().includes(q));
        return sortSearchHitsByQuery(matched, q, limit);
    }

    const q = raw.toLowerCase();
    const matched = hits.filter((h) => h.tokens.includes(q));
    return sortSearchHitsByQuery(matched, q, limit);
}

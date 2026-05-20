/**
 * Human-readable USD for internal estimates — avoids collapsing tiny costs to "$0.00".
 */
export function formatUsdEstimate(n: number): string {
    const x = Number(n);
    if (!Number.isFinite(x)) return '—';
    if (x === 0) return '$0';

    const abs = Math.abs(x);
    if (abs < 1e-10) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            maximumSignificantDigits: 4,
        }).format(x);
    }

    const maxFrac = abs < 0.01 ? 8 : abs < 1 ? 6 : abs < 100 ? 4 : 2;
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: maxFrac,
    }).format(x);
}

/**
 * Shared secret for signing internal-reports payloads (pending writes, editing sessions).
 *
 * Env vars override when set. Otherwise a built-in fallback is used so local/internal
 * use does not require configuration. For production exposure, set
 * INTERNAL_REPORTS_WRITE_SIGNING_SECRET (or INTERNAL_REPORTS_SECRET).
 */
const BUILTIN_SIGNING_FALLBACK =
    'demo-food-internal-reports-builtin-signing-v1-not-for-untrusted-public-internet';

export function internalReportsSigningSecret(): string {
    return (
        process.env.INTERNAL_REPORTS_WRITE_SIGNING_SECRET?.trim() ||
        process.env.INTERNAL_REPORTS_SECRET?.trim() ||
        BUILTIN_SIGNING_FALLBACK
    );
}

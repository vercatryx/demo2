/**
 * Central place for Supabase API keys (new `sb_*` keys + legacy JWT fallbacks).
 * Never commit real keys; set in .env.local only.
 *
 * If legacy JWTs are disabled in the Supabase dashboard but still present in .env,
 * they must come *after* new keys so we do not send rejected keys first.
 */

const PLACEHOLDER = /^(REQUIRED|CHANGE_ME|xxx|\[.*\])$/i;

/** Ignore template placeholders like REQUIRED so they do not beat real anon keys. */
export function isUsableSupabaseKey(value: string | undefined): value is string {
    const v = value?.trim();
    if (!v || PLACEHOLDER.test(v)) return false;
    return v.startsWith('eyJ') || v.startsWith('sb_');
}

/** Best key for general PostgREST reads/writes via supabase-js (app singleton). */
export function getSupabaseDbApiKey(): string | undefined {
    const secret = process.env.SUPABASE_SECRET_KEY?.trim();
    const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY?.trim();
    const legacyService = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    const legacyAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
    if (isUsableSupabaseKey(secret)) return secret;
    if (isUsableSupabaseKey(publishable)) return publishable;
    if (isUsableSupabaseKey(legacyService)) return legacyService;
    if (isUsableSupabaseKey(legacyAnon)) return legacyAnon;
    return undefined;
}

export type SupabaseDbKeySource = 'secret' | 'publishable' | 'legacy_service' | 'legacy_anon';

/** Which env var supplied the DB API key (for logs only; no secrets). */
export function getSupabaseDbKeySource(): SupabaseDbKeySource | null {
    if (isUsableSupabaseKey(process.env.SUPABASE_SECRET_KEY)) return 'secret';
    if (isUsableSupabaseKey(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY)) {
        return 'publishable';
    }
    if (isUsableSupabaseKey(process.env.SUPABASE_SERVICE_ROLE_KEY)) return 'legacy_service';
    if (isUsableSupabaseKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)) return 'legacy_anon';
    return null;
}

/**
 * Elevated server key only: new secret or legacy service_role JWT (not publishable).
 * Use when an operation must bypass RLS like the old service role; requires one of these set.
 */
export function getSupabaseServerSecretKey(): string | undefined {
    const candidates = [
        process.env.SUPABASE_SECRET_KEY,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        process.env.SUPABASE_SERVICE_KEY,
    ];
    for (const raw of candidates) {
        const v = raw?.trim();
        if (isUsableSupabaseKey(v)) return v;
    }
    return undefined;
}

/** Human-readable hint when service key env vars are missing on the host. */
export function getSupabaseServiceKeySetupHint(): string {
    return 'Set SUPABASE_SECRET_KEY (sb_secret_…) or SUPABASE_SERVICE_ROLE_KEY on the server/host — not only NEXT_PUBLIC_* publishable keys.';
}

/** Extension-style fallbacks: full chain including publishable + legacy anon. */
export function getSupabaseServiceOrAnonKey(): string | undefined {
    return getSupabaseDbApiKey();
}

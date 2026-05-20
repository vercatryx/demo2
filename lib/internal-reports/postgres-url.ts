import postgres from 'postgres';

const PLACEHOLDER = /\[REF\]|\[PASSWORD\]|REQUIRED|CHANGE_ME/i;

/** Extract project ref from Supabase URL or postgres user (postgres.xxx). */
export function supabaseProjectRefFromEnv(): string | undefined {
    const api = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    if (api) {
        try {
            return new URL(api).hostname.split('.')[0] || undefined;
        } catch {
            /* ignore */
        }
    }
    return undefined;
}

function isPlaceholderUrl(url: string): boolean {
    return PLACEHOLDER.test(url);
}

export type ParsedPgCreds = {
    username: string;
    password: string;
    host: string;
    port: string;
    database: string;
};

export function parsePostgresUrl(raw: string): ParsedPgCreds | null {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('prisma+') || isPlaceholderUrl(trimmed)) {
        return null;
    }
    try {
        const parsed = new URL(trimmed.replace(/^postgres:/, 'postgresql:'));
        return {
            username: decodeURIComponent(parsed.username),
            password: decodeURIComponent(parsed.password),
            host: parsed.hostname,
            port: parsed.port || '5432',
            database: parsed.pathname.replace(/^\//, '') || 'postgres',
        };
    } catch {
        return null;
    }
}

/** Build a postgres.js URL (password safely encoded). */
export function buildPostgresUrl(creds: ParsedPgCreds): string {
    const user = encodeURIComponent(creds.username);
    const pass = encodeURIComponent(creds.password);
    return `postgres://${user}:${pass}@${creds.host}:${creds.port}/${creds.database}`;
}

/**
 * Supabase shared pooler hostnames are region-specific (not always aws-0-us-east-1).
 * Optional override: SUPABASE_POOLER_HOST=aws-1-us-east-1.pooler.supabase.com
 */
export function poolerHostCandidates(configuredHost: string | undefined): string[] {
    const override = process.env.SUPABASE_POOLER_HOST?.trim();
    const out: string[] = [];
    if (override) out.push(override);
    if (configuredHost && !out.includes(configuredHost)) out.push(configuredHost);
    for (let i = 0; i <= 2; i++) {
        for (const region of [
            'us-east-1',
            'us-east-2',
            'us-west-1',
            'us-west-2',
            'eu-west-1',
            'ap-south-1',
            'ap-southeast-1',
        ]) {
            const h = `aws-${i}-${region}.pooler.supabase.com`;
            if (!out.includes(h)) out.push(h);
        }
    }
    return out;
}

let cachedWorkingPoolerHost: string | null | undefined;

export async function discoverWorkingPoolerHost(creds: ParsedPgCreds): Promise<string | null> {
    if (cachedWorkingPoolerHost !== undefined) return cachedWorkingPoolerHost;

    const ref = supabaseProjectRefFromEnv();
    const user =
        creds.username.includes('.') || !ref
            ? creds.username
            : `postgres.${ref}`;

    for (const host of poolerHostCandidates(creds.host)) {
        for (const port of ['5432', '6543']) {
            const trial = buildPostgresUrl({ ...creds, host, port, username: user });
            const sql = postgres(trial, { max: 1, ssl: 'require', connect_timeout: 10 });
            try {
                await sql`select 1 as ok`;
                cachedWorkingPoolerHost = host;
                return host;
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                if (/password authentication failed/i.test(msg)) {
                    // Tenant exists on this host; password in .env does not match.
                    cachedWorkingPoolerHost = host;
                    return host;
                }
            } finally {
                await sql.end({ timeout: 3 }).catch(() => undefined);
            }
        }
    }
    cachedWorkingPoolerHost = null;
    return null;
}

/**
 * Normalize Supabase URI for the `postgres` npm driver (used by Data Copilot SQL).
 * Preserves port (6543 transaction vs 5432 session). Strips sslmode (driver uses ssl option).
 */
export function normalizePostgresUrlForNode(raw: string, hostOverride?: string): string | null {
    const creds = parsePostgresUrl(raw);
    if (!creds) return null;
    if (hostOverride) creds.host = hostOverride;
    return buildPostgresUrl(creds);
}

export function getInternalReportsPostgresUrl(): string | undefined {
    const candidates = [
        process.env.INTERNAL_REPORTS_POSTGRES_URL,
        process.env.SUPABASE_DATABASE_URL,
        process.env.DATABASE_URL,
    ];
    const expectedRef = supabaseProjectRefFromEnv();

    for (const c of candidates) {
        const raw = c?.trim();
        if (!raw) continue;
        const creds = parsePostgresUrl(raw);
        if (!creds) continue;

        if (expectedRef) {
            const refInUser = creds.username.includes('.')
                ? creds.username.split('.').slice(1).join('.')
                : '';
            if (refInUser && refInUser !== expectedRef) {
                continue;
            }
        }
        const normalized = normalizePostgresUrlForNode(raw);
        if (normalized) return normalized;
    }
    return undefined;
}

/** Resolve URL, auto-correcting pooler hostname when DATABASE_URL used a template region. */
export async function resolveInternalReportsPostgresUrl(): Promise<string | undefined> {
    const raw =
        process.env.INTERNAL_REPORTS_POSTGRES_URL?.trim() ||
        process.env.SUPABASE_DATABASE_URL?.trim() ||
        process.env.DATABASE_URL?.trim();
    if (!raw) return undefined;

    const creds = parsePostgresUrl(raw);
    if (!creds) return undefined;

    const direct = normalizePostgresUrlForNode(raw);
    if (!direct) return undefined;

    const sql = postgres(direct, { max: 1, ssl: 'require', connect_timeout: 10 });
    try {
        await sql`select 1 as ok`;
        return direct;
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!/tenant or user not found/i.test(msg)) {
            return direct;
        }
    } finally {
        await sql.end({ timeout: 3 }).catch(() => undefined);
    }

    const host = await discoverWorkingPoolerHost(creds);
    if (!host) return direct;
    return normalizePostgresUrlForNode(raw, host) ?? direct;
}

export function postgresConnectionHint(): string {
    const ref = supabaseProjectRefFromEnv() ?? 'your-project-ref';
    const configured = process.env.DATABASE_URL ? parsePostgresUrl(process.env.DATABASE_URL) : null;
    const hostNote = configured
        ? ` Your DATABASE_URL host is \`${configured.host}\`; Supabase Connect may show a different pooler (e.g. aws-1-us-east-1).`
        : '';
    return (
        'Data Copilot needs a working Postgres URI. In Supabase Dashboard → project **' +
        ref +
        '** → **Connect**, copy the **entire** Session or Transaction URI (not only the password into an old template).' +
        hostNote +
        ' Paste as `DATABASE_URL` or `INTERNAL_REPORTS_POSTGRES_URL` in `.env.local`, then restart `npm run dev` and run `npm run test:internal-reports-db`.' +
        ' If you see "password authentication failed", reset the database password in the dashboard and paste the new full URI again.'
    );
}

export function isPostgresAuthError(message: string): boolean {
    return /tenant or user not found|password authentication failed|invalid authorization/i.test(message);
}

export function isWrongPoolerHostError(message: string): boolean {
    return /tenant or user not found/i.test(message);
}

export function isPasswordAuthError(message: string): boolean {
    return /password authentication failed/i.test(message);
}

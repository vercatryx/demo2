import postgres from 'postgres';
import { resolveInternalReportsPostgresUrl } from '@/lib/internal-reports/postgres-url';

const BLOCKED_IN_WRITE =
    /\b(create|drop|alter|truncate|grant|revoke|execute\s+immediate|copy\s+to|copy\s+from|into\s+outfile)\b/i;

/**
 * Single-statement DML only. Used for internal-reports batch apply after human confirmation.
 */
export function validateSingleWriteSql(sql: string): { ok: true; sql: string } | { ok: false; error: string } {
    const raw = sql.trim().replace(/^\uFEFF/, '');
    if (!raw) return { ok: false, error: 'Write SQL is empty.' };
    if (raw.length > 48_000) return { ok: false, error: 'Write SQL exceeds maximum length.' };
    if (BLOCKED_IN_WRITE.test(raw)) {
        return { ok: false, error: 'Statement contains blocked keywords (DDL or dangerous commands).' };
    }
    const one = raw.replace(/;+\s*$/g, '').trim();
    if (one.includes(';')) return { ok: false, error: 'Multiple statements are not allowed.' };
    if (!/^\s*(update|delete|insert)\b/i.test(one)) {
        return { ok: false, error: 'Write must be a single UPDATE, DELETE, or INSERT statement.' };
    }
    return { ok: true, sql: one };
}

/** On by default. Set INTERNAL_REPORTS_ALLOW_WRITES to false / 0 / no / off to disable batch writes. */
export function internalReportsWritesEnabled(): boolean {
    const v = process.env.INTERNAL_REPORTS_ALLOW_WRITES?.trim().toLowerCase();
    if (!v) return true;
    return !(v === 'false' || v === '0' || v === 'no' || v === 'off');
}

export type CommitWritesResult = {
    counts: number[];
};

/**
 * Runs all statements in one transaction (all commit or all roll back).
 */
export async function commitWritesTransaction(writes: string[]): Promise<CommitWritesResult> {
    const url = await resolveInternalReportsPostgresUrl();
    if (!url) {
        throw new Error(
            'No Postgres URL. Set INTERNAL_REPORTS_POSTGRES_URL or SUPABASE_DATABASE_URL for write operations.'
        );
    }
    const validated = writes.map((w) => {
        const v = validateSingleWriteSql(w);
        if (!v.ok) throw new Error(v.error);
        return v.sql;
    });

    const sql = postgres(url, {
        max: 1,
        idle_timeout: 20,
        connect_timeout: 30,
        ssl: 'require',
    });
    try {
        const counts = await sql.begin(async (tx) => {
            const out: number[] = [];
            for (const stmt of validated) {
                const r = await tx.unsafe(stmt);
                const n = typeof (r as { count?: number }).count === 'number' ? (r as { count: number }).count : 0;
                out.push(n);
            }
            return out;
        });
        return { counts };
    } finally {
        await sql.end({ timeout: 5 }).catch(() => undefined);
    }
}

/**
 * Executes each write inside a transaction that is rolled back — verifies statements run without error.
 */
export async function dryRunWritesInRollbackTransaction(writes: string[]): Promise<void> {
    const url = await resolveInternalReportsPostgresUrl();
    if (!url) {
        throw new Error(
            'No Postgres URL. Set INTERNAL_REPORTS_POSTGRES_URL or SUPABASE_DATABASE_URL for write operations.'
        );
    }
    const validated = writes.map((w) => {
        const v = validateSingleWriteSql(w);
        if (!v.ok) throw new Error(v.error);
        return v.sql;
    });

    const sql = postgres(url, {
        max: 1,
        idle_timeout: 20,
        connect_timeout: 30,
        ssl: 'require',
    });
    try {
        await sql`begin`;
        try {
            for (const stmt of validated) {
                await sql.unsafe(stmt);
            }
        } finally {
            await sql`rollback`;
        }
    } finally {
        await sql.end({ timeout: 5 }).catch(() => undefined);
    }
}

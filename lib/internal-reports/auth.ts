import type { NextRequest } from 'next/server';
import { canAccessAiTools } from '@/lib/role-access';
import { getSession } from '@/lib/session';

/**
 * Optional shared secret when `INTERNAL_REPORTS_REQUIRE_AUTH=true`.
 * When that flag is off, admin session (AI tools role) is required in this app.
 */
export function getInternalReportsSecret(): string | undefined {
    return process.env.INTERNAL_REPORTS_SECRET?.trim() || undefined;
}

export function authorizeInternalReports(request: NextRequest): boolean {
    if (process.env.INTERNAL_REPORTS_REQUIRE_AUTH === 'true') {
        const secret = getInternalReportsSecret();
        if (!secret) return false;
        const url = new URL(request.url);
        const q = url.searchParams.get('key')?.trim();
        const auth = request.headers.get('authorization');
        const bearer = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : undefined;
        return q === secret || bearer === secret;
    }
    return false;
}

export async function authorizeInternalReportsRequest(request: NextRequest): Promise<boolean> {
    if (authorizeInternalReports(request)) return true;
    const session = await getSession();
    return Boolean(session?.userId && canAccessAiTools(session.role));
}

export async function authorizeInternalReportsBodyKey(key: string | undefined): Promise<boolean> {
    if (process.env.INTERNAL_REPORTS_REQUIRE_AUTH === 'true') {
        const secret = getInternalReportsSecret();
        if (!secret) return false;
        return (key ?? '').trim() === secret;
    }
    const session = await getSession();
    return Boolean(session?.userId && canAccessAiTools(session.role));
}

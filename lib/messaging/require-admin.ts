import { getSession } from '@/lib/session';

export async function requireAdminMessaging() {
    const session = await getSession();
    if (!session?.userId) {
        return { ok: false as const, status: 401, msg: 'Not authenticated' };
    }
    if (session.role !== 'admin' && session.role !== 'super-admin') {
        return { ok: false as const, status: 403, msg: 'Admins only' };
    }
    return { ok: true as const };
}

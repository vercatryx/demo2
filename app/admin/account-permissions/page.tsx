import { notFound } from 'next/navigation';
import { verifySession } from '@/lib/session';
import { AccountPermissionsClient } from '@/components/admin/AccountPermissionsClient';

export const dynamic = 'force-dynamic';
export const metadata = {
    title: 'Account Permissions',
    robots: { index: false, follow: false },
};

export default async function AccountPermissionsPage() {
    const session = await verifySession();
    if (session.role !== 'admin' && session.role !== 'super-admin') notFound();
    return <AccountPermissionsClient />;
}

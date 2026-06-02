import { notFound } from 'next/navigation';
import { verifySession } from '@/lib/session';
import { MassMessagingClient } from '@/components/admin/messaging/MassMessagingClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mass Messaging', robots: { index: false, follow: false } };

export default async function MassMessagingPage() {
    const session = await verifySession();
    if (session.role !== 'admin' && session.role !== 'super-admin') notFound();
    return <MassMessagingClient />;
}

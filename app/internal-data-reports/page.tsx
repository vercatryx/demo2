import { notFound } from 'next/navigation';
import { InternalReportsClient } from '@/components/internal-reports/InternalReportsClient';
import { canAccessAiTools } from '@/lib/role-access';
import { verifySession } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Data Copilot', robots: { index: false, follow: false } };

export default async function InternalDataReportsPage() {
    const session = await verifySession();
    if (!canAccessAiTools(session.role)) notFound();
    return <InternalReportsClient />;
}

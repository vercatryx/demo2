/**
 * Admin hub: AI / SMS / voice usage, SMS transcripts by number, internal rate card.
 *
 * Linked from the sidebar under AI Bot (with AI Builder and SMS Tester).
 */
import { notFound } from 'next/navigation';
import { verifySession } from '@/lib/session';
import { AiUsageClient } from '@/components/admin/AiUsageClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Usage & conversations', robots: { index: false, follow: false } };

export default async function AiUsagePage() {
    const session = await verifySession();
    if (session.role !== 'admin' && session.role !== 'super-admin') notFound();
    return <AiUsageClient />;
}

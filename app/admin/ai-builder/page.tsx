/**
 * Unlisted AI Instructions Builder page.
 *
 * Not linked from the main admin tabs — admins access it directly via
 * /admin/ai-builder. Still gated by the admin session so unauthenticated
 * users are redirected to /login.
 *
 * If AI_BUILDER_ENABLED is set to "false", the page 404s as a simple
 * feature flag escape hatch.
 */
import { notFound } from 'next/navigation';
import { verifySession } from '@/lib/session';
import { AiBuilderClient } from '@/components/admin/ai-builder/AiBuilderClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'AI Instructions Builder', robots: { index: false, follow: false } };

export default async function AiBuilderPage() {
    if (process.env.AI_BUILDER_ENABLED === 'false') notFound();
    const session = await verifySession();
    if (session.role !== 'admin' && session.role !== 'super-admin') notFound();
    return <AiBuilderClient />;
}

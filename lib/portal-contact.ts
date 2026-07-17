'use server';

import { getPublicClient } from '@/lib/actions';
import { sendEmail } from '@/lib/email';
import { brandedParagraph, buildBrandedEmailShell, escapeHtml } from '@/lib/email-branded-shell';
import { getSession } from '@/lib/session';

const PORTAL_CONTACT_EMAIL = 'triangleoffice@shinytriangle.com';

export async function sendPortalContactMessage(params: {
    clientId: string;
    message: string;
}): Promise<{ success: boolean; error?: string }> {
    const session = await getSession();
    if (!session?.userId) {
        return { success: false, error: 'Please sign in and try again.' };
    }

    if (session.role === 'client' && session.userId !== params.clientId) {
        return { success: false, error: 'You can only send messages from your own portal.' };
    }

    const message = params.message?.trim();
    if (!message) {
        return { success: false, error: 'Please enter a message.' };
    }
    if (message.length > 5000) {
        return { success: false, error: 'Message is too long. Please shorten it and try again.' };
    }

    const client = await getPublicClient(params.clientId);
    if (!client) {
        return { success: false, error: 'Client not found.' };
    }

    const safeMessage = escapeHtml(message).replace(/\n/g, '<br>');
    const subject = `Portal help request — ${client.fullName} (${client.id})`;

    const detailRows = [
        brandedParagraph(`<strong>Client name:</strong> ${escapeHtml(client.fullName)}`),
        brandedParagraph(`<strong>Client ID:</strong> ${escapeHtml(client.id)}`),
        client.email
            ? brandedParagraph(`<strong>Email:</strong> ${escapeHtml(client.email)}`)
            : '',
        client.phoneNumber
            ? brandedParagraph(`<strong>Phone:</strong> ${escapeHtml(client.phoneNumber)}`)
            : '',
        brandedParagraph(`<strong>Service type:</strong> ${escapeHtml(String(client.serviceType))}`),
        brandedParagraph(
            `<strong>Sent from portal by:</strong> ${escapeHtml(String(session.name || session.role))} (${escapeHtml(String(session.role))})`,
        ),
        brandedParagraph(`<strong>Message:</strong><br>${safeMessage}`),
    ].filter(Boolean);

    const html = buildBrandedEmailShell({ bodyHtml: detailRows.join('') });

    const result = await sendEmail({
        to: PORTAL_CONTACT_EMAIL,
        subject,
        html,
    });

    if (!result.success) {
        return { success: false, error: result.error || 'Could not send your message. Please try again later.' };
    }

    return { success: true };
}

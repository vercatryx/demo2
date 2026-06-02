import { buildBrandedEmailShell } from '@/lib/email-branded-shell';
import type { ComposePayload } from './types';

const NAME_TOKEN_REGEX = /\{\{name\}\}|<name>/gi;
const DEFAULT_NAME = 'Valued Client';

export function personalizeText(text: string, fullName: string): string {
    const safeName = fullName.trim() || DEFAULT_NAME;
    return text.replace(NAME_TOKEN_REGEX, safeName);
}

export function htmlToPlainText(html: string): string {
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<\/li>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

export function wrapEmailBodyHtml(bodyHtml: string): string {
    return buildBrandedEmailShell({
        bodyHtml,
        centerLogo: true,
    });
}

export function renderEmailHtml(bodyHtml: string, fullName: string): string {
    const personalized = personalizeText(bodyHtml, fullName);
    return wrapEmailBodyHtml(personalized);
}

export function renderEmailPlain(bodyHtml: string, fullName: string): string {
    const personalized = personalizeText(bodyHtml, fullName);
    return htmlToPlainText(personalized);
}

export function renderSmsText(bodyText: string, fullName: string): string {
    return personalizeText(bodyText, fullName);
}

/** Demo build: no outbound email — UI only. */
export async function sendComposedEmail(_params: {
    to: string;
    subject: string;
    bodyHtml: string;
    fullName: string;
}): Promise<{ success: boolean; error?: string; provider?: 'main' | 'gmail' }> {
    return { success: true, provider: 'main' };
}

/** Demo build: no outbound SMS — UI only. */
export async function sendComposedSms(_params: {
    to: string;
    bodyText: string;
    fullName: string;
}): Promise<{ success: boolean; error?: string }> {
    return { success: true };
}

/** Demo build: no outbound calls — UI only. */
export async function sendComposedCall(_params: {
    to: string;
    bodyText: string;
    fullName: string;
    clientId?: string;
}): Promise<{ success: boolean; error?: string }> {
    return { success: true };
}

export async function dispatchMessage(params: {
    channel: ComposePayload['channel'];
    to: string;
    fullName: string;
    clientId?: string;
    subject?: string;
    bodyHtml?: string;
    bodyText?: string;
}): Promise<{ success: boolean; error?: string; provider?: 'main' | 'gmail' }> {
    if (params.channel === 'email') {
        if (!params.subject?.trim()) {
            return { success: false, error: 'Subject is required' };
        }
        if (!params.bodyHtml?.trim()) {
            return { success: false, error: 'Email body is required' };
        }
        return sendComposedEmail({
            to: params.to,
            subject: params.subject,
            bodyHtml: params.bodyHtml,
            fullName: params.fullName,
        });
    }

    if (params.channel === 'call') {
        if (!params.bodyText?.trim()) {
            return { success: false, error: 'Call script is required' };
        }
        return sendComposedCall({
            to: params.to,
            bodyText: params.bodyText,
            fullName: params.fullName,
            clientId: params.clientId,
        });
    }

    if (!params.bodyText?.trim()) {
        return { success: false, error: 'SMS message is required' };
    }
    return sendComposedSms({
        to: params.to,
        bodyText: params.bodyText,
        fullName: params.fullName,
    });
}

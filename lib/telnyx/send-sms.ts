import { sanitizeUserFacingText } from '@/lib/user-facing-text';

const DEFAULT_OUTBOUND_FROM = '+18335131923';

function digits10(input: string): string {
    const d = input.replace(/\D/g, '');
    if (d.length === 11 && d.startsWith('1')) return d.slice(1);
    return d.length === 10 ? d : '';
}

export function getOutboundSmsFrom(): string {
    return (process.env.TELNYX_SMS_OUTBOUND_FROM ?? DEFAULT_OUTBOUND_FROM).trim();
}

/** Format a 10-digit US phone or E.164-ish input as +1XXXXXXXXXX for Telnyx. */
export function toE164US(input: string): string {
    if (input.includes('+')) return input.trim();
    const digits = digits10(input);
    if (digits.length !== 10) return input.trim();
    return `+1${digits}`;
}

export type SendSmsResult =
    | { success: true; messageId: string | null }
    | { success: false; error: string };

export async function sendSms(params: { to: string; text: string; from?: string }): Promise<SendSmsResult> {
    const telnyxKey = process.env.TELNYX_API_KEY;
    if (!telnyxKey) {
        return { success: false, error: 'Messaging credentials are not configured' };
    }

    const from = params.from ?? getOutboundSmsFrom();
    const to = params.to.includes('+') ? params.to : toE164US(params.to);

    try {
        const sendRes = await fetch('https://api.telnyx.com/v2/messages', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${telnyxKey}`,
            },
            body: JSON.stringify({
                from,
                to,
                text: params.text,
                ...(process.env.TELNYX_MESSAGING_PROFILE_ID
                    ? { messaging_profile_id: process.env.TELNYX_MESSAGING_PROFILE_ID }
                    : {}),
            }),
        });

        if (!sendRes.ok) {
            const errText = await sendRes.text().catch(() => '');
            return { success: false, error: sanitizeUserFacingText(errText || `SMS send failed (${sendRes.status})`) };
        }

        const json: unknown = await sendRes.json().catch(() => null);
        const messageId = (json as { data?: { id?: string } } | null)?.data?.id ?? null;
        return { success: true, messageId };
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'SMS send failed';
        return { success: false, error: sanitizeUserFacingText(msg) };
    }
}

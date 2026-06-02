/** Unified Telnyx Line 1 (+1 833-513-1923 by default). */

const DEFAULT_MAIN_LINE = '+18335131923';

/** Production voice webhook — override with TELNYX_VOICE_WEBHOOK_URL or APP_URL. */
const DEFAULT_PRODUCTION_VOICE_WEBHOOK = '';

/** Telnyx does not follow redirects reliably on POST — normalize to https when possible. */
export function normalizeVoiceWebhookUrl(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return '';

    try {
        const withPath = trimmed.includes('/api/telnyx/voice')
            ? trimmed
            : `${trimmed.replace(/\/$/, '')}/api/telnyx/voice`;
        const u = new URL(withPath);

        if (u.protocol === 'http:') {
            u.protocol = 'https:';
        }
        if (!u.pathname.endsWith('/api/telnyx/voice')) {
            u.pathname = '/api/telnyx/voice';
        }
        u.search = '';
        u.hash = '';
        return u.toString();
    } catch {
        return trimmed;
    }
}

export function getTelnyxMainLineE164(): string {
    return (
        process.env.TELNYX_MAIN_LINE?.trim() ||
        process.env.TELNYX_SMS_OUTBOUND_FROM?.trim() ||
        process.env.TELNYX_OUTBOUND_CALL_FROM?.trim() ||
        DEFAULT_MAIN_LINE
    );
}

export function getOutboundSmsFrom(): string {
    return process.env.TELNYX_SMS_OUTBOUND_FROM?.trim() || getTelnyxMainLineE164();
}

export function getOutboundCallFrom(): string {
    return process.env.TELNYX_OUTBOUND_CALL_FROM?.trim() || getTelnyxMainLineE164();
}

export function getCallControlAppId(): string | null {
    const id = process.env.TELNYX_CALL_CONTROL_APP_ID?.trim();
    return id || null;
}

export function getVoiceWebhookUrl(): string | null {
    const explicit = process.env.TELNYX_VOICE_WEBHOOK_URL?.trim();
    if (explicit) return normalizeVoiceWebhookUrl(explicit);

    const base =
        process.env.APP_URL ||
        process.env.SITE_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        (process.env.NEXT_PUBLIC_VERCEL_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` : '');
    if (!base) return null;
    return normalizeVoiceWebhookUrl(`${base.replace(/\/$/, '')}/api/telnyx/voice`);
}

/** Webhook URL sent on every outbound dial — never rely on Telnyx portal config alone. */
export function getOutboundVoiceWebhookUrl(): string {
    const explicit = process.env.TELNYX_VOICE_WEBHOOK_URL?.trim();
    if (explicit) return normalizeVoiceWebhookUrl(explicit);

    for (const key of ['APP_URL', 'SITE_URL', 'NEXT_PUBLIC_APP_URL'] as const) {
        const v = process.env[key]?.trim();
        if (v) return normalizeVoiceWebhookUrl(`${v.replace(/\/$/, '')}/api/telnyx/voice`);
    }

    if (process.env.NEXT_PUBLIC_VERCEL_URL) {
        return normalizeVoiceWebhookUrl(`https://${process.env.NEXT_PUBLIC_VERCEL_URL}/api/telnyx/voice`);
    }

    return 'http://localhost:3000/api/telnyx/voice';
}

/** True when Retell LLM sync on AI builder save should run. Default false — set AI_BUILDER_RETELL_SYNC=true to re-enable during transition. */
export function retellSyncEnabled(): boolean {
    const flag = process.env.AI_BUILDER_RETELL_SYNC?.trim().toLowerCase();
    return flag === 'true' || flag === '1';
}

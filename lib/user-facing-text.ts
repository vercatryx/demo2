/**
 * Strip vendor / platform names from text shown in the app UI.
 */

const ENV_VAR_PATTERN = /\b(?:TELNYX|RETELL|TWILIO|SENDGRID|GMAIL|OPENAI|ANTHROPIC|SUPABASE|VERCEL)_[A-Z0-9_]+\b/g;

const REPLACEMENTS: Array<[RegExp, string]> = [
    [ENV_VAR_PATTERN, 'service configuration'],
    [/\bTelnyx\b/gi, ''],
    [/\bRetell\b/gi, 'voice'],
    [/\bTwilio\b/gi, ''],
    [/\bSendGrid\b/gi, 'email'],
    [/\bGmail\b/gi, 'backup email'],
    [/\bAnthropic\b/gi, 'Claude'],
    [/\bOpenAI\b/gi, 'GPT'],
    [/\bSupabase\b/gi, 'database'],
    [/\bVercel\b/gi, 'host'],
    [/\bAWS\.?Polly\b/gi, 'speech'],
    [/\bPolly\b/gi, 'speech'],
    [/\bAI_BUILDER_RETELL_SYNC\b/g, 'voice sync'],
];

export function sanitizeUserFacingText(text: string | null | undefined): string {
    if (!text) return '';
    let out = text;
    for (const [pattern, replacement] of REPLACEMENTS) {
        out = out.replace(pattern, replacement);
    }
    return out
        .replace(/\(\s*\)/g, '')
        .replace(/\s{2,}/g, ' ')
        .replace(/\s+([,.;:])/g, '$1')
        .trim();
}

/** Usage log / filter display — never show raw vendor ids. */
export function displayUsageProvider(provider: string | null | undefined): string {
    if (!provider?.trim()) return '—';
    const p = provider.trim().toLowerCase();
    if (p === 'telnyx') return 'messaging';
    if (p === 'anthropic' || p === 'openai') return 'ai';
    if (p === 'retell') return 'voice';
    if (p === 'gmail') return 'email';
    return sanitizeUserFacingText(provider);
}

export function displayPricingLabel(label: string | null | undefined): string {
    return sanitizeUserFacingText(label ?? '');
}

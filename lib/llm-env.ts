/**
 * LLM API keys for server routes (OpenAI / Anthropic).
 * Ignores template placeholders; prefers OpenAI when both are set.
 */

const PLACEHOLDER = /^(REQUIRED|CHANGE_ME|xxx|\[.*\])$/i;

export function isUsableLlmApiKey(value: string | undefined): value is string {
    const v = value?.trim();
    if (!v || PLACEHOLDER.test(v)) return false;
    return v.startsWith('sk-') || v.length >= 24;
}

export function getOpenAiApiKey(): string | undefined {
    const candidates = [
        process.env.OPENAI_API_KEY,
        process.env.INTERNAL_REPORTS_OPENAI_API_KEY,
    ];
    for (const c of candidates) {
        if (isUsableLlmApiKey(c)) return c.trim();
    }
    return undefined;
}

export function getAnthropicApiKey(): string | undefined {
    const candidates = [process.env.ANTHROPIC_API_KEY, process.env.INTERNAL_REPORTS_ANTHROPIC_API_KEY];
    for (const c of candidates) {
        if (isUsableLlmApiKey(c)) return c.trim();
    }
    return undefined;
}

export function resolveReportsLlm(): { provider: 'openai' | 'anthropic'; model: string } | null {
    const openaiKey = getOpenAiApiKey();
    const anthropicKey = getAnthropicApiKey();
    if (openaiKey) {
        return {
            provider: 'openai',
            model:
                process.env.OPENAI_MODEL?.trim() ||
                process.env.OPENAI_CHAT_MODEL?.trim() ||
                process.env.INTERNAL_REPORTS_OPENAI_MODEL?.trim() ||
                'gpt-5.2',
        };
    }
    if (anthropicKey) {
        return {
            provider: 'anthropic',
            model:
                process.env.ANTHROPIC_MODEL?.trim() ||
                process.env.INTERNAL_REPORTS_ANTHROPIC_MODEL?.trim() ||
                'claude-sonnet-4-6',
        };
    }
    return null;
}

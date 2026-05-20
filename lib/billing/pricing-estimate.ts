/**
 * Parenthetical USD from `usage_pricing_rates`. Rates are USD per 1M tokens (LLM),
 * per SMS segment, or per voice minute — see migration comments.
 */

export type PricingRateRow = {
    dimension: string;
    model_key: string;
    usd_per_unit: number;
};

export function pickRate(rows: PricingRateRow[], dimension: string, modelKey: string): number {
    const mk = (modelKey || '').trim();
    const exact = rows.find(r => r.dimension === dimension && (r.model_key || '').trim() === mk);
    if (exact) return Number(exact.usd_per_unit);
    const fallback = rows.find(r => r.dimension === dimension && (r.model_key || '').trim() === '');
    return fallback ? Number(fallback.usd_per_unit) : 0;
}

export function estimateLlmUsd(rows: PricingRateRow[], model: string | null, inTok: number, outTok: number): number {
    const m = model || '';
    const inR = pickRate(rows, 'llm_input', m) / 1_000_000;
    const outR = pickRate(rows, 'llm_output', m) / 1_000_000;
    return inTok * inR + outTok * outR;
}

export function estimateSmsUsd(rows: PricingRateRow[], direction: 'inbound' | 'outbound', segments: number): number {
    const dim = direction === 'inbound' ? 'sms_segment_inbound' : 'sms_segment_outbound';
    const r = pickRate(rows, dim, '');
    return segments * r;
}

export function estimateVoiceUsd(rows: PricingRateRow[], durationSeconds: number): number {
    const perMin = pickRate(rows, 'voice_minute', '');
    return (durationSeconds / 60) * perMin;
}

export function estimateEventUsd(
    rows: PricingRateRow[],
    ev: {
        kind: string;
        model?: string | null;
        input_tokens?: number | null;
        output_tokens?: number | null;
        sms_segments?: number | null;
        sms_direction?: string | null;
        duration_seconds?: number | null;
    }
): number {
    if (ev.kind === 'llm_completion') {
        return estimateLlmUsd(rows, ev.model ?? null, ev.input_tokens ?? 0, ev.output_tokens ?? 0);
    }
    if (ev.kind === 'sms_message') {
        const dir = ev.sms_direction === 'outbound' ? 'outbound' : 'inbound';
        return estimateSmsUsd(rows, dir, ev.sms_segments ?? 0);
    }
    if (ev.kind === 'voice_call') {
        return estimateVoiceUsd(rows, ev.duration_seconds ?? 0);
    }
    return 0;
}

/**
 * Pure function that renders the admin AI instructions editor into the final
 * system prompt sent to Retell and used by the SMS handler.
 *
 * The UI is a single textbox. Function definitions are not editable in the UI;
 * we always append a read-only one-line catalog reference so the model has a
 * consistent name → description map. Retell additionally receives the full
 * JSON parameter schemas via `general_tools[]`, so the in-prompt block is
 * intentionally terse.
 */
import { FUNCTIONS_CATALOG } from './functions-catalog';

export type FunctionBlock = {
    /** Catalog name. Must match an entry in FUNCTIONS_CATALOG. */
    fn: string;
    order: number;
    /** Admin-authored text for the prompt "When to call" section. */
    whenToCall?: string;
    /** Admin-authored text read aloud while the tool runs. */
    beforeSay?: string;
    /** Admin-authored text read aloud after the tool returns. */
    afterSay?: string;
    /** Freeform notes authored by the admin; appended to the function section. */
    notes?: string;
    /** Optional override of the short description sent to Retell. */
    descriptionOverride?: string;
};

export type AiConfigInput = {
    general_instructions: string;
    /**
     * Deprecated: kept for backwards compatibility with older rows.
     * The current UI does not use function_blocks.
     */
    function_blocks?: FunctionBlock[];
};

const AVAILABLE_FUNCTIONS_HEADING = /^##\s+available functions/im;

export function compileFinalPrompt(cfg: AiConfigInput): string {
    const parts: string[] = [];
    const generalRaw = (cfg.general_instructions ?? '').trim();
    const byName = new Map(FUNCTIONS_CATALOG.map(fn => [fn.name, fn]));

    // Expand inline tokens like [[look_up_client]] so Retell sees human text
    // while still preserving the exact tool name for reliable calling.
    const general = generalRaw.replace(/\[\[([a-z0-9_]+)\]\]/gi, (_m, nameRaw) => {
        const name = String(nameRaw ?? '').toLowerCase();
        const fn = byName.get(name);
        if (!fn) return `[[${nameRaw}]]`;
        return `${fn.label} (${fn.name})`;
    });
    if (general) {
        parts.push(general);
    }

    // If the admin already authored their own "Available Functions" section in
    // general_instructions, don't duplicate it. Retell still gets full JSON
    // schemas via general_tools[] either way.
    if (general && AVAILABLE_FUNCTIONS_HEADING.test(general)) {
        console.warn('[compile-prompt] general_instructions already contains an Available Functions heading; skipping auto-append.');
        return parts.join('\n\n').trim();
    }

    // Compact reference: one line per tool. Full schemas live on the Retell side.
    parts.push('## Available Functions (reference)');
    const lines = FUNCTIONS_CATALOG.filter(fn => !fn.smsOnly).map(fn => {
        const tag = fn.category === 'write' ? ' [WRITE — requires explicit caller confirmation]' : '';
        return `- ${fn.name}: ${fn.description}${tag}`;
    });
    parts.push(lines.join('\n'));

    return parts.join('\n\n').trim();
}

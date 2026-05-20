/**
 * PATCH the Retell LLM object with our compiled prompt and the full tool list.
 *
 * We rebuild `general_tools` from the catalog + enabled function blocks every
 * save, so our DB is the single source of truth. After one-time Retell
 * bootstrap (create LLM + agent + BYOC) nobody needs to touch the Retell
 * dashboard.
 *
 * Docs: https://docs.retellai.com/api-references/update-retell-llm
 */
import { FUNCTIONS_CATALOG, type CatalogEntry } from './functions-catalog';

type RetellTool =
    | {
        type: 'custom';
        name: string;
        description: string;
        url: string;
        method: 'GET' | 'POST';
        parameters: Record<string, unknown>;
        speak_during_execution?: boolean;
        speak_after_execution?: boolean;
    }
    | { type: 'end_call'; name: string; description: string };

export type SyncArgs = {
    retellLlmId: string;
    compiledPrompt: string;
    /** Public base URL used to form absolute URLs for each custom tool. */
    baseUrl: string;
};

export type SyncResult =
    | { ok: true; tools: RetellTool[] }
    | { ok: false; error: string };

function buildTool(entry: CatalogEntry, baseUrl: string): RetellTool | null {
    if (entry.builtIn) {
        if (entry.name === 'end_call') {
            return {
                type: 'end_call',
                name: entry.name,
                description: entry.description
            };
        }
        return null;
    }
    const cleanBase = baseUrl.replace(/\/$/, '');
    return {
        type: 'custom',
        name: entry.name,
        description: entry.description,
        url: `${cleanBase}${entry.urlPath}`,
        method: entry.method,
        parameters: entry.parameters as unknown as Record<string, unknown>,
        speak_during_execution: entry.speakDuringExecution ? true : false,
        speak_after_execution: entry.speakAfterExecution ?? true
    };
}

/**
 * Build the full general_tools array from the static catalog.
 * The AI Builder no longer edits which tools exist; we always push the full
 * tool list so authoring stays entirely on our side.
 */
export function buildGeneralTools(baseUrl: string): RetellTool[] {
    const out: RetellTool[] = [];
    for (const entry of FUNCTIONS_CATALOG) {
        if (entry.smsOnly) continue;
        const tool = buildTool(entry, baseUrl);
        if (tool) out.push(tool);
    }
    return out;
}

export async function syncToRetell(args: SyncArgs): Promise<SyncResult> {
    const apiKey = process.env.RETELL_API_KEY;
    if (!apiKey) return { ok: false, error: 'RETELL_API_KEY is not set' };
    if (!args.retellLlmId) return { ok: false, error: 'RETELL_LLM_ID is not set' };
    if (!args.baseUrl) return { ok: false, error: 'APP_PUBLIC_BASE_URL is not set' };

    const tools = buildGeneralTools(args.baseUrl);

    const res = await fetch(`https://api.retellai.com/update-retell-llm/${encodeURIComponent(args.retellLlmId)}`, {
        method: 'PATCH',
        headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            general_prompt: args.compiledPrompt,
            general_tools: tools
        })
    });

    if (!res.ok) {
        const body = await res.text().catch(() => '');
        return { ok: false, error: `Retell ${res.status}: ${body}` };
    }
    return { ok: true, tools };
}

/** Public re-export so the API route / admin UI can show users every catalog item. */
export { FUNCTIONS_CATALOG };

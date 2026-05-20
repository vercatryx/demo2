import { getAnthropicApiKey, getOpenAiApiKey } from '@/lib/llm-env';

/**
 * Provider-neutral chat + tool-calling wrapper for Anthropic and OpenAI.
 *
 * One call, one response — no streaming. Used by the SMS handler (voice stays
 * on Retell's built-in LLM).
 *
 * Tool calling uses each provider's native API (Anthropic `tool_use` / OpenAI
 * `tool_calls`). Callers describe tools once with `LlmTool` and we translate
 * to the provider's format. The response always returns `{ text, toolCalls }`
 * — the loop in `lib/sms/sms-agent.ts` decides what to do with it.
 */

export type LlmProvider = 'anthropic' | 'openai';

export type LlmToolCall = {
    /** Provider-issued id used to correlate with the tool result on the next turn. */
    id: string;
    name: string;
    /** Parsed JSON object the model passed as arguments. */
    input: unknown;
};

export type LlmMessage =
    | { role: 'user'; content: string }
    | { role: 'assistant'; content: string; toolCalls?: LlmToolCall[] }
    | { role: 'tool'; toolCallId: string; toolName: string; content: string };

export type LlmTool = {
    name: string;
    description: string;
    /** JSON Schema for the tool's input. Must be `type: 'object'`. */
    inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
};

export type LlmTokenUsage = {
    input_tokens: number;
    output_tokens: number;
};

export type LlmResponse = {
    /** Combined text content from the response (may be empty if the model only emitted tool calls). */
    text: string;
    /** Tool calls the model wants to run. Empty when the model returned a final text answer. */
    toolCalls: LlmToolCall[];
    /** Populated when the provider returns token usage (Anthropic / OpenAI). */
    usage?: LlmTokenUsage;
};

export type CallLlmArgs = {
    provider: LlmProvider;
    model: string;
    system: string;
    messages: LlmMessage[];
    /** Tools available to the model. Omit or pass `[]` to disable tool calling. */
    tools?: LlmTool[];
    /** Soft cap on reply length. Defaults to 1024 tokens. */
    maxTokens?: number;
    /** OpenAI only: force tool use (e.g. internal reports regression). */
    toolChoice?: 'auto' | 'required' | 'none';
};

export async function callLLM(args: CallLlmArgs): Promise<LlmResponse> {
    if (args.provider === 'anthropic') return callAnthropic(args);
    if (args.provider === 'openai') return callOpenAI(args);
    throw new Error(`Unsupported LLM provider: ${args.provider}`);
}

/* -------------------------------------------------------------------------- */
/*  Anthropic                                                                 */
/* -------------------------------------------------------------------------- */

type AnthropicContentBlock =
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: unknown }
    | { type: 'tool_result'; tool_use_id: string; content: string };

type AnthropicMessage = {
    role: 'user' | 'assistant';
    content: string | AnthropicContentBlock[];
};

function toAnthropicMessages(messages: LlmMessage[]): AnthropicMessage[] {
    // Tool results must be grouped into a single user message that follows the
    // assistant turn that emitted the corresponding tool_use blocks. We coalesce
    // adjacent `role: 'tool'` entries into one user message with multiple
    // tool_result blocks.
    const out: AnthropicMessage[] = [];
    for (const m of messages) {
        if (m.role === 'user') {
            out.push({ role: 'user', content: m.content });
        } else if (m.role === 'assistant') {
            const blocks: AnthropicContentBlock[] = [];
            if (m.content) blocks.push({ type: 'text', text: m.content });
            for (const tc of m.toolCalls ?? []) {
                blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input ?? {} });
            }
            out.push({
                role: 'assistant',
                content: blocks.length === 1 && blocks[0].type === 'text' ? blocks[0].text : blocks,
            });
        } else {
            // tool result — coalesce with previous user message if it was also a tool-result message
            const block: AnthropicContentBlock = {
                type: 'tool_result',
                tool_use_id: m.toolCallId,
                content: m.content,
            };
            const prev = out[out.length - 1];
            if (prev && prev.role === 'user' && Array.isArray(prev.content)) {
                prev.content.push(block);
            } else {
                out.push({ role: 'user', content: [block] });
            }
        }
    }
    return out;
}

function retryDelay(res: Response, attempt: number): number {
    const header = res.headers.get('retry-after');
    if (header) {
        const secs = parseFloat(header);
        if (Number.isFinite(secs) && secs > 0) return secs * 1000;
    }
    return Math.min(1000 * 2 ** attempt, 30000);
}

async function callAnthropic(args: CallLlmArgs): Promise<LlmResponse> {
    const key = getAnthropicApiKey();
    if (!key) throw new Error('ANTHROPIC_API_KEY is not set');

    const body: Record<string, unknown> = {
        model: args.model,
        max_tokens: args.maxTokens ?? 1024,
        system: args.system,
        messages: toAnthropicMessages(args.messages),
    };
    if (args.tools && args.tools.length > 0) {
        body.tools = args.tools.map(t => ({
            name: t.name,
            description: t.description,
            input_schema: t.inputSchema,
        }));
        if (args.toolChoice === 'required') {
            body.tool_choice = { type: 'any' };
        }
    }

    let res!: Response;
    for (let attempt = 0; attempt <= 3; attempt++) {
        res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': key,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify(body),
        });
        if (res.ok) break;
        if (res.status === 429 && attempt < 3) {
            await new Promise(r => setTimeout(r, retryDelay(res, attempt)));
            continue;
        }
        const errText = await res.text().catch(() => '');
        throw new Error(`Anthropic ${res.status}: ${errText}`);
    }
    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Anthropic ${res.status}: ${errText}`);
    }
    const data = (await res.json()) as {
        content?: AnthropicContentBlock[];
        usage?: { input_tokens?: number; output_tokens?: number };
    };
    const blocks = data.content ?? [];
    const text = blocks
        .filter((b): b is Extract<AnthropicContentBlock, { type: 'text' }> => b.type === 'text')
        .map(b => b.text)
        .join('')
        .trim();
    const toolCalls: LlmToolCall[] = blocks
        .filter((b): b is Extract<AnthropicContentBlock, { type: 'tool_use' }> => b.type === 'tool_use')
        .map(b => ({ id: b.id, name: b.name, input: b.input }));
    const usage =
        data.usage?.input_tokens != null && data.usage?.output_tokens != null
            ? {
                  input_tokens: data.usage.input_tokens,
                  output_tokens: data.usage.output_tokens,
              }
            : undefined;
    return { text, toolCalls, usage };
}

/* -------------------------------------------------------------------------- */
/*  OpenAI                                                                    */
/* -------------------------------------------------------------------------- */

type OpenAiToolCall = {
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
};

type OpenAiMessage =
    | { role: 'system'; content: string }
    | { role: 'user'; content: string }
    | { role: 'assistant'; content: string | null; tool_calls?: OpenAiToolCall[] }
    | { role: 'tool'; tool_call_id: string; content: string };

function toOpenAiMessages(system: string, messages: LlmMessage[]): OpenAiMessage[] {
    const out: OpenAiMessage[] = [{ role: 'system', content: system }];
    for (const m of messages) {
        if (m.role === 'user') {
            out.push({ role: 'user', content: m.content });
        } else if (m.role === 'assistant') {
            const toolCalls = m.toolCalls?.map<OpenAiToolCall>(tc => ({
                id: tc.id,
                type: 'function',
                function: { name: tc.name, arguments: JSON.stringify(tc.input ?? {}) },
            }));
            out.push({
                role: 'assistant',
                content: m.content || null,
                ...(toolCalls && toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
            });
        } else {
            out.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content });
        }
    }
    return out;
}

async function callOpenAI(args: CallLlmArgs): Promise<LlmResponse> {
    const key = getOpenAiApiKey();
    if (!key) throw new Error('OPENAI_API_KEY is not set');

    const usesCompletionTokens = /^o\d|^gpt-5/.test(args.model);
    const tokenKey = usesCompletionTokens ? 'max_completion_tokens' : 'max_tokens';
    const body: Record<string, unknown> = {
        model: args.model,
        [tokenKey]: args.maxTokens ?? 1024,
        messages: toOpenAiMessages(args.system, args.messages),
    };
    if (args.tools && args.tools.length > 0) {
        body.tools = args.tools.map(t => ({
            type: 'function',
            function: {
                name: t.name,
                description: t.description,
                parameters: t.inputSchema,
            },
        }));
        if (args.toolChoice === 'required') {
            body.tool_choice = 'required';
        }
    }

    let res!: Response;
    for (let attempt = 0; attempt <= 3; attempt++) {
        res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${key}`,
            },
            body: JSON.stringify(body),
        });
        if (res.ok) break;
        if (res.status === 429 && attempt < 3) {
            await new Promise(r => setTimeout(r, retryDelay(res, attempt)));
            continue;
        }
        const errText = await res.text().catch(() => '');
        throw new Error(`OpenAI ${res.status}: ${errText}`);
    }
    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`OpenAI ${res.status}: ${errText}`);
    }
    const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string | null; tool_calls?: OpenAiToolCall[] } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const message = data.choices?.[0]?.message ?? {};
    const text = (message.content ?? '').trim();
    const toolCalls: LlmToolCall[] = (message.tool_calls ?? []).map(tc => {
        let parsed: unknown = {};
        try {
            parsed = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
        } catch {
            // OpenAI very rarely emits malformed JSON; preserve the raw string so the
            // tool executor can decide what to do.
            parsed = { _raw_arguments: tc.function.arguments };
        }
        return { id: tc.id, name: tc.function.name, input: parsed };
    });
    const u = data.usage;
    const usage =
        u?.prompt_tokens != null && u?.completion_tokens != null
            ? { input_tokens: u.prompt_tokens, output_tokens: u.completion_tokens }
            : undefined;
    return { text, toolCalls, usage };
}

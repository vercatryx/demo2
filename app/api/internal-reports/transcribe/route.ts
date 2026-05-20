import { NextRequest, NextResponse } from 'next/server';
import { getOpenAiApiKey } from '@/lib/llm-env';
import { DATA_COPILOT_SUPPORT_MESSAGE } from '@/lib/internal-reports/user-errors';
import { authorizeInternalReportsRequest } from '@/lib/internal-reports/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MAX_BYTES = 24 * 1024 * 1024;

function transcriptionModel(): string {
    return (
        process.env.OPENAI_TRANSCRIPTION_MODEL?.trim() ||
        process.env.INTERNAL_REPORTS_TRANSCRIPTION_MODEL?.trim() ||
        'whisper-1'
    );
}

export async function POST(request: NextRequest) {
    if (!(await authorizeInternalReportsRequest(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const apiKey = getOpenAiApiKey();
    if (!apiKey) {
        console.error('[internal-reports transcribe] OPENAI_API_KEY not configured');
        return NextResponse.json({ error: DATA_COPILOT_SUPPORT_MESSAGE }, { status: 503 });
    }

    let form: FormData;
    try {
        form = await request.formData();
    } catch {
        return NextResponse.json({ error: 'Expected multipart form body' }, { status: 400 });
    }

    const file = form.get('file');
    if (!(file instanceof File)) {
        return NextResponse.json({ error: 'Missing file field (audio blob).' }, { status: 400 });
    }
    if (file.size === 0) {
        return NextResponse.json({ error: 'Empty audio file.' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
        return NextResponse.json({ error: 'Recording too large (max ~24 MB).' }, { status: 400 });
    }

    const model = transcriptionModel();
    const upstream = new FormData();
    upstream.append('model', model);
    upstream.append('file', file, file.name || 'recording.webm');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: upstream,
    });

    const raw = await res.text();
    if (!res.ok) {
        return NextResponse.json(
            { error: raw.slice(0, 800) || `OpenAI transcription failed (${res.status})` },
            { status: res.status >= 400 && res.status < 600 ? res.status : 502 }
        );
    }

    const trimmed = raw.trim();
    if (trimmed.startsWith('{')) {
        let parsed: { text?: string };
        try {
            parsed = JSON.parse(trimmed) as { text?: string };
        } catch {
            return NextResponse.json({ error: 'Invalid response from OpenAI' }, { status: 502 });
        }
        const text = (parsed.text ?? '').trim();
        return NextResponse.json({ text });
    }

    return NextResponse.json({ text: trimmed });
}

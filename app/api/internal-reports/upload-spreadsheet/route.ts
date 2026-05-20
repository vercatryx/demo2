import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { authorizeInternalReportsRequest } from '@/lib/internal-reports/auth';
import { analyzeSpreadsheetStructure, parseSpreadsheetUpload } from '@/lib/internal-reports/spreadsheet-upload';
import { formatStructureForUserChat } from '@/lib/internal-reports/spreadsheet-structure';
import { toUserFacingReportsError } from '@/lib/internal-reports/user-errors';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(request: NextRequest) {
    if (!(await authorizeInternalReportsRequest(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let form: FormData;
    try {
        form = await request.formData();
    } catch {
        return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
    }

    const file = form.get('file');
    if (!file || typeof file === 'string') {
        return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length === 0) {
        return NextResponse.json({ error: 'Empty file' }, { status: 400 });
    }
    if (buf.length > MAX_BYTES) {
        return NextResponse.json({ error: 'File too large (max 8 MB)' }, { status: 400 });
    }

    const name = 'name' in file && typeof file.name === 'string' ? file.name : 'upload.xlsx';
    const lower = name.toLowerCase();
    if (!lower.endsWith('.xlsx') && !lower.endsWith('.xls')) {
        return NextResponse.json({ error: 'Upload an Excel file (.xlsx)' }, { status: 400 });
    }

    const userHint = String(form.get('hint') ?? '').trim();

    try {
        const parsed = parseSpreadsheetUpload(buf, name);
        const structure = analyzeSpreadsheetStructure(parsed);
        return NextResponse.json({
            ok: true,
            upload: parsed,
            structure,
            structure_user_message: formatStructureForUserChat(structure, userHint || undefined),
            user_hint: userHint || undefined,
        });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/empty|no sheets|no column|no data/i.test(msg)) {
            return NextResponse.json({ ok: false, user_message: msg }, { status: 400 });
        }
        console.error('[internal-reports] upload-spreadsheet:', msg);
        return NextResponse.json(
            { ok: false, user_message: toUserFacingReportsError(msg, 'upload-spreadsheet') },
            { status: 500 }
        );
    }
}

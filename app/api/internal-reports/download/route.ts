import { NextRequest, NextResponse } from 'next/server';
import { authorizeInternalReportsRequest } from '@/lib/internal-reports/auth';
import { getExport } from '@/lib/internal-reports/export-token-cache';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    if (!(await authorizeInternalReportsRequest(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const token = url.searchParams.get('token')?.trim();
    if (!token) {
        return NextResponse.json({ error: 'token required' }, { status: 400 });
    }
    const entry = getExport(token);
    if (!entry) {
        console.warn('[internal-reports download] miss token', token.slice(0, 8), 'len', token.length);
        return NextResponse.json({ error: 'Invalid or expired download link' }, { status: 404 });
    }
    return new NextResponse(new Uint8Array(entry.buffer), {
        status: 200,
        headers: {
            'Content-Type': entry.mime,
            'Content-Disposition': `attachment; filename="${entry.filename.replace(/"/g, '')}"`,
            'Cache-Control': 'no-store',
        },
    });
}

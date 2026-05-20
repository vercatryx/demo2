import { NextRequest, NextResponse } from 'next/server';
import { authorizeInternalReportsRequest } from '@/lib/internal-reports/auth';
import {
    assertReportId,
    buildReportsWorkbook,
    createReportsSupabase,
    runAllReports,
    runReport,
} from '@/lib/internal-reports';
import { REPORT_IDS } from '@/lib/internal-reports/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
    if (!(await authorizeInternalReportsRequest(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const format = (url.searchParams.get('format') ?? 'json').toLowerCase();
    const report = url.searchParams.get('report') ?? 'all';

    try {
        const supabase = createReportsSupabase();
        const generatedAt = new Date().toISOString();

        let sheets;
        if (report === 'all') {
            sheets = await runAllReports(supabase);
        } else {
            const id = assertReportId(report);
            if (!id) {
                return NextResponse.json(
                    { error: 'Invalid report', report, allowed: ['all', ...REPORT_IDS] },
                    { status: 400 }
                );
            }
            sheets = await runReport(supabase, id);
        }

        if (format === 'xlsx') {
            const buf = buildReportsWorkbook(sheets, generatedAt);
            const fname = `demo-food-reports-${report}-${generatedAt.slice(0, 19).replace(/[:]/g, '-')}.xlsx`;
            return new NextResponse(new Uint8Array(buf), {
                status: 200,
                headers: {
                    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    'Content-Disposition': `attachment; filename="${fname}"`,
                },
            });
        }

        return NextResponse.json({
            generatedAt,
            timezoneNote: 'Date comparisons that say “NY” use America/New_York calendar dates (en-CA).',
            sheets: sheets.map((s) => ({
                name: s.name,
                title: s.title,
                methodology: s.methodology ?? null,
                rowCount: s.rows.length,
                rows: s.rows,
            })),
        });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[internal-reports GET]', msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

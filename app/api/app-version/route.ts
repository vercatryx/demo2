import { NextResponse } from 'next/server';
import { getAppBuildId } from '@/lib/app-build-id';

export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json(
        { buildId: getAppBuildId() },
        { headers: { 'Cache-Control': 'no-store, must-revalidate' } },
    );
}

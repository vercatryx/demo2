import { NextResponse } from 'next/server';

/** Demo build: inbound SMS is disabled. */
export async function POST() {
    return NextResponse.json({ error: 'SMS disabled in demo' }, { status: 410 });
}

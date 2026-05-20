import { NextResponse } from 'next/server';

/** Demo build: Retell voice webhooks are disabled. */
export async function POST() {
    return NextResponse.json({ error: 'Voice AI disabled in demo' }, { status: 410 });
}

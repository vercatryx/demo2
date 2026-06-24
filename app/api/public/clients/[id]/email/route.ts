import { NextRequest, NextResponse } from 'next/server';
import { getClient, updateClient } from '@/lib/actions';
import { authenticatePublicApi, publicApiCorsHeaders } from '@/lib/public-api-auth';

const corsHeaders = publicApiCorsHeaders('PATCH, PUT');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function OPTIONS() {
    return new NextResponse(null, { status: 200, headers: corsHeaders });
}

/**
 * PATCH /api/public/clients/:id/email
 *
 * Updates ONLY the email address of the client identified by :id.
 * No other client fields can be modified through this endpoint.
 *
 * Auth: Authorization: Bearer <PUBLIC_API_KEY>
 *
 * Body: { "email": "new@example.com" }   (use null or "" to clear)
 *
 * Response: { success: true, client: { id, fullName, email } }
 */
async function handleUpdate(request: NextRequest, id: string) {
    const auth = authenticatePublicApi(request, corsHeaders);
    if (auth.ok === false) return auth.response;

    const clientId = id?.trim();
    if (!clientId) {
        return NextResponse.json(
            { success: false, error: 'Client id is required' },
            { status: 400, headers: corsHeaders }
        );
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            { success: false, error: 'Request body must be valid JSON' },
            { status: 400, headers: corsHeaders }
        );
    }

    if (typeof body !== 'object' || body === null || !('email' in body)) {
        return NextResponse.json(
            { success: false, error: 'Body must include an "email" field' },
            { status: 400, headers: corsHeaders }
        );
    }

    const rawEmail = (body as { email: unknown }).email;

    let normalizedEmail: string | null;
    if (rawEmail === null || rawEmail === '') {
        normalizedEmail = null;
    } else if (typeof rawEmail === 'string') {
        const trimmed = rawEmail.trim();
        if (!EMAIL_REGEX.test(trimmed)) {
            return NextResponse.json(
                { success: false, error: 'email must be a valid email address, empty string, or null' },
                { status: 400, headers: corsHeaders }
            );
        }
        normalizedEmail = trimmed;
    } else {
        return NextResponse.json(
            { success: false, error: 'email must be a string or null' },
            { status: 400, headers: corsHeaders }
        );
    }

    const existing = await getClient(clientId);
    if (!existing) {
        return NextResponse.json(
            { success: false, error: 'Client not found' },
            { status: 404, headers: corsHeaders }
        );
    }

    const updated = await updateClient(clientId, { email: normalizedEmail }, { skipOrderSync: true });

    if (!updated) {
        return NextResponse.json(
            { success: false, error: 'Client not found or update returned no data' },
            { status: 404, headers: corsHeaders }
        );
    }

    return NextResponse.json(
        {
            success: true,
            client: {
                id: updated.id,
                fullName: updated.fullName,
                email: updated.email ?? null,
            },
        },
        { status: 200, headers: corsHeaders }
    );
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        return await handleUpdate(request, id);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Internal Server Error';
        console.error('Error in public update-client-email API:', error);
        return NextResponse.json(
            { success: false, error: message },
            { status: 500, headers: corsHeaders }
        );
    }
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        return await handleUpdate(request, id);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Internal Server Error';
        console.error('Error in public update-client-email API:', error);
        return NextResponse.json(
            { success: false, error: message },
            { status: 500, headers: corsHeaders }
        );
    }
}

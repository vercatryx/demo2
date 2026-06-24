import { NextRequest, NextResponse } from 'next/server';
import { getClientsUnlimited } from '@/lib/actions';
import { authenticatePublicApi, publicApiCorsHeaders } from '@/lib/public-api-auth';

const corsHeaders = publicApiCorsHeaders('GET');

export async function OPTIONS() {
    return new NextResponse(null, { status: 200, headers: corsHeaders });
}

/**
 * GET /api/public/clients
 *
 * Returns the full list of (non-archived) clients with all the information
 * we have on each of them.
 *
 * Auth: Authorization: Bearer <PUBLIC_API_KEY>
 *
 * Response: { success: true, count: number, clients: ClientProfile[] }
 */
export async function GET(request: NextRequest) {
    try {
        const auth = authenticatePublicApi(request, corsHeaders);
        if (auth.ok === false) return auth.response;

        const clients = await getClientsUnlimited();

        return NextResponse.json(
            { success: true, count: clients.length, clients },
            { status: 200, headers: corsHeaders }
        );
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Internal Server Error';
        console.error('Error in public clients API:', error);
        return NextResponse.json(
            { success: false, error: message },
            { status: 500, headers: corsHeaders }
        );
    }
}

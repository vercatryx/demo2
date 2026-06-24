import { NextRequest, NextResponse } from 'next/server';

/**
 * CORS headers for the public API. Methods are configured per-route.
 */
export function publicApiCorsHeaders(methods: string): Record<string, string> {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': `${methods}, OPTIONS`,
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
}

/**
 * Extract the API key a request is presenting, from either the
 * `Authorization: Bearer <key>` header or a `?key=<key>` query param.
 *
 * The query param exists so the widget can be loaded in an <iframe> (browsers
 * cannot attach an Authorization header to a document/iframe load).
 */
export function getProvidedApiKey(request: NextRequest): string | null {
    const authHeader = request.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7);
    }
    const queryKey = request.nextUrl.searchParams.get('key');
    if (queryKey) return queryKey;
    return null;
}

/**
 * Returns true when the request presents the correct public API key
 * (via header or query param). Use this for non-JSON contexts (e.g. pages).
 */
export function isAuthorizedPublicApiKey(request: NextRequest): boolean {
    const apiKey = process.env.PUBLIC_API_KEY;
    if (!apiKey) return false;
    return getProvidedApiKey(request) === apiKey;
}

/**
 * Authenticate a request against the public API key.
 *
 * Clients must send `Authorization: Bearer <PUBLIC_API_KEY>` or `?key=<PUBLIC_API_KEY>`.
 * Returns `{ ok: true }` on success, or `{ ok: false, response }` with the
 * appropriate error response to return directly from the route.
 */
export function authenticatePublicApi(
    request: NextRequest,
    corsHeaders: Record<string, string>
): { ok: true } | { ok: false; response: NextResponse } {
    const apiKey = process.env.PUBLIC_API_KEY;

    if (!apiKey) {
        return {
            ok: false,
            response: NextResponse.json(
                { success: false, error: 'API key not configured on server' },
                { status: 500, headers: corsHeaders }
            ),
        };
    }

    const providedKey = getProvidedApiKey(request);
    if (!providedKey) {
        return {
            ok: false,
            response: NextResponse.json(
                { success: false, error: 'Missing API key (use Authorization: Bearer <key> or ?key=<key>)' },
                { status: 401, headers: corsHeaders }
            ),
        };
    }

    if (providedKey !== apiKey) {
        return {
            ok: false,
            response: NextResponse.json(
                { success: false, error: 'Invalid API key' },
                { status: 401, headers: corsHeaders }
            ),
        };
    }

    return { ok: true };
}

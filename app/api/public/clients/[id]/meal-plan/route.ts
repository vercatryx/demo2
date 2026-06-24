import { NextRequest, NextResponse } from 'next/server';
import { getClient, getClientMealPlannerData, saveClientMealPlannerData } from '@/lib/actions';
import { authenticatePublicApi, publicApiCorsHeaders } from '@/lib/public-api-auth';

const corsHeaders = publicApiCorsHeaders('GET, PATCH, POST');

export async function OPTIONS() {
    return new NextResponse(null, { status: 200, headers: corsHeaders });
}

/**
 * GET /api/public/clients/:id/meal-plan
 *
 * Returns the client's per-day meal-planner orders (the data behind the
 * calendar widget). Auth: Authorization: Bearer <key>  OR  ?key=<key>.
 *
 * Response: { success, client: { id, fullName }, orders: MealPlannerOrderResult[] }
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const auth = authenticatePublicApi(request, corsHeaders);
        if (auth.ok === false) return auth.response;

        const { id } = await params;
        const clientId = id?.trim();
        if (!clientId) {
            return NextResponse.json(
                { success: false, error: 'Client id is required' },
                { status: 400, headers: corsHeaders }
            );
        }

        const client = await getClient(clientId);
        if (!client) {
            return NextResponse.json(
                { success: false, error: 'Client not found' },
                { status: 404, headers: corsHeaders }
            );
        }

        const orders = await getClientMealPlannerData(clientId);

        return NextResponse.json(
            {
                success: true,
                client: { id: client.id, fullName: client.fullName },
                orders,
            },
            { status: 200, headers: corsHeaders }
        );
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Internal Server Error';
        console.error('Error in public meal-plan GET:', error);
        return NextResponse.json(
            { success: false, error: message },
            { status: 500, headers: corsHeaders }
        );
    }
}

type IncomingItem = { id?: string; name: string; quantity: number; value?: number | null };

/**
 * PATCH (or POST) /api/public/clients/:id/meal-plan
 *
 * Saves the items for a single delivery date. Other dates are preserved.
 * Auth: Authorization: Bearer <key>  OR  ?key=<key>.
 *
 * Body: { "date": "YYYY-MM-DD", "items": [{ id?, name, quantity, value? }] }
 *
 * Response: { success, client: { id, fullName }, orders } (full refreshed list)
 */
async function handleSave(request: NextRequest, id: string) {
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

    if (typeof body !== 'object' || body === null) {
        return NextResponse.json(
            { success: false, error: 'Body must be a JSON object' },
            { status: 400, headers: corsHeaders }
        );
    }

    const { date, items } = body as { date?: unknown; items?: unknown };

    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
        return NextResponse.json(
            { success: false, error: 'date is required in YYYY-MM-DD format' },
            { status: 400, headers: corsHeaders }
        );
    }

    if (!Array.isArray(items)) {
        return NextResponse.json(
            { success: false, error: 'items must be an array' },
            { status: 400, headers: corsHeaders }
        );
    }

    const cleanItems: IncomingItem[] = [];
    for (const raw of items) {
        if (typeof raw !== 'object' || raw === null) {
            return NextResponse.json(
                { success: false, error: 'each item must be an object with name and quantity' },
                { status: 400, headers: corsHeaders }
            );
        }
        const it = raw as { id?: unknown; name?: unknown; quantity?: unknown; value?: unknown };
        const name = typeof it.name === 'string' ? it.name.trim() : '';
        if (!name) {
            return NextResponse.json(
                { success: false, error: 'each item requires a non-empty name' },
                { status: 400, headers: corsHeaders }
            );
        }
        const quantity = Number(it.quantity);
        if (!Number.isFinite(quantity) || quantity < 0) {
            return NextResponse.json(
                { success: false, error: 'each item quantity must be a non-negative number' },
                { status: 400, headers: corsHeaders }
            );
        }
        const value =
            it.value === null || it.value === undefined || it.value === ''
                ? null
                : Number(it.value);
        if (value !== null && !Number.isFinite(value)) {
            return NextResponse.json(
                { success: false, error: 'item value must be a number or null' },
                { status: 400, headers: corsHeaders }
            );
        }
        cleanItems.push({
            id: typeof it.id === 'string' ? it.id : undefined,
            name,
            quantity: Math.floor(quantity),
            value,
        });
    }

    const client = await getClient(clientId);
    if (!client) {
        return NextResponse.json(
            { success: false, error: 'Client not found' },
            { status: 404, headers: corsHeaders }
        );
    }

    const result = await saveClientMealPlannerData(clientId, date.trim(), cleanItems);
    if (!result.ok) {
        return NextResponse.json(
            { success: false, error: result.error || 'Failed to save meal plan' },
            { status: 500, headers: corsHeaders }
        );
    }

    const orders = await getClientMealPlannerData(clientId);

    return NextResponse.json(
        {
            success: true,
            client: { id: client.id, fullName: client.fullName },
            orders,
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
        return await handleSave(request, id);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Internal Server Error';
        console.error('Error in public meal-plan PATCH:', error);
        return NextResponse.json(
            { success: false, error: message },
            { status: 500, headers: corsHeaders }
        );
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        return await handleSave(request, id);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Internal Server Error';
        console.error('Error in public meal-plan POST:', error);
        return NextResponse.json(
            { success: false, error: message },
            { status: 500, headers: corsHeaders }
        );
    }
}

import { getClient, getClientMealPlannerData } from '@/lib/actions';
import { MealPlanCalendarWidget } from './MealPlanCalendarWidget';

export const dynamic = 'force-dynamic';

type Props = {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ key?: string }>;
};

function Centered({ title, message }: { title: string; message: string }) {
    return (
        <div
            style={{
                fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
                display: 'flex',
                minHeight: '100vh',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 24,
                background: '#f8fafc',
            }}
        >
            <div
                style={{
                    maxWidth: 420,
                    textAlign: 'center',
                    background: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 12,
                    padding: 28,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                }}
            >
                <h2 style={{ margin: '0 0 8px', fontSize: 18, color: '#0f172a' }}>{title}</h2>
                <p style={{ margin: 0, color: '#64748b', fontSize: 14, lineHeight: 1.5 }}>{message}</p>
            </div>
        </div>
    );
}

export default async function ClientCalendarEmbedPage({ params, searchParams }: Props) {
    const { id } = await params;
    const { key } = await searchParams;

    const expected = process.env.PUBLIC_API_KEY;
    if (!expected) {
        return <Centered title="Not configured" message="PUBLIC_API_KEY is not set on the server." />;
    }
    if (!key || key !== expected) {
        return (
            <Centered
                title="Unauthorized"
                message="A valid API key is required. Append ?key=<PUBLIC_API_KEY> to the embed URL."
            />
        );
    }

    const client = await getClient(id);
    if (!client) {
        return <Centered title="Client not found" message={`No client exists with id ${id}.`} />;
    }

    const orders = await getClientMealPlannerData(id);

    return (
        <MealPlanCalendarWidget
            clientId={client.id}
            fullName={client.fullName}
            apiKey={key}
            initialOrders={orders}
        />
    );
}

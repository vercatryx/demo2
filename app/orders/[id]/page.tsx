import { redirect } from 'next/navigation';

type Props = { params: Promise<{ id: string }> };

/** Deep links open the order in the list sidebar instead of a separate page. */
export default async function OrderDetailPage({ params }: Props) {
    const { id } = await params;
    redirect(`/orders?order=${encodeURIComponent(id)}`);
}

import { VendorDetail } from '@/components/vendors/VendorDetail';
import { getVendor } from '@/lib/actions';
import { getVendorSummarySinceDate, loadVendorOrdersSummary } from '@/lib/vendor-orders-summary';
import type { Metadata } from 'next';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const vendor = await getVendor(id);
  const name = vendor?.name ?? 'Vendor';
  return { title: name };
}

export default async function VendorDetailPage({ params }: Props) {
    const { id } = await params;
    const vendor = await getVendor(id);
    const since = getVendorSummarySinceDate();
    const { rows, total_dates } = await loadVendorOrdersSummary(id, since);
    return (
        <VendorDetail
            vendorId={id}
            vendor={vendor ?? undefined}
            initialOrders={[]}
            initialDateSummaries={rows}
            initialTotalDates={total_dates}
            summarySince={since}
        />
    );
}


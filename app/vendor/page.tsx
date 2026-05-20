import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getVendor } from '@/lib/actions';
import { VendorDetail } from '@/components/vendors/VendorDetail';
import { getVendorSummarySinceDate, loadVendorOrdersSummary } from '@/lib/vendor-orders-summary';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Vendor Portal',
};

export default async function VendorPage() {
    const session = await getSession();

    // Verify session is valid and user is a vendor
    if (!session || session.role !== 'vendor') {
        redirect('/login');
    }

    const vendorId = session.userId;
    const vendorData = await getVendor(vendorId);
    const since = getVendorSummarySinceDate();
    const { rows, total_dates } = await loadVendorOrdersSummary(vendorId, since);

    return (
        <VendorDetail
            vendorId={vendorId}
            isVendorView={true}
            vendor={vendorData || undefined}
            initialDateSummaries={rows}
            initialTotalDates={total_dates}
            summarySince={since}
        />
    );
}

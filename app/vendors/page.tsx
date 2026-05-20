import Link from 'next/link';
import { getVendors } from '@/lib/actions';
import type { Metadata } from 'next';
import styles from './VendorsIndex.module.css';

export const metadata: Metadata = {
  title: 'Vendor downloads',
};

export default async function VendorsPage() {
  const vendors = (await getVendors()).filter((v) => v.isActive !== false);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Vendor downloads</h1>
        <p className={styles.subtitle}>Choose a kitchen to view delivery schedules, labels, and export files.</p>
      </header>
      {vendors.length === 0 ? (
        <p className={styles.empty}>No active vendors found. Run the demo seed to populate vendors.</p>
      ) : (
        <ul className={styles.list}>
          {vendors.map((v) => (
            <li key={v.id}>
              <Link href={`/vendors/${v.id}`} className={styles.card}>
                <span className={styles.vendorName}>{v.name}</span>
                <span className={styles.meta}>
                  {v.serviceTypes?.join(', ') || 'Food'} ·{' '}
                  {v.deliveryDays?.length ? v.deliveryDays.join(', ') : 'No delivery days'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

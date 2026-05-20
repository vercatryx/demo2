import { createClient } from '@supabase/supabase-js';
import { computeVendorOrdersSummary } from '../lib/vendor-orders-summary';

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');
  const db = createClient(url, key, { auth: { persistSession: false } });
  const vendorId = process.argv[2] || 'f5126455-9a8f-4f46-afda-5c5e8089bc46';
  const since = process.argv[3] ?? new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const { rows, total_dates } = await computeVendorOrdersSummary(db, vendorId, since);
  console.log('vendor', vendorId, 'since', since, 'total_dates', total_dates, 'rows', rows.length);
  console.log(rows.slice(0, 8));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

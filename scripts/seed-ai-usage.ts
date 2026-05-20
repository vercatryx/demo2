/**
 * Populate AI Usage admin pages without full DB reset:
 *   npm run seed:ai-usage
 */
import { createClient } from '@supabase/supabase-js';
import { seedAiUsageData } from '../lib/demo-seed-ai-usage';

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Set SUPABASE_SECRET_KEY in .env.local');

  const db = createClient(url, key, { auth: { persistSession: false } });
  console.log('Seeding AI usage demo data…');
  const result = await seedAiUsageData(db);
  console.log(`  usage_events: ${result.usageEvents}`);
  console.log(`  SMS policies: ${result.policies}`);
  console.log('Done. Hard-refresh /admin/ai-usage (default range: last 7 days).');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

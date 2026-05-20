import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

export default async function PortalPreviewDietcomboPage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    redirect('/clients');
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data } = await sb
    .from('clients')
    .select('id')
    .in('service_type', ['Food', 'Meal'])
    .limit(1)
    .maybeSingle();
  if (data?.id) redirect(`/client-portal/${data.id}`);
  redirect('/clients');
}

import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

/** Staff sidebar previews: pick a demo client and open classic (triangle) portal. */
export async function redirectToPortalClassicPreview(serviceTypes: string[]) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    redirect('/clients');
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });
  for (const serviceType of serviceTypes) {
    const { data } = await sb
      .from('clients')
      .select('id')
      .eq('service_type', serviceType)
      .limit(1)
      .maybeSingle();
    if (data?.id) redirect(`/client-portal-triangle/${data.id}`);
  }
  redirect('/clients');
}

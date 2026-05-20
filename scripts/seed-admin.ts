/**
 * Ensure demo admin login exists: username `admin`, password `12345`.
 * Uses .env.local Supabase credentials.
 *
 *   npx tsx --env-file=.env.local scripts/seed-admin.ts
 */
import { createClient } from '@supabase/supabase-js';
import { hashPassword } from '../lib/password';

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SECRET) in .env.local');
    process.exit(1);
  }
  const ref = url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  if (ref === 'uqgbekvxvqntiptgvccw') {
    console.error('REFUSING: .env.local points at PRODUCTION. Switch to demo project first.');
    process.exit(1);
  }

  const db = createClient(url, key, { auth: { persistSession: false } });
  const hashed = await hashPassword('12345');

  const { data: existing } = await db.from('admins').select('id').eq('username', 'admin').maybeSingle();

  if (existing?.id) {
    const { error } = await db
      .from('admins')
      .update({ password: hashed, name: 'Demo Admin' })
      .eq('id', existing.id);
    if (error) throw error;
    console.log('Updated admin password on project', ref);
  } else {
    const { error } = await db.from('admins').insert({
      id: crypto.randomUUID(),
      username: 'admin',
      password: hashed,
      name: 'Demo Admin',
    });
    if (error) throw error;
    console.log('Created admin user on project', ref);
  }

  console.log('Login: admin / 12345');
  console.log('Also set in .env.local: ADMIN_USERNAME=admin ADMIN_PASSWORD=12345');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

# Which database is the demo app using?

The merged app in `demo-food/` talks to **one Supabase project** — whatever is in **`demo-food/.env.local`**. There is no hard-coded “demo mode” in code.

## Your projects (reference)

| Project ref | Role | Typical data |
|-------------|------|----------------|
| `uqgbekvxvqntiptgvccw` | **Production** (real Diet) | Real clients, live orders |
| `xijcvnsmmwwnpeadmsnb` | **Demo** (merge plan) | Fresh schema; may have seed data |
| `hxzkejgwjqupbaxrvzut` | PITR clone (recovery) | Snapshot — safe to delete when done |
| `vahcjnulvdkqpcfswfyd` | Bad PITR (demo seed) | Ignore / delete |

## Current wiring (check yours)

```bash
cd demo-food
rg 'NEXT_PUBLIC_SUPABASE_URL' .env.local
```

If you see **`uqgbekvxvqntiptgvccw`**, local `npm run dev` is hitting **production**.

The template `.env.local.example` points at **`xijcvnsmmwwnpeadmsnb`** (demo). That only applies after you copy/fill it into `.env.local`.

**Also check:**

- `apps/drivers-expo/.env` — run `npm run sync-env` inside `apps/drivers-expo` after changing root env
- **R2** vars in `.env.local` — if still `storage.thedietfantasy.com`, uploads go to **production** buckets even when DB is demo

## Switch to the demo database

1. In [Supabase Dashboard](https://supabase.com/dashboard) → project **`xijcvnsmmwwnpeadmsnb`** → **Settings → API**:
   - Project URL
   - `anon` or **publishable** key
   - **service_role** or **secret** key (for server actions / seed)
2. **Database → Connect** → copy **pooler** `DATABASE_URL` (for `npm run seed:demo` only).
3. Copy the demo env file and edit secrets:

```bash
cd demo-food
cp .env.demo.local .env.local
# Edit .env.local: SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY, DATABASE_URL, JWT_SECRET, ENV_ADMIN_PASSWORD, R2 (optional separate demo buckets)
```

4. Restart Next.js (`npm run dev`).
5. Sync Expo env if you use the driver app:

```bash
npm run sync-env --prefix apps/drivers-expo
```

6. Confirm:

```bash
rg 'supabase.co' .env.local
# Should show xijcvnsmmwwnpeadmsnb, NOT uqgbekvxvqntiptgvccw
```

## Switch back to production

Keep a saved copy before switching, e.g.:

```bash
cp .env.local .env.production.local   # one-time backup of prod env
```

To restore:

```bash
cp .env.production.local .env.local
# restart dev server
```

Never run `npm run seed:demo` while `.env.local` points at `uqgbek`.

## How the app picks the connection

All server/client DB access uses:

- `NEXT_PUBLIC_SUPABASE_URL`
- API key via `lib/supabase-env.ts` (`SUPABASE_SECRET_KEY` → publishable → `SUPABASE_SERVICE_ROLE_KEY` → anon)

Scripts (`seed:demo`, `merge:pitr`, etc.) read the same `.env.local`.

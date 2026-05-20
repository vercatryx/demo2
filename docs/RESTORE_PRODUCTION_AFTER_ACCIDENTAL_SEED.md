# Restore production after accidental demo seed

## What happened

`npm run seed:demo:reset` was run while `demo-food/.env.local` still pointed at the **production** Supabase project (`uqgbekvxvqntiptgvccw`). The script **truncated** core tables and inserted fake demo data (e.g. `client###@demo.local`, admin user `demo`).

The **intended** demo project for the merge is `xijcvnsmmwwnpeadmsnb` — only that project should ever be seeded.

## Stop further damage

1. Do **not** run `seed:demo` / `seed:demo:reset` again until `.env.local` targets the test project only.
2. Pause any deploys or cron jobs writing to production until restored.

## Option 1 — Supabase point-in-time recovery (best)

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → project **uqgbekvxvqntiptgvccw**.
2. **Database** → **Backups** (or **Point in time**).
3. Choose a restore time **before** the accidental seed (same day, earlier timestamp).
4. Restore to a **new** project first if offered, verify data, then switch the app URL/keys.

Requires a plan with PITR enabled. If backups are daily only, use the latest snapshot **before** the incident.

## Option 2 — Older Supabase project clone

Your env backups reference another project (`cbmjuucyvipvmgwqdqbv`). If that is a stale copy of production, you can export tables from it and import into `uqgbekvxvqntiptgvccw` (table-by-table, with care). Check row counts in the dashboard first.

## Option 3 — Repo restore scripts (partial)

If you have `backup/.env` pointing at a good source:

```bash
cd demo-food
# dry-run first
npx ts-node --compiler-options '{"module":"CommonJS","moduleResolution":"node"}' scripts/restore-incident-from-backup.ts --dry-run
```

This script is built for a **specific** incident (SMS tables + selective client fields). It is **not** a full DB restore. Use only if it matches your situation.

## After restore

1. Keep production credentials only in a **production** env file (not used by demo seed).
2. Point `demo-food/.env.local` at **xijcvnsmmwwnpeadmsnb** for local demo work (see `.env.local.example`).
3. Run seed only with `DEMO_SEED_CONFIRM=I_UNDERSTAND` and a test project ref (see `scripts/seed-demo.ts`).

## Compare MAIN vs a PITR clone

```bash
cd demo-food
npm run compare:pitr -- \
  --pitr-url https://YOUR_PITR_PROJECT.supabase.co \
  --pitr-key "$PITR_SERVICE_ROLE_KEY" \
  --since "2026-05-18T00:00:00.000Z"
```

**Good PITR clone:** row counts close to MAIN, real client names, few `@demo.local` emails.

**Wrong PITR clone:** ~1000 clients, `client###@demo.local`, ~3500 orders — that is the **accidental demo seed**, not your lost day. Pick an earlier restore time.

## Merge forward (recommended): PITR → MAIN

Keeps work you did on MAIN after the 19h restore; adds **new** clients and **updates** to existing clients/orders where PITR is newer.

```bash
cd demo-food
# 1. Dry run
npm run merge:pitr -- \
  --pitr-url https://hxzkejgwjqupbaxrvzut.supabase.co \
  --pitr-key "$PITR_SERVICE_ROLE_KEY"

# 2. Apply
npm run merge:pitr:apply -- \
  --pitr-url https://hxzkejgwjqupbaxrvzut.supabase.co \
  --pitr-key "$PITR_SERVICE_ROLE_KEY"
```

What it does:

- **clients** — insert 15 missing; **update ~114+** where PITR `updated_at` is newer (includes `upcoming_order` JSON)
- **orders** — update rows where PITR `last_updated` is newer; re-copy line items / vendor selections for those orders
- **upcoming_orders** — same pattern + child rows
- **order_history** / **billing_records** — insert rows that exist only on PITR
- **Skips** rows where MAIN is newer (your 5 post-restore clients and any edits since restore stay)

## Verify production

In SQL editor or psql on **uqgbekvxvqntiptgvccw**:

```sql
SELECT COUNT(*) FROM clients;
SELECT full_name, email FROM clients LIMIT 5;
SELECT username FROM admins;
```

Real data should **not** look like `@demo.local` or bulk parody names unless that was already true in your environment.

-- Pending scripts for mass-messaging robocalls (keyed by Telnyx call_control_id / callee).
create table if not exists public.outbound_announcement_calls (
    id uuid primary key default gen_random_uuid(),
    call_control_id text unique,
    to_e164 text not null,
    from_e164 text not null,
    script text not null,
    client_id text references public.clients (id) on delete set null,
    created_at timestamptz not null default now()
);

create index if not exists outbound_announcement_calls_to_created_idx
    on public.outbound_announcement_calls (to_e164, created_at desc);

create index if not exists outbound_announcement_calls_created_idx
    on public.outbound_announcement_calls (created_at);

alter table public.outbound_announcement_calls enable row level security;

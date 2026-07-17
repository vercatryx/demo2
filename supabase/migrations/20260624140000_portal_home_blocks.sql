-- Flexible promo / content blocks on the client portal home screen

alter table public.app_settings
    add column if not exists portal_home_blocks jsonb not null default '[]'::jsonb;

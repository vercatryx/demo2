-- Unified display order for promo cards and featured product sections on portal home

alter table public.app_settings
    add column if not exists portal_home_layout_order jsonb not null default '{"food":[],"boxes":[]}'::jsonb;

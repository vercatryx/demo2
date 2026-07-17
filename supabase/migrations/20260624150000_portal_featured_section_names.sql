-- Preset featured section names for portal home (food vs boxes)

alter table public.app_settings
    add column if not exists portal_featured_section_names jsonb not null default '{"food":[],"box":[]}'::jsonb;

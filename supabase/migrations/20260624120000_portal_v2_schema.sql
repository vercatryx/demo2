-- Client portal v2: vendor images, food menu layout, portal settings, item brand

alter table public.vendors
    add column if not exists portal_image_url text,
    add column if not exists portal_hero_image_url text;

alter table public.menu_items
    add column if not exists brand text;

alter table public.app_settings
    add column if not exists portal_v2_enabled boolean not null default false,
    add column if not exists portal_featured_items jsonb not null default '{"foodItemIds":[],"boxItemIds":[]}'::jsonb;

create table if not exists public.food_menu_layout_configs (
    id integer primary key check (id = 1),
    config jsonb not null default '{
        "orderedVendorIds": [],
        "subMenusByVendor": {},
        "itemSubMenuByItemId": {},
        "sectionHeroImages": {}
    }'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create or replace function public.set_food_menu_layout_configs_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_food_menu_layout_configs_updated_at on public.food_menu_layout_configs;
create trigger trg_food_menu_layout_configs_updated_at
before update on public.food_menu_layout_configs
for each row
execute function public.set_food_menu_layout_configs_updated_at();

alter table public.food_menu_layout_configs enable row level security;

drop policy if exists "food_menu_layout_configs_select_authenticated" on public.food_menu_layout_configs;
create policy "food_menu_layout_configs_select_authenticated"
on public.food_menu_layout_configs
for select
to authenticated
using (true);

drop policy if exists "food_menu_layout_configs_insert_authenticated" on public.food_menu_layout_configs;
create policy "food_menu_layout_configs_insert_authenticated"
on public.food_menu_layout_configs
for insert
to authenticated
with check (id = 1);

drop policy if exists "food_menu_layout_configs_update_authenticated" on public.food_menu_layout_configs;
create policy "food_menu_layout_configs_update_authenticated"
on public.food_menu_layout_configs
for update
to authenticated
using (id = 1)
with check (id = 1);

insert into public.food_menu_layout_configs (id)
values (1)
on conflict (id) do nothing;

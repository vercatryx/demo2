-- Client login maintenance-mode toggle for the client portal (defaults OFF so demo-food's
-- existing login flow keeps working until an admin explicitly enables maintenance mode).

alter table public.app_settings
    add column if not exists client_login_maintenance_mode boolean not null default false,
    add column if not exists client_login_maintenance_message text;

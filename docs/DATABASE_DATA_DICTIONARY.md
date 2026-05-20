# Database data dictionary (Demo Food)

This file is **machine-oriented documentation** for humans and AI agents: table/column definitions from **live Postgres** (`extracted_schema.sql`), merged with `supabase/migrations/demo-merge/` when needed, plus Demo Food–specific pitfalls below.

## Regenerate (recommended after schema migrations)

```bash
npm run db:docs
```

That runs `db:extract-schema` (live introspection) then rebuilds this file. One-off extract only: `npm run db:extract-schema`.

## Schemas included

| Schema | Purpose |
|--------|---------|
| **public** | Application data: clients, orders, vendors, menus, billing, forms, SMS/AI usage, etc. |
| **auth** | Supabase Auth (login identities, sessions). Do not store app PHI here. |
| **storage** | Supabase Storage metadata (file buckets/objects). |

Other Supabase schemas (`extensions`, `realtime`, `vault`, …) are platform-internal — query live `information_schema.columns` in the SQL Editor if you need them. This dump did not include separate `extensions` user tables.

## Concepts not visible as single columns

- **`clients.upcoming_order` (JSONB)** — Canonical “next week” cart for Food / Meal / Boxes / Custom. Shape is documented in `UPCOMING_ORDER_SCHEMA.md` in this repo. Do not confuse with the relational `upcoming_orders` table (scheduled rows per delivery day).
- **Billing week** — Sunday–Saturday in **America/New_York** (`lib/produce-roster-week.ts`). There is **no** `billing_week_start_sunday` RPC on Demo Food.
- **Admin → Boxes Org** — **Not** `box_types`. Uses `menu_items` (name, price, vendor, `category_id`, `usp_id`), `item_categories`, and `box_menu_layout_configs` row `id = 1` JSON `config`: `orderedCategoryIds`, `subMenusByCategory` (sub1/sub2 folder trees per category), `itemSubMenuByItemId` (menu item → folder node id). Data Copilot: `export_boxes_org_template` / `propose_boxes_org_import`.

## Common column placement (demo DB — do not guess)

| Column / concept | Table | Notes |
|------------------|-------|--------|
| `delivery_days` | **`vendors`** only (JSONB) | Join `menu_items.vendor_id` → `vendors.id`. Not on `menu_items`. |
| `minimum_meals`, `cutoff_hours` | **`vendors`** | Food vendor rules. |
| `upcoming_order` (JSONB) | **`clients`** | Cart snapshot. **No** `active_order` column. Not the same as table `upcoming_orders`. |
| `notes` | **`orders`** | Order/billing notes. **No** `billing_notes` column. |
| `dropdown_enabled` / `dropdown_options` | _none_ | Not stored on menu/breakfast tables in Demo Food. |

---

## Schema: `public`

### `public.admins`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `username` | character varying(255) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `password` | character varying(255) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `name` | character varying(255) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `public.ai_config`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | uuid NOT NULL DEFAULT gen_random_uuid() | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `general_instructions` | text NOT NULL DEFAULT ''::text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `function_blocks` | jsonb NOT NULL DEFAULT '[]'::jsonb | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `llm_provider` | text NOT NULL DEFAULT 'anthropic'::text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `llm_model` | text NOT NULL DEFAULT 'claude-haiku-4-5'::text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `retell_llm_id` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `retell_agent_id` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `compiled_prompt` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp with time zone NOT NULL DEFAULT now() | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_by` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `public.app_settings`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | character varying(36) NOT NULL DEFAULT '1'::character varying | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `weekly_cutoff_day` | character varying(50) DEFAULT 'Friday'::character varying | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `weekly_cutoff_time` | character varying(50) DEFAULT '17:00'::character varying | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `report_email` | character varying(255) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `enable_passwordless_login` | boolean DEFAULT false | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `food_box_category_id` | character varying(36) | When set, box orders cannot mix items from this category with items from other categories (choose one mode per box). |

### `public.billing_records`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `client_id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `order_id` | character varying(36) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `status` | character varying(50) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `remarks` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `navigator` | character varying(255) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `amount` | numeric(10,2) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `public.box_menu_layout_configs`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | integer NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `config` | jsonb NOT NULL DEFAULT '{"orderedCategoryIds": [], "subMenusByCategory": {}, "itemSubMenuByItemId": {}}'::jsonb | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp with time zone NOT NULL DEFAULT now() | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp with time zone NOT NULL DEFAULT now() | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `public.box_quotas`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `box_type_id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `category_id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `target_value` | numeric(10,2) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `public.box_types`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `name` | character varying(255) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `vendor_id` | character varying(36) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `is_active` | boolean DEFAULT true | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `price_each` | numeric(10,2) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `usp_id` | text | Optional USP or external catalog id; set in admin only. |

### `public.breakfast_categories`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | character varying(36) NOT NULL DEFAULT (uuid_generate_v4())::text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `name` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `set_value` | numeric(10,2) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `meal_type` | text NOT NULL DEFAULT 'Breakfast'::text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `sort_order` | integer DEFAULT 0 | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `public.breakfast_items`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | character varying(36) NOT NULL DEFAULT (uuid_generate_v4())::text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `category_id` | character varying(36) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `name` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `quota_value` | numeric(10,2) DEFAULT 1 | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `price_each` | numeric(10,2) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `is_active` | boolean DEFAULT true | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `sort_order` | integer DEFAULT 0 | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `image_url` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `usp_id` | text | Optional USP or external catalog id; set in admin only. |

### `public.city_colors`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `city` | character varying(100) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `color` | character varying(7) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `public.client_box_orders`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | character varying(36) NOT NULL DEFAULT (uuid_generate_v4())::text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `client_id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `case_id` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `box_type_id` | character varying(36) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `vendor_id` | character varying(36) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `quantity` | integer DEFAULT 1 | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `items` | jsonb DEFAULT '{}'::jsonb | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp with time zone DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp with time zone DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `item_notes` | jsonb | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `public.client_statuses`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `name` | character varying(255) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `is_system_default` | boolean DEFAULT false | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `deliveries_allowed` | boolean DEFAULT true | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `requires_units_on_change` | boolean DEFAULT false | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `public.clients`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `full_name` | character varying(255) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `first_name` | character varying(255) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `last_name` | character varying(255) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `email` | character varying(255) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `address` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `apt` | character varying(50) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `city` | character varying(100) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `state` | character varying(2) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `zip` | character varying(10) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `county` | character varying(100) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `phone_number` | character varying(255) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `secondary_phone_number` | character varying(255) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `client_id_external` | character varying(100) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `case_id_external` | character varying(100) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `medicaid` | boolean DEFAULT false | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `paused` | boolean DEFAULT false | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `complex` | boolean DEFAULT false | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `bill` | boolean DEFAULT true | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `delivery` | boolean DEFAULT true | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `dislikes` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `latitude` | double precision | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `longitude` | double precision | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `lat` | double precision | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `lng` | double precision | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `geocoded_at` | timestamp without time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `billings` | jsonb | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `visits` | jsonb | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `sign_token` | character varying(255) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `navigator_id` | character varying(36) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `end_date` | date | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `screening_took_place` | boolean DEFAULT false | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `screening_signed` | boolean DEFAULT false | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `screening_status` | character varying(50) DEFAULT 'not_started'::character varying | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `notes` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `status_id` | character varying(36) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `service_type` | character varying(50) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `approved_meals_per_week` | integer | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `parent_client_id` | character varying(36) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `dob` | date | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `cin` | character varying(50) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `authorized_amount` | numeric(10,2) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `expiration_date` | date | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `upcoming_order` | jsonb | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_by` | character varying(255) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `meal_planner_data` | jsonb | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `voucher_amount` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `assigned_driver_id` | character varying(36) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `archived_at` | timestamp with time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `unite_account` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `nutritionist_id` | character varying(36) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `produce_vendor_id` | uuid | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `produce_roster_effective_at` | timestamp with time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `voucher_amount_regular` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `voucher_amount_dependents` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `public.delivery_history`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `client_id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `vendor_id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `service_type` | character varying(50) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `delivery_date` | date NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `items_summary` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `proof_of_delivery_image` | character varying(500) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `public.driver_route_order`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `driver_id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `client_id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `position` | integer NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `public.drivers`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `day` | character varying(20) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `name` | character varying(255) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `color` | character varying(7) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `stop_ids` | jsonb | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `public.equipment`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `name` | character varying(255) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `price` | numeric(10,2) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `vendor_id` | character varying(36) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `public.filled_forms`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `form_id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `public.form_answers`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `filled_form_id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `question_id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `value` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `public.form_submissions`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `form_id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `client_id` | character varying(36) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `token` | character varying(255) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `status` | character varying(50) DEFAULT 'pending'::character varying | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `data` | jsonb | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `signature_url` | character varying(500) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `pdf_url` | character varying(500) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `comments` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `public.forms`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `title` | character varying(255) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `description` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `public.item_categories`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `name` | character varying(255) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `set_value` | numeric(10,2) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `meal_type` | text NOT NULL DEFAULT 'Lunch'::text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `sort_order` | integer DEFAULT 0 | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `public.meal_planner_custom_items`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `client_id` | character varying(36) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `calendar_date` | date NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `name` | character varying(255) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `quantity` | integer NOT NULL DEFAULT 1 | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `sort_order` | integer DEFAULT 0 | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `expiration_date` | date | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `value` | numeric(10,2) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `public.meal_planner_date_config`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `calendar_date` | date NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `client_id` | character varying(36) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `expected_total_meals` | integer | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `public.meal_planner_order_items`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `meal_planner_order_id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `meal_type` | character varying(50) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `menu_item_id` | character varying(36) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `meal_item_id` | character varying(36) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `quantity` | integer NOT NULL DEFAULT 1 | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `notes` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `custom_name` | character varying(255) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `custom_price` | numeric(10,2) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `sort_order` | integer DEFAULT 0 | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `public.meal_planner_orders`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `client_id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `status` | character varying(50) NOT NULL DEFAULT 'draft'::character varying | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `scheduled_delivery_date` | date | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `delivery_day` | character varying(50) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `total_value` | numeric(10,2) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `total_items` | integer | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `items` | jsonb | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `notes` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `processed_order_id` | character varying(36) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `processed_at` | timestamp without time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `user_modified` | boolean NOT NULL DEFAULT false | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `case_id` | character varying(255) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `public.menu_items`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `vendor_id` | character varying(36) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `name` | character varying(255) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `value` | numeric(10,2) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `price_each` | numeric(10,2) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `is_active` | boolean DEFAULT true | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `category_id` | character varying(36) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `quota_value` | numeric(10,2) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `minimum_order` | integer DEFAULT 0 | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `image_url` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `sort_order` | integer DEFAULT 0 | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `usp_id` | text | Optional USP or external catalog id; set in admin only. |

### `public.navigator_logs`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `navigator_id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `client_id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `action` | character varying(255) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `details` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `units_added` | integer NOT NULL DEFAULT 0 | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `old_status` | character varying(255) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `new_status` | character varying(255) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `public.navigators`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `name` | character varying(255) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `email` | character varying(255) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `password` | character varying(255) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `is_active` | boolean DEFAULT true | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `public.nutritionists`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `name` | character varying(255) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `email` | character varying(255) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `public.order_box_selections`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `order_id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `vendor_id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `box_type_id` | character varying(36) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `quantity` | integer NOT NULL DEFAULT 1 | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `items` | jsonb | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `public.order_history`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `client_id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `who` | character varying(255) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `summary` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `timestamp` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `change_kind` | character varying(64) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `public.order_items`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `vendor_selection_id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `menu_item_id` | character varying(36) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `quantity` | integer NOT NULL DEFAULT 1 | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `custom_name` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `custom_price` | numeric(10,2) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `meal_item_id` | character varying(36) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `notes` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `public.order_vendor_selections`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | character varying(36) NOT NULL DEFAULT (uuid_generate_v4())::text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `order_id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `vendor_id` | character varying(36) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `public.orders`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `client_id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `service_type` | character varying(50) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `case_id` | character varying(255) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `status` | character varying(50) NOT NULL DEFAULT 'pending'::character varying | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `scheduled_delivery_date` | date | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `actual_delivery_date` | timestamp with time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `delivery_day` | character varying(50) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `delivery_distribution` | jsonb | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `total_value` | numeric(10,2) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `total_items` | integer | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `notes` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `proof_of_delivery_url` | character varying(500) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `order_number` | integer | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `last_updated` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_by` | character varying(255) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `vendor_id` | character varying(36) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `bill_amount` | numeric(10,2) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `public.passwordless_codes`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `email` | character varying(255) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `code` | character varying(10) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `expires_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `attempts` | integer DEFAULT 0 | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `public.produce_vendors`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | uuid NOT NULL DEFAULT gen_random_uuid() | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `name` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `token` | text NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'::text) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `is_active` | boolean NOT NULL DEFAULT true | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp with time zone NOT NULL DEFAULT now() | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `public.questions`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `form_id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `text` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `type` | character varying(50) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `options` | jsonb | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `conditional_text_inputs` | jsonb | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `order` | integer NOT NULL DEFAULT 0 | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `public.route_runs`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `day` | character varying(20) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `snapshot` | jsonb NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `public.routes`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `name` | character varying(255) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `color` | character varying(7) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `stop_ids` | jsonb | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `public.schedules`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `client_id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `monday` | boolean DEFAULT true | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `tuesday` | boolean DEFAULT true | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `wednesday` | boolean DEFAULT true | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `thursday` | boolean DEFAULT true | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `friday` | boolean DEFAULT true | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `saturday` | boolean DEFAULT true | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `sunday` | boolean DEFAULT true | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `public.settings`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `key` | character varying(255) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `value` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `public.signatures`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `client_id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `order_id` | character varying(36) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `slot` | integer NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `strokes` | jsonb NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `signed_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `ip` | character varying(45) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `user_agent` | character varying(500) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `public.stops`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `day` | character varying(20) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `delivery_date` | date | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `client_id` | character varying(36) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `order_id` | character varying(36) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `order` | integer | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `name` | character varying(255) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `address` | character varying(500) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `apt` | character varying(50) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `city` | character varying(100) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `state` | character varying(2) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `zip` | character varying(10) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `phone` | character varying(20) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `dislikes` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `lat` | double precision | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `lng` | double precision | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `completed` | boolean DEFAULT false | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `proof_url` | character varying(500) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `assigned_driver_id` | character varying(36) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `public.upcoming_order_box_selections`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `upcoming_order_id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `vendor_id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `box_type_id` | character varying(36) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `quantity` | integer NOT NULL DEFAULT 1 | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `items` | jsonb | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `public.upcoming_order_items`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `upcoming_order_id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `vendor_selection_id` | character varying(36) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `upcoming_vendor_selection_id` | character varying(36) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `menu_item_id` | character varying(36) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `quantity` | integer NOT NULL DEFAULT 1 | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `custom_name` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `custom_price` | numeric(10,2) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `meal_item_id` | character varying(36) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `notes` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `sort_order` | integer DEFAULT 0 | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `public.upcoming_order_vendor_selections`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `upcoming_order_id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `vendor_id` | character varying(36) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `public.upcoming_orders`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `client_id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `service_type` | character varying(50) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `case_id` | character varying(255) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `status` | character varying(50) NOT NULL DEFAULT 'scheduled'::character varying | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `scheduled_delivery_date` | date | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `take_effect_date` | date | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `delivery_day` | character varying(50) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `delivery_distribution` | jsonb | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `total_value` | numeric(10,2) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `total_items` | integer | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `notes` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `order_number` | integer | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `processed_order_id` | character varying(36) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `processed_at` | timestamp without time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `last_updated` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_by` | character varying(255) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `meal_type` | text DEFAULT 'Lunch'::text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `user_modified` | boolean NOT NULL DEFAULT false | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `public.usage_events`

*Raw usage facts: LLM completions (SMS path), SMS segments, voice calls from Retell webhooks.*

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | uuid NOT NULL DEFAULT gen_random_uuid() | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `occurred_at` | timestamp with time zone NOT NULL DEFAULT now() | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `kind` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `channel` | text NOT NULL | sms = Telnyx/web pipeline; admin_sms_tester = /admin/sms-testing; voice = Retell |
| `provider` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `phone_e164` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `client_id` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `model` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `input_tokens` | integer | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `output_tokens` | integer | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `sms_segments` | integer | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `sms_direction` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `duration_seconds` | integer | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `retell_call_id` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `telnyx_message_id` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `metadata` | jsonb NOT NULL DEFAULT '{}'::jsonb | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `public.usage_pricing_rates`

*Internal rate card for parenthetical cost estimates — not invoice-grade.*

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | uuid NOT NULL DEFAULT gen_random_uuid() | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `dimension` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `model_key` | text NOT NULL DEFAULT ''::text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `usd_per_unit` | numeric(14,8) NOT NULL | LLM: USD per 1M input/output tokens; SMS: USD per segment; voice: USD per minute |
| `label` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp with time zone NOT NULL DEFAULT now() | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `public.vendors`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | character varying(36) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `name` | character varying(255) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `email` | character varying(255) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `password` | character varying(255) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `service_type` | character varying(255) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `delivery_days` | jsonb | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `delivery_frequency` | character varying(50) DEFAULT 'Once'::character varying | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `is_active` | boolean DEFAULT true | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `minimum_meals` | integer DEFAULT 0 | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `cutoff_hours` | integer DEFAULT 0 | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `is_default` | boolean DEFAULT false | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

## Schema: `auth`

### `auth.audit_log_entries`

*Auth: Audit trail for user actions.*

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `instance_id` | uuid | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `id` | uuid NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `payload` | json | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp with time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `ip_address` | character varying(64) NOT NULL DEFAULT ''::character varying | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `auth.custom_oauth_providers`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | uuid NOT NULL DEFAULT gen_random_uuid() | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `provider_type` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `identifier` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `name` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `client_id` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `client_secret` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `acceptable_client_ids` | text[] NOT NULL DEFAULT '{}'::text[] | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `scopes` | text[] NOT NULL DEFAULT '{}'::text[] | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `pkce_enabled` | boolean NOT NULL DEFAULT true | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `attribute_mapping` | jsonb NOT NULL DEFAULT '{}'::jsonb | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `authorization_params` | jsonb NOT NULL DEFAULT '{}'::jsonb | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `enabled` | boolean NOT NULL DEFAULT true | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `email_optional` | boolean NOT NULL DEFAULT false | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `issuer` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `discovery_url` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `skip_nonce_check` | boolean NOT NULL DEFAULT false | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `cached_discovery` | jsonb | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `discovery_cached_at` | timestamp with time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `authorization_url` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `token_url` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `userinfo_url` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `jwks_uri` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp with time zone NOT NULL DEFAULT now() | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp with time zone NOT NULL DEFAULT now() | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `auth.flow_state`

*Stores metadata for all OAuth/SSO login flows*

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | uuid NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `user_id` | uuid | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `auth_code` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `code_challenge_method` | code_challenge_method | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `code_challenge` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `provider_type` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `provider_access_token` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `provider_refresh_token` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp with time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp with time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `authentication_method` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `auth_code_issued_at` | timestamp with time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `invite_token` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `referrer` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `oauth_client_state_id` | uuid | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `linking_target_id` | uuid | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `email_optional` | boolean NOT NULL DEFAULT false | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `auth.identities`

*Auth: Stores identities associated to a user.*

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `provider_id` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `user_id` | uuid NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `identity_data` | jsonb NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `provider` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `last_sign_in_at` | timestamp with time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp with time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp with time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `email` | text | Auth: Email is a generated column that references the optional email property in the identity_data |
| `id` | uuid NOT NULL DEFAULT gen_random_uuid() | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `auth.instances`

*Auth: Manages users across multiple sites.*

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | uuid NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `uuid` | uuid | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `raw_base_config` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp with time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp with time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `auth.mfa_amr_claims`

*auth: stores authenticator method reference claims for multi factor authentication*

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `session_id` | uuid NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp with time zone NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp with time zone NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `authentication_method` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `id` | uuid NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `auth.mfa_challenges`

*auth: stores metadata about challenge requests made*

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | uuid NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `factor_id` | uuid NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp with time zone NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `verified_at` | timestamp with time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `ip_address` | inet NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `otp_code` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `web_authn_session_data` | jsonb | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `auth.mfa_factors`

*auth: stores metadata about factors*

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | uuid NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `user_id` | uuid NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `friendly_name` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `factor_type` | factor_type NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `status` | factor_status NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp with time zone NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp with time zone NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `secret` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `phone` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `last_challenged_at` | timestamp with time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `web_authn_credential` | jsonb | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `web_authn_aaguid` | uuid | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `last_webauthn_challenge_data` | jsonb | Stores the latest WebAuthn challenge data including attestation/assertion for customer verification |

### `auth.oauth_authorizations`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | uuid NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `authorization_id` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `client_id` | uuid NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `user_id` | uuid | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `redirect_uri` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `scope` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `state` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `resource` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `code_challenge` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `code_challenge_method` | code_challenge_method | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `response_type` | oauth_response_type NOT NULL DEFAULT 'code'::auth.oauth_response_type | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `status` | oauth_authorization_status NOT NULL DEFAULT 'pending'::auth.oauth_authorization_status | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `authorization_code` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp with time zone NOT NULL DEFAULT now() | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `expires_at` | timestamp with time zone NOT NULL DEFAULT (now() + '00:03:00'::interval) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `approved_at` | timestamp with time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `nonce` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `auth.oauth_client_states`

*Stores OAuth states for third-party provider authentication flows where Supabase acts as the OAuth client.*

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | uuid NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `provider_type` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `code_verifier` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp with time zone NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `auth.oauth_clients`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | uuid NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `client_secret_hash` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `registration_type` | oauth_registration_type NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `redirect_uris` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `grant_types` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `client_name` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `client_uri` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `logo_uri` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp with time zone NOT NULL DEFAULT now() | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp with time zone NOT NULL DEFAULT now() | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `deleted_at` | timestamp with time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `client_type` | oauth_client_type NOT NULL DEFAULT 'confidential'::auth.oauth_client_type | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `token_endpoint_auth_method` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `auth.oauth_consents`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | uuid NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `user_id` | uuid NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `client_id` | uuid NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `scopes` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `granted_at` | timestamp with time zone NOT NULL DEFAULT now() | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `revoked_at` | timestamp with time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `auth.one_time_tokens`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | uuid NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `user_id` | uuid NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `token_type` | one_time_token_type NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `token_hash` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `relates_to` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp without time zone NOT NULL DEFAULT now() | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp without time zone NOT NULL DEFAULT now() | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `auth.refresh_tokens`

*Auth: Store of tokens used to refresh JWT tokens once they expire.*

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `instance_id` | uuid | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `id` | bigint NOT NULL DEFAULT nextval('auth.refresh_tokens_id_seq'::regclass) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `token` | character varying(255) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `user_id` | character varying(255) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `revoked` | boolean | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp with time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp with time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `parent` | character varying(255) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `session_id` | uuid | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `auth.saml_providers`

*Auth: Manages SAML Identity Provider connections.*

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | uuid NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `sso_provider_id` | uuid NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `entity_id` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `metadata_xml` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `metadata_url` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `attribute_mapping` | jsonb | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp with time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp with time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `name_id_format` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `auth.saml_relay_states`

*Auth: Contains SAML Relay State information for each Service Provider initiated login.*

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | uuid NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `sso_provider_id` | uuid NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `request_id` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `for_email` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `redirect_to` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp with time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp with time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `flow_state_id` | uuid | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `auth.schema_migrations`

*Auth: Manages updates to the auth system.*

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `version` | character varying(255) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `auth.sessions`

*Auth: Stores session data associated to a user.*

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | uuid NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `user_id` | uuid NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp with time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp with time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `factor_id` | uuid | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `aal` | aal_level | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `not_after` | timestamp with time zone | Auth: Not after is a nullable column that contains a timestamp after which the session should be regarded as expired. |
| `refreshed_at` | timestamp without time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `user_agent` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `ip` | inet | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `tag` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `oauth_client_id` | uuid | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `refresh_token_hmac_key` | text | Holds a HMAC-SHA256 key used to sign refresh tokens for this session. |
| `refresh_token_counter` | bigint | Holds the ID (counter) of the last issued refresh token. |
| `scopes` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `auth.sso_domains`

*Auth: Manages SSO email address domain mapping to an SSO Identity Provider.*

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | uuid NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `sso_provider_id` | uuid NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `domain` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp with time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp with time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `auth.sso_providers`

*Auth: Manages SSO identity provider information; see saml_providers for SAML.*

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | uuid NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `resource_id` | text | Auth: Uniquely identifies a SSO provider according to a user-chosen resource ID (case insensitive), useful in infrastructure as code. |
| `created_at` | timestamp with time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp with time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `disabled` | boolean | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `auth.users`

*Auth: Stores user login data within a secure schema.*

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `instance_id` | uuid | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `id` | uuid NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `aud` | character varying(255) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `role` | character varying(255) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `email` | character varying(255) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `encrypted_password` | character varying(255) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `email_confirmed_at` | timestamp with time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `invited_at` | timestamp with time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `confirmation_token` | character varying(255) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `confirmation_sent_at` | timestamp with time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `recovery_token` | character varying(255) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `recovery_sent_at` | timestamp with time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `email_change_token_new` | character varying(255) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `email_change` | character varying(255) | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `email_change_sent_at` | timestamp with time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `last_sign_in_at` | timestamp with time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `raw_app_meta_data` | jsonb | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `raw_user_meta_data` | jsonb | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `is_super_admin` | boolean | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp with time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp with time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `phone` | text DEFAULT NULL::character varying | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `phone_confirmed_at` | timestamp with time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `phone_change` | text DEFAULT ''::character varying | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `phone_change_token` | character varying(255) DEFAULT ''::character varying | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `phone_change_sent_at` | timestamp with time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `confirmed_at` | timestamp with time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `email_change_token_current` | character varying(255) DEFAULT ''::character varying | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `email_change_confirm_status` | smallint DEFAULT 0 | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `banned_until` | timestamp with time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `reauthentication_token` | character varying(255) DEFAULT ''::character varying | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `reauthentication_sent_at` | timestamp with time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `is_sso_user` | boolean NOT NULL DEFAULT false | Auth: Set this column to true when the account comes from SSO. These accounts can have duplicate emails. |
| `deleted_at` | timestamp with time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `is_anonymous` | boolean NOT NULL DEFAULT false | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `auth.webauthn_challenges`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | uuid NOT NULL DEFAULT gen_random_uuid() | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `user_id` | uuid | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `challenge_type` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `session_data` | jsonb NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp with time zone NOT NULL DEFAULT now() | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `expires_at` | timestamp with time zone NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `auth.webauthn_credentials`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | uuid NOT NULL DEFAULT gen_random_uuid() | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `user_id` | uuid NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `credential_id` | bytea NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `public_key` | bytea NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `attestation_type` | text NOT NULL DEFAULT ''::text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `aaguid` | uuid | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `sign_count` | bigint NOT NULL DEFAULT 0 | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `transports` | jsonb NOT NULL DEFAULT '[]'::jsonb | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `backup_eligible` | boolean NOT NULL DEFAULT false | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `backed_up` | boolean NOT NULL DEFAULT false | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `friendly_name` | text NOT NULL DEFAULT ''::text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp with time zone NOT NULL DEFAULT now() | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp with time zone NOT NULL DEFAULT now() | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `last_used_at` | timestamp with time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

## Schema: `storage`

### `storage.buckets`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `name` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `owner` | uuid | Field is deprecated, use owner_id instead |
| `created_at` | timestamp with time zone DEFAULT now() | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp with time zone DEFAULT now() | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `public` | boolean DEFAULT false | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `avif_autodetection` | boolean DEFAULT false | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `file_size_limit` | bigint | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `allowed_mime_types` | text[] | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `owner_id` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `type` | buckettype NOT NULL DEFAULT 'STANDARD'::storage.buckettype | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `storage.buckets_analytics`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `name` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `type` | buckettype NOT NULL DEFAULT 'ANALYTICS'::storage.buckettype | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `format` | text NOT NULL DEFAULT 'ICEBERG'::text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp with time zone NOT NULL DEFAULT now() | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp with time zone NOT NULL DEFAULT now() | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `id` | uuid NOT NULL DEFAULT gen_random_uuid() | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `deleted_at` | timestamp with time zone | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `storage.buckets_vectors`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `type` | buckettype NOT NULL DEFAULT 'VECTOR'::storage.buckettype | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp with time zone NOT NULL DEFAULT now() | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp with time zone NOT NULL DEFAULT now() | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `storage.migrations`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | integer NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `name` | character varying(100) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `hash` | character varying(40) NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `executed_at` | timestamp without time zone DEFAULT CURRENT_TIMESTAMP | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `storage.objects`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | uuid NOT NULL DEFAULT gen_random_uuid() | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `bucket_id` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `name` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `owner` | uuid | Field is deprecated, use owner_id instead |
| `created_at` | timestamp with time zone DEFAULT now() | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp with time zone DEFAULT now() | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `last_accessed_at` | timestamp with time zone DEFAULT now() | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `metadata` | jsonb | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `path_tokens` | text[] | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `version` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `owner_id` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `user_metadata` | jsonb | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `storage.s3_multipart_uploads`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `in_progress_size` | bigint NOT NULL DEFAULT 0 | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `upload_signature` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `bucket_id` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `key` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `version` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `owner_id` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp with time zone NOT NULL DEFAULT now() | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `user_metadata` | jsonb | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `metadata` | jsonb | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `storage.s3_multipart_uploads_parts`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | uuid NOT NULL DEFAULT gen_random_uuid() | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `upload_id` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `size` | bigint NOT NULL DEFAULT 0 | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `part_number` | integer NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `bucket_id` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `key` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `etag` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `owner_id` | text | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `version` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp with time zone NOT NULL DEFAULT now() | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |

### `storage.vector_indexes`

| Column | Type / definition | Meaning (DB comment or guidance) |
|--------|---------------------|-------------------------------------|
| `id` | text NOT NULL DEFAULT gen_random_uuid() | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `name` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `bucket_id` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `data_type` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `dimension` | integer NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `distance_metric` | text NOT NULL | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `metadata_configuration` | jsonb | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `created_at` | timestamp with time zone NOT NULL DEFAULT now() | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |
| `updated_at` | timestamp with time zone NOT NULL DEFAULT now() | _No COMMENT ON COLUMN in dump/migrations — infer from name, types, and app code._ |


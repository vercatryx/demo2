--
-- Live schema extract (Demo Food) — generated 2026-05-20T14:30:27.218Z
-- Source: scripts/extract-live-schema.ts (information_schema + pg_catalog)
-- Regenerate: npm run db:extract-schema  (or npm run db:docs)
--

-- Name: admins; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.admins (
    id character varying(36) NOT NULL,
    username character varying(255) NOT NULL,
    password character varying(255) NOT NULL,
    name character varying(255),
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.admins OWNER TO postgres;


-- Name: ai_config; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.ai_config (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    general_instructions text NOT NULL DEFAULT ''::text,
    function_blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
    llm_provider text NOT NULL DEFAULT 'anthropic'::text,
    llm_model text NOT NULL DEFAULT 'claude-haiku-4-5'::text,
    retell_llm_id text,
    retell_agent_id text,
    compiled_prompt text,
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_by text
);

ALTER TABLE public.ai_config OWNER TO postgres;


-- Name: app_settings; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.app_settings (
    id character varying(36) NOT NULL DEFAULT '1'::character varying,
    weekly_cutoff_day character varying(50) DEFAULT 'Friday'::character varying,
    weekly_cutoff_time character varying(50) DEFAULT '17:00'::character varying,
    report_email character varying(255),
    enable_passwordless_login boolean DEFAULT false,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    food_box_category_id character varying(36)
);

ALTER TABLE public.app_settings OWNER TO postgres;

COMMENT ON COLUMN public.app_settings.food_box_category_id IS 'When set, box orders cannot mix items from this category with items from other categories (choose one mode per box).';

-- Name: billing_records; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.billing_records (
    id character varying(36) NOT NULL,
    client_id character varying(36) NOT NULL,
    order_id character varying(36),
    status character varying(50) NOT NULL,
    remarks text,
    navigator character varying(255),
    amount numeric(10,2) NOT NULL,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.billing_records OWNER TO postgres;


-- Name: box_menu_layout_configs; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.box_menu_layout_configs (
    id integer NOT NULL,
    config jsonb NOT NULL DEFAULT '{"orderedCategoryIds": [], "subMenusByCategory": {}, "itemSubMenuByItemId": {}}'::jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.box_menu_layout_configs OWNER TO postgres;


-- Name: box_quotas; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.box_quotas (
    id character varying(36) NOT NULL,
    box_type_id character varying(36) NOT NULL,
    category_id character varying(36) NOT NULL,
    target_value numeric(10,2) NOT NULL,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.box_quotas OWNER TO postgres;


-- Name: box_types; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.box_types (
    id character varying(36) NOT NULL,
    name character varying(255) NOT NULL,
    vendor_id character varying(36),
    is_active boolean DEFAULT true,
    price_each numeric(10,2),
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    usp_id text
);

ALTER TABLE public.box_types OWNER TO postgres;

COMMENT ON COLUMN public.box_types.usp_id IS 'Optional USP or external catalog id; set in admin only.';

-- Name: breakfast_categories; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.breakfast_categories (
    id character varying(36) NOT NULL DEFAULT (uuid_generate_v4())::text,
    name text NOT NULL,
    set_value numeric(10,2),
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    meal_type text NOT NULL DEFAULT 'Breakfast'::text,
    sort_order integer DEFAULT 0
);

ALTER TABLE public.breakfast_categories OWNER TO postgres;


-- Name: breakfast_items; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.breakfast_items (
    id character varying(36) NOT NULL DEFAULT (uuid_generate_v4())::text,
    category_id character varying(36),
    name text NOT NULL,
    quota_value numeric(10,2) DEFAULT 1,
    price_each numeric(10,2),
    is_active boolean DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    sort_order integer DEFAULT 0,
    image_url text,
    usp_id text
);

ALTER TABLE public.breakfast_items OWNER TO postgres;

COMMENT ON COLUMN public.breakfast_items.usp_id IS 'Optional USP or external catalog id; set in admin only.';

-- Name: city_colors; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.city_colors (
    id character varying(36) NOT NULL,
    city character varying(100) NOT NULL,
    color character varying(7) NOT NULL,
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.city_colors OWNER TO postgres;


-- Name: client_box_orders; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.client_box_orders (
    id character varying(36) NOT NULL DEFAULT (uuid_generate_v4())::text,
    client_id character varying(36) NOT NULL,
    case_id text,
    box_type_id character varying(36),
    vendor_id character varying(36),
    quantity integer DEFAULT 1,
    items jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    item_notes jsonb
);

ALTER TABLE public.client_box_orders OWNER TO postgres;


-- Name: client_statuses; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.client_statuses (
    id character varying(36) NOT NULL,
    name character varying(255) NOT NULL,
    is_system_default boolean DEFAULT false,
    deliveries_allowed boolean DEFAULT true,
    requires_units_on_change boolean DEFAULT false,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.client_statuses OWNER TO postgres;


-- Name: clients; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.clients (
    id character varying(36) NOT NULL,
    full_name character varying(255) NOT NULL,
    first_name character varying(255),
    last_name character varying(255),
    email character varying(255),
    address text,
    apt character varying(50),
    city character varying(100),
    state character varying(2),
    zip character varying(10),
    county character varying(100),
    phone_number character varying(255),
    secondary_phone_number character varying(255),
    client_id_external character varying(100),
    case_id_external character varying(100),
    medicaid boolean DEFAULT false,
    paused boolean DEFAULT false,
    complex boolean DEFAULT false,
    bill boolean DEFAULT true,
    delivery boolean DEFAULT true,
    dislikes text,
    latitude double precision,
    longitude double precision,
    lat double precision,
    lng double precision,
    geocoded_at timestamp without time zone,
    billings jsonb,
    visits jsonb,
    sign_token character varying(255),
    navigator_id character varying(36),
    end_date date,
    screening_took_place boolean DEFAULT false,
    screening_signed boolean DEFAULT false,
    screening_status character varying(50) DEFAULT 'not_started'::character varying,
    notes text,
    status_id character varying(36),
    service_type character varying(50) NOT NULL,
    approved_meals_per_week integer,
    parent_client_id character varying(36),
    dob date,
    cin character varying(50),
    authorized_amount numeric(10,2),
    expiration_date date,
    upcoming_order jsonb,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by character varying(255),
    meal_planner_data jsonb,
    voucher_amount text,
    assigned_driver_id character varying(36),
    archived_at timestamp with time zone,
    unite_account text,
    nutritionist_id character varying(36),
    produce_vendor_id uuid,
    produce_roster_effective_at timestamp with time zone,
    voucher_amount_regular text,
    voucher_amount_dependents text
);

ALTER TABLE public.clients OWNER TO postgres;


-- Name: delivery_history; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.delivery_history (
    id character varying(36) NOT NULL,
    client_id character varying(36) NOT NULL,
    vendor_id character varying(36) NOT NULL,
    service_type character varying(50) NOT NULL,
    delivery_date date NOT NULL,
    items_summary text,
    proof_of_delivery_image character varying(500),
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.delivery_history OWNER TO postgres;


-- Name: driver_route_order; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.driver_route_order (
    driver_id character varying(36) NOT NULL,
    client_id character varying(36) NOT NULL,
    position integer NOT NULL
);

ALTER TABLE public.driver_route_order OWNER TO postgres;


-- Name: drivers; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.drivers (
    id character varying(36) NOT NULL,
    day character varying(20) NOT NULL,
    name character varying(255) NOT NULL,
    color character varying(7),
    stop_ids jsonb,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.drivers OWNER TO postgres;


-- Name: equipment; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.equipment (
    id character varying(36) NOT NULL,
    name character varying(255) NOT NULL,
    price numeric(10,2) NOT NULL,
    vendor_id character varying(36),
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.equipment OWNER TO postgres;


-- Name: filled_forms; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.filled_forms (
    id character varying(36) NOT NULL,
    form_id character varying(36) NOT NULL,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.filled_forms OWNER TO postgres;


-- Name: form_answers; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.form_answers (
    id character varying(36) NOT NULL,
    filled_form_id character varying(36) NOT NULL,
    question_id character varying(36) NOT NULL,
    value text NOT NULL,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.form_answers OWNER TO postgres;


-- Name: form_submissions; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.form_submissions (
    id character varying(36) NOT NULL,
    form_id character varying(36) NOT NULL,
    client_id character varying(36),
    token character varying(255) NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying,
    data jsonb,
    signature_url character varying(500),
    pdf_url character varying(500),
    comments text,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.form_submissions OWNER TO postgres;


-- Name: forms; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.forms (
    id character varying(36) NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.forms OWNER TO postgres;


-- Name: item_categories; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.item_categories (
    id character varying(36) NOT NULL,
    name character varying(255) NOT NULL,
    set_value numeric(10,2),
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    meal_type text NOT NULL DEFAULT 'Lunch'::text,
    sort_order integer DEFAULT 0
);

ALTER TABLE public.item_categories OWNER TO postgres;


-- Name: meal_planner_custom_items; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.meal_planner_custom_items (
    id character varying(36) NOT NULL,
    client_id character varying(36),
    calendar_date date NOT NULL,
    name character varying(255) NOT NULL,
    quantity integer NOT NULL DEFAULT 1,
    sort_order integer DEFAULT 0,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expiration_date date,
    value numeric(10,2)
);

ALTER TABLE public.meal_planner_custom_items OWNER TO postgres;


-- Name: meal_planner_date_config; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.meal_planner_date_config (
    id character varying(36) NOT NULL,
    calendar_date date NOT NULL,
    client_id character varying(36),
    expected_total_meals integer
);

ALTER TABLE public.meal_planner_date_config OWNER TO postgres;


-- Name: meal_planner_order_items; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.meal_planner_order_items (
    id character varying(36) NOT NULL,
    meal_planner_order_id character varying(36) NOT NULL,
    meal_type character varying(50) NOT NULL,
    menu_item_id character varying(36),
    meal_item_id character varying(36),
    quantity integer NOT NULL DEFAULT 1,
    notes text,
    custom_name character varying(255),
    custom_price numeric(10,2),
    sort_order integer DEFAULT 0,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.meal_planner_order_items OWNER TO postgres;


-- Name: meal_planner_orders; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.meal_planner_orders (
    id character varying(36) NOT NULL,
    client_id character varying(36) NOT NULL,
    status character varying(50) NOT NULL DEFAULT 'draft'::character varying,
    scheduled_delivery_date date,
    delivery_day character varying(50),
    total_value numeric(10,2),
    total_items integer,
    items jsonb,
    notes text,
    processed_order_id character varying(36),
    processed_at timestamp without time zone,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    user_modified boolean NOT NULL DEFAULT false,
    case_id character varying(255)
);

ALTER TABLE public.meal_planner_orders OWNER TO postgres;


-- Name: menu_items; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.menu_items (
    id character varying(36) NOT NULL,
    vendor_id character varying(36),
    name character varying(255) NOT NULL,
    value numeric(10,2) NOT NULL,
    price_each numeric(10,2),
    is_active boolean DEFAULT true,
    category_id character varying(36),
    quota_value numeric(10,2),
    minimum_order integer DEFAULT 0,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    image_url text,
    sort_order integer DEFAULT 0,
    usp_id text
);

ALTER TABLE public.menu_items OWNER TO postgres;

COMMENT ON COLUMN public.menu_items.usp_id IS 'Optional USP or external catalog id; set in admin only.';

-- Name: navigator_logs; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.navigator_logs (
    id character varying(36) NOT NULL,
    navigator_id character varying(36) NOT NULL,
    client_id character varying(36) NOT NULL,
    action character varying(255) NOT NULL,
    details text,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    units_added integer NOT NULL DEFAULT 0,
    old_status character varying(255),
    new_status character varying(255)
);

ALTER TABLE public.navigator_logs OWNER TO postgres;


-- Name: navigators; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.navigators (
    id character varying(36) NOT NULL,
    name character varying(255) NOT NULL,
    email character varying(255),
    password character varying(255),
    is_active boolean DEFAULT true,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.navigators OWNER TO postgres;


-- Name: nutritionists; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.nutritionists (
    id character varying(36) NOT NULL,
    name character varying(255) NOT NULL,
    email character varying(255),
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.nutritionists OWNER TO postgres;


-- Name: order_box_selections; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.order_box_selections (
    id character varying(36) NOT NULL,
    order_id character varying(36) NOT NULL,
    vendor_id character varying(36) NOT NULL,
    box_type_id character varying(36),
    quantity integer NOT NULL DEFAULT 1,
    items jsonb,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.order_box_selections OWNER TO postgres;


-- Name: order_history; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.order_history (
    id character varying(36) NOT NULL,
    client_id character varying(36) NOT NULL,
    who character varying(255) NOT NULL,
    summary text NOT NULL,
    timestamp timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    change_kind character varying(64)
);

ALTER TABLE public.order_history OWNER TO postgres;


-- Name: order_items; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.order_items (
    id character varying(36) NOT NULL,
    vendor_selection_id character varying(36) NOT NULL,
    menu_item_id character varying(36),
    quantity integer NOT NULL DEFAULT 1,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    custom_name text,
    custom_price numeric(10,2),
    meal_item_id character varying(36),
    notes text
);

ALTER TABLE public.order_items OWNER TO postgres;


-- Name: order_vendor_selections; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.order_vendor_selections (
    id character varying(36) NOT NULL DEFAULT (uuid_generate_v4())::text,
    order_id character varying(36) NOT NULL,
    vendor_id character varying(36),
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.order_vendor_selections OWNER TO postgres;


-- Name: orders; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.orders (
    id character varying(36) NOT NULL,
    client_id character varying(36) NOT NULL,
    service_type character varying(50) NOT NULL,
    case_id character varying(255),
    status character varying(50) NOT NULL DEFAULT 'pending'::character varying,
    scheduled_delivery_date date,
    actual_delivery_date timestamp with time zone,
    delivery_day character varying(50),
    delivery_distribution jsonb,
    total_value numeric(10,2),
    total_items integer,
    notes text,
    proof_of_delivery_url character varying(500),
    order_number integer,
    last_updated timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by character varying(255),
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    vendor_id character varying(36)
);

ALTER TABLE public.orders OWNER TO postgres;


-- Name: passwordless_codes; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.passwordless_codes (
    id character varying(36) NOT NULL,
    email character varying(255) NOT NULL,
    code character varying(10) NOT NULL,
    expires_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    attempts integer DEFAULT 0
);

ALTER TABLE public.passwordless_codes OWNER TO postgres;


-- Name: produce_vendors; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.produce_vendors (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    token text NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'::text),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.produce_vendors OWNER TO postgres;


-- Name: questions; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.questions (
    id character varying(36) NOT NULL,
    form_id character varying(36) NOT NULL,
    text text NOT NULL,
    type character varying(50) NOT NULL,
    options jsonb,
    conditional_text_inputs jsonb,
    order integer NOT NULL DEFAULT 0,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.questions OWNER TO postgres;


-- Name: route_runs; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.route_runs (
    id character varying(36) NOT NULL,
    day character varying(20) NOT NULL,
    snapshot jsonb NOT NULL,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.route_runs OWNER TO postgres;


-- Name: routes; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.routes (
    id character varying(36) NOT NULL,
    name character varying(255) NOT NULL,
    color character varying(7),
    stop_ids jsonb,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.routes OWNER TO postgres;


-- Name: schedules; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.schedules (
    id character varying(36) NOT NULL,
    client_id character varying(36) NOT NULL,
    monday boolean DEFAULT true,
    tuesday boolean DEFAULT true,
    wednesday boolean DEFAULT true,
    thursday boolean DEFAULT true,
    friday boolean DEFAULT true,
    saturday boolean DEFAULT true,
    sunday boolean DEFAULT true,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.schedules OWNER TO postgres;


-- Name: settings; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.settings (
    id character varying(36) NOT NULL,
    key character varying(255) NOT NULL,
    value text NOT NULL,
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.settings OWNER TO postgres;


-- Name: signatures; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.signatures (
    id character varying(36) NOT NULL,
    client_id character varying(36) NOT NULL,
    order_id character varying(36),
    slot integer NOT NULL,
    strokes jsonb NOT NULL,
    signed_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ip character varying(45),
    user_agent character varying(500),
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.signatures OWNER TO postgres;


-- Name: stops; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.stops (
    id character varying(36) NOT NULL,
    day character varying(20) NOT NULL,
    delivery_date date,
    client_id character varying(36),
    order_id character varying(36),
    order integer,
    name character varying(255) NOT NULL,
    address character varying(500) NOT NULL,
    apt character varying(50),
    city character varying(100) NOT NULL,
    state character varying(2) NOT NULL,
    zip character varying(10) NOT NULL,
    phone character varying(20),
    dislikes text,
    lat double precision,
    lng double precision,
    completed boolean DEFAULT false,
    proof_url character varying(500),
    assigned_driver_id character varying(36),
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.stops OWNER TO postgres;


-- Name: upcoming_order_box_selections; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.upcoming_order_box_selections (
    id character varying(36) NOT NULL,
    upcoming_order_id character varying(36) NOT NULL,
    vendor_id character varying(36) NOT NULL,
    box_type_id character varying(36),
    quantity integer NOT NULL DEFAULT 1,
    items jsonb,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.upcoming_order_box_selections OWNER TO postgres;


-- Name: upcoming_order_items; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.upcoming_order_items (
    id character varying(36) NOT NULL,
    upcoming_order_id character varying(36) NOT NULL,
    vendor_selection_id character varying(36),
    upcoming_vendor_selection_id character varying(36),
    menu_item_id character varying(36),
    quantity integer NOT NULL DEFAULT 1,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    custom_name text,
    custom_price numeric(10,2),
    meal_item_id character varying(36),
    notes text,
    sort_order integer DEFAULT 0
);

ALTER TABLE public.upcoming_order_items OWNER TO postgres;


-- Name: upcoming_order_vendor_selections; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.upcoming_order_vendor_selections (
    id character varying(36) NOT NULL,
    upcoming_order_id character varying(36) NOT NULL,
    vendor_id character varying(36),
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.upcoming_order_vendor_selections OWNER TO postgres;


-- Name: upcoming_orders; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.upcoming_orders (
    id character varying(36) NOT NULL,
    client_id character varying(36) NOT NULL,
    service_type character varying(50) NOT NULL,
    case_id character varying(255),
    status character varying(50) NOT NULL DEFAULT 'scheduled'::character varying,
    scheduled_delivery_date date,
    take_effect_date date,
    delivery_day character varying(50),
    delivery_distribution jsonb,
    total_value numeric(10,2),
    total_items integer,
    notes text,
    order_number integer,
    processed_order_id character varying(36),
    processed_at timestamp without time zone,
    last_updated timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by character varying(255),
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    meal_type text DEFAULT 'Lunch'::text,
    user_modified boolean NOT NULL DEFAULT false
);

ALTER TABLE public.upcoming_orders OWNER TO postgres;


-- Name: usage_events; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.usage_events (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    occurred_at timestamp with time zone NOT NULL DEFAULT now(),
    kind text NOT NULL,
    channel text NOT NULL,
    provider text,
    phone_e164 text,
    client_id text,
    model text,
    input_tokens integer,
    output_tokens integer,
    sms_segments integer,
    sms_direction text,
    duration_seconds integer,
    retell_call_id text,
    telnyx_message_id text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.usage_events OWNER TO postgres;

COMMENT ON TABLE public.usage_events IS 'Raw usage facts: LLM completions (SMS path), SMS segments, voice calls from Retell webhooks.';

COMMENT ON COLUMN public.usage_events.channel IS 'sms = Telnyx/web pipeline; admin_sms_tester = /admin/sms-testing; voice = Retell';

-- Name: usage_pricing_rates; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.usage_pricing_rates (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    dimension text NOT NULL,
    model_key text NOT NULL DEFAULT ''::text,
    usd_per_unit numeric(14,8) NOT NULL,
    label text,
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.usage_pricing_rates OWNER TO postgres;

COMMENT ON TABLE public.usage_pricing_rates IS 'Internal rate card for parenthetical cost estimates — not invoice-grade.';

COMMENT ON COLUMN public.usage_pricing_rates.usd_per_unit IS 'LLM: USD per 1M input/output tokens; SMS: USD per segment; voice: USD per minute';

-- Name: vendors; Type: TABLE; Schema: public; Owner: postgres

CREATE TABLE public.vendors (
    id character varying(36) NOT NULL,
    name character varying(255) NOT NULL,
    email character varying(255),
    password character varying(255),
    service_type character varying(255),
    delivery_days jsonb,
    delivery_frequency character varying(50) DEFAULT 'Once'::character varying,
    is_active boolean DEFAULT true,
    minimum_meals integer DEFAULT 0,
    cutoff_hours integer DEFAULT 0,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_default boolean DEFAULT false
);

ALTER TABLE public.vendors OWNER TO postgres;


-- Name: audit_log_entries; Type: TABLE; Schema: auth; Owner: postgres

CREATE TABLE auth.audit_log_entries (
    instance_id uuid,
    id uuid NOT NULL,
    payload json,
    created_at timestamp with time zone,
    ip_address character varying(64) NOT NULL DEFAULT ''::character varying
);

ALTER TABLE auth.audit_log_entries OWNER TO postgres;

COMMENT ON TABLE auth.audit_log_entries IS 'Auth: Audit trail for user actions.';


-- Name: custom_oauth_providers; Type: TABLE; Schema: auth; Owner: postgres

CREATE TABLE auth.custom_oauth_providers (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    provider_type text NOT NULL,
    identifier text NOT NULL,
    name text NOT NULL,
    client_id text NOT NULL,
    client_secret text NOT NULL,
    acceptable_client_ids text[] NOT NULL DEFAULT '{}'::text[],
    scopes text[] NOT NULL DEFAULT '{}'::text[],
    pkce_enabled boolean NOT NULL DEFAULT true,
    attribute_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
    authorization_params jsonb NOT NULL DEFAULT '{}'::jsonb,
    enabled boolean NOT NULL DEFAULT true,
    email_optional boolean NOT NULL DEFAULT false,
    issuer text,
    discovery_url text,
    skip_nonce_check boolean NOT NULL DEFAULT false,
    cached_discovery jsonb,
    discovery_cached_at timestamp with time zone,
    authorization_url text,
    token_url text,
    userinfo_url text,
    jwks_uri text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE auth.custom_oauth_providers OWNER TO postgres;


-- Name: flow_state; Type: TABLE; Schema: auth; Owner: postgres

CREATE TABLE auth.flow_state (
    id uuid NOT NULL,
    user_id uuid,
    auth_code text,
    code_challenge_method code_challenge_method,
    code_challenge text,
    provider_type text NOT NULL,
    provider_access_token text,
    provider_refresh_token text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    authentication_method text NOT NULL,
    auth_code_issued_at timestamp with time zone,
    invite_token text,
    referrer text,
    oauth_client_state_id uuid,
    linking_target_id uuid,
    email_optional boolean NOT NULL DEFAULT false
);

ALTER TABLE auth.flow_state OWNER TO postgres;

COMMENT ON TABLE auth.flow_state IS 'Stores metadata for all OAuth/SSO login flows';


-- Name: identities; Type: TABLE; Schema: auth; Owner: postgres

CREATE TABLE auth.identities (
    provider_id text NOT NULL,
    user_id uuid NOT NULL,
    identity_data jsonb NOT NULL,
    provider text NOT NULL,
    last_sign_in_at timestamp with time zone,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    email text,
    id uuid NOT NULL DEFAULT gen_random_uuid()
);

ALTER TABLE auth.identities OWNER TO postgres;

COMMENT ON TABLE auth.identities IS 'Auth: Stores identities associated to a user.';

COMMENT ON COLUMN auth.identities.email IS 'Auth: Email is a generated column that references the optional email property in the identity_data';

-- Name: instances; Type: TABLE; Schema: auth; Owner: postgres

CREATE TABLE auth.instances (
    id uuid NOT NULL,
    uuid uuid,
    raw_base_config text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);

ALTER TABLE auth.instances OWNER TO postgres;

COMMENT ON TABLE auth.instances IS 'Auth: Manages users across multiple sites.';


-- Name: mfa_amr_claims; Type: TABLE; Schema: auth; Owner: postgres

CREATE TABLE auth.mfa_amr_claims (
    session_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    authentication_method text NOT NULL,
    id uuid NOT NULL
);

ALTER TABLE auth.mfa_amr_claims OWNER TO postgres;

COMMENT ON TABLE auth.mfa_amr_claims IS 'auth: stores authenticator method reference claims for multi factor authentication';


-- Name: mfa_challenges; Type: TABLE; Schema: auth; Owner: postgres

CREATE TABLE auth.mfa_challenges (
    id uuid NOT NULL,
    factor_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    verified_at timestamp with time zone,
    ip_address inet NOT NULL,
    otp_code text,
    web_authn_session_data jsonb
);

ALTER TABLE auth.mfa_challenges OWNER TO postgres;

COMMENT ON TABLE auth.mfa_challenges IS 'auth: stores metadata about challenge requests made';


-- Name: mfa_factors; Type: TABLE; Schema: auth; Owner: postgres

CREATE TABLE auth.mfa_factors (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    friendly_name text,
    factor_type factor_type NOT NULL,
    status factor_status NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    secret text,
    phone text,
    last_challenged_at timestamp with time zone,
    web_authn_credential jsonb,
    web_authn_aaguid uuid,
    last_webauthn_challenge_data jsonb
);

ALTER TABLE auth.mfa_factors OWNER TO postgres;

COMMENT ON TABLE auth.mfa_factors IS 'auth: stores metadata about factors';

COMMENT ON COLUMN auth.mfa_factors.last_webauthn_challenge_data IS 'Stores the latest WebAuthn challenge data including attestation/assertion for customer verification';

-- Name: oauth_authorizations; Type: TABLE; Schema: auth; Owner: postgres

CREATE TABLE auth.oauth_authorizations (
    id uuid NOT NULL,
    authorization_id text NOT NULL,
    client_id uuid NOT NULL,
    user_id uuid,
    redirect_uri text NOT NULL,
    scope text NOT NULL,
    state text,
    resource text,
    code_challenge text,
    code_challenge_method code_challenge_method,
    response_type oauth_response_type NOT NULL DEFAULT 'code'::auth.oauth_response_type,
    status oauth_authorization_status NOT NULL DEFAULT 'pending'::auth.oauth_authorization_status,
    authorization_code text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    expires_at timestamp with time zone NOT NULL DEFAULT (now() + '00:03:00'::interval),
    approved_at timestamp with time zone,
    nonce text
);

ALTER TABLE auth.oauth_authorizations OWNER TO postgres;


-- Name: oauth_client_states; Type: TABLE; Schema: auth; Owner: postgres

CREATE TABLE auth.oauth_client_states (
    id uuid NOT NULL,
    provider_type text NOT NULL,
    code_verifier text,
    created_at timestamp with time zone NOT NULL
);

ALTER TABLE auth.oauth_client_states OWNER TO postgres;

COMMENT ON TABLE auth.oauth_client_states IS 'Stores OAuth states for third-party provider authentication flows where Supabase acts as the OAuth client.';


-- Name: oauth_clients; Type: TABLE; Schema: auth; Owner: postgres

CREATE TABLE auth.oauth_clients (
    id uuid NOT NULL,
    client_secret_hash text,
    registration_type oauth_registration_type NOT NULL,
    redirect_uris text NOT NULL,
    grant_types text NOT NULL,
    client_name text,
    client_uri text,
    logo_uri text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    deleted_at timestamp with time zone,
    client_type oauth_client_type NOT NULL DEFAULT 'confidential'::auth.oauth_client_type,
    token_endpoint_auth_method text NOT NULL
);

ALTER TABLE auth.oauth_clients OWNER TO postgres;


-- Name: oauth_consents; Type: TABLE; Schema: auth; Owner: postgres

CREATE TABLE auth.oauth_consents (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    client_id uuid NOT NULL,
    scopes text NOT NULL,
    granted_at timestamp with time zone NOT NULL DEFAULT now(),
    revoked_at timestamp with time zone
);

ALTER TABLE auth.oauth_consents OWNER TO postgres;


-- Name: one_time_tokens; Type: TABLE; Schema: auth; Owner: postgres

CREATE TABLE auth.one_time_tokens (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    token_type one_time_token_type NOT NULL,
    token_hash text NOT NULL,
    relates_to text NOT NULL,
    created_at timestamp without time zone NOT NULL DEFAULT now(),
    updated_at timestamp without time zone NOT NULL DEFAULT now()
);

ALTER TABLE auth.one_time_tokens OWNER TO postgres;


-- Name: refresh_tokens; Type: TABLE; Schema: auth; Owner: postgres

CREATE TABLE auth.refresh_tokens (
    instance_id uuid,
    id bigint NOT NULL DEFAULT nextval('auth.refresh_tokens_id_seq'::regclass),
    token character varying(255),
    user_id character varying(255),
    revoked boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    parent character varying(255),
    session_id uuid
);

ALTER TABLE auth.refresh_tokens OWNER TO postgres;

COMMENT ON TABLE auth.refresh_tokens IS 'Auth: Store of tokens used to refresh JWT tokens once they expire.';


-- Name: saml_providers; Type: TABLE; Schema: auth; Owner: postgres

CREATE TABLE auth.saml_providers (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    entity_id text NOT NULL,
    metadata_xml text NOT NULL,
    metadata_url text,
    attribute_mapping jsonb,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    name_id_format text
);

ALTER TABLE auth.saml_providers OWNER TO postgres;

COMMENT ON TABLE auth.saml_providers IS 'Auth: Manages SAML Identity Provider connections.';


-- Name: saml_relay_states; Type: TABLE; Schema: auth; Owner: postgres

CREATE TABLE auth.saml_relay_states (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    request_id text NOT NULL,
    for_email text,
    redirect_to text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    flow_state_id uuid
);

ALTER TABLE auth.saml_relay_states OWNER TO postgres;

COMMENT ON TABLE auth.saml_relay_states IS 'Auth: Contains SAML Relay State information for each Service Provider initiated login.';


-- Name: schema_migrations; Type: TABLE; Schema: auth; Owner: postgres

CREATE TABLE auth.schema_migrations (
    version character varying(255) NOT NULL
);

ALTER TABLE auth.schema_migrations OWNER TO postgres;

COMMENT ON TABLE auth.schema_migrations IS 'Auth: Manages updates to the auth system.';


-- Name: sessions; Type: TABLE; Schema: auth; Owner: postgres

CREATE TABLE auth.sessions (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    factor_id uuid,
    aal aal_level,
    not_after timestamp with time zone,
    refreshed_at timestamp without time zone,
    user_agent text,
    ip inet,
    tag text,
    oauth_client_id uuid,
    refresh_token_hmac_key text,
    refresh_token_counter bigint,
    scopes text
);

ALTER TABLE auth.sessions OWNER TO postgres;

COMMENT ON TABLE auth.sessions IS 'Auth: Stores session data associated to a user.';

COMMENT ON COLUMN auth.sessions.not_after IS 'Auth: Not after is a nullable column that contains a timestamp after which the session should be regarded as expired.';
COMMENT ON COLUMN auth.sessions.refresh_token_hmac_key IS 'Holds a HMAC-SHA256 key used to sign refresh tokens for this session.';
COMMENT ON COLUMN auth.sessions.refresh_token_counter IS 'Holds the ID (counter) of the last issued refresh token.';

-- Name: sso_domains; Type: TABLE; Schema: auth; Owner: postgres

CREATE TABLE auth.sso_domains (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    domain text NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);

ALTER TABLE auth.sso_domains OWNER TO postgres;

COMMENT ON TABLE auth.sso_domains IS 'Auth: Manages SSO email address domain mapping to an SSO Identity Provider.';


-- Name: sso_providers; Type: TABLE; Schema: auth; Owner: postgres

CREATE TABLE auth.sso_providers (
    id uuid NOT NULL,
    resource_id text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    disabled boolean
);

ALTER TABLE auth.sso_providers OWNER TO postgres;

COMMENT ON TABLE auth.sso_providers IS 'Auth: Manages SSO identity provider information; see saml_providers for SAML.';

COMMENT ON COLUMN auth.sso_providers.resource_id IS 'Auth: Uniquely identifies a SSO provider according to a user-chosen resource ID (case insensitive), useful in infrastructure as code.';

-- Name: users; Type: TABLE; Schema: auth; Owner: postgres

CREATE TABLE auth.users (
    instance_id uuid,
    id uuid NOT NULL,
    aud character varying(255),
    role character varying(255),
    email character varying(255),
    encrypted_password character varying(255),
    email_confirmed_at timestamp with time zone,
    invited_at timestamp with time zone,
    confirmation_token character varying(255),
    confirmation_sent_at timestamp with time zone,
    recovery_token character varying(255),
    recovery_sent_at timestamp with time zone,
    email_change_token_new character varying(255),
    email_change character varying(255),
    email_change_sent_at timestamp with time zone,
    last_sign_in_at timestamp with time zone,
    raw_app_meta_data jsonb,
    raw_user_meta_data jsonb,
    is_super_admin boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    phone text DEFAULT NULL::character varying,
    phone_confirmed_at timestamp with time zone,
    phone_change text DEFAULT ''::character varying,
    phone_change_token character varying(255) DEFAULT ''::character varying,
    phone_change_sent_at timestamp with time zone,
    confirmed_at timestamp with time zone,
    email_change_token_current character varying(255) DEFAULT ''::character varying,
    email_change_confirm_status smallint DEFAULT 0,
    banned_until timestamp with time zone,
    reauthentication_token character varying(255) DEFAULT ''::character varying,
    reauthentication_sent_at timestamp with time zone,
    is_sso_user boolean NOT NULL DEFAULT false,
    deleted_at timestamp with time zone,
    is_anonymous boolean NOT NULL DEFAULT false
);

ALTER TABLE auth.users OWNER TO postgres;

COMMENT ON TABLE auth.users IS 'Auth: Stores user login data within a secure schema.';

COMMENT ON COLUMN auth.users.is_sso_user IS 'Auth: Set this column to true when the account comes from SSO. These accounts can have duplicate emails.';

-- Name: webauthn_challenges; Type: TABLE; Schema: auth; Owner: postgres

CREATE TABLE auth.webauthn_challenges (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid,
    challenge_type text NOT NULL,
    session_data jsonb NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    expires_at timestamp with time zone NOT NULL
);

ALTER TABLE auth.webauthn_challenges OWNER TO postgres;


-- Name: webauthn_credentials; Type: TABLE; Schema: auth; Owner: postgres

CREATE TABLE auth.webauthn_credentials (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    credential_id bytea NOT NULL,
    public_key bytea NOT NULL,
    attestation_type text NOT NULL DEFAULT ''::text,
    aaguid uuid,
    sign_count bigint NOT NULL DEFAULT 0,
    transports jsonb NOT NULL DEFAULT '[]'::jsonb,
    backup_eligible boolean NOT NULL DEFAULT false,
    backed_up boolean NOT NULL DEFAULT false,
    friendly_name text NOT NULL DEFAULT ''::text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    last_used_at timestamp with time zone
);

ALTER TABLE auth.webauthn_credentials OWNER TO postgres;


-- Name: buckets; Type: TABLE; Schema: storage; Owner: postgres

CREATE TABLE storage.buckets (
    id text NOT NULL,
    name text NOT NULL,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    public boolean DEFAULT false,
    avif_autodetection boolean DEFAULT false,
    file_size_limit bigint,
    allowed_mime_types text[],
    owner_id text,
    type buckettype NOT NULL DEFAULT 'STANDARD'::storage.buckettype
);

ALTER TABLE storage.buckets OWNER TO postgres;

COMMENT ON COLUMN storage.buckets.owner IS 'Field is deprecated, use owner_id instead';

-- Name: buckets_analytics; Type: TABLE; Schema: storage; Owner: postgres

CREATE TABLE storage.buckets_analytics (
    name text NOT NULL,
    type buckettype NOT NULL DEFAULT 'ANALYTICS'::storage.buckettype,
    format text NOT NULL DEFAULT 'ICEBERG'::text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    deleted_at timestamp with time zone
);

ALTER TABLE storage.buckets_analytics OWNER TO postgres;


-- Name: buckets_vectors; Type: TABLE; Schema: storage; Owner: postgres

CREATE TABLE storage.buckets_vectors (
    id text NOT NULL,
    type buckettype NOT NULL DEFAULT 'VECTOR'::storage.buckettype,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE storage.buckets_vectors OWNER TO postgres;


-- Name: migrations; Type: TABLE; Schema: storage; Owner: postgres

CREATE TABLE storage.migrations (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    hash character varying(40) NOT NULL,
    executed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE storage.migrations OWNER TO postgres;


-- Name: objects; Type: TABLE; Schema: storage; Owner: postgres

CREATE TABLE storage.objects (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    bucket_id text,
    name text,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_accessed_at timestamp with time zone DEFAULT now(),
    metadata jsonb,
    path_tokens text[],
    version text,
    owner_id text,
    user_metadata jsonb
);

ALTER TABLE storage.objects OWNER TO postgres;

COMMENT ON COLUMN storage.objects.owner IS 'Field is deprecated, use owner_id instead';

-- Name: s3_multipart_uploads; Type: TABLE; Schema: storage; Owner: postgres

CREATE TABLE storage.s3_multipart_uploads (
    id text NOT NULL,
    in_progress_size bigint NOT NULL DEFAULT 0,
    upload_signature text NOT NULL,
    bucket_id text NOT NULL,
    key text NOT NULL,
    version text NOT NULL,
    owner_id text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    user_metadata jsonb,
    metadata jsonb
);

ALTER TABLE storage.s3_multipart_uploads OWNER TO postgres;


-- Name: s3_multipart_uploads_parts; Type: TABLE; Schema: storage; Owner: postgres

CREATE TABLE storage.s3_multipart_uploads_parts (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    upload_id text NOT NULL,
    size bigint NOT NULL DEFAULT 0,
    part_number integer NOT NULL,
    bucket_id text NOT NULL,
    key text NOT NULL,
    etag text NOT NULL,
    owner_id text,
    version text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE storage.s3_multipart_uploads_parts OWNER TO postgres;


-- Name: vector_indexes; Type: TABLE; Schema: storage; Owner: postgres

CREATE TABLE storage.vector_indexes (
    id text NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    bucket_id text NOT NULL,
    data_type text NOT NULL,
    dimension integer NOT NULL,
    distance_metric text NOT NULL,
    metadata_configuration jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE storage.vector_indexes OWNER TO postgres;


-- Public RPC / functions (for agent reference)

-- FUNCTION public.get_routes_for_date → jsonb
-- FUNCTION public.search_clients_for_dashboard → USER-DEFINED
-- FUNCTION public.set_box_menu_layout_configs_updated_at → trigger

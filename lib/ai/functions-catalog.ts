/**
 * Static catalog of all AI-callable functions backed by routes in app/api/retell/*.
 *
 * This is the single source of truth for:
 *   - the drag-and-drop builder palette
 *   - the `general_tools` array we push to Retell on save
 *   - the per-function sections rendered into the compiled system prompt
 *
 * Adding a new function here (plus the route file) is all that's required to
 * expose it in the admin builder and to Retell — no dashboard work needed.
 */

export type FunctionCategory = 'read' | 'write' | 'call-control';

export type CategoryMeta = {
    id: FunctionCategory;
    label: string;
    /** Short blurb shown above each palette group. */
    description: string;
    /** Tailwind-compatible accent color tokens used by the builder UI. */
    accent: string;
    accentSoft: string;
    border: string;
    /** One-line badge copy shown on each card. */
    badge: string;
    /** lucide-react icon name. Imported dynamically by the UI. */
    icon: 'Eye' | 'Save' | 'PhoneForwarded';
};

export const CATEGORIES: Record<FunctionCategory, CategoryMeta> = {
    read: {
        id: 'read',
        label: 'Look up information',
        description: 'These functions read data. They never change anything.',
        accent: '#2563eb',
        accentSoft: 'rgba(37, 99, 235, 0.12)',
        border: 'rgba(37, 99, 235, 0.45)',
        badge: 'READ-ONLY',
        icon: 'Eye'
    },
    write: {
        id: 'write',
        label: 'Change the order',
        description:
            "These functions MODIFY the client's order. Be explicit about when the AI is allowed to call them.",
        accent: '#f59e0b',
        accentSoft: 'rgba(245, 158, 11, 0.14)',
        border: 'rgba(245, 158, 11, 0.55)',
        badge: 'MODIFIES ORDER',
        icon: 'Save'
    },
    'call-control': {
        id: 'call-control',
        label: 'Call control',
        description: 'Terminal actions — transferring or ending the call.',
        accent: '#8b5cf6',
        accentSoft: 'rgba(139, 92, 246, 0.14)',
        border: 'rgba(139, 92, 246, 0.45)',
        badge: 'CALL CONTROL',
        icon: 'PhoneForwarded'
    }
};

/** JSON Schema shape accepted by Retell's `general_tools[].parameters`. */
type ParamSchema = {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
};

export type CatalogEntry = {
    /** Function identifier used by Retell when invoking the tool. Keep in sync with route paths. */
    name: string;
    /** Short human label for the builder palette. */
    label: string;
    /** Short description passed to Retell so the LLM knows when to use it. */
    description: string;
    /** One-line summary of the arguments (for the builder card). */
    paramsSummary: string;
    /** Default text shown in the "When to call" field when first added. */
    defaultWhenToCall: string;
    /** HTTP method Retell should use. */
    method: 'GET' | 'POST';
    /** Path under APP_PUBLIC_BASE_URL. */
    urlPath: string;
    /** JSON Schema for tool parameters; Retell uses this to coerce arguments. */
    parameters: ParamSchema;
    /** Category used for visual styling and palette grouping. */
    category: FunctionCategory;
    /** Default utterance while the call is running. */
    speakDuringExecution?: string;
    /** Default utterance after the call completes. */
    speakAfterExecution?: boolean;
    /** If true, this is a Retell built-in (transfer_call / end_call) with no URL. */
    builtIn?: boolean;
    /** If true, excluded from Retell general_tools and from the auto-appended "## Available Functions" list. SMS agent still receives the tool. */
    smsOnly?: boolean;
    /**
     * Human-friendly list of the data that must already be known before calling.
     * Used by the AI Builder sidebar when inserting function snippets.
     */
    requiredData: string[];
};

const EMPTY_PARAMS: ParamSchema = { type: 'object', properties: {}, required: [] };

/**
 * All functions the AI can call. Order here drives the default palette order.
 */
export const FUNCTIONS_CATALOG: CatalogEntry[] = [
    {
        name: 'look_up_client',
        label: 'Look up client',
        description:
            'Look up the caller by phone number or full name. Returns either a single match, multiple matches (ask which one), or no match.',
        paramsSummary: 'phone_number and/or full_name',
        defaultWhenToCall:
            "Call as soon as you have a phone number or a full name. If the inbound lookup already identified the caller (dynamic variable pre_call_lookup_result=single_match), do NOT call this again.",
        method: 'POST',
        urlPath: '/api/retell/look-up-client',
        category: 'read',
        requiredData: ['phone_number OR full_name (or caller_id)'],
        parameters: {
            type: 'object',
            properties: {
                phone_number: {
                    type: 'string',
                    description: '10- or 11-digit US phone number. Optional if full_name is given.'
                },
                full_name: {
                    type: 'string',
                    description: "Full name as the caller says it. Optional if phone_number is given."
                }
            },
            required: []
        }
    },
    {
        name: 'select_client',
        label: 'Select client',
        description:
            'Disambiguate when look_up_client returned multiple matches. Pass the chosen client_id.',
        paramsSummary: 'client_id',
        defaultWhenToCall:
            "Only after look_up_client returned multiple_matches=true AND the caller has confirmed which profile they want.",
        method: 'POST',
        urlPath: '/api/retell/select-client',
        category: 'read',
        requiredData: ['client_id (from look_up_client multiple matches)'],
        parameters: {
            type: 'object',
            properties: {
                client_id: { type: 'string', description: 'The chosen client id from the prior list.' }
            },
            required: ['client_id']
        }
    },
    {
        name: 'get_order_history',
        label: 'Get order history',
        description: 'List past and scheduled orders for a client.',
        paramsSummary: 'client_id',
        defaultWhenToCall:
            "Call when the caller asks about previous orders, past deliveries, or scheduled upcoming orders.",
        method: 'GET',
        urlPath: '/api/retell/get-order-history',
        category: 'read',
        requiredData: ['client_id'],
        parameters: {
            type: 'object',
            properties: {
                client_id: { type: 'string', description: 'Resolved client id.' }
            },
            required: ['client_id']
        }
    },
    {
        name: 'get_custom_order_details',
        label: 'Get custom order details',
        description: "Return the current upcoming order for a Custom-service client.",
        paramsSummary: 'client_id',
        defaultWhenToCall:
            "Call for Custom-service clients when the caller wants to review what is currently scheduled.",
        method: 'GET',
        urlPath: '/api/retell/get-custom-order-details',
        category: 'read',
        requiredData: ['client_id'],
        parameters: {
            type: 'object',
            properties: {
                client_id: { type: 'string', description: 'Resolved client id.' }
            },
            required: ['client_id']
        }
    },
    {
        name: 'get_box_client_info',
        label: 'Get box client info',
        description:
            'For Boxes-service clients: authorized box count; each slot has categories + items (menu lines like Food Box A / Random Box F appear as item names here). available_box_types and quota_matrix reflect the DB — often a SINGLE program (e.g. Standard Box): every slot repeats that box_type_id; customer-facing "box flavors" are item_id rows inside categories, not separate box types. Never invent box_type UUIDs.',
        paramsSummary: 'client_id',
        defaultWhenToCall:
            "Call at the start of building or changing a Box order, or when the caller asks what items are available.",
        method: 'GET',
        urlPath: '/api/retell/get-box-client-info',
        category: 'read',
        requiredData: ['client_id'],
        parameters: {
            type: 'object',
            properties: {
                client_id: { type: 'string', description: 'Resolved client id.' }
            },
            required: ['client_id']
        }
    },
    {
        name: 'get_food_vendors_and_menu',
        label: 'Get food vendors and menu',
        description:
            'For Food-service clients: returns approved_meals_per_week, remaining_meals, current selections, full prepackaged meal_packages[] (categories + items), vendor_total_count (authoritative count of Food vendors in vendors[]), and vendors (delivery days, minimum meals). Response includes food_menu_presentation_hint — follow it when describing menus so dropdown options are not presented as separate products. Vendor menu lines may include dropdown_groups when the item has required option lists. For SMS, vendor line-item menus may be omitted unless include_vendor_menu_items=true — then use get_vendor_menu_items for one vendor.',
        paramsSummary: 'client_id, include_vendor_menu_items?',
        defaultWhenToCall:
            "Call at the start of building or changing a Food order, or when the caller asks what vendors or meals are available.",
        method: 'GET',
        urlPath: '/api/retell/get-food-vendors-and-menu',
        category: 'read',
        requiredData: ['client_id'],
        parameters: {
            type: 'object',
            properties: {
                client_id: { type: 'string', description: 'Resolved client id.' },
                include_vendor_menu_items: {
                    type: 'boolean',
                    description:
                        'If true, include every vendor items[] line (large). If false or omitted on SMS, vendors only have menu_item_count and empty items — call get_vendor_menu_items for details. HTTP/Retell default is full menus unless include_vendor_menu_items=false in the URL.'
                }
            },
            required: ['client_id']
        }
    },
    {
        name: 'get_vendor_menu_items',
        label: 'Get one vendor menu (Food)',
        description:
            'Food clients only. Returns menu line items (item_id, name, meal_value, and when configured dropdown_groups) plus vendor minimum_meals and delivery_days for a single vendor_id. Response includes food_menu_presentation_hint — follow it so each items[] row is described as one orderable line with its dropdown slots, not a flattened list of options as separate products. Use after get_food_vendors_and_menu when vendor menus were omitted or when the caller asks about one vendor.',
        paramsSummary: 'client_id, vendor_id',
        defaultWhenToCall:
            'After the slim food overview, when the caller names or picks a vendor and needs item IDs, meal values, and any dropdown_groups before saving.',
        method: 'GET',
        urlPath: '/api/retell/get-vendor-menu-items',
        category: 'read',
        requiredData: ['client_id', 'vendor_id'],
        parameters: {
            type: 'object',
            properties: {
                client_id: { type: 'string', description: 'Resolved client id.' },
                vendor_id: { type: 'string', description: 'UUID from get_food_vendors_and_menu vendors[].vendor_id.' }
            },
            required: ['client_id', 'vendor_id']
        }
    },
    {
        name: 'clear_all_vendor_orders',
        label: 'Clear all vendor orders',
        description:
            'MODIFIES DATA. Clears ALL delivery-day vendor selections for a Food client in one step, and clears ALL prepackaged meal package (meal_selections) choices too, so the full approved_meals_per_week is available again. Use when the customer says "clear all", "start fresh", "remove everything", "reset so I can order X", or similar.',
        paramsSummary: 'client_id',
        defaultWhenToCall:
            'Call when the customer wants to wipe all current vendor orders at once. Prefer this over individual day clears.',
        method: 'POST',
        urlPath: '/api/retell/clear-all-vendor-orders',
        category: 'write',
        requiredData: ['client_id'],
        parameters: {
            type: 'object',
            properties: {
                client_id: { type: 'string', description: 'Resolved client id.' }
            },
            required: ['client_id']
        }
    },
    {
        name: 'save_food_order',
        label: 'Save food order',
        description:
            "MODIFIES DATA. Save food selections for a delivery day. REPLACES (overwrites) that day's existing vendor selections — the validation limit is checked against the NEW submission only, not what was there before. Pass vendor_selections:[] to wipe a day. Optionally pass meal_selections[] to update prepackaged Breakfast/Lunch/Dinner packages. For any vendor line with dropdown_groups from the menu tools, each ordered item MUST include a matching note (semicolon-separated exact option labels per group, same order).",
        paramsSummary: 'client_id, delivery_day, vendor_selections[] (per-line note when dropdown_groups), meal_selections[]?',
        defaultWhenToCall:
            "Call ONLY after the caller has explicitly confirmed their full selection AND you have validated vendor minimums, prepackaged set_value targets, the global approved_meals_per_week cap, and every menu item with dropdown_groups has a complete note on its line (semicolon-separated picks). Bundle vendorSelections and mealSelections into a single call so the caller only confirms once. Never call without confirmation.",
        method: 'POST',
        urlPath: '/api/retell/save-food-order',
        category: 'write',
        requiredData: ['client_id', 'delivery_day', 'vendor_selections[] (confirmed; per-line note when menu shows dropdown_groups)', 'meal_selections[] (optional; only if prepackaged meals were changed)'],
        parameters: {
            type: 'object',
            properties: {
                client_id: { type: 'string', description: 'Resolved client id.' },
                delivery_day: {
                    type: 'string',
                    description: 'One of: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday.'
                },
                vendor_selections: {
                    type: 'array',
                    description: 'Each vendor the caller ordered from for the delivery_day, with the items and quantities picked. Pass an empty array to clear the day.',
                    items: {
                        type: 'object',
                        properties: {
                            vendor_id: { type: 'string' },
                            items: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        item_id: { type: 'string' },
                                        quantity: { type: 'number' },
                                        note: {
                                            type: 'string',
                                            description:
                                                'Optional line note. REQUIRED when the menu tool shows dropdown_groups for that item_id: one exact option label per group, in the same order as dropdown_groups, joined with semicolons (e.g. Vanilla;Cup). Also used for free-text notes when the item allows notes without dropdowns.',
                                        },
                                    },
                                    required: ['item_id', 'quantity'],
                                },
                            },
                        },
                        required: ['vendor_id', 'items'],
                    },
                },
                meal_selections: {
                    type: 'array',
                    description:
                        'Optional. Prepackaged breakfast_categories / breakfast_items from get_food_vendors_and_menu.meal_packages only (not vendor menu_items). For each category with set_value, sum of (quota_value × qty) must equal set_value exactly — partial package totals are rejected. meal_type must match meal_packages[].meal_type. Only meal_types passed here are replaced. Never duplicate the same picks in vendor_selections: package flavors live on the meal package line via note when dropdown_groups are present.',
                    items: {
                        type: 'object',
                        properties: {
                            meal_type: {
                                type: 'string',
                                description:
                                    'Must match meal_packages[].meal_type from get_food_vendors_and_menu (exact string — may be "Breakfast" or a label like "Shabbos Packages (21Meals)" depending on data).'
                            },
                            vendor_id: {
                                type: 'string',
                                description:
                                    'Optional UUID. Only if scoping package lines to a vendor when items have vendor_id.'
                            },
                            category_selections: {
                                type: 'array',
                                description:
                                    'One object per breakfast category row. category_id MUST be meal_packages[].categories[].category_id (UUID), never prose or labels.',
                                items: {
                                    type: 'object',
                                    properties: {
                                        category_id: {
                                            type: 'string',
                                            description:
                                                'Exact UUID from get_food_vendors_and_menu → meal_packages[].categories[].category_id for that package row (e.g. Shabbos). Never descriptions in parentheses.'
                                        },
                                        items: {
                                            type: 'array',
                                            description:
                                                'Lines use item_id from meal_packages[].categories[].items[].item_id (UUIDs only). When that row shows dropdown_groups, include note with exact option labels per group in order, semicolon-separated (same rule as vendor lines).',
                                            items: {
                                                type: 'object',
                                                properties: {
                                                    item_id: {
                                                        type: 'string',
                                                        description:
                                                            'UUID from meal_packages[].categories[].items[].item_id — copy exactly.'
                                                    },
                                                    quantity: { type: 'number' },
                                                    note: {
                                                        type: 'string',
                                                        description:
                                                            'Optional. REQUIRED when meal_packages shows dropdown_groups for this item_id: exactly one value per dropdown group, in the same array order as dropdown_groups, joined with semicolons. Each value must be an exact string from that group\'s options (not the group label, not the category name). Example: 2 groups → "Vanilla;Large". Example: 14 juice slots → 14 exact juice names separated by semicolons.',
                                                    },
                                                },
                                                required: ['item_id', 'quantity']
                                            }
                                        }
                                    },
                                    required: ['category_id', 'items']
                                }
                            }
                        },
                        required: ['meal_type', 'category_selections']
                    }
                }
            },
            required: ['client_id', 'delivery_day', 'vendor_selections']
        }
    },
    {
        name: 'save_box_order',
        label: 'Save box order',
        description:
            'MODIFIES DATA. Save the chosen box selections. Must include one selection per authorized box, each matching the required points per category.',
        paramsSummary: 'client_id, box_selections[]',
        defaultWhenToCall:
            "Call ONLY after the caller has explicitly confirmed their selections AND every category in every box meets its required point value. Never call without confirmation.",
        method: 'POST',
        urlPath: '/api/retell/save-box-order',
        category: 'write',
        requiredData: ['client_id', 'box_selections[] (one per box; points validated; confirmed by caller)'],
        parameters: {
            type: 'object',
            properties: {
                client_id: { type: 'string' },
                box_selections: {
                    type: 'array',
                    description: 'One entry per authorized box.',
                    items: {
                        type: 'object',
                        properties: {
                            box_type_id: { type: 'string' },
                            category_selections: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        category_id: { type: 'string' },
                                        items: {
                                            type: 'array',
                                            items: {
                                                type: 'object',
                                                properties: {
                                                    item_id: { type: 'string' },
                                                    quantity: { type: 'number' }
                                                },
                                                required: ['item_id', 'quantity']
                                            }
                                        }
                                    },
                                    required: ['category_id', 'items']
                                }
                            }
                        },
                        required: ['box_type_id', 'category_selections']
                    }
                }
            },
            required: ['client_id', 'box_selections']
        }
    },
    {
        name: 'mark_sms_peer_no_text',
        label: 'Mark number as SMS-unavailable',
        description:
            'SMS ONLY. Use when the inbound message is clearly an automated carrier or handset notice that this line cannot receive SMS (e.g. "does not accept text messages", "automatic reply", "please call instead") — not a human trying to order.',
        paramsSummary: 'evidence_quote, optional confidence',
        defaultWhenToCall:
            'Only for obvious machine-generated no-SMS / call-instead notices in the current inbound. Never use for normal customer wording or order changes.',
        method: 'POST',
        urlPath: '/api/retell/sms-peer-no-text',
        category: 'read',
        smsOnly: true,
        requiredData: ['evidence_quote (short excerpt from the inbound message)'],
        parameters: {
            type: 'object',
            properties: {
                evidence_quote: {
                    type: 'string',
                    description: 'Short verbatim excerpt proving this is a no-SMS / carrier auto-reply.',
                },
                confidence: {
                    type: 'string',
                    enum: ['high', 'medium'],
                    description: 'How sure you are that this is not a human.',
                },
            },
            required: ['evidence_quote'],
        },
    },
    {
        name: 'end_call',
        label: 'End call',
        description: 'End the call politely.',
        paramsSummary: '(no args)',
        defaultWhenToCall:
            "End the call only after the caller has confirmed they are done and there is nothing else to help with.",
        method: 'POST',
        urlPath: '',
        category: 'call-control',
        requiredData: ['caller confirmed they are done'],
        parameters: EMPTY_PARAMS,
        builtIn: true
    }
];

export function getCatalogEntry(name: string): CatalogEntry | undefined {
    return FUNCTIONS_CATALOG.find(f => f.name === name);
}

export function getCategoryMeta(category: FunctionCategory): CategoryMeta {
    return CATEGORIES[category];
}

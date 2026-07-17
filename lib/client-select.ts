/**
 * Client row select for portal/admin upcoming-order writes.
 *
 * Triangle uses this to omit its large `clients.order_history` JSONB column from
 * hot-path writes. demo-food's order history lives in a separate `order_history`
 * table (see `recordClientChange` / `getClientChangeLog` in lib/actions.ts), so
 * there is no equivalent large column on `clients` to avoid here — `select('*')`
 * is both correct and cheap.
 */
export const CLIENT_SELECT_WITHOUT_ORDER_HISTORY = '*';

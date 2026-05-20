/** Tabs on `/admin` — kept in sync with sidebar links (`?tab=`). */

export type AdminPanelTab =
    | 'menus'
    | 'mealSelect'
    | 'boxes'
    | 'boxesOrg'
    | 'equipment'
    | 'vendors'
    | 'navigators'
    | 'nutritionists'
    | 'statuses'
    | 'form'
    | 'settings'
    | 'orders';

export const ADMIN_PANEL_TAB_IDS: readonly AdminPanelTab[] = [
    'menus',
    'mealSelect',
    'boxes',
    'boxesOrg',
    'equipment',
    'vendors',
    'navigators',
    'nutritionists',
    'statuses',
    'form',
    'settings',
    'orders',
] as const;

export function parseAdminPanelTab(param: string | null): AdminPanelTab {
    if (param && ADMIN_PANEL_TAB_IDS.includes(param as AdminPanelTab)) {
        return param as AdminPanelTab;
    }
    return 'menus';
}

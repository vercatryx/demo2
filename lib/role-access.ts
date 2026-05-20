export type AppRole =
    | 'super-admin'
    | 'admin'
    | 'brooklyn_admin'
    | 'navigator'
    | 'vendor'
    | 'client';

export function canAccessBilling(role: string | undefined): boolean {
    return role === 'admin' || role === 'super-admin';
}

export function canAccessAdminPanel(role: string | undefined): boolean {
    return role === 'admin' || role === 'super-admin';
}

export function canAccessAiTools(role: string | undefined): boolean {
    return canAccessAdminPanel(role);
}

export function canAccessAssignVendors(role: string | undefined): boolean {
    return role === 'admin' || role === 'super-admin' || role === 'navigator';
}

export function isBrooklynAdmin(role: string | undefined): boolean {
    return role === 'brooklyn_admin';
}

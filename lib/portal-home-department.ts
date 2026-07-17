/** Virtual sidebar id for the portal home / welcome panel (not a real vendor or category). */
export const PORTAL_HOME_DEPARTMENT_ID = '__portal_home__';

export function isPortalHomeDepartment(id: string | null | undefined): boolean {
    return id === PORTAL_HOME_DEPARTMENT_ID;
}

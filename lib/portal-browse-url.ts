import { PORTAL_HOME_DEPARTMENT_ID, isPortalHomeDepartment } from '@/lib/portal-home-department';

export type PortalView = 'home' | 'departments' | 'sections' | 'products';

export type PortalBrowseState = {
    view: PortalView;
    /** Food vendor id, box category id, or {@link PORTAL_HOME_DEPARTMENT_ID} on home */
    departmentId: string | null;
    /** Subfolder path within department */
    folderPath: string[];
    /** Highlight item after search jump */
    highlightItemId: string | null;
};

const PRESERVED_QUERY_KEYS = ['portal', 'legacy'] as const;

export type ParsedPortalBrowseUrl = {
    browse: PortalBrowseState;
    deliveryDay?: string;
};

function parseView(raw: string | null): PortalView | null {
    if (raw === 'home' || raw === 'departments' || raw === 'sections' || raw === 'products') {
        return raw;
    }
    return null;
}

/** Read portal browse location from the current query string. */
export function parsePortalBrowseUrl(searchParams: URLSearchParams): ParsedPortalBrowseUrl {
    const viewParam = parseView(searchParams.get('view'));
    const dept = searchParams.get('dept')?.trim() || null;
    const pathParam = searchParams.get('path')?.trim() || '';
    const folderPath = pathParam ? pathParam.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const highlightItemId = searchParams.get('item')?.trim() || null;
    const deliveryDay = searchParams.get('day')?.trim() || undefined;

    if (viewParam === 'departments') {
        return {
            browse: { view: 'departments', departmentId: null, folderPath: [], highlightItemId: null },
            deliveryDay,
        };
    }

    if (viewParam === 'sections' && dept) {
        return {
            browse: { view: 'sections', departmentId: dept, folderPath, highlightItemId: null },
            deliveryDay,
        };
    }

    if (viewParam === 'products' && dept) {
        return {
            browse: { view: 'products', departmentId: dept, folderPath, highlightItemId },
            deliveryDay,
        };
    }

    if (viewParam === 'home' || (!viewParam && !dept)) {
        return {
            browse: {
                view: 'home',
                departmentId: PORTAL_HOME_DEPARTMENT_ID,
                folderPath: [],
                highlightItemId: null,
            },
            deliveryDay,
        };
    }

    // Friendly shorthand: ?dept=… with optional path (no view param)
    if (dept) {
        const view: PortalView = folderPath.length > 0 ? 'products' : 'sections';
        return {
            browse: { view, departmentId: dept, folderPath, highlightItemId },
            deliveryDay,
        };
    }

    return {
        browse: {
            view: 'home',
            departmentId: PORTAL_HOME_DEPARTMENT_ID,
            folderPath: [],
            highlightItemId: null,
        },
        deliveryDay,
    };
}

export type PortalBrowseUrlExtras = {
    deliveryDay?: string;
};

function copyPreservedParams(from: URLSearchParams, to: URLSearchParams): void {
    for (const key of PRESERVED_QUERY_KEYS) {
        const value = from.get(key);
        if (value) to.set(key, value);
    }
}

/** Build query string for the current browse location (preserves portal version params). */
export function buildPortalBrowseQuery(
    state: PortalBrowseState,
    existing: URLSearchParams,
    extras?: PortalBrowseUrlExtras,
): string {
    const params = new URLSearchParams();
    copyPreservedParams(existing, params);

    if (state.view === 'home' || isPortalHomeDepartment(state.departmentId)) {
        // Home — only preserved params (and no delivery day)
    } else if (state.view === 'departments') {
        params.set('view', 'departments');
    } else if (state.departmentId) {
        params.set('view', state.view);
        params.set('dept', state.departmentId);
        if (state.folderPath.length > 0) {
            params.set('path', state.folderPath.join(','));
        }
        if (state.view === 'products' && state.highlightItemId) {
            params.set('item', state.highlightItemId);
        }
        if (extras?.deliveryDay) {
            params.set('day', extras.deliveryDay);
        }
    }

    return params.toString();
}

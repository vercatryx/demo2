'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PORTAL_HOME_DEPARTMENT_ID } from '@/lib/portal-home-department';
import {
    buildPortalBrowseQuery,
    parsePortalBrowseUrl,
    type PortalBrowseState,
    type PortalBrowseUrlExtras,
    type PortalView,
} from '@/lib/portal-browse-url';

export type { PortalBrowseState, PortalView };

const INITIAL: PortalBrowseState = {
    view: 'home',
    departmentId: PORTAL_HOME_DEPARTMENT_ID,
    folderPath: [],
    highlightItemId: null,
};

export type UsePortalBrowseOptions = {
    /** Current food delivery day — included in the URL when browsing a vendor. */
    deliveryDay?: string;
    /** Called when the user navigates via browser back/forward or a shared link. */
    onNavigateFromUrl?: (parsed: ReturnType<typeof parsePortalBrowseUrl>) => void;
};

export function usePortalBrowse(options: UsePortalBrowseOptions = {}) {
    const { deliveryDay, onNavigateFromUrl } = options;
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const searchParamsRef = useRef(searchParams);
    searchParamsRef.current = searchParams;

    const deliveryDayRef = useRef(deliveryDay);
    deliveryDayRef.current = deliveryDay;

    const onNavigateFromUrlRef = useRef(onNavigateFromUrl);
    onNavigateFromUrlRef.current = onNavigateFromUrl;

    const lastWrittenQueryRef = useRef<string | null>(null);

    // Always start from INITIAL so SSR and the first client render match.
    // Reading window.location in useState caused React #418 hydration mismatches
    // (server: home, client: deep-link browse), which remounted the portal mid-edit
    // and looked like "Saving…" forever / order reverting.
    const [state, setState] = useState<PortalBrowseState>(INITIAL);

    const urlExtras = useMemo((): PortalBrowseUrlExtras | undefined => {
        if (!deliveryDay) return undefined;
        return { deliveryDay };
    }, [deliveryDay]);

    const syncToUrl = useCallback(
        (next: PortalBrowseState, extras?: PortalBrowseUrlExtras) => {
            const qs = buildPortalBrowseQuery(next, searchParamsRef.current, extras);
            if (qs === searchParamsRef.current.toString()) return;
            lastWrittenQueryRef.current = qs;
            router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        },
        [pathname, router],
    );

    const applyBrowseState = useCallback(
        (next: PortalBrowseState, extras?: PortalBrowseUrlExtras) => {
            setState(next);
            syncToUrl(next, extras);
        },
        [syncToUrl],
    );

    const goHome = useCallback(() => {
        applyBrowseState({
            view: 'home',
            departmentId: PORTAL_HOME_DEPARTMENT_ID,
            folderPath: [],
            highlightItemId: null,
        });
    }, [applyBrowseState]);

    const goDepartments = useCallback(() => {
        applyBrowseState({ view: 'departments', departmentId: null, folderPath: [], highlightItemId: null });
    }, [applyBrowseState]);

    const goSections = useCallback(
        (departmentId: string, folderPath: string[] = []) => {
            applyBrowseState(
                { view: 'sections', departmentId, folderPath, highlightItemId: null },
                deliveryDayRef.current ? { deliveryDay: deliveryDayRef.current } : undefined,
            );
        },
        [applyBrowseState],
    );

    const goProducts = useCallback(
        (departmentId: string, folderPath: string[], highlightItemId?: string | null) => {
            applyBrowseState(
                {
                    view: 'products',
                    departmentId,
                    folderPath,
                    highlightItemId: highlightItemId ?? null,
                },
                deliveryDayRef.current ? { deliveryDay: deliveryDayRef.current } : undefined,
            );
        },
        [applyBrowseState],
    );

    const setFolderPath = useCallback(
        (folderPath: string[]) => {
            setState((prev) => {
                const next = { ...prev, folderPath };
                syncToUrl(next, deliveryDayRef.current ? { deliveryDay: deliveryDayRef.current } : undefined);
                return next;
            });
        },
        [syncToUrl],
    );

    // Keep URL in sync when delivery day changes while browsing a vendor.
    useEffect(() => {
        if (state.view !== 'products' && state.view !== 'sections') return;
        if (!state.departmentId || state.departmentId === PORTAL_HOME_DEPARTMENT_ID) return;
        syncToUrl(state, urlExtras);
    }, [urlExtras, state, syncToUrl]);

    // Browser back/forward and shared links.
    useEffect(() => {
        const current = searchParams.toString();
        if (current === lastWrittenQueryRef.current) {
            lastWrittenQueryRef.current = null;
            return;
        }

        const parsed = parsePortalBrowseUrl(searchParams);
        setState(parsed.browse);
        onNavigateFromUrlRef.current?.(parsed);
    }, [searchParams]);

    const breadcrumbs = useMemo(() => {
        const crumbs: { label: string; action?: () => void }[] = [{ label: 'Home', action: goHome }];
        if (state.view === 'departments' || state.departmentId) {
            crumbs.push({ label: 'Departments', action: goDepartments });
        }
        return crumbs;
    }, [state.view, state.departmentId, goHome, goDepartments]);

    return {
        state,
        goHome,
        goDepartments,
        goSections,
        goProducts,
        setFolderPath,
        breadcrumbs,
        setState,
    };
}

export type PortalBrowseApi = ReturnType<typeof usePortalBrowse>;

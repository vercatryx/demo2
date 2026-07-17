'use client';

import { useEffect, useState } from 'react';

const POLL_MS = 60_000;

declare global {
    interface Window {
        /** Build id of the bundle this browser session first loaded (for diagnostics). */
        __appBuildId?: string;
    }
}

/**
 * Detects when the server has been redeployed while this browser tab is still
 * running an older bundle (stale bundles break server actions after a deploy).
 * Polls the build id and shows a refresh banner as soon as it changes.
 */
export function AppVersionWatcher() {
    const [stale, setStale] = useState(false);

    useEffect(() => {
        let initial: string | null = null;
        let cancelled = false;

        const check = async () => {
            try {
                const res = await fetch('/api/app-version', { cache: 'no-store' });
                if (!res.ok) return;
                const data = (await res.json()) as { buildId?: string };
                const buildId = data.buildId || '';
                if (!buildId || buildId === 'dev' || cancelled) return;
                if (initial === null) {
                    initial = buildId;
                    window.__appBuildId = buildId;
                    return;
                }
                if (buildId !== initial) setStale(true);
            } catch {
                // Offline / transient — try again on the next tick.
            }
        };

        void check();
        const timer = setInterval(() => void check(), POLL_MS);
        const onWake = () => void check();
        window.addEventListener('focus', onWake);
        window.addEventListener('online', onWake);
        document.addEventListener('visibilitychange', onWake);
        return () => {
            cancelled = true;
            clearInterval(timer);
            window.removeEventListener('focus', onWake);
            window.removeEventListener('online', onWake);
            document.removeEventListener('visibilitychange', onWake);
        };
    }, []);

    if (!stale) return null;

    return (
        <div
            role="alert"
            className="fixed inset-x-0 top-0 z-[9999] flex items-center justify-center gap-3 bg-amber-500 px-4 py-2.5 text-sm font-medium text-white shadow-md"
        >
            <span>A new version of this site is available. Please refresh to keep saving working.</span>
            <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-md bg-white px-3 py-1 text-sm font-semibold text-amber-700 shadow-sm hover:bg-amber-50"
            >
                Refresh now
            </button>
        </div>
    );
}

'use client';

import { useEffect, useState } from 'react';
import type { ItemCategory, MenuItem } from '@/lib/types';
import { useDataCache } from '@/lib/data-cache';
import { getBoxMenuLayoutConfig } from '@/lib/merge-triangle-actions';
import { MenuLayoutDemoClient } from '@/components/admin/box-selector-demo/MenuLayoutDemoClient';
import type { DemoBoxLayoutConfig } from '@/components/admin/box-selector-demo/constants';

export function BoxesOrgManagement() {
    const { getCategories, getMenuItems } = useDataCache();
    const [categories, setCategories] = useState<ItemCategory[]>([]);
    const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
    const [initialLayout, setInitialLayout] = useState<DemoBoxLayoutConfig | null>(null);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const [c, m, layout] = await Promise.all([
                getCategories(),
                getMenuItems(),
                getBoxMenuLayoutConfig(),
            ]);
            if (cancelled) return;
            setCategories(c);
            setMenuItems(m);
            setInitialLayout(layout);
            setReady(true);
        })();
        return () => {
            cancelled = true;
        };
    }, [getCategories, getMenuItems]);

    if (!ready) {
        return <p style={{ color: 'var(--text-secondary)' }}>Loading…</p>;
    }

    return <MenuLayoutDemoClient categories={categories} menuItems={menuItems} initialLayout={initialLayout} embedded />;
}

'use client';

import React from 'react';
import { Home, LayoutGrid, ShoppingCart, User } from 'lucide-react';
import styles from './portal-v2.module.css';

type Tab = 'home' | 'departments' | 'cart' | 'account';

type Props = {
    active: Tab;
    cartCount: number;
    onHome: () => void;
    onDepartments: () => void;
    onCart: () => void;
    onAccount: () => void;
};

export function PortalMobileNav({ active, cartCount, onHome, onDepartments, onCart, onAccount }: Props) {
    return (
        <nav className={styles.portalV2MobileNav} aria-label="Portal navigation">
            <button
                type="button"
                className={`${styles.portalV2MobileNavItem} ${active === 'home' ? styles.portalV2MobileNavItemActive : ''}`}
                onClick={onHome}
            >
                <Home size={22} />
                Home
            </button>
            <button
                type="button"
                className={`${styles.portalV2MobileNavItem} ${active === 'departments' ? styles.portalV2MobileNavItemActive : ''}`}
                onClick={onDepartments}
            >
                <LayoutGrid size={22} />
                Shop
            </button>
            <button
                type="button"
                className={`${styles.portalV2MobileNavItem} ${active === 'cart' ? styles.portalV2MobileNavItemActive : ''}`}
                onClick={onCart}
            >
                <ShoppingCart size={22} />
                Cart{cartCount > 0 ? ` (${cartCount})` : ''}
            </button>
            <button
                type="button"
                className={`${styles.portalV2MobileNavItem} ${active === 'account' ? styles.portalV2MobileNavItemActive : ''}`}
                onClick={onAccount}
            >
                <User size={22} />
                Account
            </button>
        </nav>
    );
}

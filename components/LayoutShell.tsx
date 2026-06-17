'use client';

import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { usePathname } from 'next/navigation';
import { DataCacheProvider } from '@/lib/data-cache';
import styles from './LayoutShell.module.css';
import clsx from 'clsx';

export function LayoutShell({ children, userName, userRole, userId }: { children: React.ReactNode, userName?: string, userRole?: string, userId?: string }) {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const pathname = usePathname();

    if (pathname === '/login' || pathname.startsWith('/login/')) {
        return <>{children}</>;
    }

    const isVendorsProduce = pathname === '/vendors/produce' || pathname.startsWith('/vendors/produce/');
    if (isVendorsProduce) {
        return <>{children}</>;
    }

    const isVendorPortal = pathname === '/vendor' || pathname.startsWith('/vendor/');
    const isClientPortal =
        pathname.startsWith('/client-portal') ||
        pathname.startsWith('/client-portal-triangle') ||
        pathname.startsWith('/admin/client-portal');
    const isVerifyOrder = pathname.startsWith('/verify-order');
    const isDelivery = pathname.startsWith('/delivery');
    const isDrivers = pathname.startsWith('/drivers');
    const isProduce = pathname.startsWith('/produce');
    const isRoutes = pathname === '/routes' || pathname.startsWith('/routes/');
    const showSidebar = !isVendorPortal && !isClientPortal && !isVerifyOrder && !isDelivery && !isDrivers && !isProduce;

    const mainClassName = clsx(
        styles.main,
        showSidebar && (isCollapsed ? styles.mainWithSidebarCollapsed : styles.mainWithSidebar),
        !showSidebar && styles.mainFullBleed,
    );

    const contentClassName = clsx(
        'page-content',
        isRoutes && 'page-content--routes',
        isClientPortal && 'page-content--flush',
    );

    return (
        <DataCacheProvider>
            <div className={styles.shell}>
                {showSidebar && (
                    <Sidebar
                        isCollapsed={isCollapsed}
                        toggle={() => setIsCollapsed(!isCollapsed)}
                        userName={userName}
                        userRole={userRole}
                        userId={userId}
                    />
                )}

                <main className={mainClassName}>
                    <div className={contentClassName}>
                        {children}
                    </div>
                </main>
            </div>
        </DataCacheProvider>
    );
}

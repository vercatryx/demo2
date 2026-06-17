'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    Users,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    Download,
    History,
    Settings,
    Route,
    Package,
    CalendarCheck,
    ClipboardList,
    ScrollText,
    AlertTriangle,
    Bot,
    PieChart,
    CreditCard,
    FileText,
    Database,
    Mail,
    Shield,
    Utensils,
    Box,
    LayoutTemplate,
    type LucideIcon,
} from 'lucide-react';
import {
    canAccessAdminPanel,
    canAccessAiTools,
    canAccessBilling,
    isBrooklynAdmin,
} from '@/lib/role-access';
import { AppBrand } from '@/components/AppBrand';
import styles from './Sidebar.module.css';
import { logout } from '@/lib/auth-actions';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { getNavigatorLogs } from '@/lib/actions';
import { useTime } from '@/lib/time-context';
import { SidebarActiveOrderSummary } from './SidebarActiveOrderSummary';

type NavItem = {
    label: string;
    href: string;
    icon: LucideIcon;
    role?: string;
};

type NavSection = {
    id: string;
    label: string;
    items: NavItem[];
};

const navSections: NavSection[] = [
    {
        id: 'clients',
        label: 'Clients',
        items: [
            { label: 'Client Dashboard', href: '/clients', icon: Users },
            { label: 'Meal Plan Edits', href: '/meal-plan-edits', icon: CalendarCheck },
            { label: 'Missing Orders', href: '/missing-orders', icon: AlertTriangle },
            { label: 'Pending screenings', href: '/pending-screenings', icon: ClipboardList },
            { label: 'My History', href: '/navigator-history', icon: History, role: 'navigator' },
        ],
    },
    {
        id: 'billing',
        label: 'Billing',
        items: [
            { label: 'Billing', href: '/billing', icon: CreditCard },
            { label: 'Invoice', href: '/invoice', icon: FileText },
        ],
    },
    {
        id: 'delivery',
        label: 'Delivery',
        items: [
            { label: 'Routes', href: '/routes', icon: Route },
            { label: 'Downloads', href: '/vendors', icon: Download },
            { label: 'Produce', href: '/vendors/produce', icon: Package },
        ],
    },
    {
        id: 'portals',
        label: 'Portals',
        items: [
            { label: 'Portal (meal plan)', href: '/portal-preview/dietcombo', icon: LayoutTemplate },
            { label: 'Portal (classic · food)', href: '/portal-preview/triangle/food', icon: Utensils },
            { label: 'Portal (classic · boxes)', href: '/portal-preview/triangle/boxes', icon: Box },
        ],
    },
    {
        id: 'admin',
        label: 'Admin',
        items: [
            { label: 'Changes', href: '/admin/changes', icon: ScrollText },
            { label: 'Admin Control', href: '/admin', icon: Settings },
            { label: 'Mass Messaging', href: '/admin/messaging', icon: Mail },
            { label: 'Account Permissions', href: '/admin/account-permissions', icon: Shield },
        ],
    },
    {
        id: 'ai',
        label: 'AI Tools',
        items: [
            { label: 'AI Builder', href: '/admin/ai-builder', icon: Bot },
            { label: 'Data Copilot', href: '/internal-data-reports', icon: Database },
            { label: 'AI Usage', href: '/admin/ai-usage', icon: PieChart },
        ],
    },
];

function isNavItemVisible(item: NavItem, userRole: string): boolean {
    if (isBrooklynAdmin(userRole)) {
        return ['Client Dashboard', 'Routes', 'Meal Plan Edits'].includes(item.label);
    }
    if (item.label === 'Pending screenings' || item.label === 'Changes' || item.label === 'Missing Orders') {
        return canAccessAdminPanel(userRole);
    }
    if (item.label === 'Admin Control' || item.label === 'Downloads' || item.label === 'Produce' || item.label === 'Mass Messaging' || item.label === 'Account Permissions') {
        return canAccessAdminPanel(userRole);
    }
    if (item.label === 'AI Builder' || item.label === 'AI Usage' || item.label === 'Data Copilot') {
        return canAccessAiTools(userRole);
    }
    if (item.label === 'Billing' || item.label === 'Invoice') {
        return canAccessBilling(userRole);
    }
    if (item.role) {
        return userRole === item.role;
    }
    return true;
}

function isItemActive(pathname: string, href: string, allHrefs: string[]): boolean {
    const base = href.split('?')[0]!;
    const matches = allHrefs.filter((candidate) => {
        const candidateBase = candidate.split('?')[0]!;
        if (candidateBase === '/admin') {
            return pathname === '/admin' || pathname === '/admin/';
        }
        return pathname === candidateBase || pathname.startsWith(`${candidateBase}/`);
    });

    if (matches.length === 0) return false;

    const bestMatch = matches.sort((a, b) => b.length - a.length)[0]!.split('?')[0]!;
    return bestMatch === base;
}

function findSectionForPath(
    sections: Array<{ id: string; items: NavItem[] }>,
    pathname: string,
    allHrefs: string[],
): string | null {
    for (const section of sections) {
        if (section.items.some((item) => isItemActive(pathname, item.href, allHrefs))) {
            return section.id;
        }
    }
    return null;
}

export function Sidebar({
    isCollapsed = false,
    toggle,
    userName = 'Admin',
    userRole = 'admin',
    userId = '',
}: {
    isCollapsed?: boolean;
    toggle?: () => void;
    userName?: string;
    userRole?: string;
    userId?: string;
}) {
    const pathname = usePathname();
    const { currentTime } = useTime();
    const [todayUnits, setTodayUnits] = useState<number | null>(null);
    const [weekUnits, setWeekUnits] = useState<number | null>(null);
    const [isLoadingUnits, setIsLoadingUnits] = useState(false);

    const visibleSections = useMemo(
        () =>
            navSections
                .map((section) => ({
                    ...section,
                    items: section.items.filter((item) => isNavItemVisible(item, userRole)),
                }))
                .filter((section) => section.items.length > 0),
        [userRole],
    );

    const flatVisibleItems = useMemo(
        () => visibleSections.flatMap((section) => section.items),
        [visibleSections],
    );

    const allVisibleHrefs = useMemo(
        () => flatVisibleItems.map((item) => item.href),
        [flatVisibleItems],
    );

    const [openSections, setOpenSections] = useState<Set<string>>(() => new Set());

    useEffect(() => {
        const activeSectionId = findSectionForPath(visibleSections, pathname, allVisibleHrefs);
        if (!activeSectionId) return;
        setOpenSections((prev) => {
            if (prev.size === 1 && prev.has(activeSectionId)) return prev;
            return new Set([activeSectionId]);
        });
    }, [pathname, visibleSections, allVisibleHrefs]);

    const toggleSection = (sectionId: string) => {
        setOpenSections((prev) => {
            if (prev.has(sectionId)) {
                return new Set();
            }
            return new Set([sectionId]);
        });
    };

    const loadNavigatorUnits = useCallback(async () => {
        if (!userId) return;

        setIsLoadingUnits(true);
        try {
            const logs = await getNavigatorLogs(userId);
            const now = currentTime;
            const today = new Date(now);
            today.setHours(0, 0, 0, 0);

            const weekStart = new Date(today);
            const dayOfWeek = today.getDay();
            weekStart.setDate(today.getDate() - dayOfWeek);
            weekStart.setHours(0, 0, 0, 0);

            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6);
            weekEnd.setHours(23, 59, 59, 999);

            const todayTotal = logs
                .filter((log) => new Date(log.createdAt) >= today)
                .reduce((sum, log) => sum + log.unitsAdded, 0);

            const weekTotal = logs
                .filter((log) => {
                    const logDate = new Date(log.createdAt);
                    return logDate >= weekStart && logDate <= weekEnd;
                })
                .reduce((sum, log) => sum + log.unitsAdded, 0);

            setTodayUnits(todayTotal);
            setWeekUnits(weekTotal);
        } catch (error) {
            console.error('Error loading navigator units:', error);
            setTodayUnits(0);
            setWeekUnits(0);
        } finally {
            setIsLoadingUnits(false);
        }
    }, [userId, currentTime]);

    useEffect(() => {
        if (userRole === 'navigator' && userId) {
            loadNavigatorUnits();
        }
    }, [userRole, userId, loadNavigatorUnits]);

    const renderNavItem = (item: NavItem, nested = false) => {
        const Icon = item.icon;
        const isActive = isItemActive(pathname, item.href, allVisibleHrefs);
        const isMyHistory = item.label === 'My History' && userRole === 'navigator';

        return (
            <div key={item.href} className={styles.navItemWrapper}>
                <Link
                    href={item.href}
                    className={`${styles.navItem} ${nested ? styles.navItemNested : ''} ${isActive ? styles.active : ''}`}
                    title={isCollapsed ? item.label : undefined}
                >
                    <Icon size={18} className={styles.navIcon} aria-hidden="true" />
                    {!isCollapsed && <span className={styles.navLabel}>{item.label}</span>}
                </Link>
                {isMyHistory && !isCollapsed && (
                    <div className={styles.navigatorStats}>
                        {isLoadingUnits ? (
                            <div className={`${styles.statBadge} ${styles.statLoading}`}>
                                <span>Loading</span>
                                <span className={styles.statValue}>…</span>
                            </div>
                        ) : (
                            <>
                                {todayUnits !== null && (
                                    <div className={styles.statBadge}>
                                        <span>Today</span>
                                        <span className={styles.statValue}>{todayUnits}</span>
                                    </div>
                                )}
                                {weekUnits !== null && (
                                    <div className={styles.statBadge}>
                                        <span>This week</span>
                                        <span className={styles.statValue}>{weekUnits}</span>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <aside className={`${styles.sidebar} ${isCollapsed ? styles.collapsed : ''}`}>
            <div className={styles.header}>
                {!isCollapsed ? (
                    <AppBrand variant="sidebar" className={styles.logo} />
                ) : (
                    <AppBrand variant="sidebarCollapsed" className={styles.logoCollapsed} />
                )}
                <button
                    type="button"
                    onClick={toggle}
                    className={styles.toggleBtn}
                    aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                    {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                </button>
            </div>

            <nav className={styles.nav}>
                {isCollapsed
                    ? flatVisibleItems.map((item) => renderNavItem(item))
                    : visibleSections.map((section) => {
                          const isOpen = openSections.has(section.id);
                          const sectionHasActive = section.items.some((item) =>
                              isItemActive(pathname, item.href, allVisibleHrefs),
                          );
                          const sectionPanelId = `sidebar-section-${section.id}`;

                          return (
                              <div key={section.id} className={styles.navSection}>
                                  <button
                                      type="button"
                                      className={`${styles.sectionHeader} ${sectionHasActive ? styles.sectionHeaderActive : ''}`}
                                      onClick={() => toggleSection(section.id)}
                                      aria-expanded={isOpen}
                                      aria-controls={sectionPanelId}
                                  >
                                      <span className={styles.sectionLabel}>{section.label}</span>
                                      <span className={styles.sectionMeta}>
                                          <span className={styles.sectionCount}>{section.items.length}</span>
                                          <ChevronDown
                                              size={14}
                                              className={`${styles.sectionChevron} ${isOpen ? styles.sectionChevronOpen : ''}`}
                                              aria-hidden="true"
                                          />
                                      </span>
                                  </button>
                                  {isOpen ? (
                                      <div id={sectionPanelId} className={styles.sectionItems}>
                                          {section.items.map((item) => renderNavItem(item, true))}
                                      </div>
                                  ) : null}
                              </div>
                          );
                      })}
            </nav>

            {!isCollapsed && <SidebarActiveOrderSummary />}

            <div className={styles.footer}>
                {!isCollapsed ? (
                    <>
                        <div className={styles.userCard}>
                            <div className={styles.userInfo}>
                                <div className={styles.userName}>{userName}</div>
                                <div className={styles.userRole}>{userRole}</div>
                            </div>
                        </div>
                        <button type="button" onClick={() => logout()} className={styles.signOutBtn}>
                            Sign out
                        </button>
                    </>
                ) : (
                    <div className={styles.userCollapsed} title={userName}>
                        {(userName[0] || 'A').toUpperCase()}
                    </div>
                )}
            </div>
        </aside>
    );
}

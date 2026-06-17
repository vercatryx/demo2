'use client';

import clsx from 'clsx';
import { APP_BRAND_NAME, APP_BRAND_SHORT } from '@/lib/brand';
import styles from './AppBrand.module.css';

export type AppBrandVariant = 'sidebar' | 'sidebarCollapsed' | 'login' | 'compact';

type AppBrandProps = {
  variant?: AppBrandVariant;
  /** Overrides the default subtitle for the variant. Pass null to hide. */
  subtitle?: string | null;
  className?: string;
};

const DEFAULT_SUBTITLES: Record<AppBrandVariant, string | null> = {
  sidebar: 'Admin',
  sidebarCollapsed: null,
  login: 'Admin portal',
  compact: null,
};

export function AppBrand({
  variant = 'sidebar',
  subtitle,
  className,
}: AppBrandProps) {
  if (variant === 'sidebarCollapsed') {
    return (
      <div className={clsx(styles.root, styles.sidebarCollapsed, className)} aria-label={APP_BRAND_NAME}>
        <span className={styles.collapsedLabel}>{APP_BRAND_SHORT}</span>
      </div>
    );
  }

  const resolvedSubtitle =
    subtitle !== undefined ? subtitle : DEFAULT_SUBTITLES[variant];

  return (
    <div className={clsx(styles.root, styles[variant], className)}>
      <div className={styles.copy}>
        <span className={styles.title}>{APP_BRAND_NAME}</span>
        {resolvedSubtitle ? (
          <span className={styles.subtitle}>{resolvedSubtitle}</span>
        ) : null}
      </div>
    </div>
  );
}

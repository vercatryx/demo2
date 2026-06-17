'use client';

import type { ReactNode } from 'react';
import clsx from 'clsx';
import styles from './primitives.module.css';

export function PageHeader({
  title,
  subtitle,
  badge,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('page-header', className)}>
      <div className={styles.pageHeaderMain}>
        <h1 className="page-header__title">
          {title}
          {badge ? <span className={styles.pageHeaderBadge}>{badge}</span> : null}
        </h1>
        {subtitle ? <p className="page-header__subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </div>
  );
}

export function SectionCard({
  title,
  subtitle,
  actions,
  children,
  padded = true,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  padded?: boolean;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={clsx('section-card', className)}>
      {title || subtitle || actions ? (
        <header className="section-card__header">
          <div>
            {title ? <h2 className="section-card__title">{title}</h2> : null}
            {subtitle ? <p className="section-card__subtitle">{subtitle}</p> : null}
          </div>
          {actions ? <div className={styles.sectionCardActions}>{actions}</div> : null}
        </header>
      ) : null}
      <div
        className={clsx(
          padded ? 'section-card__body' : 'section-card__body--flush',
          bodyClassName,
        )}
      >
        {children}
      </div>
    </section>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  inset = false,
}: {
  icon?: ReactNode;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  inset?: boolean;
}) {
  return (
    <div className={clsx('empty-state', inset && styles.emptyStateInset)}>
      <div className="empty-state__icon">{icon ?? <DefaultEmptyIcon />}</div>
      <div className="empty-state__title">{title}</div>
      {body ? <div className="empty-state__body">{body}</div> : null}
      {action ? <div className={styles.emptyStateAction}>{action}</div> : null}
    </div>
  );
}

function DefaultEmptyIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M4 9h16" />
    </svg>
  );
}

export function AlertBox({
  tone,
  children,
}: {
  tone: 'error' | 'success' | 'warning' | 'info';
  children: ReactNode;
}) {
  return (
    <div className={clsx('alert', `alert--${tone}`)} role="alert">
      <span className="alert__dot" aria-hidden="true" />
      <div className={styles.alertContent}>{children}</div>
    </div>
  );
}

type BadgeTone = 'slate' | 'brand' | 'success' | 'danger' | 'warning' | 'info';

export function Badge({
  tone = 'slate',
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={clsx('badge', `badge--${tone}`, className)}>
      {children}
    </span>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  id,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  id?: string;
  disabled?: boolean;
}) {
  const switchId = id ?? `switch-${Math.random().toString(36).slice(2, 9)}`;
  return (
    <label className="switch" htmlFor={switchId}>
      <input
        id={switchId}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch-track" aria-hidden="true" />
      {label ? <span className="switch-label">{label}</span> : null}
    </label>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  variant = 'light',
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  variant?: 'light' | 'dark';
}) {
  return (
    <div className="segmented" role="tablist">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={value === opt.value}
          className={clsx(
            'segmented-item',
            value === opt.value && 'segmented-item--active',
            value === opt.value && variant === 'dark' && 'segmented-item--dark',
          )}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_TONES = [
  styles.avatarRed,
  styles.avatarOrange,
  styles.avatarAmber,
  styles.avatarEmerald,
  styles.avatarTeal,
  styles.avatarSky,
  styles.avatarBlue,
  styles.avatarIndigo,
  styles.avatarViolet,
  styles.avatarRose,
];

export function avatarToneClass(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

export function Avatar({
  name,
  size = 'md',
  square = false,
}: {
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  square?: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      className={clsx(
        styles.avatar,
        styles[`avatar${size.charAt(0).toUpperCase()}${size.slice(1)}`],
        square && styles.avatarSquare,
        avatarToneClass(name),
      )}
    >
      {getInitials(name)}
    </div>
  );
}

export { LoadingIndicator } from './LoadingIndicator';

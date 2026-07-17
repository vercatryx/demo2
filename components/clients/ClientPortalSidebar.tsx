'use client';

import React, { useState, useTransition } from 'react';
import { logout } from '@/lib/auth-actions';
import type { SwitchableClientAccount } from '@/lib/client-portal-account-switch';
import { Mail, Phone, MapPin, Package, CreditCard, LogOut, Users } from 'lucide-react';
import { ClientProfile } from '@/lib/types';
import styles from './ClientPortal.module.css';

interface Props {
    client: ClientProfile;
    /** Effective service type for current order (orderConfig.serviceType ?? client.serviceType). Use this for UI, not client.serviceType. */
    serviceType?: string;
    switchableAccounts?: SwitchableClientAccount[];
    /** Account switching UI is portal v2 only; legacy sidebar never shows the switcher. */
    showAccountSwitcher?: boolean;
    onSwitchAccount?: (targetClientId: string) => Promise<{ success: boolean; message?: string } | void>;
}

export default function ClientPortalSidebar({
    client,
    serviceType: effectiveServiceType,
    switchableAccounts = [],
    showAccountSwitcher = false,
    onSwitchAccount,
}: Props) {
    const serviceType = effectiveServiceType ?? client.serviceType;
    const showAccountSwitcherUi = showAccountSwitcher && switchableAccounts.length > 1;
    const [switchError, setSwitchError] = useState('');
    const [isPending, startTransition] = useTransition();

    const handleAccountSwitch = (targetClientId: string) => {
        if (targetClientId === client.id || isPending || !onSwitchAccount) return;
        setSwitchError('');
        startTransition(async () => {
            try {
                const result = await onSwitchAccount(targetClientId);
                if (result && !result.success) {
                    setSwitchError(result.message || 'Could not switch accounts.');
                }
            } catch (error) {
                if (error instanceof Error && error.message === 'ACCOUNT_SWITCH_CANCELLED') {
                    return;
                }
            }
        });
    };

    return (
        <div className={styles.sidebarColumn} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div className={styles.sidebarInner}>
                {/* Header / Avatar */}
                <div className={styles.sidebarProfile}>
                    <div className={styles.sidebarAvatar}>
                        {client.fullName.charAt(0)}
                    </div>
                    <div className={styles.sidebarProfileText}>
                        <h2 className={styles.sidebarName}>{client.fullName}</h2>
                        <div className={styles.sidebarMeta}>ID: {client.id}</div>
                        <div className={styles.sidebarSubtitle}>Client Portal</div>
                    </div>
                </div>

                {/* Info Sections */}
                <div className={styles.sidebarSections}>

                    {/* Contact Info */}
                    <div className={`section ${styles.sidebarSection}`}>
                        <h3 className={styles.sidebarSectionTitle}>
                            Contact Details
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {client.email && (
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                                    <Mail size={16} style={{ marginTop: '2px', flexShrink: 0 }} />
                                    <span style={{ wordBreak: 'break-all' }}>{client.email}</span>
                                </div>
                            )}
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                                <Phone size={16} style={{ marginTop: '2px', flexShrink: 0 }} />
                                <span>{client.phoneNumber}</span>
                            </div>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                                <MapPin size={16} style={{ marginTop: '2px', flexShrink: 0 }} />
                                <span>{client.address}</span>
                            </div>
                        </div>
                    </div>

                    {/* Service Info */}
                    <div className={`section ${styles.sidebarSection}`}>
                        <h3 className={styles.sidebarSectionTitle}>
                            Service Plan
                        </h3>
                        <div style={{
                            padding: '16px',
                            background: 'var(--bg-app)',
                            borderRadius: '8px',
                            border: '1px solid var(--border-color)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                {serviceType === 'Food' || serviceType === 'Meal' ? <UtensilsIcon /> : <Package size={18} />}
                                <span>{serviceType === 'Meal' ? 'Food' : serviceType} Service</span>
                            </div>

                            {serviceType === 'Food' || serviceType === 'Meal' ? (
                                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <CreditCard size={14} />
                                    <span>Approved: <strong>{client.approvedMealsPerWeek || 0}</strong> meals/week</span>
                                </div>
                            ) : (
                                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <CreditCard size={14} />
                                    <span>Authorized: <strong>{client.approvedMealsPerWeek || 'Standard'}</strong> boxes</span>
                                </div>
                            )}
                        </div>
                    </div>

                </div>
            </div>

            {/* Account switch + Sign out */}
            <div className={styles.sidebarLogout}>
                {showAccountSwitcherUi && (
                    <div className={styles.accountSwitch}>
                        <label htmlFor="portal-account-switch" className={styles.accountSwitchLabel}>
                            <Users size={16} />
                            <span>Switch account</span>
                        </label>
                        <select
                            id="portal-account-switch"
                            className={styles.accountSwitchSelect}
                            value={client.id}
                            disabled={isPending}
                            onChange={(e) => handleAccountSwitch(e.target.value)}
                        >
                            {switchableAccounts.map((account) => (
                                <option key={account.id} value={account.id}>
                                    {account.name}
                                    {account.address ? ` — ${account.address}` : ''}
                                </option>
                            ))}
                        </select>
                        {switchError && (
                            <p className={styles.accountSwitchError} role="alert">{switchError}</p>
                        )}
                    </div>
                )}
                <form action={logout}>
                    <button
                        type="submit"
                        className="btn btn-ghost" // Assuming this class exists, otherwise basic styles
                        style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-start',
                            gap: '12px',
                            padding: '10px 12px',
                            color: 'var(--text-secondary)',
                            borderRadius: '8px',
                            transition: 'all 0.2s',
                            cursor: 'pointer',
                            border: 'none',
                            background: 'transparent',
                            fontSize: '0.95rem'
                        }}
                        onMouseOver={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-app)'; e.currentTarget.style.color = 'var(--color-danger)'; }}
                        onMouseOut={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                    >
                        <LogOut size={18} />
                        <span>Sign Out</span>
                    </button>
                </form>
            </div>
        </div>
    );
}

function UtensilsIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
            <path d="M7 2v20" />
            <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
        </svg>
    )
}

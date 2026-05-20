'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';

/**
 * When a client's status is not Approved, staff must acknowledge the status issue
 * before the client portal UI is shown (clients are blocked entirely on the server).
 */
export function StaffClientPortalStatusAcknowledgement({
    statusLabel,
    clientProfileHref,
    clientDisplayName,
    children,
}: {
    statusLabel: string;
    clientProfileHref: string;
    clientDisplayName?: string;
    children: ReactNode;
}) {
    const [confirmed, setConfirmed] = useState(false);

    if (confirmed) {
        return <>{children}</>;
    }

    return (
        <div
            style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '2rem',
                backgroundColor: 'var(--bg-app)',
            }}
        >
            <div
                style={{
                    maxWidth: 560,
                    padding: 0,
                    backgroundColor: 'var(--bg-surface)',
                    borderRadius: 12,
                    border: '1px solid var(--border-color)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                    overflow: 'hidden',
                }}
            >
                <div
                    role="alert"
                    style={{
                        padding: '1.25rem 1.5rem',
                        backgroundColor: 'var(--color-warning-bg, #fef3c7)',
                        borderBottom: '1px solid var(--border-color)',
                    }}
                >
                    <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)' }}>
                        Client status: {statusLabel}
                    </p>
                    {clientDisplayName ? (
                        <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                            {clientDisplayName}
                        </p>
                    ) : null}
                </div>
                <div style={{ padding: '1.5rem' }}>
                    <p style={{ margin: '0 0 1rem', lineHeight: 1.6, color: 'var(--text-primary)' }}>
                        This client is not Approved. You can still preview the portal, but clients in this status
                        cannot place orders through the portal until their status is updated.
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => setConfirmed(true)}
                        >
                            Continue to portal preview
                        </button>
                        <Link href={clientProfileHref} className="btn btn-secondary">
                            Open client profile
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}

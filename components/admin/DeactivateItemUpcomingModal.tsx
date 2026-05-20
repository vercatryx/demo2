'use client';

import { useState } from 'react';
import {
    stripCatalogItemFromAllClientsUpcomingOrders,
    stripVendorFromAllClientsUpcomingOrders,
} from '@/lib/merge-triangle-actions';
import { X, Loader2, Users } from 'lucide-react';

export type DeactivateStripKind = 'menu' | 'meal' | 'vendor';

export type DeactivateItemUpcomingModalProps = {
    open: boolean;
    onClose: () => void;
    /** Menu item id, meal (breakfast) item id, or vendor id when `kind` is `vendor`. */
    itemId: string;
    itemName: string;
    kind: DeactivateStripKind;
};

/**
 * After deactivating a catalog item or vendor, optionally strip its id from every client's saved upcoming_order JSON.
 */
export function DeactivateItemUpcomingModal({
    open,
    onClose,
    itemId,
    itemName,
    kind,
}: DeactivateItemUpcomingModalProps) {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<{ scanned: number; updated: number } | null>(null);
    const [error, setError] = useState<string | null>(null);

    if (!open) return null;

    const isVendor = kind === 'vendor';
    const kindLabel = isVendor
        ? 'vendor assignment (food, meal, or box)'
        : kind === 'meal'
          ? 'meal selection'
          : 'menu / box';
    const title = isVendor ? 'Vendor deactivated' : 'Item deactivated';
    const resultWhere = isVendor ? 'where this vendor appeared' : 'where this item appeared';

    async function runStrip() {
        setLoading(true);
        setError(null);
        try {
            const res =
                kind === 'vendor'
                    ? await stripVendorFromAllClientsUpcomingOrders(itemId)
                    : await stripCatalogItemFromAllClientsUpcomingOrders(itemId, kind);
            if (!res.success) {
                setError(res.error);
                return;
            }
            setResult({ scanned: res.clientsScanned, updated: res.clientsUpdated });
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Request failed');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.55)',
                zIndex: 10050,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '20px',
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="deactivate-upcoming-title"
        >
            <div
                style={{
                    background: 'var(--bg-surface, #fff)',
                    borderRadius: '10px',
                    maxWidth: '480px',
                    width: '100%',
                    padding: '24px',
                    border: '1px solid var(--border-color, #e5e5e5)',
                    boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                    <h3 id="deactivate-upcoming-title" style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600 }}>
                        {title}
                    </h3>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            padding: 4,
                            color: 'var(--text-secondary, #666)',
                        }}
                        aria-label="Close"
                    >
                        <X size={22} />
                    </button>
                </div>
                <p style={{ margin: '14px 0 0', color: 'var(--text-secondary, #555)', lineHeight: 1.5, fontSize: '0.95rem' }}>
                    <strong>{itemName}</strong> is inactive. Past orders still reference it as stored. If clients still have
                    this {kindLabel} in their <strong>upcoming order</strong> profile, you can clear it everywhere in one
                    step.
                </p>

                {error && (
                    <p style={{ marginTop: '12px', color: 'var(--color-danger, #b91c1c)', fontSize: '0.9rem' }}>{error}</p>
                )}

                {result && (
                    <p style={{ marginTop: '14px', fontSize: '0.95rem', color: 'var(--text-primary, #111)' }}>
                        Scanned <strong>{result.scanned}</strong> client profile(s) with an upcoming order. Updated{' '}
                        <strong>{result.updated}</strong> {resultWhere}.
                    </p>
                )}

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '22px', justifyContent: 'flex-end' }}>
                    <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
                        {result ? 'Done' : 'Skip for now'}
                    </button>
                    {!result && (
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={runStrip}
                            disabled={loading}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                        >
                            {loading ? <Loader2 size={16} className="animate-spin" /> : <Users size={16} />}
                            {loading ? 'Working…' : 'Remove from all upcoming orders'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

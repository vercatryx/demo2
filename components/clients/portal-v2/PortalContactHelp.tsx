'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, MessageCircle, X } from 'lucide-react';
import type { ClientProfile } from '@/lib/types';
import { sendPortalContactMessage } from '@/lib/portal-contact';
import styles from './portal-v2.module.css';

type Props = {
    client: ClientProfile;
    serviceType: string;
};

export function PortalContactHelp({ client, serviceType }: Props) {
    const [open, setOpen] = useState(false);
    const [message, setMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !sending) {
                setOpen(false);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [open, sending]);

    const close = () => {
        if (sending) return;
        setOpen(false);
    };

    const handleOpen = () => {
        setFeedback(null);
        setOpen(true);
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setSending(true);
        setFeedback(null);

        const result = await sendPortalContactMessage({
            clientId: client.id,
            message,
        });

        setSending(false);

        if (result.success) {
            setMessage('');
            setFeedback({
                type: 'success',
                text: 'Thanks — your message was sent. We will get back to you soon.',
            });
            return;
        }

        setFeedback({
            type: 'error',
            text: result.error || 'Could not send your message. Please try again.',
        });
    };

    return (
        <>
            <button
                type="button"
                className={styles.portalV2ContactFab}
                onClick={handleOpen}
                aria-haspopup="dialog"
                aria-expanded={open}
            >
                <MessageCircle size={18} aria-hidden />
                Need any help? Contact us.
            </button>

            {open && (
                <div className={styles.portalV2ContactBackdrop} role="presentation" onClick={close}>
                    <div
                        className={styles.portalV2ContactSheet}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="portal-contact-title"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className={styles.portalV2ContactSheetHeader}>
                            <h2 id="portal-contact-title" className={styles.portalV2ContactSheetTitle}>
                                Contact us
                            </h2>
                            <button
                                type="button"
                                className={styles.portalV2ContactCloseBtn}
                                onClick={close}
                                disabled={sending}
                                aria-label="Close"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <p className={styles.portalV2ContactSheetLead}>
                            Tell us what you need and we&apos;ll email our team. Your details are included automatically.
                        </p>

                        <dl className={styles.portalV2ContactMeta}>
                            <div className={styles.portalV2ContactMetaRow}>
                                <dt>Name</dt>
                                <dd>{client.fullName}</dd>
                            </div>
                            <div className={styles.portalV2ContactMetaRow}>
                                <dt>Client ID</dt>
                                <dd>{client.id}</dd>
                            </div>
                            {client.email ? (
                                <div className={styles.portalV2ContactMetaRow}>
                                    <dt>Email</dt>
                                    <dd>{client.email}</dd>
                                </div>
                            ) : null}
                            {client.phoneNumber ? (
                                <div className={styles.portalV2ContactMetaRow}>
                                    <dt>Phone</dt>
                                    <dd>{client.phoneNumber}</dd>
                                </div>
                            ) : null}
                            <div className={styles.portalV2ContactMetaRow}>
                                <dt>Service</dt>
                                <dd>{serviceType}</dd>
                            </div>
                        </dl>

                        <form className={styles.portalV2ContactForm} onSubmit={handleSubmit}>
                            <label className={styles.portalV2ContactLabel} htmlFor="portal-contact-message">
                                Your message
                            </label>
                            <textarea
                                id="portal-contact-message"
                                className={styles.portalV2ContactTextarea}
                                rows={4}
                                value={message}
                                onChange={(event) => setMessage(event.target.value)}
                                placeholder="How can we help?"
                                required
                                disabled={sending}
                            />

                            {feedback ? (
                                <p
                                    className={
                                        feedback.type === 'success'
                                            ? styles.portalV2ContactFeedbackSuccess
                                            : styles.portalV2ContactFeedbackError
                                    }
                                    role="status"
                                >
                                    {feedback.text}
                                </p>
                            ) : null}

                            <div className={styles.portalV2ContactActions}>
                                <button
                                    type="button"
                                    className={styles.portalV2FoodBoxModalBtnSecondary}
                                    onClick={close}
                                    disabled={sending}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className={styles.portalV2FoodBoxModalBtnPrimary}
                                    disabled={sending || !message.trim()}
                                >
                                    {sending ? (
                                        <>
                                            <Loader2 size={16} className="spin" aria-hidden />
                                            Sending…
                                        </>
                                    ) : (
                                        'Send message'
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}

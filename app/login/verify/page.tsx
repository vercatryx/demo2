'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { verifyOtp } from '@/lib/auth-actions';
import { LoginShell } from '../LoginShell';
import styles from '../page.module.css';

export default function VerifyLoginPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [isVerifying, setIsVerifying] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    useEffect(() => {
        const emailParam = searchParams.get('email');
        const codeParam = searchParams.get('code');

        if (emailParam) {
            setEmail(emailParam);
        }
        if (codeParam) {
            setCode(codeParam);
            if (emailParam) {
                handleVerify(emailParam, codeParam);
            }
        }
    }, [searchParams]);

    const handleVerify = async (emailToVerify: string, codeToVerify: string) => {
        if (!emailToVerify || !codeToVerify) {
            setError('Email and code are required.');
            return;
        }

        setIsVerifying(true);
        setError('');
        setMessage('Verifying code…');

        try {
            const result = await verifyOtp(emailToVerify, codeToVerify);
            if (!result.success) {
                setError(result.message || 'Verification failed. The code may be invalid or expired.');
                setIsVerifying(false);
            } else {
                setMessage('Verification successful. Redirecting…');
            }
        } catch (error: unknown) {
            if (error instanceof Error && error.message !== 'NEXT_REDIRECT') {
                setError('An error occurred during verification.');
                setIsVerifying(false);
            }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await handleVerify(email, code);
    };

    return (
        <LoginShell>
            <div className={styles.card}>
                <header className={styles.cardHeader}>
                    <h2 className={styles.cardTitle}>Verify your login</h2>
                    <p className={styles.cardSubtitle}>
                        Enter the code from your email to complete sign-in.
                    </p>
                </header>

                <form className={styles.form} onSubmit={handleSubmit}>
                    <div className={styles.field}>
                        <label htmlFor="email" className={styles.label}>
                            Email
                        </label>
                        <input
                            id="email"
                            type="email"
                            required
                            className={styles.input}
                            placeholder="you@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            disabled={isVerifying}
                            autoFocus
                        />
                    </div>

                    <div className={styles.field}>
                        <label htmlFor="code" className={styles.label}>
                            Verification code
                        </label>
                        <input
                            id="code"
                            type="text"
                            inputMode="numeric"
                            required
                            className={styles.inputOtp}
                            placeholder="000000"
                            value={code}
                            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            disabled={isVerifying}
                            autoComplete="one-time-code"
                        />
                    </div>

                    {error ? <div className={styles.alertError}>{error}</div> : null}
                    {message && !error ? <div className={styles.alertSuccess}>{message}</div> : null}

                    <button
                        type="submit"
                        disabled={isVerifying || !email || !code}
                        className={styles.submitBtn}
                    >
                        {isVerifying ? (
                            <>
                                <div className={styles.spinner} />
                                Verifying…
                            </>
                        ) : (
                            'Verify & sign in'
                        )}
                    </button>

                    <div className={styles.backLinkWrap}>
                        <button
                            type="button"
                            onClick={() => router.push('/login')}
                            className={styles.textBtn}
                        >
                            Back to sign in
                        </button>
                    </div>
                </form>
            </div>
        </LoginShell>
    );
}

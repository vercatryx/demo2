'use client';

import { useActionState, useState } from 'react';
import { Check } from 'lucide-react';
import {
    login,
    checkLoginIdentity,
    sendOtp,
    verifyOtp,
    confirmLoginWithPick,
    type LoginAccountChoice,
} from '@/lib/auth-actions';
import { LoginShell } from './LoginShell';
import styles from './page.module.css';

type Step = 1 | 2 | 3;

type VerifyOtpClientResult = {
    success: boolean;
    message?: string;
    needsAccountChoice?: boolean;
    accountChoices?: LoginAccountChoice[];
    pickToken?: string;
};

const STEPS = [
    { id: 1, label: 'Identify' },
    { id: 2, label: 'Sign in' },
    { id: 3, label: 'Choose' },
] as const;

function StepIndicator({ step }: { step: Step }) {
    return (
        <div className={styles.stepBar} aria-label="Sign-in progress">
            {STEPS.map((s, index) => {
                const isActive = step === s.id;
                const isDone = step > s.id;
                return (
                    <div key={s.id} className={styles.stepTrack}>
                        {index > 0 && (
                            <span
                                className={`${styles.stepConnector} ${step > s.id - 1 ? styles.stepConnectorDone : ''}`}
                                aria-hidden
                            />
                        )}
                        <div className={styles.stepItem}>
                            <span
                                className={`${styles.stepDot} ${isActive ? styles.stepDotActive : ''} ${isDone ? styles.stepDotDone : ''}`}
                            >
                                {isDone ? <Check size={12} strokeWidth={2.5} /> : s.id}
                            </span>
                            <span className={`${styles.stepLabel} ${isActive ? styles.stepLabelActive : ''}`}>
                                {s.label}
                            </span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export default function LoginPage() {
    const [state, action, isPending] = useActionState(login, undefined);
    const [step, setStep] = useState<Step>(1);
    const [username, setUsername] = useState('');
    const [checkingIdentity, setCheckingIdentity] = useState(false);
    const [identityError, setIdentityError] = useState('');

    const [useOtp, setUseOtp] = useState(false);
    const [otpCode, setOtpCode] = useState('');
    const [verifyingOtp, setVerifyingOtp] = useState(false);
    const [otpMessage, setOtpMessage] = useState('');
    const [resendTimer, setResendTimer] = useState(0);

    const [accountChoices, setAccountChoices] = useState<LoginAccountChoice[]>([]);
    const [pickToken, setPickToken] = useState('');
    const [pickError, setPickError] = useState('');
    const [pickingAccount, setPickingAccount] = useState(false);

    const handleNext = async () => {
        if (!username.trim()) {
            setIdentityError('Please enter a username or email.');
            return;
        }

        setCheckingIdentity(true);
        setIdentityError('');

        try {
            const result = await checkLoginIdentity(username);

            if (result.exists && 'needsAccountChoice' in result && result.needsAccountChoice && result.accountChoices?.length) {
                setAccountChoices(result.accountChoices);
                setUseOtp(true);
                setOtpMessage('Sending security code...');
                const sendResult = await sendOtp(username);
                if (sendResult.success) {
                    setOtpMessage(sendResult.message || `Code sent to ${username.trim()}`);
                    setStep(2);
                    startResendTimer();
                } else {
                    setIdentityError(sendResult.message || 'Failed to send verification code.');
                }
                setCheckingIdentity(false);
                return;
            }

            if (result.exists) {
                if (result.type === 'client' && result.id) {
                    if (result.produceNotAllowed) {
                        setIdentityError('Produce account holders cannot sign in here. Please contact support.');
                        setCheckingIdentity(false);
                        return;
                    }
                    setUseOtp(true);
                    setOtpMessage('Sending security code...');
                    const sendResult = await sendOtp(username);
                    if (sendResult.success) {
                        setOtpMessage(sendResult.message || `Code sent to ${username.trim()}`);
                        setStep(2);
                        startResendTimer();
                    } else {
                        setIdentityError(sendResult.message || 'Failed to send verification code.');
                        setCheckingIdentity(false);
                        return;
                    }
                } else {
                    setUseOtp(false);
                    setStep(2);
                }
                setCheckingIdentity(false);
            } else {
                setIdentityError('No account found with that email, username, or phone number.');
                setCheckingIdentity(false);
            }
        } catch (err) {
            console.error('Identity check error:', err);
            setIdentityError('An error occurred. Please try again.');
            setCheckingIdentity(false);
        }
    };

    const startResendTimer = () => {
        setResendTimer(60);
        const interval = setInterval(() => {
            setResendTimer((prev) => {
                if (prev <= 1) {
                    clearInterval(interval);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    };

    const handleResendOtp = async () => {
        if (resendTimer > 0) return;
        setOtpMessage('Resending code...');
        const result = await sendOtp(username);
        if (result.success) {
            setOtpMessage(result.message || `Code resent to ${username.trim()}`);
            startResendTimer();
        } else {
            setOtpMessage(result.message || 'Failed to resend code.');
        }
    };

    const handleVerifyOtp = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!otpCode) return;

        setVerifyingOtp(true);
        setOtpMessage('');

        try {
            const result = (await verifyOtp(username, otpCode)) as VerifyOtpClientResult;
            if (result.needsAccountChoice && result.pickToken && result.accountChoices?.length) {
                setAccountChoices(result.accountChoices);
                setPickToken(result.pickToken);
                setPickError('');
                setStep(3);
                setVerifyingOtp(false);
                return;
            }
            if (!result.success) {
                setOtpMessage(result.message || 'Verification failed.');
                setVerifyingOtp(false);
            }
        } catch {
            // redirect throws
        }
    };

    const handlePickAccount = async (choice: LoginAccountChoice) => {
        if (!pickToken) return;
        setPickError('');
        setPickingAccount(true);
        try {
            const r = await confirmLoginWithPick(pickToken, { type: choice.type, id: choice.id });
            if (!r.success) {
                setPickError(r.message || 'Could not open that account.');
            }
        } catch {
            // redirect
        } finally {
            setPickingAccount(false);
        }
    };

    const handleBack = () => {
        if (step === 3) {
            setStep(1);
            setIdentityError('Start again: enter your email or phone number and request a new code.');
            setOtpCode('');
            setOtpMessage('');
            setUseOtp(false);
            setAccountChoices([]);
            setPickToken('');
            setPickError('');
            return;
        }
        setStep(1);
        setIdentityError('');
        setOtpCode('');
        setOtpMessage('');
        setUseOtp(false);
        setAccountChoices([]);
        setPickToken('');
        setPickError('');
    };

    const cardTitle =
        step === 1
            ? 'Sign in'
            : step === 2
              ? useOtp
                  ? 'Enter your code'
                  : 'Enter password'
              : 'Choose account';

    const cardSubtitle =
        step === 1
            ? 'Use your email, username, or mobile number to continue.'
            : step === 2 && useOtp
              ? `We sent a 6-digit code to ${username.trim() || 'your contact'}.`
              : step === 2
                ? 'Enter the password for your account.'
                : 'This contact is linked to more than one account.';

    const showOtpError =
        useOtp &&
        step === 2 &&
        otpMessage &&
        !otpMessage.includes('sent') &&
        !otpMessage.includes('Resend') &&
        !otpMessage.includes('Resending');

    return (
        <LoginShell>
            <StepIndicator step={step} />

            <div className={styles.card}>
                <header className={styles.cardHeader}>
                    <h2 className={styles.cardTitle}>{cardTitle}</h2>
                    {cardSubtitle ? <p className={styles.cardSubtitle}>{cardSubtitle}</p> : null}
                </header>

                {step !== 3 ? (
                    <form
                        className={styles.form}
                        action={useOtp ? () => {} : action}
                        onSubmit={useOtp ? handleVerifyOtp : undefined}
                    >
                        {step === 1 && (
                            <div className={styles.field}>
                                <label htmlFor="username" className={styles.label}>
                                    Username, email, or mobile number
                                </label>
                                <input
                                    id="username"
                                    name="username"
                                    type="text"
                                    required
                                    className={styles.input}
                                    placeholder="you@example.com"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleNext();
                                        }
                                    }}
                                    disabled={checkingIdentity}
                                    autoFocus
                                />
                                {identityError ? (
                                    <div className={styles.alertError}>{identityError}</div>
                                ) : null}
                            </div>
                        )}

                        {step === 2 && (
                            <>
                                <div className={styles.identityChip}>
                                    <span className={styles.identityText}>{username}</span>
                                    <button type="button" onClick={handleBack} className={styles.textBtn}>
                                        Change
                                    </button>
                                </div>
                                <input type="hidden" name="username" value={username} />

                                {useOtp ? (
                                    <div className={styles.field}>
                                        <label htmlFor="otp" className={styles.label}>
                                            Security code
                                        </label>
                                        <input
                                            id="otp"
                                            name="otpCode"
                                            type="text"
                                            inputMode="numeric"
                                            required
                                            className={styles.inputOtp}
                                            placeholder="000000"
                                            value={otpCode}
                                            onChange={(e) =>
                                                setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                                            }
                                            autoFocus
                                            autoComplete="one-time-code"
                                        />
                                        <div className={styles.resendRow}>
                                            <span className={styles.resendHint}>{otpMessage}</span>
                                            {resendTimer > 0 ? (
                                                <span>Resend in {resendTimer}s</span>
                                            ) : (
                                                <button type="button" onClick={handleResendOtp} className={styles.textBtn}>
                                                    Resend code
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className={styles.field}>
                                        <label htmlFor="password" className={styles.label}>
                                            Password
                                        </label>
                                        <input
                                            id="password"
                                            name="password"
                                            type="password"
                                            required
                                            className={styles.input}
                                            placeholder="Enter your password"
                                            autoFocus
                                        />
                                    </div>
                                )}
                            </>
                        )}

                        {!useOtp && step === 2 && state?.message ? (
                            <div className={styles.alertError}>{state.message}</div>
                        ) : null}

                        {showOtpError ? <div className={styles.alertError}>{otpMessage}</div> : null}

                        {step === 1 ? (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    handleNext();
                                }}
                                disabled={checkingIdentity}
                                className={styles.submitBtn}
                            >
                                {checkingIdentity ? (
                                    <>
                                        <div className={styles.spinner} />
                                        Checking…
                                    </>
                                ) : (
                                    'Continue'
                                )}
                            </button>
                        ) : (
                            <button type="submit" disabled={isPending || verifyingOtp} className={styles.submitBtn}>
                                {isPending || verifyingOtp ? (
                                    <>
                                        <div className={styles.spinner} />
                                        {useOtp ? 'Verifying…' : 'Signing in…'}
                                    </>
                                ) : useOtp ? (
                                    'Verify & sign in'
                                ) : (
                                    'Sign in'
                                )}
                            </button>
                        )}
                    </form>
                ) : (
                    <div className={styles.form}>
                        <div className={styles.identityChip}>
                            <span className={styles.identityText}>{username}</span>
                            <button type="button" onClick={handleBack} className={styles.textBtn}>
                                Start over
                            </button>
                        </div>
                        <p className={styles.chooseHint}>Select the account you want to open.</p>
                        <div className={styles.accountList}>
                            {accountChoices.map((c) => (
                                <button
                                    key={`${c.type}-${c.id}`}
                                    type="button"
                                    className={styles.accountBtn}
                                    disabled={pickingAccount}
                                    onClick={() => handlePickAccount(c)}
                                >
                                    <span className={styles.accountTitle}>{c.title}</span>
                                    {c.subtitle ? (
                                        <span className={styles.accountSubtitle}>{c.subtitle}</span>
                                    ) : null}
                                </button>
                            ))}
                        </div>
                        {pickError ? <div className={styles.alertError}>{pickError}</div> : null}
                        {identityError ? <div className={styles.alertError}>{identityError}</div> : null}
                    </div>
                )}
            </div>
        </LoginShell>
    );
}

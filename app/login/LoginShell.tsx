import Image from 'next/image';
import { ClipboardList, Lock, Users, Truck } from 'lucide-react';
import { APP_BRAND_NAME } from '@/lib/brand';
import styles from './page.module.css';

/** New filename avoids stale browser / CDN cache from the old Mario image. */
const DELIVERY_HERO = '/images/login-meal-delivery.jpg';
const POEL_LOGO = '/images/poel-logo.png';

export function LoginShell({ children }: { children: React.ReactNode }) {
    return (
        <div className={styles.page}>
            <main className={styles.formPanel}>
                <div className={styles.mobileHero} aria-hidden="true">
                    <Image
                        src={DELIVERY_HERO}
                        alt=""
                        fill
                        sizes="100vw"
                        className={styles.mobileHeroImage}
                        unoptimized
                    />
                    <div className={styles.mobileHeroOverlay} />
                    <p className={styles.mobileHeroCaption}>
                        Poel AI demo for the SCN program — client meals, routes &amp; billing
                    </p>
                </div>

                <div className={styles.formInner}>
                    <div className={styles.formBrand}>
                        <img
                            src="/app-brand-mark.svg"
                            alt=""
                            className={styles.formBrandMark}
                            width={36}
                            height={36}
                        />
                        <div>
                            <p className={styles.formBrandName}>{APP_BRAND_NAME}</p>
                            <p className={styles.formBrandSub}>Poel AI · SCN demo</p>
                        </div>
                    </div>
                    <div className={styles.mobileBrand}>
                        <img
                            src="/app-brand-mark.svg"
                            alt=""
                            className={styles.mobileBrandMark}
                            width={40}
                            height={40}
                        />
                        <div>
                            <p className={styles.mobileBrandName}>{APP_BRAND_NAME}</p>
                            <p className={styles.mobileBrandSub}>Poel AI · SCN demo</p>
                        </div>
                    </div>
                    {children}
                    <p className={styles.formFooter}>
                        <span className={styles.formFooterLine}>
                            <Lock size={13} strokeWidth={2} />
                            Protected by secure authentication
                        </span>
                        <span className={styles.formFooterPoel}>
                            Demo by
                            <Image
                                src={POEL_LOGO}
                                alt="Poel AI"
                                width={52}
                                height={58}
                                className={styles.formFooterPoelLogo}
                            />
                        </span>
                    </p>
                </div>
            </main>

            <aside className={styles.brandPanel}>
                <div className={styles.brandMedia} aria-hidden="true">
                    <Image
                        src={DELIVERY_HERO}
                        alt=""
                        fill
                        priority
                        sizes="(min-width: 960px) 66vw, 100vw"
                        className={styles.brandPhoto}
                        unoptimized
                    />
                    <div className={styles.brandOverlay} />
                    <div className={styles.brandGlow} />
                </div>

                <div className={styles.brandInner}>
                    <div className={styles.brandHeader}>
                        <div className={styles.poelLogoWrap}>
                            <Image
                                src={POEL_LOGO}
                                alt="Poel AI"
                                width={88}
                                height={99}
                                priority
                                className={styles.poelLogo}
                            />
                        </div>
                        <div className={styles.brandBadge}>SCN program demo</div>
                    </div>

                    <div className={styles.brandContent}>
                        <div className={styles.brandIntro}>
                            <h1 className={styles.brandName}>{APP_BRAND_NAME}</h1>
                            <p className={styles.brandTagline}>
                                This interactive demo shows what the platform can do for SCN food programs —
                                manage clients, meal plans, vendor orders, delivery routes, and billing in one
                                place.
                            </p>
                        </div>

                        <ul className={styles.featureList}>
                            <li className={styles.featureItem}>
                                <span className={styles.featureIcon}>
                                    <Users size={18} strokeWidth={2} />
                                </span>
                                <div className={styles.featureCopy}>
                                    <strong>Client & caseload management</strong>
                                    <span>Profiles, screenings, statuses, and meal plan edits</span>
                                </div>
                            </li>
                            <li className={styles.featureItem}>
                                <span className={styles.featureIcon}>
                                    <Truck size={18} strokeWidth={2} />
                                </span>
                                <div className={styles.featureCopy}>
                                    <strong>Delivery operations</strong>
                                    <span>Routes, drivers, vendor sheets, and proof of delivery</span>
                                </div>
                            </li>
                            <li className={styles.featureItem}>
                                <span className={styles.featureIcon}>
                                    <ClipboardList size={18} strokeWidth={2} />
                                </span>
                                <div className={styles.featureCopy}>
                                    <strong>Orders, billing & admin</strong>
                                    <span>Invoices, missing orders, messaging, and permissions</span>
                                </div>
                            </li>
                        </ul>
                    </div>

                    <div className={styles.brandFooter}>
                        <Image
                            src={POEL_LOGO}
                            alt=""
                            width={40}
                            height={45}
                            className={styles.brandFooterLogo}
                            aria-hidden
                        />
                        <span>
                            Interactive demo by <strong>Poel AI</strong> for the SCN program · Sample data
                            only
                        </span>
                    </div>
                </div>
            </aside>
        </div>
    );
}

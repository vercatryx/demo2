'use client';

import { forwardRef } from 'react';
import type { ClientInvoiceApiPayload } from '@/lib/invoice/build-client-invoice-payload';
import { formatInvoiceMoney, getClientInvoiceFixedLine } from '@/lib/invoice/build-client-invoice-payload';
import { APP_BRAND_NAME, APP_LOGO_PATH } from '@/lib/brand';
import {
    INVOICE_ORG_ADDRESS_INLINE,
    INVOICE_ORG_SUPPORT,
    invoiceOrgContactOneLine,
    invoiceOrgFooterTagline,
} from '@/lib/invoice/invoice-org-footer';
import styles from './invoice-receipt.module.css';

/** Body rows so the sheet reads as a full A4 page before PDF scaling. */
const MIN_TABLE_BODY_ROWS = 34;

type Props = {
    invoice: ClientInvoiceApiPayload;
};

export const InvoiceReceipt = forwardRef<HTMLDivElement, Props>(function InvoiceReceipt({ invoice }, ref) {
    const footerLine = invoiceOrgFooterTagline();
    const padCount = Math.max(0, MIN_TABLE_BODY_ROWS - 1);
    const accountRef = invoice.clientId.slice(0, 8).toUpperCase();
    const fixedLine =
        invoice.invoiceFixedLine ??
        getClientInvoiceFixedLine(invoice.produceInvoice === true, invoice.householdMemberCount ?? 1);

    return (
        <div className={styles.receiptA4Frame}>
            <div ref={ref} className={styles.printSheet}>
                <article className={styles.receipt}>
                    <header className={styles.receiptHeader}>
                        <div className={styles.headerTop}>
                            <div className={styles.brand}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={APP_LOGO_PATH} alt={APP_BRAND_NAME} className={styles.logo} />
                            </div>
                            <div className={styles.headerTitles}>
                                <h1 className={styles.docTitle}>Invoice</h1>
                            </div>
                        </div>
                    </header>

                    <div className={styles.metaRow}>
                        <div className={styles.combinedBillingBox}>
                            <div className={styles.billingBlock}>
                                <div className={styles.blockLabel}>Billing period</div>
                                <div className={styles.blockValue}>{invoice.periodLabel}</div>
                            </div>
                            <div className={styles.boxDivider} aria-hidden="true" />
                            <div className={styles.billingBlock}>
                                <div className={styles.blockLabel}>Delivery date</div>
                                <div className={styles.blockValue}>{invoice.deliveryDateFormatted}</div>
                            </div>
                        </div>
                        <aside className={styles.deliverySide}>
                            <div className={styles.deliverySideTitle}>Account</div>
                            <div className={styles.deliveryName}>Ref. {accountRef}</div>
                            <div className={styles.deliveryAddressMuted}>
                                Household size: {Math.max(1, invoice.householdMemberCount ?? 1)} member
                                {(invoice.householdMemberCount ?? 1) !== 1 ? 's' : ''}
                            </div>
                            <div className={styles.deliveryAddressMuted} style={{ marginTop: '0.5rem' }}>
                                Name, address, and phone are omitted on demo invoices.
                            </div>
                        </aside>
                    </div>

                    {invoice.warnings.length > 0 ? (
                        <ul className={styles.warnings}>
                            {invoice.warnings.map((w, i) => (
                                <li key={i}>{w}</li>
                            ))}
                        </ul>
                    ) : null}

                    <div className={styles.tableWrap}>
                        <table className={styles.lineTable}>
                            <thead>
                                <tr>
                                    <th className={styles.colNum}>#</th>
                                    <th>Item</th>
                                    <th className={styles.colMoney}>Unit price</th>
                                    <th className={styles.colQty}>Qty</th>
                                    <th className={styles.colMoney}>Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td className={styles.colNum}>1</td>
                                    <td>{fixedLine.description}</td>
                                    <td className={styles.colMoney}>{formatInvoiceMoney(fixedLine.unitPriceUsd)}</td>
                                    <td className={styles.colQty}>{fixedLine.quantity}</td>
                                    <td className={styles.colMoney}>{formatInvoiceMoney(fixedLine.lineTotalUsd)}</td>
                                </tr>
                                {Array.from({ length: padCount }).map((_, i) => (
                                    <tr key={`pad-${i}`} className={styles.padRow}>
                                        <td className={styles.colNum} />
                                        <td />
                                        <td className={styles.colMoney} />
                                        <td className={styles.colQty} />
                                        <td className={styles.colMoney} />
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className={styles.totalRow}>
                                    <td colSpan={4} className={styles.totalLabel}>
                                        Invoice total
                                    </td>
                                    <td className={styles.colMoney}>{formatInvoiceMoney(fixedLine.lineTotalUsd)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    <footer className={styles.receiptFooter}>
                        <p className={styles.footerBrand}>{footerLine}</p>
                        <p className={styles.footerOrgOneLine} aria-label={invoiceOrgContactOneLine()}>
                            <span className={styles.footerOrgPlain}>{INVOICE_ORG_ADDRESS_INLINE}</span>
                            <span className={styles.footerOrgPipe} aria-hidden="true">
                                |
                            </span>
                            <a className={styles.footerOrgLink} href={`mailto:${INVOICE_ORG_SUPPORT.email}`}>
                                {INVOICE_ORG_SUPPORT.email}
                            </a>
                            <span className={styles.footerOrgPipe} aria-hidden="true">
                                |
                            </span>
                            <a className={styles.footerOrgLink} href={`tel:${INVOICE_ORG_SUPPORT.phoneTel}`}>
                                {INVOICE_ORG_SUPPORT.phoneDisplay}
                            </a>
                        </p>
                    </footer>
                </article>
            </div>
        </div>
    );
});

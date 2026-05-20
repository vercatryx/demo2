/**
 * Vendor contact on client invoices (HTML receipt + server PDF).
 * Override via NEXT_PUBLIC_INVOICE_ORG_* in .env.local (see .env.example).
 */

import { APP_BRAND_NAME } from '@/lib/brand';

function env(key: string): string | undefined {
    const v = process.env[key]?.trim();
    return v || undefined;
}

/** Single-line mailing address on invoice footer */
export const INVOICE_ORG_ADDRESS_INLINE =
    env('NEXT_PUBLIC_INVOICE_ORG_ADDRESS') ?? '44 S Main St, New City, NY 10956';

export const INVOICE_ORG_SUPPORT = {
    email: env('NEXT_PUBLIC_INVOICE_ORG_EMAIL') ?? 'support@clientfoodservice.com',
    /** E.164 for tel: links */
    phoneTel: env('NEXT_PUBLIC_INVOICE_ORG_PHONE_TEL') ?? '+18454786605',
    phoneDisplay: env('NEXT_PUBLIC_INVOICE_ORG_PHONE_DISPLAY') ?? '(845) 478-6605',
} as const;

/** Tagline above the contact line (HTML + PDF). */
export function invoiceOrgFooterTagline(): string {
    return env('NEXT_PUBLIC_INVOICE_ORG_FOOTER_LINE') ?? `Thank you for your business. — ${APP_BRAND_NAME}`;
}

const SEP = ' | ';

/** Single line: `address | email | phone` */
export function invoiceOrgContactOneLine(): string {
    return `${INVOICE_ORG_ADDRESS_INLINE}${SEP}${INVOICE_ORG_SUPPORT.email}${SEP}${INVOICE_ORG_SUPPORT.phoneDisplay}`;
}

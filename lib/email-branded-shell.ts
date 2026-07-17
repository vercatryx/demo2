/** Same asset as `components/Sidebar.tsx` and login — `next/image` src `/mainLogo.jpg`. */
export const ADMIN_BRAND_LOGO_PATH = '/mainLogo.jpg';

/**
 * Absolute base URL for `/public` assets in outgoing mail (images must be fully qualified).
 * Override with EMAIL_BRANDING_BASE_URL if the app URL differs from where static files are served.
 */
export function getPublicSiteBaseUrl(): string {
    const explicit = process.env.EMAIL_BRANDING_BASE_URL?.trim();
    if (explicit) return explicit.replace(/\/$/, '');

    let baseUrl =
        process.env.APP_URL ||
        process.env.SITE_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        (process.env.NEXT_PUBLIC_VERCEL_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` : '');
    if (!baseUrl) baseUrl = 'http://localhost:3000';
    return baseUrl.replace(/\/$/, '');
}

export function getBrandedEmailLogoSrc(): string {
    const baseUrl = getPublicSiteBaseUrl();
    const logoOverride = process.env.CLIENT_STATUS_EMAIL_LOGO_URL?.trim();
    return logoOverride || `${baseUrl}${ADMIN_BRAND_LOGO_PATH}`;
}

export function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export type BrandedEmailShellOptions = {
    bodyHtml: string;
    logoSrc?: string;
    logoAlt?: string;
    /** When true, logo is centered in the header (mass messaging). Default false (left-aligned). */
    centerLogo?: boolean;
};

const BODY_PARAGRAPH_STYLE =
    'margin:0 0 16px 0;color:#1e293b;font-family:Georgia,\'Times New Roman\',Times,serif;font-size:16px;line-height:1.65;';

/** Table-based layout for broad email client support; header uses hosted logo image. */
export function buildBrandedEmailShell(opts: BrandedEmailShellOptions): string {
    const logoSrc = opts.logoSrc ?? getBrandedEmailLogoSrc();
    const logoAlt = opts.logoAlt ?? 'Logo';
    const centerLogo = opts.centerLogo ?? false;
    const logoAlign = centerLogo ? 'center' : 'left';
    const logoMargin = centerLogo ? '0 auto' : '0';

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background-color:#e8eef4;-webkit-text-size-adjust:100%;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#e8eef4;margin:0;padding:24px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;border-collapse:collapse;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(12,35,64,0.12);">
        <tr>
          <td style="padding:20px 28px 18px 28px;line-height:0;background-color:#ffffff;text-align:${logoAlign};border-bottom:1px solid #e5e7eb;">
            <img src="${escapeHtml(logoSrc)}" alt="${escapeHtml(logoAlt)}" width="240" height="240" style="display:block;max-width:220px;width:100%;height:auto;margin:${logoMargin};border:0;outline:none;text-decoration:none;">
          </td>
        </tr>
        <tr>
          <td style="padding:0;height:5px;background-color:#d4af37;font-size:0;line-height:0;">&nbsp;</td>
        </tr>
        <tr>
          <td style="padding:32px 36px 28px 36px;font-family:Georgia,'Times New Roman',Times,serif;font-size:16px;line-height:1.65;color:#1e293b;background-color:#ffffff;">
            ${opts.bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 36px;background-color:#f1f5f9;border-top:1px solid #e2e8f0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#64748b;text-align:center;">
            Triangle Square · SCN Program · <a href="tel:+18459351870" style="color:#0c2340;text-decoration:none;">845-935-1870</a>
          </td>
        </tr>
      </table>
      <p style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#94a3b8;margin:16px 0 0 0;text-align:center;">This message was sent automatically. Please do not reply directly to this email.</p>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/** Wrap plain paragraphs in styled `<p>` tags for branded emails. */
export function brandedParagraph(html: string): string {
    return `<p style="${BODY_PARAGRAPH_STYLE}">${html}</p>`;
}

export function brandedPhoneParagraph(): string {
    return `<p style="margin:0 0 24px 0;color:#1e293b;">If you have any questions or would like further clarification, please feel free to call our office at <a href="tel:+18459351870" style="color:#0c2340;font-weight:bold;text-decoration:none;">845-935-1870</a>.</p>`;
}

export function brandedSignoff(): string {
    return `<p style="margin:0 0 8px 0;color:#1e293b;">Thank you.</p><p style="margin:0;font-weight:bold;color:#0c2340;">The Triangle Square Team</p>`;
}

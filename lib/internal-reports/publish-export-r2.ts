import { randomBytes } from 'crypto';
import { uploadFile } from '@/lib/storage';

function isR2Configured(): boolean {
    return Boolean(
        process.env.R2_ACCOUNT_ID?.trim() &&
            process.env.R2_ACCESS_KEY_ID?.trim() &&
            process.env.R2_SECRET_ACCESS_KEY?.trim() &&
            process.env.R2_BUCKET_NAME?.trim() &&
            process.env.NEXT_PUBLIC_R2_DOMAIN?.trim()
    );
}

/**
 * Uploads the workbook to R2 and returns a public HTTPS URL.
 * Use this so downloads work across Vercel / multi-instance (in-memory or /tmp alone does not).
 */
export async function tryPublishXlsxPublicUrl(buffer: Buffer, displayFileName: string): Promise<string | null> {
    if (!isR2Configured()) return null;
    const domain = process.env.NEXT_PUBLIC_R2_DOMAIN!.trim();
    const raw = (displayFileName || 'export.xlsx').trim();
    const baseName = raw.replace(/\.xlsx$/i, '').trim() || 'export';
    /** URL-safe slug; human-readable part first so browser “Save as” defaults stay readable (not random-id-prefix). */
    const safeBase = baseName
        .replace(/[^\w.-]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 92);
    const uniq = randomBytes(5).toString('hex');
    const key = `internal-reports/${new Date().toISOString().slice(0, 10)}/${safeBase || 'export'}-${uniq}.xlsx`;
    try {
        await uploadFile(key, buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    } catch (e) {
        console.error('[internal-reports] R2 upload failed, falling back to token download', e);
        return null;
    }
    const base = domain.replace(/\/$/, '');
    return base.startsWith('http') ? `${base}/${key}` : `https://${base}/${key}`;
}

'use server';

/**
 * Demo build: outbound email is disabled.
 */
interface EmailOptions {
    to: string;
    subject: string;
    html: string;
    text?: string;
    /** Ignored in this demo build (email is disabled) — accepted so callers type-check. */
    attachments?: { filename: string; content: string; contentType?: string }[];
}

export async function sendEmail(
    _options: EmailOptions
): Promise<{ success: false; error: string }> {
    return { success: false, error: 'Email is disabled in this demo environment.' };
}

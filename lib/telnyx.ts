/** Demo build: outbound SMS is disabled. */

export async function sendSms(
    _to: string,
    _body: string,
    _opts?: { messageType?: string; clientId?: string; clientName?: string }
): Promise<{ success: false; error: string }> {
    return { success: false, error: 'SMS is disabled in this demo environment.' };
}

export function formatDeliveryTimestamp(date: Date): string {
    return date.toLocaleString('en-US', { timeZone: 'America/New_York' });
}

export async function sendSmsToClient(
    _client: { phone_number?: string | null; secondary_phone_number?: string | null },
    _message: string
): Promise<void> {
    // no-op in demo
}

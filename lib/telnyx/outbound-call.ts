/**
 * Outbound Call Control dials (announcement / mass voice).
 * Uses the same Call Control app + webhook as inbound keypad IVR.
 */

import { getCallControlAppId, getOutboundCallFrom, getOutboundVoiceWebhookUrl } from '@/lib/telnyx/line-config';
import {
    attachCallControlIdToPending,
    savePendingOutboundCall,
} from '@/lib/telnyx/outbound-call-pending';
import { toE164US } from '@/lib/telnyx/send-sms';

const TELNYX_API = 'https://api.telnyx.com/v2';

function parseTelnyxDialError(raw: string, status: number): string {
    try {
        const json = JSON.parse(raw) as {
            errors?: Array<{ detail?: string; code?: string | number }>;
            telnyx_error?: { error_code?: string };
        };
        const detail = json.errors?.[0]?.detail ?? '';
        const code = json.telnyx_error?.error_code ?? String(json.errors?.[0]?.code ?? '');
        if (code === 'D38' || /outbound profile/i.test(detail)) {
            return (
                'Outbound voice is not enabled on the Call Control app. In Telnyx Mission Control, ' +
                'create an Outbound Voice Profile (whitelist US), add your Call Control application to it, ' +
                'then retry.'
            );
        }
        if (detail) return detail;
    } catch {
        // fall through
    }
    return raw || `Outbound call failed (${status})`;
}

export type OutboundCallClientState = {
    mode: 'outbound_announce';
    script: string;
    clientId?: string;
    pendingId?: string;
};

export function encodeOutboundCallState(state: OutboundCallClientState): string {
    return Buffer.from(JSON.stringify(state), 'utf8').toString('base64');
}

export function decodeOutboundCallState(raw: string | null | undefined): OutboundCallClientState | null {
    if (!raw?.trim()) return null;
    try {
        const json = Buffer.from(raw, 'base64').toString('utf8');
        const parsed = JSON.parse(json) as OutboundCallClientState;
        if (parsed?.mode === 'outbound_announce' && typeof parsed.script === 'string') {
            return parsed;
        }
    } catch {
        // not our payload — likely IVR session
    }
    return null;
}

export type DialOutboundResult =
    | { success: true; callControlId: string | null; webhookUrl: string }
    | { success: false; error: string };

export async function dialOutboundAnnouncement(params: {
    to: string;
    script: string;
    clientId?: string;
}): Promise<DialOutboundResult> {
    const apiKey = process.env.TELNYX_API_KEY?.trim();
    if (!apiKey) {
        return { success: false, error: 'Voice credentials are not configured' };
    }

    const appId = getCallControlAppId();
    if (!appId) {
        return { success: false, error: 'Voice app is not configured' };
    }

    const from = getOutboundCallFrom();
    const to = params.to.includes('+') ? params.to : toE164US(params.to);
    const script = params.script.slice(0, 3000);
    const pendingId = await savePendingOutboundCall({
        toE164: to,
        fromE164: from,
        script,
        clientId: params.clientId,
    });
    const clientState = encodeOutboundCallState({
        mode: 'outbound_announce',
        script,
        clientId: params.clientId,
        pendingId: pendingId ?? undefined,
    });
    const webhookUrl = getOutboundVoiceWebhookUrl();

    try {
        const body: Record<string, string> = {
            from,
            to,
            connection_id: appId,
            client_state: clientState,
            webhook_url: webhookUrl,
            webhook_url_method: 'POST',
        };

        console.log('[telnyx:outbound-call] dial', {
            toLast4: to.slice(-4),
            webhookUrl,
            appIdLast4: appId.slice(-4),
        });

        const res = await fetch(`${TELNYX_API}/calls`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${apiKey}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        const text = await res.text().catch(() => '');
        const json = (() => {
            try {
                return JSON.parse(text) as {
                    data?: { call_control_id?: string };
                    errors?: Array<{ detail?: string }>;
                    telnyx_error?: { error_code?: string };
                };
            } catch {
                return null;
            }
        })();

        if (!res.ok || json?.errors?.length) {
            return {
                success: false,
                error: parseTelnyxDialError(text, res.status),
            };
        }

        const callControlId = json?.data?.call_control_id ?? null;
        if (pendingId && callControlId) {
            await attachCallControlIdToPending({ pendingId, callControlId });
        }

        return { success: true, callControlId, webhookUrl };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'Dial failed' };
    }
}

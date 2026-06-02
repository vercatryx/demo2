import { decodeOutboundCallState } from '@/lib/telnyx/outbound-call';
import {
    attachCallControlIdToPending,
    deletePendingOutboundCall,
    loadPendingOutboundCall,
    type PendingOutboundCall,
} from '@/lib/telnyx/outbound-call-pending';
import { hangupCall, speakText } from '@/lib/telnyx-voice';

const LOG = '[telnyx:outbound-voice]';

const OUTBOUND_VOICE_EVENTS = new Set([
    'call.initiated',
    'call.answered',
    'call.speak.ended',
    'call.speak.failed',
    'call.speak.started',
    'call.hangup',
]);

function isPendingRowId(id: string): boolean {
    return /^[0-9a-f-]{36}$/i.test(id);
}

function isOutboundDirection(direction: string | undefined): boolean {
    const d = (direction ?? '').trim().toLowerCase();
    return d === 'outgoing' || d === 'outbound';
}

async function clearPendingOutbound(pendingId: string | undefined): Promise<void> {
    if (pendingId && isPendingRowId(pendingId)) {
        await deletePendingOutboundCall(pendingId);
    }
}

async function resolveOutboundAnnounce(params: {
    clientState: string | undefined;
    callControlId: string;
    toE164: string;
}): Promise<(PendingOutboundCall & { source: 'client_state' | 'pending_db' }) | null> {
    const fromState = decodeOutboundCallState(params.clientState);
    if (fromState) {
        return {
            source: 'client_state',
            pendingId: fromState.pendingId ?? 'client_state',
            script: fromState.script,
            clientId: fromState.clientId,
        };
    }

    const pending = await loadPendingOutboundCall({
        callControlId: params.callControlId,
        toE164: params.toE164,
    });
    if (!pending) return null;
    return { ...pending, source: 'pending_db' };
}

export function isOutboundAnnounceEvent(
    evt: string,
    direction: string | undefined,
    clientState: string | undefined,
): boolean {
    if (!OUTBOUND_VOICE_EVENTS.has(evt)) return false;
    if (isOutboundDirection(direction)) return true;
    return decodeOutboundCallState(clientState) != null;
}

export async function handleOutboundAnnounceWebhook(params: {
    evt: string;
    callControlId: string;
    clientState?: string;
    toE164: string;
}): Promise<{ handled: true; action: string; ok?: boolean; error?: string } | { handled: false }> {
    const outbound = await resolveOutboundAnnounce({
        clientState: params.clientState,
        callControlId: params.callControlId,
        toE164: params.toE164,
    });
    if (!outbound) {
        return { handled: false };
    }

    const { evt, callControlId } = params;

    if (evt === 'call.initiated') {
        if (isPendingRowId(outbound.pendingId)) {
            await attachCallControlIdToPending({
                pendingId: outbound.pendingId,
                callControlId,
            });
        }
        console.log(LOG, 'outbound initiated', {
            scriptChars: outbound.script.length,
            source: outbound.source,
        });
        return { handled: true, action: 'outbound_initiated' };
    }

    if (evt === 'call.answered') {
        const speak = await speakText(callControlId, outbound.script, { voice: 'female' });
        if (!speak.ok) {
            console.error(LOG, 'outbound speak failed', speak.error);
            await clearPendingOutbound(outbound.pendingId);
            await hangupCall(callControlId);
            return { handled: true, action: 'outbound_speak_failed', ok: false, error: speak.error };
        }
        console.log(LOG, 'outbound speak started', {
            scriptChars: outbound.script.length,
            source: outbound.source,
        });
        return { handled: true, action: 'outbound_speak' };
    }

    if (evt === 'call.speak.ended') {
        await clearPendingOutbound(outbound.pendingId);
        await hangupCall(callControlId);
        return { handled: true, action: 'outbound_hangup' };
    }

    if (evt === 'call.speak.failed') {
        console.error(LOG, 'outbound speak failed event');
        await clearPendingOutbound(outbound.pendingId);
        await hangupCall(callControlId);
        return { handled: true, action: 'outbound_speak_failed_event' };
    }

    if (evt === 'call.hangup') {
        await clearPendingOutbound(outbound.pendingId);
        return { handled: true, action: 'outbound_hangup_event' };
    }

    return { handled: true, action: 'outbound_ignored', ok: true };
}

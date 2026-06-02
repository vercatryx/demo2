import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const LOG = '[telnyx:outbound-pending]';

export type PendingOutboundCall = {
    script: string;
    clientId?: string;
    pendingId: string;
};

function adminClient(): SupabaseClient | null {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
        console.error(LOG, 'missing Supabase env');
        return null;
    }
    return createClient(url, key, { auth: { persistSession: false } });
}

export async function savePendingOutboundCall(params: {
    toE164: string;
    fromE164: string;
    script: string;
    clientId?: string;
}): Promise<string | null> {
    const supabase = adminClient();
    if (!supabase) return null;

    const { data, error } = await supabase
        .from('outbound_announcement_calls')
        .insert({
            to_e164: params.toE164,
            from_e164: params.fromE164,
            script: params.script,
            client_id: params.clientId ?? null,
        })
        .select('id')
        .single();

    if (error) {
        console.error(LOG, 'insert failed', error.message);
        return null;
    }
    return data?.id ?? null;
}

export async function attachCallControlIdToPending(params: {
    pendingId: string;
    callControlId: string;
}): Promise<void> {
    const supabase = adminClient();
    if (!supabase) return;

    const { error } = await supabase
        .from('outbound_announcement_calls')
        .update({ call_control_id: params.callControlId })
        .eq('id', params.pendingId);

    if (error) {
        console.error(LOG, 'attach call_control_id failed', error.message);
    }
}

export async function loadPendingOutboundCall(params: {
    callControlId?: string | null;
    toE164?: string | null;
}): Promise<PendingOutboundCall | null> {
    const supabase = adminClient();
    if (!supabase) return null;

    if (params.callControlId) {
        const { data, error } = await supabase
            .from('outbound_announcement_calls')
            .select('id, script, client_id')
            .eq('call_control_id', params.callControlId)
            .maybeSingle();
        if (error) {
            console.error(LOG, 'load by call_control_id failed', error.message);
        } else if (data?.script) {
            return {
                pendingId: data.id,
                script: data.script,
                clientId: data.client_id ?? undefined,
            };
        }
    }

    const to = params.toE164?.trim();
    if (!to) return null;

    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data, error } = await supabase
        .from('outbound_announcement_calls')
        .select('id, script, client_id')
        .eq('to_e164', to)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error(LOG, 'load by to_e164 failed', error.message);
        return null;
    }
    if (!data?.script) return null;

    return {
        pendingId: data.id,
        script: data.script,
        clientId: data.client_id ?? undefined,
    };
}

export async function deletePendingOutboundCall(pendingId: string): Promise<void> {
    const supabase = adminClient();
    if (!supabase) return;

    const { error } = await supabase.from('outbound_announcement_calls').delete().eq('id', pendingId);
    if (error) {
        console.error(LOG, 'delete failed', error.message);
    }
}

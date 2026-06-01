/**
 * Patch existing orders: set delivery proof URLs to demo Amazon photos only.
 * Does not touch clients, items, statuses, or other seed data.
 *
 *   npm run patch:demo-proofs
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import { demoProofUrl } from '../lib/demo-proof-urls';
import { getSupabaseDbApiKey } from '../lib/supabase-env';

const STATUSES_WITH_PROOF = ['billing_successful', 'billing_pending', 'completed'] as const;

async function main() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = getSupabaseDbApiKey();
    if (!supabaseUrl || !key) {
        console.error('Missing NEXT_PUBLIC_SUPABASE_URL or Supabase DB key in .env.local');
        process.exit(1);
    }

    const sb = createClient(supabaseUrl, key, { auth: { persistSession: false } });

    const pageSize = 1000;
    const allOrders: {
        id: string;
        order_number: number | null;
        status: string;
        proof_of_delivery_url: string | null;
    }[] = [];
    let from = 0;
    while (true) {
        const { data: page, error } = await sb
            .from('orders')
            .select('id, order_number, status, proof_of_delivery_url')
            .or(`proof_of_delivery_url.not.is.null,status.in.(${STATUSES_WITH_PROOF.join(',')})`)
            .range(from, from + pageSize - 1);

        if (error) {
            console.error('Failed to load orders:', error.message);
            process.exit(1);
        }
        if (!page?.length) break;
        allOrders.push(...page);
        if (page.length < pageSize) break;
        from += pageSize;
    }

    const toPatch = allOrders.filter((o) => {
        const hasLegacyProof = Boolean(o.proof_of_delivery_url?.trim());
        const shouldHaveProof = STATUSES_WITH_PROOF.includes(
            o.status as (typeof STATUSES_WITH_PROOF)[number]
        );
        return hasLegacyProof || shouldHaveProof;
    });

    if (toPatch.length === 0) {
        console.log('No orders to patch.');
        return;
    }

    console.log(`Patching proof images on ${toPatch.length} order(s)…`);

    let ok = 0;
    let fail = 0;
    for (let i = 0; i < toPatch.length; i++) {
        const order = toPatch[i]!;
        const url = demoProofUrl(i);
        const payload: Record<string, unknown> = {
            proof_of_delivery_url: url,
            proof_of_delivery_urls: [url],
        };

        const { error: updErr } = await sb.from('orders').update(payload).eq('id', order.id);
        if (updErr) {
            if (updErr.message?.includes('proof_of_delivery_urls')) {
                const { error: legacyErr } = await sb
                    .from('orders')
                    .update({ proof_of_delivery_url: url })
                    .eq('id', order.id);
                if (legacyErr) {
                    console.error(`  #${order.order_number ?? order.id}: ${legacyErr.message}`);
                    fail++;
                } else {
                    ok++;
                }
            } else {
                console.error(`  #${order.order_number ?? order.id}: ${updErr.message}`);
                fail++;
            }
        } else {
            ok++;
        }
    }

    console.log(`Done. Updated ${ok}, failed ${fail}.`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

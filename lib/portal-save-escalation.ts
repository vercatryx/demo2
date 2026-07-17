'use server';

import { getPublicClient } from '@/lib/actions';
import { getAppBuildId } from '@/lib/app-build-id';
import { sendEmail } from '@/lib/email';
import { brandedParagraph, buildBrandedEmailShell, escapeHtml } from '@/lib/email-branded-shell';
import { getSession } from '@/lib/session';

/** Engineering inbox — every escalated cart doubles as a bug report. */
const PORTAL_ESCALATION_EMAIL = 'dh@vercatryx.com';

function summarizeOrderConfig(orderConfig: unknown): string {
    if (!orderConfig || typeof orderConfig !== 'object') return 'No cart data.';
    const cfg = orderConfig as Record<string, unknown>;
    const serviceType = String(cfg.serviceType || 'unknown');
    const lines: string[] = [`Service type: ${serviceType}`];

    if (Array.isArray(cfg.vendorSelections)) {
        lines.push(`Food kitchens with selections: ${cfg.vendorSelections.length}`);
        for (const sel of cfg.vendorSelections as Array<Record<string, unknown>>) {
            const vendorId = String(sel.vendorId || '(no vendor)');
            const items = sel.items && typeof sel.items === 'object' ? Object.keys(sel.items as object).length : 0;
            const days =
                sel.itemsByDay && typeof sel.itemsByDay === 'object'
                    ? Object.keys(sel.itemsByDay as object).length
                    : 0;
            lines.push(`- Vendor ${vendorId}: ${items} item key(s), ${days} delivery day(s)`);
        }
    }

    if (Array.isArray(cfg.boxOrders)) {
        lines.push(`Box orders: ${cfg.boxOrders.length}`);
        for (const box of cfg.boxOrders as Array<Record<string, unknown>>) {
            const itemCount =
                box.items && typeof box.items === 'object' ? Object.keys(box.items as object).length : 0;
            lines.push(
                `- Box vendor ${String(box.vendorId || '?')} qty ${String(box.quantity ?? 1)}: ${itemCount} item key(s)`,
            );
        }
    }

    return lines.join('\n');
}

/**
 * Email the office a failed portal cart so staff can enter the order manually.
 */
export async function escalatePortalCartToTeam(params: {
    clientId: string;
    orderConfig: unknown;
    saveError?: string | null;
    draftSavedAt?: string | null;
    /** Browser/session diagnostics collected by the portal so engineering can debug save failures. */
    diagnostics?: Record<string, unknown> | null;
}): Promise<{ success: boolean; error?: string }> {
    const session = await getSession();
    if (!session?.userId) {
        return { success: false, error: 'Please sign in and try again.' };
    }

    if (session.role === 'client' && session.userId !== params.clientId) {
        return { success: false, error: 'You can only send your own cart from your portal.' };
    }

    if (!params.orderConfig || typeof params.orderConfig !== 'object') {
        return { success: false, error: 'No cart to send. Please try again after adding items.' };
    }

    const client = await getPublicClient(params.clientId);
    if (!client) {
        return { success: false, error: 'Client not found.' };
    }

    const summary = summarizeOrderConfig(params.orderConfig);
    const cartJson = JSON.stringify(params.orderConfig, null, 2);
    if (cartJson.length > 900_000) {
        return {
            success: false,
            error: 'Cart is too large to email. Please call the office and we will help you.',
        };
    }

    const subject = `URGENT: Portal save failed — please enter order — ${client.fullName} (${client.id})`;
    const detailRows = [
        brandedParagraph(
            '<strong>Action needed:</strong> Client could not save in the portal. Please enter this cart manually.',
        ),
        brandedParagraph(`<strong>Client name:</strong> ${escapeHtml(client.fullName)}`),
        brandedParagraph(`<strong>Client ID:</strong> ${escapeHtml(client.id)}`),
        client.email ? brandedParagraph(`<strong>Email:</strong> ${escapeHtml(client.email)}`) : '',
        client.phoneNumber
            ? brandedParagraph(`<strong>Phone:</strong> ${escapeHtml(client.phoneNumber)}`)
            : '',
        brandedParagraph(`<strong>Service type:</strong> ${escapeHtml(String(client.serviceType))}`),
        brandedParagraph(
            `<strong>Sent by:</strong> ${escapeHtml(String(session.name || session.role))} (${escapeHtml(String(session.role))})`,
        ),
        params.saveError
            ? brandedParagraph(`<strong>Save error shown to client:</strong> ${escapeHtml(params.saveError)}`)
            : '',
        params.draftSavedAt
            ? brandedParagraph(`<strong>Local draft saved at:</strong> ${escapeHtml(params.draftSavedAt)}`)
            : '',
        brandedParagraph(
            `<strong>Cart summary:</strong><br><pre style="white-space:pre-wrap;font-size:13px;background:#f8fafc;padding:12px;border-radius:8px;">${escapeHtml(summary)}</pre>`,
        ),
        brandedParagraph(
            `<strong>Full cart JSON:</strong><br><pre style="white-space:pre-wrap;font-size:11px;background:#f8fafc;padding:12px;border-radius:8px;max-height:480px;overflow:auto;">${escapeHtml(cartJson)}</pre>`,
        ),
    ].filter(Boolean);

    const diagnosticsJson = JSON.stringify(
        {
            ...(params.diagnostics || {}),
            serverBuildId: getAppBuildId(),
            serverTime: new Date().toISOString(),
        },
        null,
        2,
    );
    if (diagnosticsJson) {
        detailRows.push(
            brandedParagraph(
                `<strong>Diagnostics (for engineering):</strong><br><pre style="white-space:pre-wrap;font-size:11px;background:#fff7ed;padding:12px;border-radius:8px;max-height:360px;overflow:auto;">${escapeHtml(diagnosticsJson)}</pre>`,
            ),
        );
    }

    const html = buildBrandedEmailShell({ bodyHtml: detailRows.join('') });

    const attachments: { filename: string; content: string; contentType?: string }[] = [
        {
            filename: `${client.id}-portal-cart.json`,
            content: cartJson,
            contentType: 'application/json',
        },
    ];
    if (diagnosticsJson) {
        attachments.push({
            filename: `${client.id}-portal-diagnostics.json`,
            content: diagnosticsJson,
            contentType: 'application/json',
        });
    }

    const result = await sendEmail({
        to: PORTAL_ESCALATION_EMAIL,
        subject,
        html,
        attachments,
    });

    if (!result.success) {
        return {
            success: false,
            error: result.error || 'Could not email the office. Please call us and we will help.',
        };
    }

    return { success: true };
}

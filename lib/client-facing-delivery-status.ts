/** Client-facing delivery status for phone/SMS — never expose internal billing statuses. */

export type ClientFacingDeliveryStatus = 'delivered' | 'not delivered';

type OrderProofFields = {
    delivery_proof_url?: string | null;
    proof_of_delivery_image?: string | null;
};

export function isOrderDelivered(order: OrderProofFields): boolean {
    const url = (order.delivery_proof_url ?? '').trim();
    const image = (order.proof_of_delivery_image ?? '').trim();
    return url.length > 0 || image.length > 0;
}

export function clientFacingDeliveryStatus(order: OrderProofFields): ClientFacingDeliveryStatus {
    return isOrderDelivered(order) ? 'delivered' : 'not delivered';
}

/** Spoken phrasing for IVR / voice agents. */
export function spokenClientFacingDeliveryStatus(order: OrderProofFields): string {
    return isOrderDelivered(order) ? 'delivered' : 'not yet delivered';
}

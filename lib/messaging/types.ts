export type MessagingChannel = 'email' | 'sms' | 'call';

export type RecipientFilter =
    | { mode: 'everyone' }
    | { mode: 'vendor'; vendorIds: string[] }
    | { mode: 'foodItem'; itemIds: string[] }
    | { mode: 'boxItem'; itemIds: string[] }
    | { mode: 'manual'; clientIds: string[] };

export type MessagingRecipient = {
    clientId: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    statusName: string | null;
    canSend: boolean;
    skipReason?: string;
};

export type ResolveRecipientsInput = {
    channel: MessagingChannel;
    filter: RecipientFilter;
    approvedOnly?: boolean;
};

export type ComposePayload = {
    channel: MessagingChannel;
    subject?: string;
    bodyHtml?: string;
    bodyText?: string;
};

export type MessagingCatalog = {
    vendors: { id: string; name: string }[];
    menuItems: { id: string; name: string; vendorId: string; vendorName: string }[];
    breakfastItems: { id: string; name: string }[];
    boxItems: { id: string; name: string; itemNumber: number | null }[];
};

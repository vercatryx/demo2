'use client';

import React from 'react';
import { X } from 'lucide-react';
import ClientPortalSidebar from '@/components/clients/ClientPortalSidebar';
import { PortalLinkedAccounts } from '@/components/clients/portal-v2/PortalLinkedAccounts';
import type { ClientProfile } from '@/lib/types';
import type { SwitchableClientAccount } from '@/lib/client-portal-account-switch';
import type { HouseholdMemberAllocation, HouseholdOrderMember } from '@/lib/household-food-order-pool';
import styles from './portal-v2.module.css';

type Props = {
    open: boolean;
    onClose: () => void;
    client: ClientProfile;
    serviceType: string;
    switchableAccounts?: SwitchableClientAccount[];
    onSwitchAccount?: (targetClientId: string) => Promise<{ success: boolean; message?: string } | void>;
    householdOrderMembers?: HouseholdOrderMember[];
    householdMemberAllocations?: HouseholdMemberAllocation[];
    focusedMemberId?: string | null;
    onFocusMember?: (memberId: string | null) => void;
};

export function PortalAccountDrawer({
    open,
    onClose,
    client,
    serviceType,
    switchableAccounts,
    onSwitchAccount,
    householdOrderMembers,
    householdMemberAllocations,
    focusedMemberId,
    onFocusMember,
}: Props) {
    if (!open) return null;

    return (
        <>
            <div className={styles.portalV2DrawerBackdrop} onClick={onClose} aria-hidden />
            <aside className={styles.portalV2Drawer} role="dialog" aria-label="Account">
                <button
                    type="button"
                    className={styles.portalV2IconBtn}
                    onClick={onClose}
                    style={{ marginBottom: 16 }}
                    aria-label="Close"
                >
                    <X size={22} />
                </button>
                <PortalLinkedAccounts
                    client={client}
                    switchableAccounts={switchableAccounts}
                    onSwitchAccount={onSwitchAccount}
                    householdOrderMembers={householdOrderMembers}
                    householdMemberAllocations={householdMemberAllocations}
                    focusedMemberId={focusedMemberId}
                    onFocusMember={onFocusMember}
                />
                <ClientPortalSidebar
                    client={client}
                    serviceType={serviceType}
                    showAccountSwitcher={false}
                />
            </aside>
        </>
    );
}

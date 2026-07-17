'use client';

import React, { useState, useTransition } from 'react';
import { Users, ChevronRight } from 'lucide-react';
import type { SwitchableClientAccount } from '@/lib/client-portal-account-switch';
import type { HouseholdMemberAllocation, HouseholdOrderMember } from '@/lib/household-food-order-pool';
import type { ClientProfile } from '@/lib/types';
import styles from './portal-v2.module.css';

type SwitchAccountResult = { success: boolean; message?: string };

type Props = {
    client: ClientProfile;
    switchableAccounts?: SwitchableClientAccount[];
    onSwitchAccount?: (targetClientId: string) => Promise<SwitchAccountResult | void>;
    /** When set, linked Food accounts share one cart with pooled weekly meals. */
    householdOrderMembers?: HouseholdOrderMember[];
    householdMemberAllocations?: HouseholdMemberAllocation[];
    focusedMemberId?: string | null;
    onFocusMember?: (memberId: string | null) => void;
};

export function PortalLinkedAccounts({
    client,
    switchableAccounts = [],
    onSwitchAccount,
    householdOrderMembers = [],
    householdMemberAllocations = [],
    focusedMemberId = null,
    onFocusMember,
}: Props) {
    const poolingEnabled = householdOrderMembers.length > 1;
    const linkedOthers = switchableAccounts.filter((a) => a.id !== client.id);
    const showLinked = poolingEnabled || linkedOthers.length > 0;
    const [switchError, setSwitchError] = useState('');
    const [isPending, startTransition] = useTransition();

    const handleSwitch = (targetClientId: string) => {
        if (targetClientId === client.id || isPending) return;

        startTransition(async () => {
            setSwitchError('');
            try {
                if (!onSwitchAccount) return;
                const result = await onSwitchAccount(targetClientId);
                if (result && !result.success) {
                    setSwitchError(result.message || 'Could not switch accounts.');
                }
            } catch (error) {
                if (error instanceof Error && error.message === 'ACCOUNT_SWITCH_CANCELLED') {
                    return;
                }
            }
        });
    };

    const handleMemberClick = (memberId: string) => {
        if (!onFocusMember) return;
        if (focusedMemberId === memberId) {
            onFocusMember(null);
            return;
        }
        onFocusMember(memberId);
    };

    if (!showLinked) return null;

    const allocationFor = (memberId: string) =>
        householdMemberAllocations.find((row) => row.id === memberId);

    if (poolingEnabled) {
        return (
            <div className={styles.portalV2LinkedAccounts}>
                <div className={styles.portalV2LinkedAccountsBanner}>
                    <Users size={16} aria-hidden />
                    <span>
                        Linked accounts share one order. Meals fill the first person&apos;s weekly allowance,
                        then the next ({householdOrderMembers.length} accounts).
                    </span>
                </div>

                <p className={styles.portalV2LinkedAccountsCurrent}>
                    Combined cart · tap a person to view their portion
                </p>

                <ul className={styles.portalV2LinkedAccountsList}>
                    {householdOrderMembers.map((member) => {
                        const allocation = allocationFor(member.id);
                        const isFocused = focusedMemberId === member.id;
                        return (
                            <li key={member.id}>
                                <button
                                    type="button"
                                    className={`${styles.portalV2LinkedAccountsItem} ${isFocused ? styles.portalV2LinkedAccountsItemActive : ''}`}
                                    onClick={() => handleMemberClick(member.id)}
                                >
                                    <span className={styles.portalV2LinkedAccountsItemText}>
                                        <span className={styles.portalV2LinkedAccountsItemName}>
                                            {member.name}
                                            {member.id === client.id ? ' (you)' : ''}
                                        </span>
                                        <span className={styles.portalV2LinkedAccountsItemMeta}>
                                            {allocation
                                                ? `${allocation.usedMeals}/${allocation.approvedMealsPerWeek} meals`
                                                : `${member.approvedMealsPerWeek} meals/week`}
                                        </span>
                                    </span>
                                    <ChevronRight size={18} aria-hidden />
                                </button>
                            </li>
                        );
                    })}
                </ul>

                {focusedMemberId && (
                    <button
                        type="button"
                        className={styles.portalV2LinkedAccountsClearFocus}
                        onClick={() => onFocusMember?.(null)}
                    >
                        Show full combined cart
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className={styles.portalV2LinkedAccounts}>
            <div className={styles.portalV2LinkedAccountsBanner}>
                <Users size={16} aria-hidden />
                <span>
                    You can switch to {linkedOthers.length} other account
                    {linkedOthers.length === 1 ? '' : 's'} that share this email or phone, or are linked
                    together.
                </span>
            </div>

            <p className={styles.portalV2LinkedAccountsCurrent}>
                Ordering for: <strong>{client.fullName}</strong> ({client.id})
            </p>

            <ul className={styles.portalV2LinkedAccountsList}>
                {linkedOthers.map((account) => (
                    <li key={account.id}>
                        <button
                            type="button"
                            className={styles.portalV2LinkedAccountsItem}
                            disabled={isPending}
                            onClick={() => handleSwitch(account.id)}
                        >
                            <span className={styles.portalV2LinkedAccountsItemText}>
                                <span className={styles.portalV2LinkedAccountsItemName}>{account.name}</span>
                                {account.serviceType && (
                                    <span className={styles.portalV2LinkedAccountsItemMeta}>{account.serviceType}</span>
                                )}
                            </span>
                            <ChevronRight size={18} aria-hidden />
                        </button>
                    </li>
                ))}
            </ul>

            {switchError && (
                <p className={styles.portalV2LinkedAccountsError} role="alert">
                    {switchError}
                </p>
            )}
        </div>
    );
}

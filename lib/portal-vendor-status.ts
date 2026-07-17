import type { ClientProfile, MenuItem, Vendor } from '@/lib/types';
import { sortWeekdays } from '@/lib/order-dates';
import { getItemPoints, isMeetingMinimum } from '@/lib/utils';
import { mergeDeliveryDayOrdersToVendorSelections } from '@/lib/portal-vendor-selection';

type VendorSelection = {
    vendorId?: string;
    items?: Record<string, number>;
    itemsByDay?: Record<string, Record<string, number>>;
    selectedDeliveryDays?: string[];
};

export function getVendorMealCount(
    selection: VendorSelection | null | undefined,
    menuItems: MenuItem[],
    client?: ClientProfile,
): number {
    if (!selection) return 0;

    if (selection.itemsByDay && Object.keys(selection.itemsByDay).length > 0) {
        let total = 0;
        for (const day of getVendorDaysWithMeals(selection, menuItems)) {
            total += getVendorMealCountForDay(selection, day, menuItems);
        }
        return total;
    }

    if (!selection.items) return 0;

    const daysCount =
        selection.selectedDeliveryDays && selection.selectedDeliveryDays.length > 0
            ? selection.selectedDeliveryDays.length
            : (client as { delivery_days?: string[] } | undefined)?.delivery_days?.length || 1;

    let total = 0;
    for (const [itemId, qty] of Object.entries(selection.items)) {
        const item = menuItems.find((i) => i.id === itemId);
        total += (Number(qty) || 0) * getItemPoints(item) * daysCount;
    }
    return total;
}

export function getVendorMealCountForDay(
    selection: { itemsByDay?: Record<string, Record<string, number>> } | null | undefined,
    day: string,
    menuItems: MenuItem[],
): number {
    if (!selection?.itemsByDay?.[day]) return 0;
    let total = 0;
    for (const [itemId, qty] of Object.entries(selection.itemsByDay[day])) {
        const item = menuItems.find((i) => i.id === itemId);
        total += (Number(qty) || 0) * getItemPoints(item);
    }
    return total;
}

/** Days that currently have at least one meal point on the vendor block. */
export function getVendorDaysWithMeals(
    selection: VendorSelection | null | undefined,
    menuItems: MenuItem[],
): string[] {
    if (!selection?.itemsByDay) return [];
    const days = Object.keys(selection.itemsByDay).filter(
        (day) => getVendorMealCountForDay(selection, day, menuItems) > 0,
    );
    return sortWeekdays(days);
}

export type VendorDayMinimumStatus = {
    day: string;
    count: number;
    minimum: number;
    meetsMin: boolean;
};

export function getVendorMinimumDayStatuses(
    vendor: Vendor,
    selection: VendorSelection | null | undefined,
    menuItems: MenuItem[],
    daysToShow: string[],
): VendorDayMinimumStatus[] {
    const minimum = vendor.minimumMeals || 0;
    return sortWeekdays(daysToShow).map((day) => {
        const count = getVendorMealCountForDay(selection, day, menuItems);
        return {
            day,
            count,
            minimum,
            meetsMin: count <= 0 || minimum <= 0 || isMeetingMinimum(count, minimum),
        };
    });
}

export function vendorMeetsMinimum(
    vendor: Vendor,
    selection: VendorSelection | null | undefined,
    menuItems: MenuItem[],
    client: ClientProfile,
): boolean {
    const minimum = vendor.minimumMeals || 0;
    if (minimum <= 0 || !selection) return true;

    if (selection.itemsByDay && Object.keys(selection.itemsByDay).length > 0) {
        for (const day of getVendorDaysWithMeals(selection, menuItems)) {
            const count = getVendorMealCountForDay(selection, day, menuItems);
            if (count > 0 && !isMeetingMinimum(count, minimum)) return false;
        }
        return true;
    }

    const count = getVendorMealCount(selection, menuItems, client);
    if (count <= 0) return true;
    return isMeetingMinimum(count, minimum);
}

export type VendorSidebarStatus = {
    hint: string | null;
    meetsMin: boolean;
};

export function getVendorSidebarStatus(
    vendor: Vendor,
    selection: VendorSelection | null | undefined,
    menuItems: MenuItem[],
    client: ClientProfile,
): VendorSidebarStatus {
    const minimum = vendor.minimumMeals || 0;
    if (minimum <= 0) return { hint: null, meetsMin: true };

    if (selection?.itemsByDay && Object.keys(selection.itemsByDay).length > 0) {
        const withItems = getVendorDaysWithMeals(selection, menuItems).map((day) => ({
            day,
            count: getVendorMealCountForDay(selection, day, menuItems),
        }));
        if (withItems.length === 0) return { hint: null, meetsMin: true };

        const failing = withItems.filter(({ count }) => count > 0 && !isMeetingMinimum(count, minimum));
        if (failing.length > 0) {
            if (withItems.length === 1) {
                return { hint: `${failing[0].count}/${minimum} min`, meetsMin: false };
            }
            const worst = [...failing].sort((a, b) => a.count - b.count)[0];
            return { hint: `${worst.day}: ${worst.count}/${minimum}`, meetsMin: false };
        }

        if (withItems.length === 1) {
            return { hint: `${withItems[0].count}/${minimum} ✓`, meetsMin: true };
        }
        return { hint: `${minimum}+ per day ✓`, meetsMin: true };
    }

    const count = getVendorMealCount(selection, menuItems, client);
    if (count <= 0) return { hint: null, meetsMin: true };

    const meetsMin = isMeetingMinimum(count, minimum);
    return {
        hint: meetsMin ? `${count}/${minimum} ✓` : `${count}/${minimum} min`,
        meetsMin,
    };
}

/** @deprecated Use getVendorSidebarStatus */
export function getVendorSidebarHint(
    vendor: Vendor,
    selection: VendorSelection | null | undefined,
    menuItems: MenuItem[],
    client: ClientProfile,
): string | null {
    return getVendorSidebarStatus(vendor, selection, menuItems, client).hint;
}

export type VendorMinimumTip = {
    vendorId: string;
    vendorName: string;
    message: string;
    severity: 'warning';
};

export function getVendorMinimumTips(
    orderConfig: { vendorSelections?: unknown[] } | null | undefined,
    vendors: Vendor[],
    menuItems: MenuItem[],
    client: ClientProfile,
    hideVendorNames = false,
): VendorMinimumTip[] {
    const tips: VendorMinimumTip[] = [];
    const selections = mergeDeliveryDayOrdersToVendorSelections(orderConfig);
    let foodIndex = 0;

    for (const selection of selections) {
        if (!selection?.vendorId) continue;
        const vendor = vendors.find((v) => v.id === selection.vendorId);
        if (!vendor) continue;
        foodIndex += 1;

        const minimum = vendor.minimumMeals || 0;
        if (minimum <= 0) continue;

        const vendorName = hideVendorNames ? `Food Selection ${foodIndex}` : vendor.name;

        if (selection.itemsByDay && Object.keys(selection.itemsByDay).length > 0) {
            for (const day of getVendorDaysWithMeals(selection, menuItems)) {
                const dayCount = getVendorMealCountForDay(selection, day, menuItems);
                if (dayCount > 0 && !isMeetingMinimum(dayCount, minimum)) {
                    tips.push({
                        vendorId: vendor.id,
                        vendorName,
                        message: `${vendorName} (${day}): ${dayCount} / ${minimum} min — add ${Math.max(0, minimum - dayCount)} more meal points.`,
                        severity: 'warning',
                    });
                }
            }
            continue;
        }

        const count = getVendorMealCount(selection, menuItems, client);
        if (count > 0 && !isMeetingMinimum(count, minimum)) {
            tips.push({
                vendorId: vendor.id,
                vendorName,
                message: `${vendorName}: ${count} / ${minimum} min — add ${Math.max(0, minimum - count)} more meal points.`,
                severity: 'warning',
            });
        }
    }

    return tips;
}

export function formatDayMinimumPreview(count: number, minimum: number): {
    line: string;
    belowMin: boolean;
    hasItems: boolean;
} {
    if (count <= 0) {
        if (minimum > 0) {
            return { line: `Min ${minimum} meal pts`, belowMin: false, hasItems: false };
        }
        return { line: 'No items yet', belowMin: false, hasItems: false };
    }

    if (minimum <= 0) {
        return { line: `${count} meal pts`, belowMin: false, hasItems: true };
    }

    const meets = isMeetingMinimum(count, minimum);
    if (meets) {
        return { line: `${count}/${minimum} meal pts ✓`, belowMin: false, hasItems: true };
    }

    return {
        line: `${count}/${minimum} min — need ${Math.max(0, minimum - count)} more`,
        belowMin: true,
        hasItems: true,
    };
}

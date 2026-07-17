import type { BoxQuota, ItemCategory, MenuItem } from '@/lib/types';
import { isAtOrOverMaximum, isExceedingMaximum, isMeetingExactTarget } from '@/lib/utils';
import {
    categoryPointsUsed,
    getActiveBoxFromConfig,
    getRequiredCategoryQuota,
} from '@/lib/portal-box-order-actions';

export type BoxCategoryTip = {
    categoryId: string;
    categoryName: string;
    message: string;
    severity: 'warning';
};

export type BoxCategoryQuotaStatus = {
    used: number;
    required: number | null;
    atOrOverLimit: boolean;
    overLimit: boolean;
};

export function getBoxCategoryQuotaStatus(
    categoryId: string,
    orderConfig: unknown,
    menuItems: MenuItem[],
    categories: ItemCategory[],
    quotasByBoxType: Record<string, BoxQuota[]>,
    boxMultiplier: number,
): BoxCategoryQuotaStatus {
    const box = getActiveBoxFromConfig(orderConfig, boxMultiplier);
    const used = categoryPointsUsed(categoryId, box.items, menuItems);
    const required = getRequiredCategoryQuota(
        categoryId,
        categories,
        quotasByBoxType,
        box.boxTypeId,
        boxMultiplier,
    );

    return {
        used,
        required,
        atOrOverLimit: required !== null && isAtOrOverMaximum(used, required),
        overLimit: required !== null && isExceedingMaximum(used, required),
    };
}

export type BoxCategorySidebarStatus = {
    hint: string | null;
    /** True when over the category point limit (warnings only). */
    atOrOverLimit: boolean;
};

export function getBoxCategorySidebarStatus(
    category: ItemCategory,
    orderConfig: unknown,
    menuItems: MenuItem[],
    categories: ItemCategory[],
    quotasByBoxType: Record<string, BoxQuota[]>,
    boxMultiplier: number,
): BoxCategorySidebarStatus {
    const { used, required, overLimit } = getBoxCategoryQuotaStatus(
        category.id,
        orderConfig,
        menuItems,
        categories,
        quotasByBoxType,
        boxMultiplier,
    );

    if (used <= 0) return { hint: null, atOrOverLimit: false };

    const usedRounded = Math.round(used);
    if (required === null) {
        return {
            hint: `${usedRounded} ${usedRounded === 1 ? 'pt' : 'pts'}`,
            atOrOverLimit: false,
        };
    }

    if (overLimit) {
        return { hint: `${usedRounded}/${required} over`, atOrOverLimit: true };
    }
    if (isMeetingExactTarget(used, required)) {
        return { hint: `${usedRounded}/${required}`, atOrOverLimit: false };
    }
    return { hint: `${usedRounded}/${required} pts`, atOrOverLimit: false };
}

export function getBoxCategoryTips(
    orderConfig: unknown,
    categories: ItemCategory[],
    menuItems: MenuItem[],
    quotasByBoxType: Record<string, BoxQuota[]>,
    boxMultiplier: number,
): BoxCategoryTip[] {
    const tips: BoxCategoryTip[] = [];
    const activeCategories = categories.filter((c) => c.isActive !== false);

    for (const category of activeCategories) {
        const { used, required, overLimit } = getBoxCategoryQuotaStatus(
            category.id,
            orderConfig,
            menuItems,
            categories,
            quotasByBoxType,
            boxMultiplier,
        );
        if (used <= 0 || required === null || !overLimit) continue;

        const usedRounded = Math.round(used);
        const name = category.name?.replace(/^\[Preview\]\s*/i, '').trim() || 'Category';

        tips.push({
            categoryId: category.id,
            categoryName: name,
            message: `${name}: ${usedRounded}/${required} pts — over the limit by ${usedRounded - required}.`,
            severity: 'warning',
        });
    }

    return tips;
}

export function formatBoxCategoryBannerMessage(
    categoryName: string,
    used: number,
    required: number | null,
    boxMultiplier: number,
): { title: string; detail: string | null; warn: boolean } {
    const usedRounded = Math.round(used);
    const limitHint = boxMultiplier > 1 ? ` (${boxMultiplier} authorized boxes)` : '';

    if (required === null) {
        return {
            title: `${categoryName} — ${usedRounded} ${usedRounded === 1 ? 'point' : 'points'} in your box`,
            detail: null,
            warn: false,
        };
    }

    const over = isExceedingMaximum(used, required);
    const atTarget = isMeetingExactTarget(used, required);

    return {
        title: `${categoryName} — ${usedRounded}/${required} points used${limitHint}`,
        detail: over
            ? `Over the limit by ${usedRounded - required} points — remove items in this category.`
            : atTarget
              ? null
              : `${required - usedRounded} points remaining in this category.`,
        warn: over,
    };
}

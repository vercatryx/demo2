import type { FoodBoxExclusiveConflict } from '@/lib/box-food-exclusive';
import type { ItemCategory, MenuItem } from '@/lib/types';
import type { BoxQuota } from '@/lib/types';
import { isExceedingMaximum, isMeetingExactTarget } from '@/lib/utils';
import {
    categoryPointsUsed,
    getActiveBoxFromConfig,
    getRequiredCategoryQuota,
} from '@/lib/portal-box-order-actions';
import type { BoxCategoryTip } from '@/lib/portal-box-status';
import { boxHasFoodBoxMixConflict } from '@/lib/box-food-exclusive';

export function resolveFoodBoxCategoryLabel(
    categories: ItemCategory[],
    foodBoxCategoryId: string | null | undefined,
): string {
    if (!foodBoxCategoryId) return '';
    const cat = categories.find((c) => c.id === foodBoxCategoryId);
    return cat?.name?.replace(/^\[Preview\]\s*/i, '').trim() || 'Food box';
}

export function getFoodBoxMixConflictTip(
    orderConfig: unknown,
    menuItems: MenuItem[],
    foodBoxCategoryId: string | null | undefined,
    boxMultiplier: number,
    categories: ItemCategory[],
): BoxCategoryTip | null {
    if (!foodBoxCategoryId) return null;
    const box = getActiveBoxFromConfig(orderConfig, boxMultiplier);
    if (!boxHasFoodBoxMixConflict(box.items || {}, menuItems, foodBoxCategoryId)) return null;

    const label = resolveFoodBoxCategoryLabel(categories, foodBoxCategoryId);
    return {
        categoryId: '__food_box_mix__',
        categoryName: label,
        message: `Your box mixes ${label} with other categories. You can't use both options in one box — remove items from one side to continue.`,
        severity: 'warning',
    };
}

export type FoodBoxExclusiveBannerCopy = {
    title: string;
    heading: string;
    foodBoxLabel: string;
    foodBoxDetail: string;
    buildYourOwnLabel: string;
    buildYourOwnDetail: string;
    combineNote: string;
};

export function getFoodBoxExclusiveBannerCopy(): FoodBoxExclusiveBannerCopy {
    return {
        title: 'Food box option',
        heading: 'Two ways to fill your box:',
        foodBoxLabel: 'Food Box',
        foodBoxDetail: 'choose only your protein; the rest is pre-selected for you.',
        buildYourOwnLabel: 'Build your own',
        buildYourOwnDetail: 'pick each item yourself.',
        combineNote: "You can't combine both options in one box.",
    };
}

export function formatBoxCategoryIncrementBlockedMessage(
    item: MenuItem,
    orderConfig: unknown,
    menuItems: MenuItem[],
    categories: ItemCategory[],
    quotasByBoxType: Record<string, BoxQuota[]>,
    boxMultiplier: number,
): string {
    const catId = item.categoryId;
    if (!catId) {
        return 'This category has reached its point limit for your box. Remove or reduce other items in this category first.';
    }

    const cat = categories.find((c) => c.id === catId);
    const catName = cat?.name?.replace(/^\[Preview\]\s*/i, '').trim() || 'Category';
    const box = getActiveBoxFromConfig(orderConfig, boxMultiplier);
    const req = getRequiredCategoryQuota(
        catId,
        categories,
        quotasByBoxType,
        box.boxTypeId,
        boxMultiplier,
    );
    const cur = Math.round(categoryPointsUsed(catId, box.items, menuItems));

    const acrossBoxes =
        boxMultiplier > 1 ? ` across your ${boxMultiplier} boxes` : '';

    if (req === null) {
        return cur > 0
            ? `This item is part of the ${catName} category. ${cur} ${cur === 1 ? 'point' : 'points'} used${acrossBoxes}.`
            : `This item is part of the ${catName} category.`;
    }

    if (isExceedingMaximum(cur, req)) {
        return `This item is part of the ${catName} category. ${cur} of ${req} points used${acrossBoxes} (over limit). Remove or reduce other items in this category first.`;
    }

    if (isMeetingExactTarget(cur, req)) {
        return `This item is part of the ${catName} category. ${cur} of ${req} points used${acrossBoxes} — this category is full.`;
    }

    return `This item is part of the ${catName} category. ${cur} of ${req} points used${acrossBoxes}. Adding this item would exceed the limit.`;
}

export type FoodBoxSwitchModalCopy = {
    title: string;
    lead: string;
    body: string;
};

export function getFoodBoxSwitchModalCopy(
    conflict: Exclude<FoodBoxExclusiveConflict, 'none'>,
    categoryName: string,
): FoodBoxSwitchModalCopy {
    const lead = `Each box uses either ${categoryName} (Food Box) or items from other categories (Build your own) — not both.`;

    if (conflict === 'clearOthers') {
        return {
            title: "Change what's in this box?",
            lead,
            body: `You're adding a Food Box item. We'll clear everything you've picked from other categories in this box so you can continue.`,
        };
    }

    return {
        title: "Change what's in this box?",
        lead,
        body: `You're adding an item from another category. We'll clear every Food Box item in this box so you can continue.`,
    };
}

/** Shared week boundaries for create-orders-next-week (Sunday–Saturday). */

export type WeekRange = {
    weekStart: Date;
    weekEnd: Date;
    weekStartStr: string;
    weekEndStr: string;
};

export function getNextWeekRange(from: Date = new Date()): WeekRange {
    const today = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 0, 0, 0, 0);
    const dayOfWeek = today.getDay();
    const daysUntilNextSunday = dayOfWeek === 0 ? 7 : 7 - dayOfWeek;
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() + daysUntilNextSunday);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    return {
        weekStart,
        weekEnd,
        weekStartStr: weekStart.toISOString().split('T')[0],
        weekEndStr: weekEnd.toISOString().split('T')[0]
    };
}

export function parseWeekRange(weekStartStr: string, weekEndStr: string): WeekRange {
    const weekStart = new Date(weekStartStr + 'T12:00:00');
    const weekEnd = new Date(weekEndStr + 'T12:00:00');
    weekEnd.setHours(23, 59, 59, 999);
    return { weekStart, weekEnd, weekStartStr, weekEndStr };
}

/** Stable key for Food/Custom orders (matches create-orders dedup). */
export function orderTupleKey(
    clientId: string,
    deliveryDateStr: string,
    serviceType: string,
    vendorId: string
): string {
    return `${clientId}|${deliveryDateStr}|${serviceType}|${vendorId}`;
}

/** Meal orders are one row per meal type (Breakfast, Lunch, …), not per vendor/date alone. */
export function mealOrderTupleKey(
    clientId: string,
    deliveryDateStr: string,
    vendorId: string,
    mealType: string
): string {
    return `${clientId}|${deliveryDateStr}|Meal|${vendorId}|${mealType}`;
}

/** One Boxes order per client per target week. */
export function boxesClientKey(clientId: string): string {
    return `${clientId}|Boxes`;
}

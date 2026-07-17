'use client';

import React from 'react';
import { AlertTriangle, Calendar, Check } from 'lucide-react';
import { sortWeekdays } from '@/lib/order-dates';
import { formatDayMinimumPreview } from '@/lib/portal-vendor-status';
import { isMeetingMinimum } from '@/lib/utils';
import styles from './portal-v2.module.css';

type Props = {
    days: string[];
    selectedDay?: string | null;
    onSelectDay: (day: string) => void;
    /** Meal point totals per delivery day for the current kitchen. */
    dayMealCounts?: Record<string, number>;
    vendorMinimum?: number;
    compact?: boolean;
};

export function PortalFoodDayPicker({
    days,
    selectedDay,
    onSelectDay,
    dayMealCounts = {},
    vendorMinimum = 0,
    compact,
}: Props) {
    const sorted = sortWeekdays(days);
    const anyDayBelowMin = sorted.some((day) => {
        const count = dayMealCounts[day] ?? 0;
        return count > 0 && vendorMinimum > 0 && !isMeetingMinimum(count, vendorMinimum);
    });
    const selectedCount = selectedDay ? (dayMealCounts[selectedDay] ?? 0) : 0;
    const selectedBelowMin =
        !!selectedDay && vendorMinimum > 0 && selectedCount > 0 && !isMeetingMinimum(selectedCount, vendorMinimum);

    if (!compact) {
        return (
            <div className={styles.portalV2DayGate}>
                <Calendar size={28} className={styles.portalV2DayGateIcon} aria-hidden />
                <h2 className={styles.portalV2DayGateTitle}>Select a delivery day</h2>
                <p className={styles.portalV2DayGateSub}>
                    Choose which day you want to start with. You can split this kitchen&apos;s order across multiple
                    delivery days — add items for one day, then switch to another.
                </p>
                {vendorMinimum > 0 && (
                    <p className={styles.portalV2DayGateMinimum}>
                        Each delivery day needs its own minimum of <strong>{vendorMinimum} meal points</strong> — totals
                        don&apos;t combine across days.
                    </p>
                )}
                <p className={styles.portalV2DayGateNote}>
                    On the next screen, a bar at the top of the menu lets you switch days and preview each day&apos;s
                    total and minimum.
                </p>
                <div className={styles.portalV2DayGateChips}>
                    {sorted.map((day) => {
                        const count = dayMealCounts[day] ?? 0;
                        const preview = formatDayMinimumPreview(count, vendorMinimum);
                        const chipWarn = preview.belowMin;
                        return (
                            <button
                                key={day}
                                type="button"
                                className={`${styles.portalV2DayChip} ${selectedDay === day ? styles.portalV2DayChipActive : ''} ${chipWarn ? styles.portalV2DayChipWarn : ''}`}
                                onClick={() => onSelectDay(day)}
                            >
                                <span className={styles.portalV2DayChipDay}>{day}</span>
                                {count > 0 && (
                                    <span
                                        className={`${styles.portalV2DayChipMeta} ${chipWarn ? styles.portalV2DayChipMetaWarn : styles.portalV2DayChipMetaOk}`}
                                    >
                                        {chipWarn && <AlertTriangle size={11} aria-hidden />}
                                        {preview.line}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    }

    return (
        <div
            className={`${styles.portalV2DayBanner} ${anyDayBelowMin ? styles.portalV2DayBannerWarn : ''}`}
            role="region"
            aria-label="Delivery day"
        >
            <div className={styles.portalV2DayBannerText}>
                <p className={styles.portalV2DayBannerTitle}>
                    {selectedDay ? (
                        <>
                            Adding items for <strong>{selectedDay}</strong>
                        </>
                    ) : (
                        'Select a delivery day'
                    )}
                </p>
                <p className={styles.portalV2DayBannerSub}>
                    Split this order across days — each day must meet the kitchen minimum on its own. Switch below to
                    add items or check another day.
                </p>
                {selectedBelowMin && selectedDay && (
                    <p className={styles.portalV2DayBannerAlert} role="alert">
                        <AlertTriangle size={14} aria-hidden />
                        {selectedDay} is at {selectedCount}/{vendorMinimum} meal points — add{' '}
                        {Math.max(0, vendorMinimum - selectedCount)} more for this delivery day.
                    </p>
                )}
                {selectedDay && selectedCount <= 0 && vendorMinimum > 0 && (
                    <p className={styles.portalV2DayBannerHint}>
                        This day needs at least {vendorMinimum} meal points once you add items.
                    </p>
                )}
            </div>
            <div className={styles.portalV2DayBannerDays}>
                {sorted.map((day) => {
                    const count = dayMealCounts[day] ?? 0;
                    const preview = formatDayMinimumPreview(count, vendorMinimum);
                    const isActive = selectedDay === day;
                    return (
                        <button
                            key={day}
                            type="button"
                            className={`${styles.portalV2DayPreviewChip} ${isActive ? styles.portalV2DayPreviewChipActive : ''} ${preview.belowMin ? styles.portalV2DayPreviewChipWarn : count > 0 && vendorMinimum > 0 ? styles.portalV2DayPreviewChipOk : ''}`}
                            onClick={() => onSelectDay(day)}
                            aria-pressed={isActive}
                        >
                            <span className={styles.portalV2DayPreviewChipDay}>
                                {day}
                                {isActive && <Check size={12} aria-hidden />}
                                {preview.belowMin && <AlertTriangle size={11} aria-hidden />}
                            </span>
                            <span
                                className={`${styles.portalV2DayPreviewChipCount} ${preview.belowMin ? styles.portalV2DayPreviewChipCountWarn : ''}`}
                            >
                                {preview.line}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

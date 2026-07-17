import type { AppSettings } from './types';

export const DEFAULT_CLIENT_LOGIN_MAINTENANCE_MESSAGE = `Our system is currently under maintenance. We hope to have it back up soon.

In the meantime, please call 845-682-0558 or email Info@trianglesquareservices.com for help.`;

export function resolveClientLoginMaintenanceMessage(raw: string | null | undefined): string {
    const trimmed = raw?.trim();
    return trimmed || DEFAULT_CLIENT_LOGIN_MAINTENANCE_MESSAGE;
}

export function getClientLoginMaintenanceState(settings: AppSettings) {
    const underMaintenance = settings.clientLoginMaintenanceMode !== false;
    return {
        underMaintenance,
        maintenanceMessage: underMaintenance
            ? resolveClientLoginMaintenanceMessage(settings.clientLoginMaintenanceMessage)
            : undefined,
    };
}

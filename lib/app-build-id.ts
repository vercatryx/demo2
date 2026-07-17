import { readFileSync } from 'fs';
import path from 'path';

let cached: string | null = null;

/**
 * Identifier of the currently running server build. Used to detect when the
 * browser is holding a bundle from an older deployment (server actions from a
 * previous build 404 after a deploy — clients must refresh).
 */
export function getAppBuildId(): string {
    if (cached) return cached;
    try {
        cached = readFileSync(path.join(process.cwd(), '.next', 'BUILD_ID'), 'utf8').trim();
    } catch {
        cached = '';
    }
    if (!cached) {
        cached = process.env.VERCEL_GIT_COMMIT_SHA || 'dev';
    }
    return cached;
}

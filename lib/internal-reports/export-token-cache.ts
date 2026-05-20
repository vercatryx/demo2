import { randomBytes } from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

export type Entry = { buffer: Buffer; mime: string; filename: string };

const TTL_MS = 45 * 60 * 1000;

const TOKEN_RE = /^[a-f0-9]{48}$/;

function tmpRoot(): string {
    const override = process.env.INTERNAL_REPORTS_EXPORT_TMP?.trim();
    return override && override.length > 0 ? override : path.join(os.tmpdir(), 'demo-food-internal-reports');
}

function xlsxPath(token: string): string {
    return path.join(tmpRoot(), `${token}.xlsx`);
}

function metaPath(token: string): string {
    return path.join(tmpRoot(), `${token}.meta.json`);
}

type Meta = { filename: string; expiresAt: number };

function sweepExpiredFiles(): void {
    const root = tmpRoot();
    if (!fs.existsSync(root)) return;
    const now = Date.now();
    for (const name of fs.readdirSync(root)) {
        if (!name.endsWith('.meta.json')) continue;
        const full = path.join(root, name);
        try {
            const raw = fs.readFileSync(full, 'utf8');
            const meta = JSON.parse(raw) as Meta;
            if (!meta.expiresAt || meta.expiresAt <= now) {
                const token = name.replace(/\.meta\.json$/, '');
                try {
                    fs.unlinkSync(full);
                } catch {
                    /* ignore */
                }
                try {
                    fs.unlinkSync(xlsxPath(token));
                } catch {
                    /* ignore */
                }
            }
        } catch {
            try {
                fs.unlinkSync(full);
            } catch {
                /* ignore */
            }
        }
    }
}

export function putExportXlsx(buffer: Buffer, filename: string): string {
    sweepExpiredFiles();
    fs.mkdirSync(tmpRoot(), { recursive: true });
    const token = randomBytes(24).toString('hex');
    const meta: Meta = { filename, expiresAt: Date.now() + TTL_MS };
    fs.writeFileSync(xlsxPath(token), buffer);
    fs.writeFileSync(metaPath(token), JSON.stringify(meta), 'utf8');
    return token;
}

export function getExport(token: string): Entry | null {
    if (!TOKEN_RE.test(token)) return null;
    sweepExpiredFiles();
    const mp = metaPath(token);
    const xp = xlsxPath(token);
    if (!fs.existsSync(mp) || !fs.existsSync(xp)) return null;
    let meta: Meta;
    try {
        meta = JSON.parse(fs.readFileSync(mp, 'utf8')) as Meta;
    } catch {
        return null;
    }
    if (!meta.expiresAt || meta.expiresAt <= Date.now()) {
        try {
            fs.unlinkSync(mp);
            fs.unlinkSync(xp);
        } catch {
            /* ignore */
        }
        return null;
    }
    try {
        const buffer = fs.readFileSync(xp);
        return {
            buffer,
            mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            filename: meta.filename || 'export.xlsx',
        };
    } catch {
        return null;
    }
}

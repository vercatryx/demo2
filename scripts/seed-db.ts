import { Pool } from 'pg';

type Row = Record<string, unknown>;

function quoteIdent(name: string): string {
    if (!/^[a-z_][a-z0-9_]*$/i.test(name)) throw new Error(`Invalid identifier: ${name}`);
    return `"${name}"`;
}

function serializeValue(v: unknown): unknown {
    if (v === undefined) return null;
    if (v !== null && typeof v === 'object' && !(v instanceof Date)) {
        return JSON.stringify(v);
    }
    return v;
}

function poolConnectionString(connectionString: string): string {
    try {
        const u = new URL(connectionString);
        u.searchParams.delete('sslmode');
        u.searchParams.delete('sslrootcert');
        return u.toString();
    } catch {
        return connectionString;
    }
}

export function createPgSeedDb(connectionString: string) {
    const pool = new Pool({
        connectionString: poolConnectionString(connectionString),
        ssl: { rejectUnauthorized: false },
    });

    function from(table: string) {
        const tableSql = quoteIdent(table);
        return {
            delete() {
                const runDelete = async (whereSql: string, params: unknown[]) => {
                    try {
                        const result = await pool.query(`DELETE FROM ${tableSql} WHERE ${whereSql}`, params);
                        return { error: null, count: result.rowCount ?? 0 };
                    } catch (error) {
                        const err = error as { message: string; code?: string };
                        return { error: err, count: 0 };
                    }
                };
                return {
                    neq(column: string, value: string) {
                        return runDelete(`${quoteIdent(column)} <> $1`, [value]);
                    },
                    eq(column: string, value: unknown) {
                        return runDelete(`${quoteIdent(column)} = $1`, [value]);
                    },
                };
            },
            async insert(rows: Row | Row[]) {
                const list = Array.isArray(rows) ? rows : [rows];
                if (list.length === 0) return { error: null };
                const cols = Object.keys(list[0]!);
                const colSql = cols.map(quoteIdent).join(', ');
                const values: unknown[] = [];
                const tuples = list.map((row, ri) => {
                    const placeholders = cols.map((col, ci) => {
                        values.push(serializeValue(row[col]));
                        return `$${ri * cols.length + ci + 1}`;
                    });
                    return `(${placeholders.join(', ')})`;
                });
                const sql = `INSERT INTO ${tableSql} (${colSql}) VALUES ${tuples.join(', ')}`;
                try {
                    await pool.query(sql, values);
                    return { error: null };
                } catch (error) {
                    const err = error as { message: string; code?: string };
                    return { error: err };
                }
            },
            update(values: Row) {
                return {
                    eq(column: string, value: unknown) {
                        return {
                            async then(
                                resolve?: (v: { error: { message: string } | null }) => void,
                                reject?: (e: unknown) => void
                            ) {
                                const cols = Object.keys(values);
                                const setSql = cols.map((c, i) => `${quoteIdent(c)} = $${i + 1}`).join(', ');
                                const params = cols.map((c) => serializeValue(values[c]));
                                params.push(value);
                                const sql = `UPDATE ${tableSql} SET ${setSql} WHERE ${quoteIdent(column)} = $${params.length}`;
                                try {
                                    await pool.query(sql, params);
                                    const result = { error: null as { message: string } | null };
                                    resolve?.(result);
                                    return result;
                                } catch (error) {
                                    const err = error as { message: string };
                                    const result = { error: err };
                                    reject?.(error);
                                    return result;
                                }
                            },
                        };
                    },
                };
            },
            async upsert(row: Row, opts?: { onConflict?: string }) {
                const cols = Object.keys(row);
                const colSql = cols.map(quoteIdent).join(', ');
                const values = cols.map((c) => serializeValue(row[c]));
                const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
                const conflict = opts?.onConflict ? quoteIdent(opts.onConflict) : quoteIdent('id');
                const updates = cols
                    .filter((c) => c !== opts?.onConflict)
                    .map((c) => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`)
                    .join(', ');
                const sql = `INSERT INTO ${tableSql} (${colSql}) VALUES (${placeholders})
          ON CONFLICT (${conflict}) DO UPDATE SET ${updates}`;
                try {
                    await pool.query(sql, values);
                    return { error: null };
                } catch (error) {
                    const err = error as { message: string; code?: string };
                    return { error: err };
                }
            },
        };
    }

    return {
        from,
        async probe() {
            try {
                await pool.query('SELECT 1');
                return { error: null as { message: string } | null };
            } catch (error) {
                return { error: error as { message: string } };
            }
        },
        async end() {
            await pool.end();
        },
    };
}

export type SeedDb = ReturnType<typeof createPgSeedDb>;

-- Store full Unite Us case URLs in case_id_external / client_id_external.
-- A typical URL is ~125–140 chars; the original varchar(100) caused
-- "value too long" (22001) on client sidebar save → opaque production 500.
-- Safe to re-run.

ALTER TABLE clients ALTER COLUMN case_id_external TYPE text;
ALTER TABLE clients ALTER COLUMN client_id_external TYPE text;

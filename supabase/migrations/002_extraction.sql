-- Phase 2: extra columns for the extraction pipeline. Idempotent.
alter table quote_lines add column if not exists line_no int;
alter table quote_lines add column if not exists basis_count numeric;
alter table quote_lines add column if not exists basis_item text;
alter table quote_lines add column if not exists extraction_id uuid references extractions(id) on delete set null;
alter table extractions add column if not exists latency_ms int;
alter table extractions add column if not exists attempts jsonb not null default '[]';
alter table open_items add column if not exists key text;
create unique index if not exists open_items_rfx_key on open_items(rfx_id, key);

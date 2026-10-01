-- Close an RFx once a decision is taken (DECISIONS F3). Idempotent.
alter table rfxs drop constraint if exists rfxs_status_check;
alter table rfxs add constraint rfxs_status_check check (status in ('draft','sent','collecting','evaluating','closed'));
alter table rfxs add column if not exists closed_at timestamptz;
alter table rfxs add column if not exists closed_note text;
alter table rfxs add column if not exists status_before_close text;

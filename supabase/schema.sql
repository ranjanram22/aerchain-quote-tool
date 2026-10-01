-- Aerchain Quote Tool: database schema.
-- Paste this whole file into Supabase > SQL Editor > New query > Run.
-- Safe to re-run: every statement is idempotent.

create extension if not exists pgcrypto;

-- ---------- Master data ----------

create table if not exists vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  email text,
  city text,
  state text,
  gstin text,
  categories text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text,
  ply int,
  flute text,
  gsm text,
  bf text,
  length_mm numeric,
  width_mm numeric,
  height_mm numeric,
  print text,
  base_unit text not null default 'piece',
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists fx_rates (
  currency text primary key,
  rate_to_inr numeric not null,
  as_of date not null,
  source_note text,
  updated_at timestamptz not null default now()
);

create table if not exists last_year_prices (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors(id) on delete cascade,
  line_key text not null,
  description text,
  unit text not null,
  price_inr numeric not null,
  contract_ref text,
  valid_from date,
  valid_to date
);

-- ---------- RFx ----------

create table if not exists rfxs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text,
  location text,
  scope text,
  terms jsonb not null default '{}',
  status text not null default 'draft'
    check (status in ('draft','sent','collecting','evaluating','closed')),
  rfx_date date not null default current_date,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_note text,
  status_before_close text
);

create table if not exists rfx_lines (
  id uuid primary key default gen_random_uuid(),
  rfx_id uuid not null references rfxs(id) on delete cascade,
  line_no int not null,
  product_id uuid references products(id) on delete set null,
  line_key text,
  description text not null,
  category text,
  spec jsonb not null default '{}',
  unit text not null,
  annual_qty numeric,
  unique (rfx_id, line_no)
);

create table if not exists rfx_questions (
  id uuid primary key default gen_random_uuid(),
  rfx_id uuid not null references rfxs(id) on delete cascade,
  q_no int not null,
  code text,
  text text not null,
  requirement jsonb not null default '{}',
  weight numeric not null default 1,
  unique (rfx_id, q_no)
);

create table if not exists rfx_vendors (
  rfx_id uuid not null references rfxs(id) on delete cascade,
  vendor_id uuid not null references vendors(id) on delete cascade,
  invited_at timestamptz not null default now(),
  status text not null default 'invited',
  primary key (rfx_id, vendor_id)
);

create table if not exists outbox (
  id uuid primary key default gen_random_uuid(),
  rfx_id uuid references rfxs(id) on delete cascade,
  vendor_id uuid references vendors(id) on delete set null,
  kind text not null check (kind in ('invite','followup')),
  to_email text,
  subject text not null,
  body text not null,
  sent_at timestamptz not null default now()
);

-- ---------- Responses & extraction ----------

create table if not exists responses (
  id uuid primary key default gen_random_uuid(),
  rfx_id uuid not null references rfxs(id) on delete cascade,
  vendor_id uuid not null references vendors(id) on delete cascade,
  received_at timestamptz not null default now(),
  raw_email_text text,
  version int not null default 1,
  superseded_by uuid references responses(id) on delete set null,
  processing_status text not null default 'pending'
    check (processing_status in ('pending','processing','done','error')),
  error text
);

create table if not exists response_files (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references responses(id) on delete cascade,
  storage_path text not null,
  filename text not null,
  mime text,
  kind text not null default 'other'
    check (kind in ('quote','certificate','test_report','other')),
  processing_status text not null default 'pending'
    check (processing_status in ('pending','processing','done','error')),
  error text,
  created_at timestamptz not null default now()
);

create table if not exists extractions (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references responses(id) on delete cascade,
  model text not null,
  raw_json jsonb not null,
  overall_confidence numeric,
  notes jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table if not exists quote_lines (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references responses(id) on delete cascade,
  vendor_line_text text,
  matched_rfx_line_id uuid references rfx_lines(id) on delete set null,
  match_confidence numeric,
  match_reason text,
  price_value numeric,
  price_currency text,
  price_unit_as_written text,
  qty_basis text,          -- piece | per_100 | per_1000 | per_kg | per_pack | per_set | ...
  pieces_per_pack numeric,
  weight_per_piece_kg numeric,
  offered_spec jsonb,
  deviation jsonb,
  reference_phrase text,   -- e.g. "rest same as last year" when price is a reference
  provenance jsonb not null default '{}',  -- {file_id, filename, locator, snippet}
  confidence numeric,
  value_origin text not null default 'stated'
    check (value_origin in ('stated','inferred','assumed','buyer_input')),
  created_at timestamptz not null default now()
);

create table if not exists commercial_terms (
  response_id uuid primary key references responses(id) on delete cascade,
  freight jsonb,
  discounts jsonb not null default '[]',
  gst jsonb,
  payment_terms jsonb,
  validity jsonb,
  lead_time jsonb,
  incoterm jsonb,
  other jsonb not null default '[]'
);

create table if not exists questionnaire_answers (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references responses(id) on delete cascade,
  question_id uuid not null references rfx_questions(id) on delete cascade,
  answer_text text,
  normalized jsonb,
  status text not null default 'unknown'
    check (status in ('pass','fail','unknown','not_answered')),
  provenance jsonb not null default '{}'
);

create table if not exists attachment_facts (
  id uuid primary key default gen_random_uuid(),
  response_file_id uuid references response_files(id) on delete cascade,
  response_id uuid references responses(id) on delete cascade,
  fact_type text not null,
  issuer text,
  cert_no text,
  valid_until date,
  is_valid_on_rfx_date boolean,
  details jsonb,
  provenance jsonb not null default '{}'
);

-- ---------- Buyer workflow ----------

create table if not exists open_items (
  id uuid primary key default gen_random_uuid(),
  rfx_id uuid not null references rfxs(id) on delete cascade,
  vendor_id uuid references vendors(id) on delete cascade,
  response_id uuid references responses(id) on delete cascade,
  rfx_line_id uuid references rfx_lines(id) on delete cascade,
  quote_line_id uuid references quote_lines(id) on delete cascade,
  kind text not null check (kind in (
    'pieces_per_pack','weight_per_piece','freight_amount','fx_rate',
    'confirm_interpretation','missing_line','unanswered_question','expired_cert','price_check')),
  message text not null,
  details jsonb,
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  resolution jsonb,
  resolved_by text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  rfx_id uuid references rfxs(id) on delete cascade,
  actor text not null,
  action text not null,
  target text,
  old_value jsonb,
  new_value jsonb,
  note text,
  at timestamptz not null default now()
);

create table if not exists llm_calls (
  id uuid primary key default gen_random_uuid(),
  task text not null,
  model text not null,
  latency_ms int,
  input_tokens int,
  output_tokens int,
  ok boolean not null,
  error text,
  at timestamptz not null default now()
);

-- Co-pilot chat history in Gemini's native format (thought signatures kept; DECISIONS T9)
create table if not exists copilot_messages (
  id uuid primary key default gen_random_uuid(),
  rfx_id uuid not null references rfxs(id) on delete cascade,
  seq int not null,
  turn int not null,
  role text not null check (role in ('user','model')),
  kind text not null check (kind in ('buyer','model','tool_result')),
  parts jsonb not null,
  model text,
  meta jsonb not null default '{}',
  at timestamptz not null default now(),
  unique (rfx_id, seq)
);

-- ---------- Indexes ----------

create index if not exists idx_rfx_lines_rfx on rfx_lines(rfx_id);
create index if not exists idx_responses_rfx on responses(rfx_id);
create index if not exists idx_quote_lines_resp on quote_lines(response_id);
create index if not exists idx_open_items_rfx on open_items(rfx_id);
create index if not exists idx_audit_rfx on audit_log(rfx_id);
create index if not exists idx_qa_resp on questionnaire_answers(response_id);
create index if not exists idx_copilot_messages_rfx on copilot_messages(rfx_id, seq);

-- ---------- Security ----------
-- The app talks to the database only from the server with the secret key,
-- which bypasses RLS. Enabling RLS with no policies blocks the public anon key.

do $$
declare t text;
begin
  foreach t in array array[
    'vendors','products','fx_rates','last_year_prices','rfxs','rfx_lines','rfx_questions',
    'rfx_vendors','outbox','responses','response_files','extractions','quote_lines',
    'commercial_terms','questionnaire_answers','attachment_facts','open_items','audit_log','llm_calls','copilot_messages'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- ---------- Storage bucket for uploaded vendor files (private) ----------

insert into storage.buckets (id, name, public)
values ('vendor-files', 'vendor-files', false)
on conflict (id) do nothing;
-- Phase 2: extra columns for the extraction pipeline. Idempotent.
alter table quote_lines add column if not exists line_no int;
alter table quote_lines add column if not exists basis_count numeric;
alter table quote_lines add column if not exists basis_item text;
alter table quote_lines add column if not exists extraction_id uuid references extractions(id) on delete set null;
alter table extractions add column if not exists latency_ms int;
alter table extractions add column if not exists attempts jsonb not null default '[]';
alter table open_items add column if not exists key text;
create unique index if not exists open_items_rfx_key on open_items(rfx_id, key);

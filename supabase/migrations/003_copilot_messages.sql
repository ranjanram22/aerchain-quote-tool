-- Co-pilot chat history, stored server-side in Gemini's native format so that
-- thought signatures survive reloads (DECISIONS T9). Idempotent.
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
create index if not exists idx_copilot_messages_rfx on copilot_messages(rfx_id, seq);
alter table copilot_messages enable row level security;

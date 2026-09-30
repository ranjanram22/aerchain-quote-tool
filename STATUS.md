# STATUS.md

Live URL: https://aerchain-quote-tool.vercel.app
Repo: github.com/ranjanram22/aerchain-quote-tool (private)

## Phase 0: Skeleton & deploy — DONE (2026-09-30)
- Next.js 16 + Tailwind app on Vercel (functions pinned to Mumbai, `bom1`).
- Supabase project `aerchain-quote-tool` (Mumbai): full schema from `supabase/schema.sql` applied, private `vendor-files` bucket created, RLS on for every table.
- `lib/models.ts` (model IDs verified on OpenRouter), `lib/llm.ts` (timeout, retry, fallback, logging to `llm_calls`), `lib/supabase.ts` (server-only).
- Home page: header, RFx list (empty), System check panel, "LLM ping" button.
- Acceptance: live URL shows Home; LLM ping returns ok from both Nemotron (free) and Claude Sonnet 5.5; health check green for keys, tables and bucket.

## Phase 1: Seed data & files — DONE (2026-09-30)
- `seed/data.ts`: 5 vendors, 30 RFx lines (3/5/7-ply RSC, mailers, printed, sheets, partitions, edge protectors), 12-question questionnaire, terms, 47 last-year prices (E and B), FX (USD 88.40, EUR 103.15 as of 25 Sep 2026).
- `npm run seed:files` generates: A `.xlsx` (USD, own names/order, freight per shipment), B letterhead PDF (per 100, footnote discount, freight incl.) + ISO + test report, C `.docx` (27/30, 150 GSM deviation, per box of 50, per bundle), D rate card PNG to photograph + ISO, E one-line email + expired ISO; A ISO + FSC. `samples/unseen/`: CSV, scanned PDF, WhatsApp text.
- `seed/check-story.ts` confirms the designed story on generator ground truth.
- `npm run seed` resets and loads master data + RFx + 5 simulated invitations.
- Home: RFx list (status, responses x/5, open ⚠ count) + Admin tabs (Vendors add/edit/delete, Products list/add, Last-year prices read-only, FX editable, System check). Admin edits are written to `audit_log`.
- Acceptance: Home lists the seed RFx; Admin tabs show vendors, products, last-year prices, FX. Verified locally (including an FX edit round trip) and on the live URL.
- Vendor D photo taken by Ranjan (angled phone shot of the rate card on a laptop screen) → `seed/files/vendor-d/rate-card-photo.jpg`.

## Phase 2: Extraction + normalization — DONE (2026-09-30)
- `lib/extract/`: preprocess (Excel/CSV → cell grid, Word → numbered paragraphs, PDF/images → vision), generic prompt, zod schema, run with repair + escalation, persistence with provenance.
- `lib/normalize.ts`: deterministic unit/FX/discount/freight/last-year/deviation/coverage/outlier/questionnaire logic; derives open items. `lib/rfx-data.ts`: bundle loader + open-item sync.
- `lib/followup.ts` + `POST /api/rfx/[id]/followup`: structured gap list → LLM-drafted email (template fallback).
- `POST /api/rfx/[id]/responses`: upload files/email text, extraction runs in the background (`after`).
- `npm run seed` now runs the real pipeline on all 5 replies; `npm run extract -- <A-E>` re-runs one vendor; `seed/verify.ts` checks against generator ground truth.
- Acceptance: A 30/30, B 30/30, C 30/30 (27 quoted + deviation + per-bundle ⚠), D 30/30 from the angled phone photo (line 18 per-kg ⚠), E: per-kg converted via RFx spec weights, "rest same as last year" → assumed from last-year contract, lines 29–30 ⚠, freight ⚠, expired ISO → fail. See TESTS.md.

## Phase 3: Workspace UI — DONE (2026-09-30)
- `/rfx/[id]`: header with ⚠ count, tabs Summary · Comparison · Questionnaire & attachments · Responses · Outbox · Activity, right-hand chat panel (placeholder until Phase 4).
- Summary: facts, vendor headline table (coverage, unit & landed totals, freight, mandatory status, ⚠), key flags, all open items with inline forms.
- Comparison: 30 × 5 grid, 7 cell states with icon + colour + legend, hover explanation, row minimum, unit vs landed toggle, include-deviations toggle, category filter, column totals with coverage.
- Source drawer: file, location, verbatim snippet, as-written value, match reason, confidence, model, every computation step, open items with forms (and resolved history), edit extracted value (logged), original file (image / PDF / Word & Excel HTML preview).
- Responses: per vendor side-by-side original ↔ extracted lines, AI notes, attempts, commercial terms, gaps list with inline forms, LLM follow-up draft → Send (simulated) → Outbox; upload/paste newer reply with auto-refresh while reading; retry on error.
- Acceptance: resolving a ⚠ (C line 29 bundle size = 100) recomputed the grid, totals and coverage immediately and was logged in Activity with the note.

## Next
Phase 4: analysis chat (agent + tools + structured answers).

## Known issues
- Vendor E's "the 3-ply / the 5-ply" was applied by the model to every 3-/5-ply line (incl. printed boxes and sheets); flagged as one ⚠ scope confirmation per group. Lines 23–24 need piece weights. This is intended behaviour for an ambiguous reply, not an extraction error.
- Vendor D fails "all mandatory" until the buyer marks Q3 (in-house testing: card mentions burst & BCT, not ECT/reports) as pass or fail.
- Vercel did not start a build on the initial import; an empty commit push triggered it. Pushes to `main` deploy normally now.

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

## Phase 4: Analysis chat — DONE (2026-09-30)
- `lib/agent/tools.ts`: 12 deterministic tools (overview, comparison, vendor profile, open items, rank with like-for-like, cheapest per line with savings vs single vendor and last year, constrained split, compare to last year, what-if, query_rows DSL, make_chart, make_table).
- `lib/agent/run.ts`: tool loop (max 8 calls), structured answer, number post-check with one regeneration, ⚠ refs; `POST /api/rfx/[id]/chat`; `POST /api/export` (.xlsx).
- Chat panel: quick chips, text + tables (Download Excel) + recharts charts, ⚠ chips that open the inline resolve form, "How this was computed" (tools + params, included, excluded, caveats, model, number check).
- ANALYSIS_MODEL switched to Claude Sonnet 5.5 after testing (DECISIONS T7).
- Acceptance (all answered correctly with traced numbers): cheapest per line among mandatory-compliant vendors; same with freight; who hasn't answered what; what changes if Shree Ganesh's discount doesn't apply.
- Cut: pin-to-summary (SPEC §9 first cut).

## Phase 5: Co-pilot + publish — DONE (2026-09-30)
- Home "New RFx" → draft RFx in DB → split view: co-pilot chat (left) + live editable draft (right: header, lines with spec, questionnaire with mandatory toggles, terms, "still missing" banner).
- Co-pilot tools: set_header, search_catalog, add/update/remove line, set_questionnaire, set_terms (`lib/copilot.ts`, `lib/draft.ts`); paste-a-list parses rows into lines.
- Publish dialog: pick vendors → invitations in Outbox (simulated) → status Sent → workspace.
- Acceptance: built a 5-line Nashik RFx by chat (3 items described + 2 pasted rows, all matched to catalog), 15-question questionnaire, terms; published to 3 vendors; pasted an email reply from one vendor → extracted 5/5 lines (per 100 converted, freight ₹3,200/trip × 60 trips/yr) and shown in the grid.

## Phase 6: Hardening + switch to free models — DONE (2026-09-30)
- Unseen inputs (CSV per 1000, scanned PDF per dozen, WhatsApp text, iPhone HEIC) handled; results in TESTS.md.
- HEIC support, "part of this reply couldn't be read" banner, add a vendor to a published RFx, map unmatched items to lines.
- Fully free models (Gemini native SDK + OpenRouter :free); model chains, back-off, cool-down, streamed "busy / switching" status; extraction cache by file hash.
- Safeguards for weaker models: photo transcription, second read of every reply, verified deviations, whole-reply low-confidence ⚠.
- Gemini vs Sonnet eval and all 15 unrehearsed questions in TESTS.md; decisions T8/E8.
- Demo data reset with the free pipeline (16 open ⚠ items).

## Post-phase additions (2026-10-01)
- Admin → System → Reset demo data (typed confirmation, cache-backed, ~1 min).
- Chat what-if for freight changes.
- Responses → Version history with compare-to-current.
- Guard: extracted prices/weights must appear in the source text (E9).
- Co-pilot fixes (T9/T10):
  - Chat history is now saved in the database (Gemini format, thought signatures kept), which fixes the 400 "missing thought_signature" error.
  - Gemini-only chain: Flash-Lite at minimal thinking, then Flash.
  - One `update_draft` tool, and replies stream into the chat.
  - About 27 s per turn before, about 6 s per turn after.

## Next
- Ranjan to test live upload (photo) on Vercel within the 5-minute limit.
- Optional: demo script, split freight rates, test-report facts, questionnaire overrides, plain-language activity log, README polish.
- Decide at the end: keep free models or move photo reading back to a paid model.

## Known issues
- Co-pilot fallback Flash models on the free tier are often busy (503) or over quota. A turn that falls back can take 30–40 s; Flash-Lite turns take about 6 s.
- Free models (mostly gemini-3.5-flash-lite in practice): the angled photo and the one-line incumbent email read less reliably than with Sonnet and vary between runs; errors are ⚠-flagged, never silent (TESTS.md). With the current seed read, Om Sai is no longer the headline-cheapest vendor and Mahalaxmi counts as mandatory-compliant.
- Flash models on the free tier are often busy/over quota; answers then come from Flash-Lite (slower, less careful prose).
- Vercel did not start a build on the initial import; an empty commit push triggered it. Pushes to `main` deploy normally now.

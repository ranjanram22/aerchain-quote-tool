# STATUS.md

Live URL: https://aerchain-quote-tool.vercel.app
Repo: github.com/ranjanram22/aerchain-quote-tool (private)

## Phase 0: Skeleton & deploy — DONE (2026-09-30)
- Next.js 16 + Tailwind app on Vercel (functions pinned to Mumbai, `bom1`).
- Supabase project `aerchain-quote-tool` (Mumbai): full schema from `supabase/schema.sql` applied, private `vendor-files` bucket created, RLS on for every table.
- `lib/models.ts` (model IDs verified on OpenRouter), `lib/llm.ts` (timeout, retry, fallback, logging to `llm_calls`), `lib/supabase.ts` (server-only).
- Home page: header, RFx list (empty), System check panel, "LLM ping" button.
- Acceptance: live URL shows Home; LLM ping returns ok from both Nemotron (free) and Claude Sonnet 5.5; health check green for keys, tables and bucket.

## Phase 1: Seed data & files — DONE (2026-09-30), one input pending
- `seed/data.ts`: 5 vendors, 30 RFx lines (3/5/7-ply RSC, mailers, printed, sheets, partitions, edge protectors), 12-question questionnaire, terms, 47 last-year prices (E and B), FX (USD 88.40, EUR 103.15 as of 25 Sep 2026).
- `npm run seed:files` generates: A `.xlsx` (USD, own names/order, freight per shipment), B letterhead PDF (per 100, footnote discount, freight incl.) + ISO + test report, C `.docx` (27/30, 150 GSM deviation, per box of 50, per bundle), D rate card PNG to photograph + ISO, E one-line email + expired ISO; A ISO + FSC. `samples/unseen/`: CSV, scanned PDF, WhatsApp text.
- `seed/check-story.ts` confirms the designed story on generator ground truth.
- `npm run seed` resets and loads master data + RFx + 5 simulated invitations.
- Home: RFx list (status, responses x/5, open ⚠ count) + Admin tabs (Vendors add/edit/delete, Products list/add, Last-year prices read-only, FX editable, System check). Admin edits are written to `audit_log`.
- Acceptance: Home lists the seed RFx; Admin tabs show vendors, products, last-year prices, FX. Verified locally (including an FX edit round trip) and on the live URL.
- **Pending (Ranjan):** phone photo of the vendor D rate card → `seed/files/vendor-d/rate-card-photo.jpg`.

## Next
Phase 2: extraction + normalization pipeline, run on all 5 vendors.

## Known issues
- Vercel did not start a build on the initial import; an empty commit push triggered it. Pushes to `main` deploy normally now.

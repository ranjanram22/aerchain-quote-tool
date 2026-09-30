# STATUS.md

Live URL: https://aerchain-quote-tool.vercel.app
Repo: github.com/ranjanram22/aerchain-quote-tool (private)

## Phase 0: Skeleton & deploy — DONE (2026-09-30)
- Next.js 16 + Tailwind app on Vercel (functions pinned to Mumbai, `bom1`).
- Supabase project `aerchain-quote-tool` (Mumbai): full schema from `supabase/schema.sql` applied, private `vendor-files` bucket created, RLS on for every table.
- `lib/models.ts` (model IDs verified on OpenRouter), `lib/llm.ts` (timeout, retry, fallback, logging to `llm_calls`), `lib/supabase.ts` (server-only).
- Home page: header, RFx list (empty), System check panel, "LLM ping" button.
- Acceptance: live URL shows Home; LLM ping returns ok from both Nemotron (free) and Claude Sonnet 5.5; health check green for keys, tables and bucket.

## Next
Phase 1: seed data generators, seed files, `npm run seed` (vendors, products, RFx, last-year prices, FX), Admin tabs on Home.

## Known issues
- Vercel did not start a build on the initial import; an empty commit push triggered it. Pushes to `main` deploy normally now.

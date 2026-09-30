# STATUS.md

## Phase 0: Skeleton & deploy — in progress
Done:
- Next.js 16 + Tailwind app, builds cleanly.
- `lib/models.ts` (model IDs verified on OpenRouter), `lib/llm.ts` (timeout, retry, fallback, logging), `lib/supabase.ts` (server-only).
- `supabase/schema.sql`: full data model from SPEC §5 plus the `vendor-files` bucket.
- Home page with RFx list, System check panel, and "LLM ping" button (`/api/llm-ping`, `/api/health`).

Waiting on Ranjan:
- Create GitHub repo, Supabase project + schema, Vercel project + env vars.

## Next
Phase 1: seed data and files.

## Known issues
- None yet.

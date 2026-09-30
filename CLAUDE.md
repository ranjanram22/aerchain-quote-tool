# CLAUDE.md — working instructions for this repo

## What this is
A prototype for Aerchain's Senior PM take-home ("Kill the Quote Spreadsheet"): an AI procurement tool that drafts an RFx, reads vendor replies in any format, normalizes them into one comparison, and answers the buyer's questions in plain language.

- **SPEC.md is the source of truth** for product, architecture, data model, and build phases. Read it at the start of every session.
- `docs/assignment.pdf` is the original brief (not committed to git). Use it only to check the assignment's exact wording. If it and SPEC.md seem to conflict, follow SPEC.md and flag the conflict to the user.
- Read `STATUS.md` at the start of every session to see where the build stands.

## Who you're working with
The user, Ranjan, is a product manager who has never written or deployed code.
- Do all technical work yourself. Don't ask him to choose between technical options; decide, and log non-trivial decisions in `DECISIONS.md` (what, alternatives, why).
- Ask him only about product questions SPEC.md doesn't answer. Recommend an answer when you ask.
- When he has to act (dashboard clicks, pasting secrets, running a command, taking a photo), give numbered, copy-paste-ready steps, one action per step, and say what he should see when it worked.
- If something is blocked on him, say what, why you can't do it, and the time/cost.
- Keep explanations short and non-technical unless he asks.

## Non-negotiable rules
1. **The AI loops must be real.** Never hardcode extraction results or answers to demo questions. Prompts must be generic: no demo vendor names, prices, or file names in any prompt. Seed data must come from running the real extraction pipeline.
2. **The LLM reads and reasons; code computes.** Every number shown on screen comes from deterministic TypeScript (conversion, FX, discounts, freight, totals, rankings, scenarios), never from model-generated text.
3. **Never guess silently.** A missing fact (pieces per box, weight per piece, freight amount) becomes a ⚠ needs-input item, never an invented value. Unquoted lines show "Not quoted", never 0 or blank. Totals always state coverage.
4. **Provenance on every extracted value**: source file, location, verbatim snippet, confidence, origin (stated/inferred/assumed/buyer input).
5. **Secrets** (`OPENROUTER_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) live only in `.env.local` and Vercel env vars. Never commit them, never print them, never send them to the browser. Keep `.env*` and `docs/` in `.gitignore`.
6. **All model IDs live in `lib/models.ts`.** Verify current OpenRouter model IDs before using them.

## How to work
- Follow SPEC.md's phases in order. Finish and verify each phase's acceptance check before starting the next.
- After each phase: run the build locally, fix errors, commit with a clear message, push, confirm the Vercel deployment succeeds, and update `STATUS.md` (done / next / known issues). Tell Ranjan the live URL and what to click to see the new work.
- Prefer small, working increments over big rewrites. Don't add dependencies or features beyond SPEC.md without logging why.
- If behind schedule, cut in the order SPEC.md §9 gives. Never cut the items it marks as never-cut.
- Test with unseen inputs, not only the seed files. Record results in `TESTS.md`.
- When something fails, explain it in one plain sentence, fix it, and say what changed.

@AGENTS.md

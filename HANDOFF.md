# HANDOFF.md — paste the prompt below into a new Claude Code session

---

You're continuing work on the Aerchain take-home prototype ("Quote Desk") in `/Users/ranjan/Desktop/aerchain-quote-tool`. Read `CLAUDE.md`, `SPEC.md`, `STATUS.md`, `DECISIONS.md` and `TESTS.md` first; they are current. This note covers what those files don't.

**State (2026-10-01):** SPEC Phases 0–6 are complete and live at https://aerchain-quote-tool.vercel.app (GitHub `ranjanram22/aerchain-quote-tool`, private; every push to `main` auto-deploys on Vercel). Post-phase additions: Admin → System → "Reset demo data", chat freight what-ifs, Responses → Version history, and the source-text number guard (DECISIONS E9).

**Hard constraints from Ranjan:**
- **Free models only.** No OpenRouter credits and no paid models. `lib/models.ts` has the chains and `assertFree()` enforces the rule.
  - Extraction: gemini-3.8-flash → gemini-3.6-flash → gemini-3.5-flash-lite.
  - Analysis: the same chain, then `nvidia/nemotron-3-ultra-550b-a55b:free`.
  - Co-pilot and follow-ups: Nemotron free → Flash-Lite.
  - In practice 3.8 is over quota or busy and 3.6 is often 503, so Flash-Lite does most of the work.
  - Whether to move back to paid models is deferred to the very end; don't change it unprompted.
- Ranjan is a PM, not a developer. Do the technical work yourself, give numbered copy-paste steps when he must act, and keep explanations short.
- Never type API keys or passwords into websites for him. Put the value on his clipboard and open the page, so he pastes it himself.

**Infrastructure you'll need:**
- **Secrets** live in `.env.local`: `OPENROUTER_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`. The same four are set in Vercel. Never print them.
- **Supabase** project ref `idffloxbrmtlmljcvnma` (Mumbai); Vercel functions are pinned to `bom1`.
  - Schema: `supabase/schema.sql`, plus migrations in `supabase/migrations/`. There is no DB password or CLI.
  - To run SQL, open `https://supabase.com/dashboard/project/idffloxbrmtlmljcvnma/sql/new` in Claude in Chrome. Set the editor text with `window.monaco.editor.getModels()[0].setValue(sql)`, then click Run via JS, e.g. `[...document.querySelectorAll('button')].find(b=>b.innerText.trim().startsWith('Run')).click()`. Coordinate clicks often miss.
- **Commands:**
  - `npm run dev` runs on port 3000 (a `.claude/launch.json` entry exists).
  - `npm run seed` resets the demo using the extraction cache, so no AI calls.
  - `npm run extract -- D [--no-cache] [--models=gemini:...]` re-reads one seed vendor.
  - `npm run check:gemini` lists and pings the Gemini models.
  - `npx tsx --conditions=react-server --env-file=.env.local seed/verify.ts` checks prices against ground truth.
  - `seed/eval/compare.ts` compares Gemini against the stored Sonnet baseline. `seed/eval/run-unseen.ts` runs the 3 unseen samples, but it adds vendors, so reset afterwards.
  - Scripts importing `lib/` need `--conditions=react-server` because of `server-only`.
  - The shell is zsh: unquoted variables don't word-split.
- **Extraction cache** lives in the Supabase Storage bucket `vendor-files` under `cache/extraction/`. The key includes `CACHE_VERSION` in `lib/extract/run.ts`; bump it only when the extraction itself changes. Post-processing guards in `persist()` apply even on cache hits.
- **Next.js 16**: read `node_modules/next/dist/docs/` before using unfamiliar APIs. Run `npx next typegen` before `tsc` when you add routes.

**Pending, in Ranjan's priority order:**
1. **Two co-pilot issues.** Ranjan is about to describe them; start there.
2. **Live photo upload on Vercel.** Ranjan is testing it himself. Risk: transcribe + read + second read on busy free models may exceed the 300 s function limit. If it fails, split the work (e.g. one pass per request with status polling).
3. **Optional:**
   - A demo script for the interview, covering the ugly-edges walkthrough.
   - Split freight rates (₹/pc for boxes + ₹/kg for sheets), currently a ⚠.
   - Show test-report facts (Shree Ganesh's burst/BCT report).
   - Questionnaire pass/fail overrides for non-mandatory questions.
   - A plain-language Activity log.
   - README polish.
   - A small AI-usage panel from the `llm_calls` table.
4. **At the very end:** decide free vs paid models (see TESTS.md, "Free-model switch").

**Known caveats in the current demo data (Gemini Flash-Lite reads):**
- Om Sai's one-line email: "₹42/kg for the 5-ply" is applied to the 5-ply pad only, and "same as last year" to everything else. Om Sai is therefore no longer the headline-cheapest; all of it is ⚠/assumed.
- Mahalaxmi's photo: 29/30 lines read correctly; line 17's weight is missing and shows as ⚠ needs input. Mahalaxmi now passes mandatory Q3 (Flash-Lite read its testing claim as "yes").
- In every run, 0 wrong values were left without a ⚠ flag.

After each change: build, lint, commit (end commit messages with the Co-Authored-By line), push, confirm the Vercel deploy, and update STATUS/DECISIONS/TESTS.

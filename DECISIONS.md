# DECISIONS.md

Every meaningful decision: what, alternatives considered, why.

## Product

### D1. Category: corrugated packaging
- **What**: Build the prototype around an Indian buyer sourcing corrugated boxes, sheets, partitions and edge protectors.
- **Alternatives**: Office supplies, MRO spares, chemicals.
- **Why**: Corrugated has the hardest unit normalization (per piece, per 100, per box of N, per bundle, per kg with piece weights, per set). If the tool handles this, simpler categories are easy.

### D2. Simulated email
- **What**: RFx invitations and follow-ups go to an in-app Outbox labelled "Simulated send". Vendor replies are uploaded or pasted by the buyer.
- **Alternatives**: Real SMTP/IMAP integration.
- **Why**: The brief allows stubbed plumbing; the graded part is the AI loop. Real email adds deliverability and security work without changing what the reviewer evaluates.

### D3. Model routing by task
- **What**: Paid vision model (Claude Sonnet) for extraction, Claude Opus only for low-confidence retries, free Nemotron model for the co-pilot and analysis chat. All IDs in `lib/models.ts`.
- **Alternatives**: One model for everything.
- **Why**: Extraction reads photos, PDFs and spreadsheets and must be accurate: worth paying for. Chat turns are frequent and text-only, and numbers come from code-side tools, so a free model is acceptable. Each task has a fallback model; switching is a one-line change.

### D4. The LLM reads and reasons; code computes
- **What**: Every number on screen comes from deterministic TypeScript (unit conversion, FX, discounts, freight, totals, rankings, scenarios). The chat model can only quote numbers returned by tools, enforced by a post-check.
- **Alternatives**: Let the model compute totals in its answer.
- **Why**: LLM arithmetic is unreliable, and a buyer with ₹4 crore at stake needs every number traceable to a formula and a source.

### D5. ⚠ needs-input instead of guessing
- **What**: A missing fact (pieces per box, weight per piece, freight amount) becomes an open item the buyer resolves in one click. The system never invents a value.
- **Alternatives**: Estimate from typical industry values.
- **Why**: A silent guess destroys trust in every other number on the screen. Asking is cheap; a wrong award is not.

### D6. Deviations excluded by default
- **What**: Lines where the offered spec differs from the requested spec (e.g. 150 GSM offered vs 180 GSM requested) are excluded from award calculations unless the buyer toggles them in.
- **Alternatives**: Include them and flag.
- **Why**: A cheaper price on a lower spec is not a like-for-like saving. Including it by default would make the non-compliant vendor look best.

### D7. No award lock; disclaimers instead
- **What**: The tool recommends and explains; it does not lock or approve awards. Answers carry coverage and caveats.
- **Alternatives**: Award workflow with approval.
- **Why**: Out of scope for the brief; the buyer's decision stays with the buyer.

### D8. No award memo generator
- **What**: No formal memo document. Tables export to Excel.
- **Alternatives**: Generate a Word/PDF award memo.
- **Why**: The brief asks for a decision, not a document. Excel exports cover sharing.

## Technical

### T1. Stack: Next.js 16 (App Router) + Tailwind 4 on Vercel, Supabase Postgres + Storage
- **Why**: One repo, one deploy target, zero servers to run. Supabase gives Postgres and file storage with a free tier.

### T2. Database accessed only from the server; RLS on with no policies
- **What**: All reads and writes use the Supabase secret (service-role) key from server code. Row Level Security is enabled on every table with no policies.
- **Alternatives**: Use the public anon key from the browser with RLS policies.
- **Why**: No auth in scope. Enabling RLS without policies means the public anon key can read nothing, so leaking it would be harmless; the secret key never reaches the browser.

### T3. Comparison computed in TypeScript, not a SQL view
- **What**: `v_comparison` from the spec is implemented as a function in `lib/normalize.ts`, not a Postgres view.
- **Why**: Normalization logic (units, FX, discounts, freight, last-year references, deviations) is too rich for SQL and must be the single source of truth for the grid, summary and analysis tools. Keeping it in one TS module keeps it testable.

### T4. LLM wrapper with logging
- **What**: `lib/llm.ts` wraps every call: per-task timeout, one retry after 1.5 s on 429/5xx/network errors, then the task's fallback model. Every attempt is logged to `llm_calls` (model, latency, tokens, error).
- **Why**: Free models rate-limit; the demo must not fail on one bad call. Logs give cost and latency numbers for the write-up.

### T5. Model IDs (verified 2026-09-30 against OpenRouter's model list)
- Extraction: `anthropic/claude-sonnet-5.5` (fallback `anthropic/claude-sonnet-5`).
- Hard extraction retry: `anthropic/claude-opus-5.5` (fallback `anthropic/claude-opus-5`).
- Co-pilot / analysis / follow-up drafts: `nvidia/nemotron-3-ultra-550b-a55b:free` (fallback: the paid variant of the same model, to avoid free-tier rate limits changing behaviour).

## Out of scope (deliberate)
Real email send/receive; vendor portal; authentication and roles (a VP uses the same buyer view); multi-currency beyond the INR/USD seed (code supports any rate in `fx_rates`); formal award memo/approval workflow; ERP/PO integration; local image deskewing/OCR (the vision model handles it); mobile layout polish.

### T6. Hosting region: Mumbai for both Vercel functions and Supabase
- **What**: `vercel.json` pins functions to `bom1` (Mumbai); the Supabase project is created in Mumbai (ap-south-1).
- **Alternatives**: Vercel default (US East) with Supabase anywhere.
- **Why**: Every page load makes several database queries; keeping functions and database in the same region avoids ~200 ms per query round trip. Mumbai also suits an Indian buyer.

## Seed data

### S1. Box weights stated in the RFx spec for standard 3-ply and 5-ply shippers only
- **What**: Lines 1–16 carry `approx_weight_kg` in their RFx spec (known from the current contract). 7-ply boxes, mailers, printed boxes, partitions and edge protectors do not.
- **Alternatives**: No weights anywhere (every per-kg quote becomes ⚠); weights on every line (per-kg quotes never need input).
- **Why**: Realistic: buyers know the weight of the standard boxes they already buy, not of every SKU. It lets the incumbent's "₹42/kg for the 5-ply" be converted from a stated fact (shown as a conversion with the source), while a vendor's per-kg price on a 7-ply box with no printed weight correctly becomes ⚠ needs input.

### S2. Seed story designed through prices, verified by a script
- **What**: Vendor prices are generated as reference price × a per-category multiplier (`seed/quotes.ts`); `seed/check-story.ts` checks that the designed answers hold (incumbent headline-cheapest; per-line winners change with freight and with the conditional discount; the deviation line is the only reason vendor C looks cheapest there).
- **Why**: SPEC §8 says to adjust seed prices, not code, if the story doesn't hold. The ground truth never enters the database: extracted values come only from running the pipeline on the generated files.

### S3. `npm run seed` resets the demo database
- **What**: The seed deletes all RFx, vendors, products, FX and last-year rows, then reloads them.
- **Why**: A repeatable known starting state for the demo. The live demo database is a single-tenant prototype, so there is no customer data to protect.

### S4. Vendor A freight allocated pro-rata to line value
- **What**: Vendor A states USD 850 per shipment and about 4 shipments per month. Annual freight = amount × shipments/year, converted to INR and spread across that vendor's quoted lines in proportion to line value (qty × unit price).
- **Alternatives**: Allocate by volume or weight (needs data we don't have); per piece (ignores that big boxes fill trucks faster).
- **Why**: Value-weighted allocation needs no invented facts, and the method is stated in the tooltip so a buyer can challenge it.

## Extraction & normalization (Phase 2)

### E1. JSON Schema in the prompt + zod validation, instead of provider "structured output" mode
- **What**: The zod schema (`lib/extract/schema.ts`) is converted to JSON Schema and put in the system prompt; the reply is parsed and validated with zod. On failure: one repair round with the validation errors, then escalation to `EXTRACTION_HARD_MODEL`.
- **Alternatives**: OpenRouter `response_format: json_schema`.
- **Why**: Structured-output support varies by provider behind OpenRouter; prompt + validation works with any model and gives the same guarantee (nothing unvalidated is stored).

### E2. Escalation to the stronger model
- **What**: Re-run on Claude Opus when the first pass is invalid, overall confidence < 0.6, or a photo is reported only partly readable — and only if ≥ 4 minutes of the request budget remain. The better-confidence result wins; every attempt is stored in `extractions.attempts`.
- **Why**: Opus costs ~2× Sonnet; most replies don't need it. In the seed run only the one-line incumbent email (ambiguous "the 5-ply") escalated.

### E3. PDFs sent natively to the vision model; no local PDF text extraction
- **What**: PDFs go to Claude as file parts; the model cites page and row in provenance. `pdf-parse` (SPEC fallback) is not used.
- **Why**: Claude reads text and scanned PDFs natively, including tables; a second text path adds a dependency without improving provenance. Revisit if a PDF fails in Phase 6.

### E4. Open items have stable keys; buyer answers carry over to re-extractions
- **What**: Normalization derives each open item with a deterministic key (e.g. `ppp:<quote_line>`, `freight:<response>`) and a fingerprint of the underlying fact. `syncOpenItems` inserts new ones, auto-closes ones that no longer apply, and copies a previous buyer resolution when a new response version has the same fingerprint.
- **Why**: SPEC §6: re-running keeps buyer confirmations where the underlying value is unchanged. Normalization reads resolutions from `open_items`, so there is one place where buyer input lives.

### E5. Group statements become one confirmation, not one per line
- **What**: When a vendor gives one price for a group ("₹42/kg for the 5-ply"), the model expands it to each plausible RFx line (origin `inferred`), and normalization groups all those lines into a single "confirm this scope" item.
- **Why**: The scope is genuinely ambiguous (5-ply shippers only, or also the printed 5-ply box and 5-ply pads?). The buyer should decide once, seeing exactly which lines were included.

### E6. Unclear answers to mandatory questions become ⚠ items; unclear ≠ pass
- **What**: A mandatory question answered only partly (e.g. "in-house burst & BCT lab" when the question asks for burst, BCT and ECT with lot reports) is `unknown`, the vendor is not counted as "passes all mandatory", and a ⚠ item asks the buyer to mark it pass or fail.
- **Why**: "Never guess silently." Treating a partial claim as a pass would overstate compliance; treating it as a fail would wrongly exclude the vendor.

### E7. Certificates decide certificate questions
- **What**: If a certificate for the question's topic is attached, its valid-until date against the RFx date decides pass/fail, whatever the vendor claims. A "yes" with no certificate is `unknown`.
- **Why**: A buyer trusts documents over claims; this is exactly how the incumbent's expired ISO certificate is caught.

### P1. Ambiguous seed interpretations stay as buyer decisions (Ranjan, 2026-09-30)
- **What**: (1) Om Sai's "the 3-ply / the 5-ply" scope stays a ⚠ confirmation with the model's broad reading (incl. printed boxes and pads) shown as a disclaimer. (2) Mahalaxmi's partial answer on in-house testing stays "unclear", so it is not counted as passing all mandatory items until the buyer decides.
- **Why**: Both are realistic judgment calls a buyer must own; the demo shows the tool surfacing them instead of silently deciding.

### T7. Analysis chat switched from free Nemotron to Claude Sonnet 5.5 (Phase 4)
- **What**: `ANALYSIS_MODEL` = `anthropic/claude-sonnet-5.5` (fallback `anthropic/claude-sonnet-5`). Co-pilot and follow-up drafts stay on free Nemotron.
- **Evidence** (same 4 acceptance questions, same tools): Nemotron free answered with correct tool calls and passed the number check, but took 22–113 s per answer (free-tier queueing; one fell back to the paid variant) and made factual slips in prose that the number check cannot catch (e.g. calling excluded vendors "mandatory-compliant"). Sonnet answered in ~11 s, stated basis/coverage/exclusions correctly, and on the discount what-if explained that the discount is not applied today and quantified the effect of confirming it.
- **Cost**: ~10–20k input tokens per question ≈ ₹3–5 per answer. Acceptable for a buyer deciding a ₹4 crore award.
- **Why**: SPEC §2 allows the switch if reliability is poor. Trust is graded; a wrong sentence next to a correct number still misleads.

### A1. Analysis agent design (Phase 4)
- **Tables come only from tools.** Each tool returns typed tables with ids; the model picks which to show (`show_tables`) and can only chart an existing table (`make_chart(table_id, columns)`). The model never passes rows or numbers into a table.
- **Number post-check.** Every number in the answer text must match a number in that turn's tool outputs (allowing rounding and lakh/crore/₹ formatting; small integers such as line numbers, counts and years are exempt). On failure the answer is regenerated once; if it still fails, a red banner lists the untraceable figures.
- **Split award method.** Exhaustive over vendor subsets (2^5 = 32 for this RFx); within a subset each line goes to its cheapest eligible vendor; share limits are then met by moving the lines with the smallest extra cost. The best solution covers the most lines, then costs least. This is exact for "max N vendors" and near-optimal with share limits, which is stated in the caveats.
- **Last-year baseline.** The incumbent's price (the vendor with the most last-year records) where one exists, otherwise the lowest last-year price for that line.
- **Discount what-ifs are evaluated on landed cost** (discounts don't change the quoted unit price). If the requested scenario equals today's state, the opposite is shown so the effect is visible.
- **Cut per SPEC §9:** "Pin to Summary" is not built (first item on the cut list). Chat history is kept per browser (localStorage), not in the database.

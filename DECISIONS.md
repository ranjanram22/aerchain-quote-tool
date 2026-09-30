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

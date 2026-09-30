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

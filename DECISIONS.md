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

### C1. Co-pilot design (Phase 5)
- **Drafts live in the database from the first click.** "New RFx" creates an `rfxs` row with status `draft`; every co-pilot tool call and every direct edit writes to it, so the right-hand draft is always the saved state (refresh-safe, no separate draft store). `/rfx/[id]` shows the co-pilot while the status is `draft` and the workspace afterwards.
- **Same operations for the model and the buyer** (`lib/draft.ts`): set_header, add/update/remove line, set_questionnaire, set_terms, search_catalog. The model never writes to tables directly.
- **Catalog first.** The co-pilot searches the catalog before creating a line and copies the product's spec + `product_id` when it matches; the draft marks those lines "✓ from catalog".
- **No invented commercial facts.** The co-pilot may draft the questionnaire (the buyer reviews it) but must not record quantities, dates or terms the buyer did not state; suggestions go in the reply. Added after a test turn recorded a placeholder deadline.
- **Model:** stays on free Nemotron (tool calling worked on every test turn; 16–120 s per turn). Latency is the main weakness; switching is one line in `lib/models.ts` if needed.
- **Publish** writes `rfx_vendors`, one invitation per vendor to the Outbox (same template as the seed), sets status `sent` and the RFx date. "Simulated send" is stated in the dialog and the Outbox.

### T8. Fully free models: Gemini (native SDK) + OpenRouter ":free" only (2026-09-30, Ranjan's call)
- **What**: All Claude usage removed. Chains in `lib/models.ts`: extraction gemini-3.8-flash → gemini-3.6-flash → gemini-3.5-flash-lite; analysis the same + nemotron free; co-pilot and follow-ups nemotron free → gemini-3.5-flash-lite. `assertFree` refuses any other model. IDs verified with the project's ListModels call and pings (`npm run check:gemini`).
- **Why Gemini native SDK**: it takes PDFs and images inline and supports tool calling; an adapter (`lib/gemini.ts`) keeps the rest of the code on the OpenAI-style message format and preserves Gemini's function-call "thought signatures".
- **Why 3.6 Flash in the chain**: 3.8 Flash (the newest) answered 503 "high demand" and then 429 "over quota"; 3.6 answered pings reliably, so it sits between 3.8 and Flash-Lite. In practice most reads still land on Flash-Lite.
- **Rate limits**: per model up to 3 tries with back-off (honouring short retry hints), switch immediately on long retry hints or repeated overload, 3-minute cool-down for a model that just hit a limit, chat capped at 6 tool calls per question, and status lines streamed to the UI ("AI busy, retrying in 6s…", "Switching to backup model…").
- **Cache**: extraction results are stored in Supabase Storage keyed by SHA-256 of (cache version, prompt, RFx brief, email text, each file's name + content hash, model chain). Reseeding and retries of identical inputs never call a model.
- **Cost of going free (see TESTS.md)**: clean inputs (Excel, PDF, Word) are as good as Sonnet; the angled photo and the ambiguous one-line email are worse. Mitigations below keep every error visible.

### E8. Safeguards added for weaker free models
- **Low-confidence replies keep values and get ⚠.** If a reply's overall confidence is < 0.7 or a photo is only partly readable, every extracted price from it is flagged under one "Low-confidence reading — confirm" item; nothing is dropped or re-guessed.
- **Photos are transcribed row by row first**, then extracted from photo + transcript (took Flash-Lite from 16–17/30 to 29/30 on the angled photo).
- **Independent second read of every reply** (look each RFx item up by size, report what is on that row). Disagreements lower that value's confidence (⚠, both readings shown in the source drawer); lines the first read missed but the second found are added at 30% confidence with ⚠ — never silently used or dropped. Model self-reported confidence is not trusted on photos (95% on a fully shifted read).
- **Deviation claims must be visible in the source text.** Otherwise they become "Possible spec difference — confirm" and do not exclude the line (Flash-Lite invented "B vs C flute" deviations on two vendors).
- **Unmatched priced items** become an "Unmatched item" ⚠ with a map-to-line control in Responses.
- **Lump sum + stated shipment frequency** is read as per-shipment freight (code rule, stated in the freight explanation).
- **Honest trade-off**: Flash-Lite's analysis prose has occasional wording slips (4 in 10 answers) that the number check cannot catch; numbers remain fully traced.

### E9. Numbers must be copied from the source text (found via version-history testing, 2026-10-01)
- **What**: After every extraction, each price and weight must literally appear in its own quoted text (snippet, item text or unit text). A price that does not appear is the reader's own arithmetic: if the unit text or snippet holds exactly one number (e.g. "₹36/kg"), that written figure replaces it; otherwise the value is kept. Either way the line drops to 30% confidence (⚠). A weight that does not appear is removed from the vendor's side, so the RFx spec weight is used and labelled as such.
- **Why**: On a revised one-line email, Flash-Lite returned "7.56" for "₹36/kg" (it had multiplied by the box weight itself) while keeping the per-kg unit, so the code converted twice and showed ₹1.59/pc; it also claimed the weight was "stated by vendor". The LLM must read, not compute (SPEC §4).

### F1. Reset demo data button; version history; freight what-ifs (2026-10-01)
- **Reset**: Admin → System → "Reset demo data" (type RESET). Same code as `npm run seed` (`lib/demo-reset.ts`), streamed progress, replies served from the extraction cache (~1 min, no AI calls). Wipes everything, including RFx created during a demo — deliberate, it is a demo reset.
- **Version history**: every earlier reply from a vendor stays viewable in Responses (files, values as written, model) with a line-by-line "changed / new / dropped" comparison against the current version. Only the newest version feeds the comparison.
- **Freight what-if**: the chat's what_if tool accepts freight changes (included, ₹/year, % of value, ₹/unit, amount per shipment × shipments/year with FX); evaluated on landed cost.

### T9. Co-pilot history kept in Gemini's native format, thought signatures included (2026-10-01)
- **Problem**: Gemini answered 400 "Function call is missing a thought_signature" (call `set_header`, position 8). Root cause, from `llm_calls`: Nemotron (first in the co-pilot chain) made a `set_header` call, then returned 503 overloaded on the next round of the same turn. Flash-Lite took over and received Nemotron's call, which has no Gemini signature. The chat history also lived only in the browser as plain text, so signatures could never survive a reload.
- **What**:
  - New table `copilot_messages` (migration 003). Every model response is stored exactly as streamed: all parts, unmerged, with their `thoughtSignature`s, the model that produced them, and the tool results.
  - Each turn replays the stored parts unchanged, both in memory within a turn and after a reload from the database. The browser now sends only the new message, and the page loads the saved chat from the database (no more localStorage).
  - The co-pilot chain is Gemini only, so another provider's tool calls can no longer enter the conversation. When the chain switches between Gemini models (Flash-Lite to Flash), earlier parts are resent as-is. Google's thinking guide (stateless mode) says to resend the previous model's thought blocks when switching models and that the backend manages compatibility.
  - A tool call is never sent as a `functionCall` if it has no usable signature (e.g. from a non-Gemini model in old history) or if its result was never saved (a turn that failed half-way). Such calls, and their results, become plain-text summaries. The OpenAI-style adapter used by the analysis chat (`lib/gemini.ts`) applies the same text-summary rule to tool calls made by Nemotron earlier in the same question.
- **Alternatives**:
  - A dummy signature: the old workaround is no longer in Google's current docs.
  - Converting every tool call after any model switch to text: unnecessary given the guide's stated compatibility, and confirmed unnecessary by the test.
  - Keeping history in the browser: signatures would be lost on reload or tampered with.
- **Test**: `seed/eval/copilot-conversation.ts` (TESTS.md).

### T10. Faster co-pilot: Flash-Lite at minimal thinking, one update_draft tool, streamed text (2026-10-01)
- **What**:
  - **Chain**: gemini-3.5-flash-lite at thinking level "minimal", then Flash (gemini-3.7-flash at "low", its lowest level, then gemini-3.5-flash at "minimal"). Nemotron is removed from the co-pilot. 3.6 Flash was left out because its free tier allows only 20 requests a day, and that quota ran out during testing.
  - **One tool**: the seven draft tools are replaced by one `update_draft` call. It takes header, terms, add_lines, update_lines, remove_lines and questionnaire together and applies them in a fixed order (updates, removals from the highest line number down, additions), so line numbers stay valid.
  - **Catalog in the prompt**: the product catalog is in the system prompt as short refs (C1…), which removes the `search_catalog` round. Code maps a ref back to the product id and its spec. A line whose stated dimensions differ from the catalog product's is kept as the buyer described it.
  - **Draft in the prompt**: the current draft snapshot is part of the system prompt and is not repeated in every stored message.
  - **Streaming**: the assistant's text streams to the chat as it is generated, and a retry discards a failed attempt's partial text.
- **Result**: average seconds per co-pilot turn on the same scripted 10-turn conversation went from **26.8 s before** to **8.9 s after**. The 8.9 s includes one turn deliberately forced onto the busy free Flash models (37 s). The 9 normal turns averaged **5.7 s**.
- **Trade-off**: Flash-Lite at minimal thinking sometimes drafts the questionnaire before the buyer asks (allowed by the prompt). Once, the Flash fallback recorded a freight term the buyer had only implied (DAP). Both are visible in the draft and editable.

### F2. Login gate, lighter RFx requirements, select-all publish, grid hover, recommendation strip (2026-10-01, Ranjan's requests)
- **Login**:
  - Every page, API route and server action sits behind one hardcoded account (username `aerchain`, password `qwerty`, in `lib/auth.ts`), checked in `proxy.ts`. The Next.js 16 proxy replaces middleware.
  - The session cookie (httpOnly, 7 days) holds an HMAC of the username keyed by `AUTH_SECRET`, falling back to the Supabase service key, so it can't be forged.
  - Unauthenticated pages redirect to `/login?next=…`; API calls get 401. Sign out is on Home.
  - Deliberately demo-grade, as asked: no user table and no password hashing. The password is in the repo, which is private.
- **New RFx: only line items and the response deadline are required.**
  - The "Still missing" banner now lists only those two, and Publish (button and server) is blocked until both are set. All other fields are labelled optional.
  - The co-pilot no longer asks for or suggests optional terms, and drafts a questionnaire only on request.
  - GST: when no GST treatment is set, the invitation says prices are taken as GST-inclusive. Location, scope and questionnaire sections are left out of the invitation when empty.
- **Publish dialog**: a "Select all" checkbox (with a partly-selected state).
- **Comparison grid hover**:
  - The explanation was positioned inside the scrolling table. The hovered cell's `brightness` filter created its own stacking context, so later rows painted over it, and the scroll box clipped it.
  - It is now one floating box (`position: fixed`) placed below the cell, or above it near the bottom of the screen. It hides on scroll.
- **Recommendation strip** (top of the evaluation workspace, on every tab; `lib/insight.ts`):
  - Up to 3 lines: the top bidder (like-for-like on the lines all eligible vendors priced), the cheapest-per-line split versus the best single vendor and last year, and what to check before awarding (open ⚠ items and assumed prices on the top bidder, excluded vendors, missing replies).
  - Deterministic: built from the same `rank_vendors` / `award_cheapest_per_line` tools as the chat, on landed cost when freight is known for the eligible vendors, otherwise on unit price (stated in the strip). It refreshes when ⚠ items are resolved.
  - Not LLM-written: no wait, no rate limits, and every number is computed by code (SPEC §4).

### F3. Close RFx, visible upload button, freight 0, "Compliant vendors only" (2026-10-01, Ranjan's requests)
- **Close / reopen an RFx**:
  - New status `closed` (migration 004: status check updated, plus `closed_at`, `closed_note`, `status_before_close`).
  - The "Close RFx…" button in the workspace header asks for an optional outcome (Awarded to <vendor> / Split award / Not awarded) and an optional note.
  - A closed RFx moves to a collapsible "Closed RFx" section on Home showing its outcome. Its workspace shows a "Closed" banner and stays fully viewable. It no longer accepts replies or late vendors: the upload API and the action refuse, and the buttons are hidden.
  - "Reopen RFx" restores the previous status. Both actions are written to the Activity log. Drafts are deleted, not closed.
- **Upload button**: Tailwind's base reset made the native file-picker button render as plain text. The native input is now hidden behind a real "📎 Choose files…" button, which lists the chosen file names. The toggle is a filled "⬆ Add response / Upload a newer reply" button.
- **Freight 0**: the freight ⚠ form now accepts 0 (₹/year or %), meaning "leave freight out" for that vendor. Normalization shows it as "Excluded — buyer entered 0 (landed cost = price without freight)". The Summary shows "freight excluded", and landed cost equals the unit price. Other number fields still require a positive value.
- **"Compliant vendors only"** replaces "Include deviations" in the comparison grid. When ticked, it hides vendors that do not pass every mandatory question: failed, unverified, or no reply. This is the same `mandatory_pass` test the chat and the recommendation use. A note lists who is hidden and why. Spec deviations stay excluded from totals and the row minimum. To count one, accept it in its ⚠ item, which was already possible.
  - **Why not keep both checkboxes**: Ranjan asked for a replacement. Accepting deviations line by line covers the old toggle's purpose.

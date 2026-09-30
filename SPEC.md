# SPEC.md — "Kill the Quote Spreadsheet" (Aerchain take-home prototype)

You (Claude Code) are building this end to end. The owner, Ranjan, is a product manager who has never written code. He will run commands you give him and paste secrets into Vercel/Supabase dashboards. Never ask him to choose between technical options; decide, and log the decision in DECISIONS.md. When he must act, give exact copy-paste steps and say what he should see when it worked.

Deadline: working, deployed prototype within ~8 hours of build time. Prefer working and robust over broad. Deploy early (Phase 0) and often.

---

## 1. What we are building

An AI procurement tool for an Indian category buyer sourcing **corrugated packaging** (30 line items, 5 vendors, INR base currency).

Flow: the buyer drafts an RFx by chatting with an AI co-pilot → "sends" it to vendors (simulated outbox, no real email) → uploads/pastes whatever each vendor sent back (Excel, PDF, Word, phone photo, plain email text) → the system extracts and normalizes every response into one side-by-side comparison (same lines, same unit, same currency) with questionnaire answers and attachments alongside → the buyer asks natural-language questions about the RFx (text, tables, charts, Excel exports) to reach an award decision.

### The one hard rule (from the assignment)
Plumbing may be stubbed. **The AI loops must be real.**
- No hardcoded extraction results. Seed data must be produced by running the real pipeline on the seed files.
- No hardcoded answers to demo questions. Prompts must be generic: never mention the demo vendor names, specific prices, or specific files in any prompt.
- Interviewers will drive the live demo themselves: they will upload files and ask questions we never rehearsed. Everything must work on unseen inputs.

### What is being graded (design for this)
1. **Ugly edges**: angled phone photo; vendor quoting 27 of 30 lines; USD quote; "per box" vs "per piece"; discount buried in a footnote; "rest same as last year"; "freight extra". And what the UI shows when the system is unsure.
2. **Trust**: would a buyer with ₹4 crore at stake act on this screen? Every number traceable to its source; every assumption visible.
3. **Judgment**: decisions logged in DECISIONS.md with the reason.

---

## 2. Stack

- **Next.js (App Router, TypeScript) + Tailwind**, deployed on **Vercel**. Single repo.
- **Supabase**: Postgres (data) + Storage bucket `vendor-files` (uploaded originals). Server-side access only, using the service-role key. No auth; single buyer user named "Ranjan (Buyer)".
- **LLMs via OpenRouter** (OpenAI-compatible API, base URL `https://openrouter.ai/api/v1`), using the `openai` npm SDK. All model IDs live in one config file `lib/models.ts` so any task can be switched with one line:
  - `EXTRACTION_MODEL`: current Claude Sonnet on OpenRouter (vision + PDF capable). **Verify the exact current model ID on openrouter.ai/models before using it.**
  - `EXTRACTION_HARD_MODEL`: current Claude Opus on OpenRouter; used only for retry when an extraction's overall confidence is low or the input is a photo that failed validation.
  - `COPILOT_MODEL`: `nvidia/nemotron-3-ultra-550b-a55b:free` (text-only, supports tool calling).
  - `ANALYSIS_MODEL`: start with `nvidia/nemotron-3-ultra-550b-a55b:free`; if tool-calling reliability is poor in Phase 6 testing, switch to Claude Sonnet and log it in DECISIONS.md.
  - Every LLM call: timeout, one retry with backoff on 429/5xx, and a fallback model defined in config. Log model used + latency + token counts to a `llm_calls` table (useful for the demo and for cost).
- Charts: `recharts`. Excel export: `exceljs`. File parsing: `xlsx` (SheetJS) for xlsx/csv, `mammoth` for docx, PDFs and images sent to the vision model directly (OpenRouter file/image content parts); fallback for PDFs: extract text with `pdf-parse` and send text.
- Long-running routes: set `export const maxDuration = 300` (confirm the Vercel plan's limit; if lower, split extraction per page/sheet and process with client polling of a `status` field).

Env vars (Vercel + `.env.local`): `OPENROUTER_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Never expose them to the browser.

Schema: write `supabase/schema.sql` (tables, views, bucket creation). Ranjan pastes it into the Supabase SQL editor; give him that step explicitly.

---

## 3. Screens and UX

### 3.1 Home (dashboard)
- Header: product name, buyer name.
- Primary button **New RFx** → opens co-pilot chat (3.2).
- **RFx list**: title, category, created date, status (Draft / Sent / Collecting responses / Evaluating), responses received (e.g. "4/5"), count of ⚠ open items. Click → RFx workspace (3.3).
- **Admin** section (tabs or cards):
  - **Vendors**: list + "Add vendor" form (name, contact name, email, city/state, GSTIN optional, categories). Edit/delete.
  - **Products catalog**: list + "Add product" form (name, type, ply, flute, paper GSM/BF, dimensions L×W×H mm, print, base unit, notes). The co-pilot uses this catalog when drafting line items.
  - **Last-year prices**: read-only table of last year's contract (vendor, line, unit, price, date), used to resolve "same as last year".
  - **FX rates**: table of currency → INR rate with an "as of" date, editable. Seed USD with a realistic rate and date.

### 3.2 New RFx (co-pilot)
- Split view: **chat on the left**, **live structured RFx draft on the right** that updates as the conversation progresses.
- The co-pilot asks for and fills: title, plant/delivery location, scope summary, **line items** (from catalog or new; each with full spec, unit of measure, annual quantity), **questionnaire** (10–15 questions; suggests standard ones), **terms** (response deadline, validity required, payment terms, delivery terms/Incoterms, freight expectation, GST treatment, currency).
- Implementation: the co-pilot uses tool calls (`set_header`, `add_line_items`, `update_line_item`, `remove_line_item`, `set_questionnaire`, `set_terms`) that mutate the draft; the right pane renders the draft. The buyer can also edit the draft directly in the right pane.
- Allow "paste a list" (e.g. the buyer pastes 30 lines from Excel): the co-pilot parses them into line items.
- **Publish**: choose vendors from DB (checkboxes) → generates one email per vendor into the **Outbox** (subject, body with RFx summary, line item table, questionnaire, and the note "reply in any format"). Status → Sent. No real email is sent; the UI labels this "Simulated send".

### 3.3 RFx workspace (existing RFx)
Layout: **main panel (left, ~65%)** with tabs + **chat panel (right, ~35%)** scoped to this RFx. "← Home" always visible.

Tabs:
1. **Summary** (default): header facts; response status per vendor (Replied / Not replied / Replied—incomplete); coverage per vendor ("27/30 lines"); headline comparison (total annual spend per vendor on comparable basis, with coverage stated beside each total); open ⚠ items count with a link to them; key flags (expired certificates, questionnaire failures, spec deviations).
2. **Comparison**: grid of 30 RFx lines × vendors. Each cell shows normalized unit price in INR per RFx unit. Cell states (colour + icon + legend):
   - `confirmed`: buyer confirmed or edited
   - `extracted`: stated in the source, high confidence
   - `converted`: deterministic conversion applied (small badge; hover shows formula, e.g. "₹1,850 per 100 pcs ÷ 100 = ₹18.50/pc")
   - `needs_input` ⚠: cannot be computed without a missing fact (hover: what is missing and why; click: inline form to supply it)
   - `assumed`: value came from an interpretation (e.g. "same as last year" resolved to last-year price); hover shows the reasoning and source
   - `deviation`: offered spec differs from requested (hover shows requested vs offered); excluded from award calculations by default
   - `not_quoted`: shown explicitly as "Not quoted", never 0 or blank
   Clicking any cell opens a **source drawer**: original file name, location (sheet/cell, page, or quoted snippet), the raw value and unit as written, every transformation step, the model used, and confidence. For images/PDFs, show the uploaded file with the quoted snippet.
   Grid controls: toggle "Include deviations", toggle "Landed cost (incl. freight & discounts)" vs "Unit price", column totals with coverage, row minimum highlighted, filter by category.
   Right side of grid (or a sub-tab): **questionnaire matrix** (question × vendor, answer, pass/fail/unknown against requirement, source link) and **attachments** (file, type, extracted facts such as certificate expiry date, validity flag).
3. **Responses**: one card per vendor.
   - **Add response**: upload one or more files and/or paste the email body. Accepts xlsx, xls, csv, pdf, docx, png, jpg, jpeg, heic (convert to jpg), txt/eml.
   - Shows processing progress per file, then side by side: original file preview ↔ extracted structured data.
   - **Gaps & issues** list for this vendor (missing lines, missing freight amount, unanswered questions, ambiguous units, expired certificates).
   - **Auto-drafted follow-up email** built from the gaps list (generated by the LLM from the structured gap list, not free-form). Buyer can edit and click "Send (simulated)" which puts it in the Outbox. Also allow re-uploading a later reply; new values supersede old ones with history kept.
4. **Outbox**: every simulated email (RFx invitations, follow-ups) with timestamp.
5. **Activity log**: every buyer confirmation/edit/input (who, when, old → new value, reason), every extraction run.

### 3.4 ⚠ Needs-input interaction (used everywhere)
- The ⚠ icon appears in grid cells, the Summary, and inside chat answers.
- Hover: short explanation, e.g. "Vendor quoted ₹640 per box. Pieces per box not stated. Needed to compare with per-piece quotes."
- Click: small inline form asking for exactly the missing fact (pieces per box / freight amount per shipment or per kg / FX override / confirm interpretation Yes-No). Optional note field.
- On save: value stored as buyer-provided with timestamp, all affected numbers recompute immediately, the item moves to the activity log. The state of affected cells becomes `confirmed` (with "buyer input" noted in the source drawer).
- Buyer can also **edit any extracted value** from the source drawer (correction) with the same logging.

### 3.5 RFx chat (analysis agent)
- Scoped to the open RFx. Quick-action chips: "Summarize this RFx", "Who hasn't replied?", "What's missing?", "Cheapest per line", "Cheapest among quality-compliant vendors", "Split award scenarios", "Compare to last year".
- The buyer can ask anything. Answers can include text, tables, and charts, each rendered in the chat; every table has "Download Excel"; any table can be "Pinned" to the Summary tab.
- Every answer ends with a collapsible **"How this was computed"** block: tools called with parameters, data included, data excluded (and why), and caveats (e.g. "2 values still ⚠ needs input; landed cost for Vendor X excludes freight, which is unknown").
- If the answer depends on any `needs_input`/`assumed`/`deviation` cell, show ⚠ chips in the answer that open the same inline form as 3.4.
- If a question can't be answered from the data, say so and say what data is missing. Never invent numbers.

---

## 4. Core principle: the LLM reads and reasons; code does the math

- The LLM: reads documents, extracts values with provenance, maps vendor lines to RFx lines, interprets units/terms/footnotes, chooses which tools to call, writes the explanation.
- Deterministic TypeScript does **all** arithmetic that reaches the screen: unit conversion, FX, discounts, freight allocation, totals, rankings, scenarios, what-ifs. The LLM never produces a number that is displayed unless that number was returned by a tool.
- Enforce this in the analysis agent's system prompt and by design: tools return numbers; the final answer renders tables/charts from tool outputs (structured), and the text may only quote numbers present in tool outputs. Add a post-check: every number in the answer text must appear in the tool outputs of that turn (allowing formatting differences); if not, regenerate once, then show a warning.

---

## 5. Data model (Postgres)

Adjust as needed but keep these concepts:

- `vendors` (id, name, contact, email, city, state, gstin, categories, created_at)
- `products` (id, name, type, ply, flute, gsm, bf, length_mm, width_mm, height_mm, print, base_unit, notes)
- `rfxs` (id, title, category, location, scope, terms jsonb, status, created_at)
- `rfx_lines` (id, rfx_id, line_no, product_id nullable, description, spec jsonb, unit, annual_qty)
- `rfx_questions` (id, rfx_id, q_no, text, requirement jsonb — e.g. {type:"boolean", must:true} or {type:"min", value:...}, weight)
- `rfx_vendors` (rfx_id, vendor_id, invited_at, status)
- `outbox` (id, rfx_id, vendor_id, kind: invite|followup, subject, body, sent_at)
- `responses` (id, rfx_id, vendor_id, received_at, raw_email_text, version, superseded_by)
- `response_files` (id, response_id, storage_path, filename, mime, kind: quote|certificate|test_report|other, processing_status, error)
- `extractions` (id, response_id, model, raw_json jsonb, overall_confidence, created_at) — full LLM output kept for audit.
- `quote_lines` (id, response_id, vendor_line_text, matched_rfx_line_id nullable, match_confidence, match_reason, price_value, price_currency, price_unit_as_written, qty_basis — e.g. per 1 / per 100 / per 1000 / per kg / per box / per bundle, pieces_per_pack nullable, weight_per_piece_kg nullable, offered_spec jsonb, deviation jsonb nullable, provenance jsonb {file_id, locator, snippet}, confidence, value_origin: stated|inferred|assumed|buyer_input)
- `commercial_terms` (response_id, freight jsonb {basis: included|extra_unknown|extra_amount|per_kg|per_shipment, amount, currency, provenance}, discounts jsonb[] {kind, value, condition, applies_to, provenance}, gst jsonb, payment_terms, validity, lead_time_days, incoterm, provenance fields)
- `questionnaire_answers` (response_id, question_id, answer_text, normalized jsonb, status: pass|fail|unknown|not_answered, provenance)
- `attachment_facts` (response_file_id, fact_type e.g. iso9001_cert, issuer, cert_no, valid_until, is_valid_on_rfx_date, provenance)
- `open_items` (id, rfx_id, vendor_id, rfx_line_id nullable, kind: pieces_per_pack|weight_per_piece|freight_amount|fx_rate|confirm_interpretation|missing_line|unanswered_question|expired_cert, message, status: open|resolved|dismissed, resolution jsonb, resolved_by, resolved_at)
- `buyer_inputs` / `audit_log` (id, rfx_id, actor, action, target, old_value, new_value, note, at)
- `last_year_prices` (vendor_id, product/line key, description, unit, price_inr, contract_ref, valid_from, valid_to)
- `fx_rates` (currency, rate_to_inr, as_of, source_note)
- `llm_calls` (id, task, model, latency_ms, input_tokens, output_tokens, ok, error, at)
- View `v_comparison`: one row per (rfx_line × vendor) with normalized INR price per RFx unit, landed variant, state, coverage flags. Computed in TypeScript (`lib/normalize.ts`) and optionally cached; single source of truth for grid, summary, and analysis tools.

---

## 6. Extraction pipeline (`lib/extract/`)

Run per response (all files + email text together, so the model can relate a cover email to its attachment).

1. **Pre-process** by type:
   - xlsx/csv: convert every sheet to a text grid **with cell references** (e.g. `Sheet1!C14: 18.50`) so provenance can cite cells.
   - docx: mammoth → text with paragraph numbers.
   - pdf: send as file to the vision model; also extract text for locator snippets when available.
   - images: send as image; if the model reports the image is rotated/skewed/partially unreadable, record that in extraction notes. Do not attempt local deskewing.
   - email text: as is.
2. **Extract** with a strict JSON schema (use structured output / JSON mode; validate with zod; on validation failure retry once with the error message, then escalate to `EXTRACTION_HARD_MODEL`). The prompt includes the RFx (lines with specs and units, questionnaire, terms) so the model can map as it reads. Output:
   - `line_quotes[]`: vendor's own text, matched RFx line number (or null), match confidence + reason, price value, currency, unit/basis **exactly as written**, pack info if stated, weight info if stated, offered spec, deviation vs requested spec, provenance {file, locator (cell/page/paragraph), verbatim snippet ≤ 200 chars}, confidence 0–1, origin (stated/inferred).
   - `references[]`: phrases like "rest same as last year", "as per previous rates" with the lines they apply to.
   - `commercial_terms`: freight, discounts (**read footnotes, fine print, and conditions**), GST, payment terms, validity, lead time, Incoterm, each with provenance.
   - `questionnaire_answers[]`, `attachments[]` (type, certificate details, expiry dates), `notes[]` (anything the model is unsure about, stated plainly).
3. **Validate & normalize** (deterministic, `lib/normalize.ts`):
   - Units: convert price to the RFx unit. Supported bases: per piece, per 100, per 1000, per pack/box/bundle (needs pieces per pack), per kg (needs weight per piece; compute from spec only if the vendor or catalog states it; otherwise `needs_input`). Never guess a missing fact; create an `open_item` instead.
   - Currency: convert with `fx_rates`; store and display original + rate + as-of date.
   - Discounts: apply only unconditional or buyer-confirmed discounts to landed cost; conditional discounts become `confirm_interpretation` open items (show the verbatim footnote).
   - Freight: included → 0 extra; extra with amount → allocate per unit (document the allocation method in the tooltip); extra with no amount → landed cost for that vendor marked incomplete + `freight_amount` open item.
   - "Same as last year": resolve against `last_year_prices` for that vendor (match by line); state `assumed`, provenance points to both the vendor's phrase and the last-year record. If no match, `needs_input`.
   - Missing lines → `not_quoted` + one `missing_line` open item per vendor listing them.
   - Spec deviations → `deviation` state; excluded from award tools unless the toggle/parameter includes them.
   - Low-confidence values (< 0.7) or low match confidence → `confirm_interpretation` open item.
   - Sanity checks: flag unit prices > 3× or < 0.33× the median of other vendors for the same line as "check" (possible unit error).
   - Certificates: `valid_until` < RFx date → `expired_cert` open item and questionnaire fail where relevant.
4. **Gap list → follow-up draft**: build a structured list of gaps, then one LLM call writes a polite, specific follow-up email (line numbers, what's missing). Buyer edits/sends (simulated).

Record every extraction run; re-running on the same response creates a new version and keeps buyer confirmations where the underlying value is unchanged.

---

## 7. Analysis agent (`lib/agent/`)

Tool-calling loop (max ~8 tool calls per turn). All tools read from the normalized comparison for the current RFx. Parameters shared by most tools: `include_deviations` (default false), `include_unconfirmed` (default true, but always reported), `cost_basis` (`unit_price` | `landed`), `vendor_filter` (list, or a questionnaire-based filter like `{must_pass: ["iso9001", "burst_test_capability"]}` or `"all_mandatory"`).

Tools:
- `get_rfx_overview()`: status, vendors, reply status, coverage, open items.
- `get_comparison(filters)`: rows of the normalized grid with states.
- `get_vendor_profile(vendor)`: terms, questionnaire results, attachments/certs, open items, assumptions ledger.
- `list_open_items(filters)`.
- `rank_vendors(cost_basis, scope)`: total annual spend per vendor on comparable lines, with coverage and a "like-for-like" total over lines every candidate quoted.
- `award_cheapest_per_line(params)`: per-line winner, total, savings vs last year and vs single best vendor.
- `award_split(params, constraints)`: constraints such as max number of vendors, min/max share per vendor, exclude vendors, must-pass questionnaire items, lines to lock to a vendor. Implement as exact search/greedy over 30 lines × ≤5 vendors (small enough for exhaustive assignment with constraints via simple branch-and-bound or ILP-lite); document the method.
- `compare_to_last_year(scope)`.
- `what_if(changes)`: e.g. vendor X drops price by 5% on 5-ply lines, freight becomes ₹Y; returns before/after.
- `query_rows(spec)`: generic filter/sort/group/aggregate over the comparison rows (safe, typed DSL; no raw SQL) for questions the named tools don't cover.
- `make_chart(spec)`: returns a chart spec (bar/line/stacked bar) built from tool output rows; UI renders with recharts.
- `make_table(rows, columns, title)`: marks a table for rendering + Excel download.

Final answer format (structured): `{ text, tables[], charts[], method: [{tool, params}], included, excluded, caveats[], open_item_refs[] }`. The UI renders all of it; `open_item_refs` render as ⚠ chips.

System prompt essentials: be a procurement analyst; always state coverage; never compare totals with different coverage without saying so; prefer like-for-like; surface quality/compliance alongside price; never invent numbers; ask a clarifying question only if the request is genuinely ambiguous, otherwise state the assumption and proceed.

---

## 8. Seed dataset (`seed/`)

Generate realistic, internally consistent data for an Indian FMCG/consumer-goods plant (e.g. "Pune plant, FY27 annual contract"). Write generators as scripts so files can be regenerated.

- **30 RFx lines** covering: 3-ply and 5-ply RSC shipper boxes (various L×W×H mm), a few 7-ply heavy-duty boxes, die-cut mailer boxes, printed boxes (1–2 colour flexo), corrugated sheets/pads, partitions/dividers, edge protectors. Specs include ply, flute (B/C/BC/E), paper GSM and BF, burst strength / BCT target, print. Units mostly "per piece", a few "per kg" (sheets) and "per set" (partitions). Realistic annual quantities (thousands to lakhs). Realistic INR prices (e.g. small 3-ply box ₹8–15, large 5-ply box ₹25–70, 7-ply ₹90–180).
- **Questionnaire (12 questions)**: ISO 9001 (mandatory), FSC certification, in-house burst/BCT/ECT testing (mandatory), monthly capacity, plant location/distance, lead time, payment terms accepted, QC process, printing capability, past food/pharma clients, contingency supply, GST registration.
- **Last-year prices** for the incumbent (Vendor E) and one other vendor on most lines.
- **Five vendors, each a different ugly edge** (names are Indian packaging companies, fictional):
  - **Vendor A**: polished `.xlsx` that ignores the template: its own line names and column order, quotes in **USD** (multinational supplier), freight as a separate per-shipment amount, all 30 lines. Valid ISO and FSC.
  - **Vendor B**: **PDF on letterhead**, prices **per 100 pieces**, a **2–3% discount in a footnote** conditional on payment within 15 days, freight included. After the discount it is the cheapest on shipper boxes.
  - **Vendor C**: **Word doc** with commercials written in paragraphs; quotes **27 of 30 lines**; one line offered at **150 GSM vs 180 GSM** requested (deviation); a couple of items priced **"per box of 50"** where the RFx asks per piece and one "per bundle" with no count stated (→ needs input). No FSC.
  - **Vendor D**: **printed rate card** (generate an image/PDF of a rate card table), priced **per kg** for board/sheets and some boxes, with piece weights stated for some lines only (→ some convertible, some needs input). Ranjan will photograph it at an angle with his phone; the photo is the seed input. Give him the file to print/display and a clear instruction.
  - **Vendor E** (incumbent): **one-line email**: "₹42/kg for the 5-ply, 38 for the 3-ply, rest same as last year, freight extra." Attachment: an **ISO 9001 certificate PDF that expired** before the RFx date; no questionnaire answers. Headline cheapest, but fails the mandatory ISO requirement and has unknown freight.
- **Attachments**: ISO certificates for A, B, C, D (valid), expired one for E; one burst/BCT test report PDF for B.
- **Designed non-obvious answers** (verify after seeding by running the real tools; adjust seed prices, not code, if the story doesn't hold):
  - Cheapest overall vendor on headline price (E) fails the mandatory quality requirement.
  - Cheapest-per-line split among compliant vendors differs from the single cheapest compliant vendor, and **changes once freight is included** (A's USD price looks good but freight flips some lines).
  - C looks cheapest on a line only because of the GSM deviation.
  - "Same as last year" is cheaper than new quotes on some lines, pricier on others.
- **Seeding process**: `npm run seed` creates vendors, products, the RFx, last-year prices, FX, uploads seed files, and **runs the real extraction pipeline** on them. Do not insert extracted values directly.
- Also create a `/samples/unseen/` folder with 3 extra test inputs never used in development prompts (e.g. a CSV with odd headers, a scanned-looking PDF, a WhatsApp-style text) for Phase 6.

---

## 9. Build phases (with acceptance checks)

Work in order. After each phase: commit, push, confirm Vercel deploy is green, update `STATUS.md` (done / next / known issues).

- **Phase 0: Skeleton & deploy (target 45 min).** Next.js app, Tailwind, Supabase client, `lib/models.ts`, one test route that calls OpenRouter and returns "ok". Walk Ranjan through: create GitHub repo, connect to Vercel, add env vars, run schema.sql in Supabase. ✅ Live URL shows Home and a working "LLM ping".
- **Phase 1: Seed data & files (1 h).** Generators, all seed files, DB seeded (without extraction). ✅ Home lists the seed RFx; Admin tabs show vendors, products, last-year prices, FX.
- **Phase 2: Extraction + normalization (2.5 h).** Pipeline for all input types; provenance; open items; follow-up drafts. Run on all 5 vendors. ✅ For each vendor, extracted lines match the source; units/FX/discount/freight/"last year" handled as specified; C shows 27/30 + deviation; D per-kg lines with missing weights show ⚠.
- **Phase 3: Workspace UI (1.5 h).** Summary, Comparison grid with states + source drawer + toggles, questionnaire matrix, Responses tab with upload/paste + side-by-side + follow-up draft, Outbox, Activity log, ⚠ inline inputs with recompute. ✅ Resolving a ⚠ updates grid and summary instantly and is logged.
- **Phase 4: Analysis chat (1.5 h).** Agent, tools, structured answers, charts, Excel export, "How this was computed", ⚠ chips, number post-check. ✅ Answers correctly: "cheapest per line among vendors who pass all mandatory questionnaire items", "same but with freight", "who hasn't answered what", "what changes if B's discount doesn't apply".
- **Phase 5: Co-pilot + publish (1 h).** Chat-to-structured RFx with live draft, catalog use, paste-a-list, publish to outbox. ✅ Creating a new 5-line RFx by chat, publishing, uploading a pasted reply, and seeing it in the grid works end to end.
- **Phase 6: Hardening (1 h).** Run `/samples/unseen/` files and 15 unrehearsed questions (write them in `TESTS.md` with results). Fix failures. Check free-model reliability; switch `ANALYSIS_MODEL` if needed. Add friendly error states (model timeout, unreadable file → "couldn't read this; here's what we got; please confirm").

Cut line if behind schedule (in this order): pin-to-summary, what_if tool, paste-a-list in co-pilot, charts beyond bar charts, activity log UI (keep the table). Never cut: provenance, ⚠ states, not-quoted handling, coverage on totals, "How this was computed".

---

## 10. Out of scope (log in DECISIONS.md as deliberate)

Real email send/receive; vendor portal; authentication and roles (VP uses the same buyer view); multi-currency beyond INR/USD seed (code supports any rate in `fx_rates`); formal award memo/approval workflow; ERP/PO integration; local image deskewing/OCR (vision model handles it); mobile layout polish.

---

## 11. Files to maintain in the repo

- `SPEC.md`: this file.
- `DECISIONS.md`: every meaningful decision: what, alternatives, why. Pre-populate with: category choice (corrugated: hardest unit normalization); simulated email; model routing by task (paid vision model for extraction, free model for co-pilot/analysis); LLM reads/code computes; ⚠ needs-input instead of guessing; deviations excluded by default; no award lock (disclaimers instead); no award memo (brief asks for a decision, not a document; exports cover it).
- `STATUS.md`: phase progress and known issues.
- `TESTS.md`: unseen inputs and unrehearsed questions with outcomes.
- `README.md`: how to run locally, env vars, how to seed, how to redeploy (written for a non-developer).

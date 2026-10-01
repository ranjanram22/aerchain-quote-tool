# TESTS.md

Unseen inputs and unrehearsed questions, with outcomes. Filled in during Phase 6 (and earlier where useful).

## Smoke tests
| Date | Test | Result |
|---|---|---|
| 2026-09-30 | `npm run build` on Phase 0 skeleton | Pass |
| 2026-09-30 | Local: `/api/health` all green, `/api/llm-ping` ok on Nemotron free + Sonnet 5.5, calls logged in `llm_calls` | Pass |
| 2026-09-30 | Live (Vercel): `/api/health` all green, `/api/llm-ping` ok (Nemotron 1.0 s, Sonnet 2.6 s) | Pass |

## Seed extraction accuracy (2026-09-30, `seed/verify.ts` vs generator ground truth)
| Vendor | Input | Model | Lines matching ground truth | Notes |
|---|---|---|---|---|
| A | .xlsx, USD, own names/order | Sonnet 5.5 | 30/30 | Freight USD 850 × 48 shipments/yr computed (+9.2%) |
| B | Letterhead PDF, per 100 | Sonnet 5.5 | 30/30 | 2.5% conditional discount found in footnote → ⚠ pending |
| C | .docx paragraphs | Sonnet 5.5 | 30/30 | 3 not quoted, 150 GSM deviation on line 11, per box of 50 converted, per bundle ⚠ |
| D | Phone photo of rate card (angled, rows drift) | Sonnet 5.5 | 30/30 | Per-kg 7-ply with printed weights converted; line 18 weight missing ⚠ |
| E | One-line email + expired ISO PDF | Opus 5.5 (escalated) | 26/30 | Model applied "the 3-ply/5-ply" to printed boxes and sheets too (ambiguous; flagged for confirmation). Expired cert → Q1 fail. |

Live upload test (Vercel): re-sent vendor C's .docx + ISO PDF to `POST /api/rfx/[id]/responses`; background extraction finished on Vercel, new version superseded v1, 30/30 match, old open items auto-closed and new ones created.

Follow-up drafts (Nemotron free) for E and C: specific, used only the gap list, correct line numbers.

## Phase 4 acceptance questions (2026-09-30)
| Question | Nemotron free | Sonnet 5.5 (adopted) |
|---|---|---|
| Cheapest per line among vendors who pass all mandatory items | Correct tool; chose landed basis unasked; prose slip ("Mahalaxmi, Om Sai … mandatory-compliant"); 25–113 s | Correct (unit basis, ₹3.85 cr, 30/30, split A/C/B, −₹6.42 L vs best single, −0.46% vs last year, exclusions stated); 11 s |
| Same but with freight | Correct (landed, ₹3.93 cr); 44 s | — (same tool, landed) |
| Who hasn't answered what? | Correct, complete; 22 s | — |
| What changes if Shree Ganesh's discount doesn't apply? | Said "no change" (true: not applied today) but missed the effect; 57–105 s | Correct: not applied today; confirming it would cut the award from ₹3.90 cr to ₹3.85 cr and shift lines to Shree Ganesh; 11 s |
| Bar chart of like-for-like landed totals | — | Chart + table over 26 common lines; Om Sai excluded (freight unknown) with reason |
| Cheapest on 7-ply and any catch | — | Transpac on unit price; flagged freight uplift, Om Sai expired ISO, Mahalaxmi per-kg gap, Deccan not quoting 17–18 |

All answers passed the number post-check (some after one regeneration).

## Phase 5 end-to-end (2026-09-30)
| Step | Result |
|---|---|
| "Packaging for Nashik warehouse: 5-ply 600x400x400 ~20000/yr, 3-ply 250x200x150 60000/yr, 12-cell partitions 15000 sets" | Header + 3 catalog-matched lines + 15-question questionnaire; also recorded a placeholder deadline → prompt tightened (no unstated terms) |
| Pasted 2 tab-separated rows | 2 lines added, catalog-matched, qty/unit kept |
| "Quotes due 20 Oct 2026, payment 45 days, DAP Nashik, freight included, GST extra, INR" | Terms updated |
| Publish to 3 vendors | 3 invitations in Outbox, status Sent |
| Pasted email reply (per 100, per set, each, per kg, freight per trip × trips/month) | 5/5 lines extracted and converted; freight ₹3,200 × 60/yr computed |

## Unseen inputs (2026-09-30) — never used while writing prompts
| Input | Vendor | Result | Verdict |
|---|---|---|---|
| `sahyadri_rates.csv` — odd headers, `price_INR_per_1000`, 10 items, own dimensions columns | Sahyadri Corrupack (new) | 10/10 items matched to the right RFx lines; ÷1000 conversion correct; partition "per set" remark respected; "Transport extra at actuals (approx Rs 18000 per truck)" → ⚠ freight (no trip count); no questionnaire → 12 unanswered | Pass |
| `KKB_quotation_scan.pdf` — image-only, skewed, noisy, prices per dozen | Kolhapur Kraft Boxes (new) | 7/7 items correct (₹158/dozen → ₹13.17/pc etc.); 1.5% discount above ₹25 L/quarter → conditional ⚠; ISO claimed without certificate → mandatory "unclear" ⚠; two freight rates (₹1.20/pc boxes, ₹0.80/kg sheets) → ⚠ freight (not auto-applied) | Pass (split freight basis left to buyer) |
| `WhatsApp Chat with Vinod Sai Packaging.txt` — bare numbers, "5 ply all sizes 2% less than what we gave you in March", "49 per kilo approx 3.3 kg" | Sai Packaging (new) | 4 bare prices read as per piece; 7-ply ₹49/kg × 3.3 kg = ₹161.70; "2% less than March" → ⚠ price needed on 9 lines (no March record — never guessed); "ISO certificate will send tomorrow" → mandatory unclear | Pass (one ⚠ per line is noisy) |
| Vendor D rate card photo re-sent as iPhone **HEIC** | Mahalaxmi | Converted (heic-convert) and read: 29/30 identical to the JPEG run | Pass. Note: a newer reply supersedes the old one entirely, so the ISO certificate from the earlier reply no longer counts until it is re-sent |


## Unrehearsed questions (2026-09-30, live site, clean seed data, Sonnet 5.5)
| # | Question | Tools chosen | Outcome |
|---|---|---|---|
| 1 | If I can only work with two suppliers, who should they be and what does it cost me on a landed basis? | overview, award_split(max 2, landed) ×2 (all vs mandatory), open items | Recommended Shree Ganesh + Deccan ₹3.94 cr, 30/30; noted the cheaper Shree Ganesh + Mahalaxmi pair (₹3.92 cr) is blocked by Mahalaxmi's unclear mandatory answer. Numbers traced ✓ |
| 2 | How much would we save by switching away from Om Sai compared to last year? | overview, compare_to_last_year, award_cheapest_per_line(exclude Om Sai) | ₹2.96 L (0.78%) on the 28 lines with a last-year price; stated coverage and that Om Sai fails mandatory ✓ |
| 3 | Is Transpac's dollar pricing a risk? What if their prices go up 5%? | vendor_profile, what_if(+5%) | FX exposure identified (USD freight, INR invoicing clause); +5% → award +₹2.94 L, Transpac 5→2 lines; flagged lead time/payment/validity gaps ✓ |
| 4 | Which lines have only one compliant quote? | get_comparison(mandatory), overview | None; lines 11, 17, 18, 29, 30 have only two (reasons per line) ✓ |
| 5 | Average price per category as a chart | query_rows(group_by category, avg_price), make_chart | Bar chart + table; basis and "no compliance filter" stated ✓ |
| 6 | What is Deccan's price on line 11 and why is it excluded? | get_comparison(line 11, incl. deviations), vendor_profile, make_table | ₹39.06/unit; excluded for GSM 150/…/150 vs 180/…/180. Correct ✓ |
| 7 | Can any single vendor supply everything? Which is cheapest? | overview, rank_vendors ×2, make_table | Shree Ganesh and Transpac cover 30/30; Shree Ganesh cheapest full-coverage compliant (₹3.99 cr landed); noted Deccan's lower total covers only 25/30. Numbers ✓; prose slip: opens with "No" then names two vendors that can |
| 8 | Total spend if all to Shree Ganesh with the early-payment discount | overview, rank_vendors, what_if(apply discount) | ₹3,89,61,966 with discount vs ₹3,99,60,980 without, 30/30 ✓ |
| 9 | Which vendors have valid ISO certificates? | overview, vendor_profile ×5 | Four valid with cert numbers and expiry; Om Sai's expired 2026-08-31 ✓ |
| 10 | Rank vendors by lead time | overview, vendor_profile ×5 | Correct order (5–7, 7, 10, 12–15 days, Om Sai not stated). Slip: said only two vendors meet ≤10 days (Deccan's 10 days also meets it) |
| 11 | Show me all the assumptions the system made for Om Sai | vendor_profile | Identified "rest same as last year" applied to last-year prices and freight unknown; wording muddled ("assumptions … due to unknown freight") |
| 12 | Cheapest option for printed boxes? | get_comparison(Printed box), overview, vendor_profile ×3, make_table | Per-line winners correct (Transpac L25 unit price; Mahalaxmi L23/L24). Slip: "freight included (except Om Sai)" — Transpac's freight is extra |
| 13 | How confident are we in Mahalaxmi's prices given it was a phone photo? | vendor_profile, list_open_items | Listed the per-kg weight gaps, the second-read disagreement on line 19 and the unverified flute claims — exactly the ⚠ items ✓ |
| 14 | Split award, no vendor above 50%, mandatory-compliant only | award_split(max_share 50, mandatory) | 4-vendor split, max share 46.58%, ₹3.85 cr, 30/30 ✓ |
| 15 | What is the weather in Pune today? | overview (unneeded) | Declined politely, redirected to the RFx ✓ |

Questions 1–5 ran on Claude Sonnet (before the switch to free models); 6–15 ran on Gemini (gemini-3.5-flash-lite after the Flash models were busy/over quota — see the streamed status). All 15 passed the number post-check. Flash-Lite's prose is less careful than Sonnet's (4 wording slips in 10 answers), never in the numbers.

Found during this run: a provider limit error was shown raw to the user → now mapped to a plain message ("The AI service's credit limit has been reached… existing data stays available").


## Free-model switch: Gemini vs stored Sonnet results (2026-09-30)

Method: `seed/eval/compare.ts` compares each vendor's current extraction field by field with the Sonnet extraction saved in `seed/eval/baseline-sonnet/` (per RFx line: quoted?, price, currency, basis, basis count, pieces per pack, weight, deviation; plus freight, discounts, 12 questionnaire answers, certificates, "same as last year" references), and scores the normalized ₹/unit per line against the generator's ground truth. "Wrong & not ⚠-flagged" = ground-truth misses that the buyer would not see flagged — the trust metric.

In practice almost every read ran on **gemini-3.5-flash-lite**: gemini-3.8-flash answered 503 "high demand" and then 429 "exceeded your current quota"; gemini-3.6-flash was mostly 503 for large requests (it succeeded twice: Deccan and Om Sai in one run each).

### Final run (with the fixes below)

| Vendor | Input | Gemini model | Line fields agreeing with Sonnet | Commercial / questionnaire / cert fields agreeing | Ground truth (Sonnet → Gemini) | Wrong & not ⚠-flagged | Verdict |
|---|---|---|---|---|---|---|---|
| A Transpac Global Packaging (India) Pvt Ltd | xlsx, USD | gemini:gemini-3.5-flash-lite (conf 1) | 240/240 | 43/44 | 30/30 → 30/30 | 0 | Same |
| B Shree Ganesh Corrugators | letterhead PDF, per 100 | gemini:gemini-3.5-flash-lite (conf 1) | 240/240 | 44/44 | 30/30 → 30/30 | 0 | Same |
| C Deccan Board & Boxes Pvt Ltd | docx paragraphs | gemini:gemini-3.5-flash-lite (conf 1) | 219/219 | 44/44 | 30/30 → 30/30 | 0 | Same |
| D Mahalaxmi Packaging Works | angled phone photo | gemini:gemini-3.5-flash-lite (conf 0.98) | 236/240 | 29/32 | 30/30 → 29/30 | 0 | **Worse** |
| E Om Sai Cartons | one-line email + expired ISO | gemini:gemini-3.5-flash-lite (conf 0.75) | 18/37 | 19/22 | 26/30 → 13/30 | 0 | **Worse** |

(A landed: ₹4.277 cr; freight: USD 850.00 per shipment × 48 shipments/yr × 88.4000 = ₹36,06,720.00/yr, allocated pro-rata to line value (+9.21%))

Unseen samples (vs the Sonnet run of the same files):

| Vendor | Lines (Sonnet) | Lines matching Sonnet value/state | Differences |
|---|---|---|---|
| Sahyadri Corrupack | — | not run | |
| Kolhapur Kraft Boxes | — | not run | |
| Sai Packaging | — | not run | |
(Unseen samples above are from the run before the last two fixes; the Sahyadri line-13 miss in the first Gemini run was an unmatched item — now surfaced as an "Unmatched item ⚠"; the 7600/set on line 28 in the later run is flagged by the 3×-median price check.)

### Which vendors got worse
- **D Mahalaxmi (angled phone photo) — worse and unstable.** Single-pass Flash-Lite shifted values one row down from line 17 onward in 2 of 4 runs (16–17/30) while reporting 95% confidence. Fixes: (1) photos are transcribed row by row before extraction → 29/30; (2) an independent second read looks up each item by printed size and flags every disagreement ⚠; (3) spec-deviation claims not visible in the source text become "possible deviation — confirm" instead of excluding the line. Remaining miss: line 17 weight not read → ⚠ needs input (not a wrong number). Flash-Lite also read the card's "in-house burst & BCT lab" as a yes to the mandatory testing question (Sonnet: unclear), so Mahalaxmi now counts as compliant.
- **E Om Sai (one-line email) — worse.** Across runs Flash-Lite/3.6 Flash read "₹42/kg for the 5-ply, 38 for the 3-ply, rest same as last year" three different ways (13/30, 2/30, 21/30 vs Sonnet 26/30); in the final run it applied ₹42/kg only to the 5-ply pad and treated everything else, including the 3-ply boxes, as "same as last year". Every affected line is shown as assumed/⚠ with the vendor's phrase. Consequence for the demo story: Om Sai is no longer the headline-cheapest vendor.
- **A, B, C — same as Sonnet (30/30).** Earlier Flash-Lite runs invented "B flute vs C flute" deviations on B and D and labelled A's per-shipment freight a lump sum; fixed by the deviation check and by reading a lump sum with a stated shipment frequency as per shipment.
- **Silent errors: 0** in the final run for every vendor.

### First Flash-Lite run (before fixes), for reference

| Vendor | Input | Gemini model | Line fields agreeing with Sonnet | Commercial / questionnaire / cert fields agreeing | Ground truth (Sonnet → Gemini) | Verdict |
|---|---|---|---|---|---|---|
| A Transpac Global Packaging (India) Pvt Ltd | xlsx, USD | gemini:gemini-3.5-flash-lite (conf 1) | 240/240 | 43/44 | 30/30 → 30/30 | Same |
| B Shree Ganesh Corrugators | letterhead PDF, per 100 | gemini:gemini-3.5-flash-lite (conf 0.99) | 238/240 | 40/44 | 30/30 → 30/30 | Same |
| C Deccan Board & Boxes Pvt Ltd | docx paragraphs | gemini:gemini-3.5-flash-lite (conf 0.98) | 219/219 | 44/44 | 30/30 → 30/30 | Same |
| D Mahalaxmi Packaging Works | angled phone photo | gemini:gemini-3.5-flash-lite (conf 0.95) | 235/240 | 27/30 | 30/30 → 29/30 | **Worse** |
| E Om Sai Cartons | one-line email + expired ISO | gemini:gemini-3.5-flash-lite (conf 0.75) | 138/142 | 17/20 | 26/30 → 30/30 | Better |


## Post-phase checks (2026-10-01)
| Test | Result |
|---|---|
| Reset demo via `/api/admin/reset` (local) | 53 s, all 5 replies from cache (no AI calls); wrong confirmation → 400 |
| what_if freight (tool, no AI): Om Sai ₹15 L/yr; Transpac included; Transpac USD 600 × 48 | Totals ₹3.908 cr → ₹3.886 / ₹3.841 / ₹3.902 cr; 3 / 14 / 2 lines change hands |
| Chat: "If Transpac agreed to include freight, how would the cheapest-per-line landed award change among compliant vendors?" | Chose what_if(freight included, mandatory, landed); −₹6.71 L; Transpac 2 → 14 lines; numbers traced ✓ |
| Version history: Om Sai sent a revised email (₹40/kg 5-ply, ₹36/kg 3-ply, freight ₹1.5 L/yr) | v1 and v2 listed; v1 view shows files, values and per-line changed/new/dropped vs v2 |
| Same revised email exposed a model computing prices ("7.56" for "₹36/kg") → shown as ₹1.59/pc | Fixed by E9: now ₹36/kg × 0.21 kg (RFx spec weight) = ₹7.56/pc with ⚠ |

## Co-pilot: thought signatures and speed (2026-10-01)
Test: `npx tsx --conditions=react-server --env-file=.env.local seed/eval/copilot-conversation.ts`.
- The test runs offline history checks first. Then it holds a live 10-turn conversation on a fresh draft (`seed/eval/copilot-script.ts`), reloads the history from the database after turn 5, and forces turn 6 onto the fallback Flash models.
- Assertions:
  - No 400 errors.
  - Every saved tool call has its thought signature and its result.
  - After turn 5, 5 buyer messages and 5 replies reload from the database.
  - Final draft: 3 lines (3-ply at 45,000, 5-ply at 12,000, edge protectors at 8,000; partitions removed), questionnaire with ISO 9001 mandatory, deadline 2026-10-20, payment 60 days, scope "rate contract".

| Run | Model per turn | Avg s/turn | Notes |
|---|---|---|---|
| Before (old code, same 10 messages) | Nemotron free; Flash-Lite on turn 10 | **26.8** (4.0–57.5) | Turn 9 reproduced the 400 "missing thought_signature" after Nemotron returned 503 mid-turn; one Nemotron call sent a malformed `items` argument |
| After, run 1 (before the 3.5 Flash fallback was added) | Flash-Lite; turn 6 forced to Flash | — | Turns 1–5 passed at 5–9 s; turn 6 failed because 3.7 Flash was 503 and 3.6 Flash was out of its daily free quota of 20 requests. The chain was changed to 3.7 Flash then 3.5 Flash (T10) |
| After, run 2 | Flash-Lite; turn 6 3.5 Flash | 10.0 (6.6 without turn 6) | PASS, 9 tool calls |
| After, run 3 (final code) | Flash-Lite; turn 6 3.5 Flash | **8.9** (**5.7** without turn 6) | PASS, 8 tool calls; turn 6 took 37 s waiting on busy free Flash models |

- Browser check (local): the reply streams in as it is written, and the saved chat reappears after a page reload.
- That check found a bug, now fixed: a catalog line sent without a description was skipped while the reply claimed it was added. Now the catalog name fills in the description, a skipped line is reported back to the model as a failure, and the prompt says to claim only what the tool result lists.

## Login, RFx requirements, publish, grid hover, recommendation (2026-10-01, local)
| Check | Result |
|---|---|
| Open `/` without signing in | 307 to `/login`; `/api/health` returns 401 |
| Wrong password, then right password | "Wrong username or password." (username kept), then lands on Home; Sign out shown |
| New RFx: "Need 3-ply RSC boxes 250x200x150, 50,000 a year" | Line added from catalog; co-pilot asks only for the response deadline; banner "Required before publishing: response deadline"; Publish disabled |
| "Quotes due 2026-10-20", then Publish → Select all | Publish enabled; Select all ticks 5/5 vendors (test draft deleted, nothing published) |
| Comparison grid hover on rows 1 and 6 | Explanation floats over neighbouring cells (below the cell; above it near the screen bottom) |
| Recommendation on the seed RFx | Top bidder Deccan Board & Boxes, ₹3.45 cr/yr landed, 0.5% below Mahalaxmi on 25 common lines; split ₹3.91 cr for 30/30 lines, ₹8.84 L below Shree Ganesh alone, +1.0% vs last year; before awarding: 3 open ⚠ on Deccan; Om Sai excluded (mandatory) |
| `seed/eval/copilot-conversation.ts` re-run after the prompt change | PASS, 9 tool calls, 8.3 s average (turn 6 forced onto 3.7 Flash: 34 s) |

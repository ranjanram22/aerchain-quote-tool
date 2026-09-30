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
| 6–15 | (Deccan line 11; single-vendor coverage; Shree Ganesh with discount; valid ISO; rank by lead time; Om Sai assumptions; printed boxes; photo confidence; ≤50% share split; weather in Pune) | — | **Not run: OpenRouter key hit its total spending limit (403 "Key limit exceeded").** To re-run once the limit is raised. |

Found during this run: a provider limit error was shown raw to the user → now mapped to a plain message ("The AI service's credit limit has been reached… existing data stays available").

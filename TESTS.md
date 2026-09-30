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

## Unseen inputs
_(Phase 6)_

## Unrehearsed questions
_(Phase 6)_

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

Follow-up drafts (Nemotron free) for E and C: specific, used only the gap list, correct line numbers.

## Unseen inputs
_(Phase 6)_

## Unrehearsed questions
_(Phase 6)_

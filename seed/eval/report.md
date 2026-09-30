### Seed vendors

| Vendor | Input | Gemini model | Line fields agreeing with Sonnet | Commercial / questionnaire / cert fields agreeing | Ground truth (Sonnet → Gemini) | Wrong & not ⚠-flagged | Verdict |
|---|---|---|---|---|---|---|---|
| A Transpac Global Packaging (India) Pvt Ltd | xlsx, USD | gemini:gemini-3.5-flash-lite (conf 1) | 240/240 | 43/44 | 30/30 → 30/30 | 0 | Same |
| B Shree Ganesh Corrugators | letterhead PDF, per 100 | gemini:gemini-3.5-flash-lite (conf 1) | 240/240 | 44/44 | 30/30 → 30/30 | 0 | Same |
| C Deccan Board & Boxes Pvt Ltd | docx paragraphs | gemini:gemini-3.5-flash-lite (conf 1) | 219/219 | 44/44 | 30/30 → 30/30 | 0 | Same |
| D Mahalaxmi Packaging Works | angled phone photo | gemini:gemini-3.5-flash-lite (conf 0.98) | 236/240 | 29/32 | 30/30 → 29/30 | 0 | **Worse** |
| E Om Sai Cartons | one-line email + expired ISO | gemini:gemini-3.5-flash-lite (conf 0.75) | 18/37 | 19/22 | 26/30 → 13/30 | 0 | **Worse** |

(A landed: ₹4.277 cr; freight: USD 850.00 per shipment × 48 shipments/yr × 88.4000 = ₹36,06,720.00/yr, allocated pro-rata to line value (+9.21%))

#### A Transpac Global Packaging (India) Pvt Ltd
Ground-truth misses (Gemini): none

Differences vs Sonnet (1):
- Q6.number: Sonnet 15 vs Gemini 12

(B landed: ₹3.996 cr; freight: Included — "Freight & delivery up to your Chakan plant is included in the above rates.")

#### B Shree Ganesh Corrugators
Ground-truth misses (Gemini): none

Differences vs Sonnet (0):
- none

(C landed: ₹3.449 cr; freight: Included — "All rates are in Indian Rupees, exclusive of GST (18%), and include door delivery to your Chakan plant.")

#### C Deccan Board & Boxes Pvt Ltd
Ground-truth misses (Gemini): none

Differences vs Sonnet (0):
- none

(D landed: ₹3.760 cr; freight: Included — "Freight included for Pune district deliveries.")

#### D Mahalaxmi Packaging Works
Ground-truth misses (Gemini): L17 expected 116.38 got needs_input [needs_input, ⚠ flagged]

Differences vs Sonnet (7):
- L4 deviation: Sonnet false vs Gemini true
- L6 deviation: Sonnet false vs Gemini true
- L16 weight_kg: Sonnet null vs Gemini 2.45
- L17 weight_kg: Sonnet 2.45 vs Gemini null
- Q3.bool: Sonnet null vs Gemini true
- Q5.answered: Sonnet true vs Gemini false
- Q12.bool: Sonnet null vs Gemini true

(E landed: incomplete; freight: Freight extra, amount not usable: "freight extra")

#### E Om Sai Cartons
Ground-truth misses (Gemini): L1 expected 7.98 got 8.90 [assumed, ⚠ flagged]; L2 expected 9.88 got 10.95 [assumed, ⚠ flagged]; L3 expected 10.26 got 11.40 [assumed, ⚠ flagged]; L4 expected 11.97 got 13.40 [assumed, ⚠ flagged]; L5 expected 7.03 got 7.85 [assumed, ⚠ flagged]; L6 expected 13.49 got 15.05 [assumed, ⚠ flagged]; L7 expected 11.02 got 12.35 [assumed, ⚠ flagged]; L8 expected 9.12 got 10.25 [assumed, ⚠ flagged]; L9 expected 27.72 got 29.90 [assumed, ⚠ flagged]; L10 expected 32.55 got 35.20 [assumed, ⚠ flagged]; L11 expected 37.59 got 40.60 [assumed, ⚠ flagged]; L12 expected 30.45 got 32.80 [assumed, ⚠ flagged]; L13 expected 50.82 got 55.10 [assumed, ⚠ flagged]; L14 expected 31.71 got 34.30 [assumed, ⚠ flagged]; L15 expected 43.89 got 47.30 [assumed, ⚠ flagged]; L16 expected 59.85 got 64.80 [assumed, ⚠ flagged]; L27 expected 52.90 got 42.00 [extracted, ⚠ flagged]

Differences vs Sonnet (22):
- L1 quoted: Sonnet true vs Gemini false
- L2 quoted: Sonnet true vs Gemini false
- L3 quoted: Sonnet true vs Gemini false
- L4 quoted: Sonnet true vs Gemini false
- L5 quoted: Sonnet true vs Gemini false
- L6 quoted: Sonnet true vs Gemini false
- L7 quoted: Sonnet true vs Gemini false
- L8 quoted: Sonnet true vs Gemini false
- L9 quoted: Sonnet true vs Gemini false
- L10 quoted: Sonnet true vs Gemini false
- L11 quoted: Sonnet true vs Gemini false
- L12 quoted: Sonnet true vs Gemini false
- L13 quoted: Sonnet true vs Gemini false
- L14 quoted: Sonnet true vs Gemini false
- L15 quoted: Sonnet true vs Gemini false
- L16 quoted: Sonnet true vs Gemini false
- L23 quoted: Sonnet true vs Gemini false
- L24 quoted: Sonnet true vs Gemini false
- L26 quoted: Sonnet true vs Gemini false
- Q1.bool: Sonnet null vs Gemini true
- Q5.answered: Sonnet true vs Gemini false
- references: Sonnet "same_as_last_year:17-18-19-20-21-22-25-28-29-30" vs Gemini "same_as_last_year:1-2-3-4-5-6-7-8-9-10-11-12-13-14-15-16-17-18-19-20-21-22-23-24-25-26-28-29-30"

### Unseen samples

| Vendor | Lines (Sonnet) | Lines matching Sonnet value/state | Differences |
|---|---|---|---|
| Sahyadri Corrupack | — | not run | |
| Kolhapur Kraft Boxes | — | not run | |
| Sai Packaging | — | not run | |

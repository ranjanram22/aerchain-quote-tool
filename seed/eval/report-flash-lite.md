### Seed vendors

| Vendor | Input | Gemini model | Line fields agreeing with Sonnet | Commercial / questionnaire / cert fields agreeing | Ground truth (Sonnet → Gemini) | Verdict |
|---|---|---|---|---|---|---|
| A Transpac Global Packaging (India) Pvt Ltd | xlsx, USD | gemini:gemini-3.5-flash-lite (conf 1) | 240/240 | 43/44 | 30/30 → 30/30 | Same |
| B Shree Ganesh Corrugators | letterhead PDF, per 100 | gemini:gemini-3.5-flash-lite (conf 0.99) | 238/240 | 40/44 | 30/30 → 30/30 | Same |
| C Deccan Board & Boxes Pvt Ltd | docx paragraphs | gemini:gemini-3.5-flash-lite (conf 0.98) | 219/219 | 44/44 | 30/30 → 30/30 | Same |
| D Mahalaxmi Packaging Works | angled phone photo | gemini:gemini-3.5-flash-lite (conf 0.95) | 235/240 | 27/30 | 30/30 → 29/30 | **Worse** |
| E Om Sai Cartons | one-line email + expired ISO | gemini:gemini-3.5-flash-lite (conf 0.75) | 138/142 | 17/20 | 26/30 → 30/30 | Better |

#### A Transpac Global Packaging (India) Pvt Ltd
Ground-truth misses (Gemini): none

Differences vs Sonnet (1):
- freight.basis: Sonnet "per_shipment" vs Gemini "lump_sum"

#### B Shree Ganesh Corrugators
Ground-truth misses (Gemini): none

Differences vs Sonnet (6):
- L4 deviation: Sonnet false vs Gemini true
- L6 deviation: Sonnet false vs Gemini true
- Q7.number: Sonnet null vs Gemini 60
- Q9.number: Sonnet null vs Gemini 2
- Q11.number: Sonnet null vs Gemini 45
- Q12.bool: Sonnet null vs Gemini true

#### C Deccan Board & Boxes Pvt Ltd
Ground-truth misses (Gemini): none

Differences vs Sonnet (0):
- none

#### D Mahalaxmi Packaging Works
Ground-truth misses (Gemini): L17 expected 116.38 got needs_input [needs_input]

Differences vs Sonnet (8):
- L16 weight_kg: Sonnet null vs Gemini 2.45
- L16 deviation: Sonnet false vs Gemini true
- L17 weight_kg: Sonnet 2.45 vs Gemini null
- L26 deviation: Sonnet false vs Gemini true
- L27 deviation: Sonnet false vs Gemini true
- Q3.bool: Sonnet null vs Gemini true
- Q5.answered: Sonnet true vs Gemini false
- Q7.answered: Sonnet true vs Gemini false

#### E Om Sai Cartons
Ground-truth misses (Gemini): none

Differences vs Sonnet (7):
- L23 quoted: Sonnet true vs Gemini false
- L24 quoted: Sonnet true vs Gemini false
- L26 quoted: Sonnet true vs Gemini false
- L27 quoted: Sonnet true vs Gemini false
- Q1.answered: Sonnet true vs Gemini false
- Q5.answered: Sonnet true vs Gemini false
- references: Sonnet "same_as_last_year:17-18-19-20-21-22-25-28-29-30" vs Gemini "same_as_last_year:17-18-19-20-21-22-23-24-25-26-27-28-29-30"

### Unseen samples

| Vendor | Lines (Sonnet) | Lines matching Sonnet value/state | Differences |
|---|---|---|---|
| Sahyadri Corrupack | — | not run | |
| Kolhapur Kraft Boxes | — | not run | |
| Sai Packaging | — | not run | |

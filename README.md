# Quote Desk (Aerchain take-home prototype)

An AI procurement tool: draft an RFx with a co-pilot, read vendor replies in any format (Excel, PDF, Word, phone photo, email text), normalize them into one comparison, and ask questions to reach an award decision.

See `SPEC.md` for the full design, `DECISIONS.md` for why things are the way they are, and `STATUS.md` for progress.

## Run it on your Mac

1. Open Terminal in this folder.
2. Install once: `npm install`
3. Make sure `.env.local` has the three keys (see below).
4. Start: `npm run dev`
5. Open http://localhost:3000

## Keys (environment variables)

Four secrets, stored in `.env.local` on your Mac and in Vercel → Project → Settings → Environment Variables. Never commit them.

| Name | Where to find it |
|---|---|
| `GEMINI_API_KEY` | aistudio.google.com → Get API key (free tier) |
| `OPENROUTER_API_KEY` | openrouter.ai → Keys (only free `:free` models are used) |
| `SUPABASE_URL` | Supabase → Project Settings → Data API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → secret key (or legacy `service_role`) |

## Database

Paste `supabase/schema.sql` into Supabase → SQL Editor → New query → Run. Safe to run again.

## Seed demo data

- `npm run seed:files` regenerates the vendor documents in `seed/files/`, the rate card to photograph in `seed/print/`, and the test inputs in `samples/unseen/`.
- `npm run seed` **resets** the database to the demo state: 5 vendors, 30-product catalog, FX rates, last-year prices, the Chakan FY27 RFx (30 lines, 12 questions) and the 5 invitation emails. From Phase 2 it also runs the real extraction pipeline on the vendor files.

## Redeploy

Every push to the `main` branch on GitHub deploys automatically on Vercel. To redeploy without a code change: Vercel → Project → Deployments → latest → ⋯ → Redeploy.

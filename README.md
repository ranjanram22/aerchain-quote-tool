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

Three secrets, stored in `.env.local` on your Mac and in Vercel → Project → Settings → Environment Variables. Never commit them.

| Name | Where to find it |
|---|---|
| `OPENROUTER_API_KEY` | openrouter.ai → Keys |
| `SUPABASE_URL` | Supabase → Project Settings → Data API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → secret key (or legacy `service_role`) |

## Database

Paste `supabase/schema.sql` into Supabase → SQL Editor → New query → Run. Safe to run again.

## Seed demo data

`npm run seed` (available from Phase 1).

## Redeploy

Every push to the `main` branch on GitHub deploys automatically on Vercel. To redeploy without a code change: Vercel → Project → Deployments → latest → ⋯ → Redeploy.

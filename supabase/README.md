# Supabase backend for table talk

This directory holds the database schema, the Row Level Security policies, the daily limits and the `talk` Edge
Function that gives Mallorca her voice. The game works without it: with no Supabase configuration the chat stays off.

## Layout

- `migrations/` has the schema: `talk_lines`, `memories`, `usage`, `usage_total` and the `consume_call` function.
- `tests/` has the pgTAP tests for RLS and `consume_call`.
- `functions/` has the Edge Function and its Deno tests.

## Deploy

1. Create a Supabase project.
2. In Authentication, Sign In / Providers, enable anonymous sign-ins.
3. Link the project: `supabase link --project-ref <ref>`.
4. Apply the schema: `supabase db push`.
5. Set the secrets:
   `supabase secrets set ANTHROPIC_API_KEY=... TALK_DAILY_LIMIT=200 TALK_GLOBAL_DAILY_LIMIT=5000`.
6. Deploy the function: `supabase functions deploy talk`.
7. In the GitHub repository settings, add the variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` so the web
   build can reach the project.

## Limits and access

A user reads only their own lines and memories. Nothing else is open to the browser: the function writes with the
service role, and `consume_call` can be executed by the service role only. It counts calls per user and per day and
in total per day, and returns false without counting once either limit is reached.

## Local checks

`supabase start` needs Docker. `supabase test db` runs the pgTAP tests, and `deno fmt --check`, `deno lint` and
`deno test` run from `functions/`. The `Talk checks` workflow runs the same on every pull request that touches
`supabase/`.

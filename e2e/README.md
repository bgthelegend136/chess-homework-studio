# E2E Smoke Tests

These Playwright tests cover the critical path only:

1. Coach logs in, creates a student, creates an assignment, and saves a question.
2. Student opens token link, checks answer, completes self-review, and coach opens Answer Analysis.

## Prerequisites

- Use a **dedicated Supabase test project**.
- Apply migrations in order:
  - `supabase/migrations/0001_init.sql`
  - `supabase/migrations/0002_evaluations_and_groups.sql`
  - `supabase/migrations/0003_self_review_fields.sql`
  - `supabase/migrations/0004_group_assignment_batches.sql`

## Environment

1. Copy `.env.e2e.example` to `.env.e2e.local`.
2. Fill all required variables.
3. Export them into your shell session before running tests.

PowerShell example:

```powershell
Get-Content .env.e2e.local | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
  $name, $value = $_ -split '=', 2
  [Environment]::SetEnvironmentVariable($name, $value, 'Process')
}
```

## Run

- Install browsers once:
  - `npx playwright install chromium`
- Run smoke tests:
  - `npm run e2e`
- Optional headed mode:
  - `npm run e2e:headed`


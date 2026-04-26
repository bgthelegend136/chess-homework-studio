# PROJECT_STATUS.md

Living status doc for the chess homework self-review app. Update this whenever a phase ships, a migration lands, or a constraint changes.

---

## What the app is

A web app coaches use to assign chess homework that students self-review. The coach pastes a PGN, picks positions from the game, and writes questions with accepted moves, an explanation, and tags. The student opens a shareable token link, plays a candidate move, writes their reasoning, clicks **Check answer**, and immediately sees Correct/Incorrect plus the coach's explanation. After the student completes self-review, the coach inspects the results in **Answer Analysis** and assigns per-question evaluations, optional feedback, and an overall grade.

Two user surfaces, no shared session:
- **Coach** — authenticated, full CRUD, behind `/login` middleware.
- **Student** — public token URL `/a/[token]`. The token *is* the identity.

## Current product direction

The product is a **self-review tool**, not an engine analysis tool, not a club/LMS. The student gets immediate, deterministic feedback (accepted-move match) plus the coach's pre-written explanation. The coach's later review is asynchronous and qualitative. Optimize for:

1. Coach setup speed (paste a PGN, write questions fast).
2. Student feedback latency (instant Check, no waiting on coach).
3. Pedagogical signal back to the coach (per-tag weak areas, evaluation distribution).

Out of scope for now: live engine eval, multi-coach orgs, student-to-student features.

## Current architecture

- **Framework:** Next.js 14 App Router, server components by default.
- **DB / Auth:** Supabase (Postgres + Auth). RLS enforced on all coach-owned tables; public student routes use the service-role admin client and authorize by matching `student_token` in the query.
- **Chess:** `chess.js` for PGN parsing and move legality. `react-chessboard` for the UI.
- **Validation:** `zod` at all server-action / route-handler boundaries.

### Route layout

- `app/(coach)/` — auth-gated coach UI: `dashboard`, `students`, `students/[id]`, `students/new`, `groups`, `groups/[id]`, `assignments/new`, `assignments/[id]/edit`, `assignments/[id]/review`.
- `app/a/[token]/` — public student page (no auth).
- `app/api/public/[token]/` — token-scoped JSON endpoints: `answers` (PUT autosave), `answers/check` (POST self-review check), `submit` (POST complete).
- `app/login/` — Supabase Auth.
- `middleware.ts` — redirects unauthenticated requests off `/(coach)` routes.

### State

- **Coach editor:** `creator-state/reducer.ts` is the single state machine for `CreatorShell`. Owns PGN parse output, ply selection, question drafts, dirty flag, and editing index.
- **Student page:** local `useState` in `StudentShell`. Each move/explanation autosaves via `PUT /api/public/[token]/answers`. Check is `POST /api/public/[token]/answers/check`. Final completion is `POST /api/public/[token]/submit`.
- **Coach review:** `ReviewShell` with server-action save.

### Supabase clients

- `lib/supabase/server.ts` — RSC + route handlers, cookies-based auth.
- `lib/supabase/browser.ts` — client components.
- `lib/supabase/admin.ts` — service-role, used only by `/api/public/[token]/*` and authorizes by token match.

### Key types (`lib/types.ts`)

`Assignment`, `AssignmentBatch`, `Question`, `Answer`, `Student`, `StudentGroup`, plus enums `AssignmentStatus`, `Evaluation`, `CalculationDepth`, and the frozen `QuestionTag` union.

## Implemented features

- Coach login / sign-out, route protection.
- Students: create, list, detail page with Groups panel, status counts, **visual performance snapshot** (checked accuracy bar + coach evaluation distribution), **recurring weak areas** by tag, assignment history.
- Groups: create, member management, group-detail controls.
- Assignments:
  - Single-student create.
  - **Duplicate assignment** - clone PGN + questions to a selected student or group without copying answers, reviews, or batch membership.
  - **Group batch create** — one assignment per group member, all sharing a `batch_id` for sync of PGN/question edits to unopened copies.
  - PGN paste + parse + move list; question CRUD tied to FEN.
  - **Q keyboard shortcut** to add a question from the selected ply.
  - Per-question fields: prompt, accepted moves (`coach_reference_answer`, comma- or newline-separated), `coach_explanation`, `coach_notes` (private), tags, `calculation_depth`.
  - Optional per-question hints with one student retry after a first wrong check.
  - PGN locked once student opens the assignment; existing questions remain editable for self-review.
  - Copy student link button.
- Student token page:
  - Drag-to-move board, autosave of move + reasoning.
  - **Check answer** with strict + loose SAN matching (`lib/chess/selfReview.ts`); locks the question once checked; shows Correct/Incorrect + accepted move(s) + coach explanation + tags + calculation depth.
  - Per-question status dots in the header.
  - Cannot complete until every question with accepted moves has been checked.
  - Due-date badge with overdue/warning/info states.
  - Read-only re-open after submission; coach grade and overall feedback shown after review.
- Coach **Answer Analysis** (`/assignments/[id]/review`): per-question student move + reasoning, evaluation dropdown, per-question feedback, overall feedback, grade, status flips to `reviewed`.
- In-app dashboard notifications when a student completes self-review.
- Coach-only **Opening Repertoire Trainer** (`/openings`) with mainline PGN parsing, board drilling, mastery tracking, and visualizer list.
- Status transitions: `not_opened` → `in_progress` (on student first open) → `submitted` → `reviewed`.

## Migrations

Apply in order in the Supabase SQL editor. All eight are required.

| File | Adds |
|---|---|
| `supabase/migrations/0001_init.sql` | `students`, `assignments` (with `assignment_status` enum), `questions`, `answers`, RLS policies. |
| `supabase/migrations/0002_evaluations_and_groups.sql` | `answers.evaluation` check, `student_groups`, `student_group_members` + RLS. |
| `supabase/migrations/0003_self_review_fields.sql` | `questions.coach_explanation`, `questions.calculation_depth` (+ check), `answers.is_correct`. |
| `supabase/migrations/0004_group_assignment_batches.sql` | `assignment_batches` + RLS, `assignments.batch_id`. |
| `supabase/migrations/0005_assignment_source.sql` | `assignments.source_assignment_id` for duplicate-assignment audit/history. |
| `supabase/migrations/0006_hint_try_again.sql` | `questions.hint`, `answers.hint_used`, `answers.attempt_count`. |
| `supabase/migrations/0007_notifications.sql` | `notifications` table + RLS for in-app assignment completion notices. |
| `supabase/migrations/0008_opening_repertoire_trainer.sql` | `opening_repertoires`, `opening_positions`, `opening_attempts`, `opening_position_progress` + RLS. |

All migrations are additive and idempotent (`if not exists` / `do $$ ... $$` guards). Safe to re-run.

## Current phase

**Phase 0 — Stabilization.** Core flows are implemented end-to-end. Focus is manual QA, fixing latent bugs (see Known risks), and tightening UX before adding net-new features. Playwright/e2e work is paused at the user's direction.

## Known risks

- **`coach_notes` is private.** Never surface in student UI, student API responses, or shared exports. The student page must continue to read only `coach_explanation`.
- **Public token endpoints use the admin client.** No rate limiting; tokens never rotate or expire. Treat the token as a long-lived bearer credential.
- **Status-change cache.** Server Components may show stale `not_opened` until hard refresh after a student opens the link.
- **Hard-coded 520px student board.** Overflows on small phones; coach board panel squashes below ~900px.
- **PGN with variations / NAGs** is silently flattened to the mainline by `lib/chess/parsePgn.ts`.
- **Loose SAN matching** in `selfReview.ts` rejects ambiguous coach inputs ("Nf3" when both knights can move there) — by design, but coaches need to know.
- **No soft delete / audit.** Deleting a question or assignment is permanent; cascades wipe answers.
- **Token collisions** are theoretically possible (`generateToken` uniqueness relies on the unique index — handle the conflict path on insert if collisions appear).

## Next roadmap

User-prioritized backlog, organized into phases. Each phase ships independently and preserves all current flows.

### Phase 1 — Coach-side leverage (low risk, high reuse)
1. **Bulk grading** in Answer Analysis — "auto-set evaluation from `is_correct`", "mark all unanswered as blunder". Pure UI + server action; no schema change.

### Phase 2 — Student-facing depth
3. **Hint + try-again** — optional `hint` text per question; configurable max attempts. Adds `questions.hint`, `questions.max_attempts`, `answers.attempt_count`, `answers.hint_used`. All nullable / defaulted, old assignments behave exactly as before.
4. **Student progress page** at the token URL — accuracy over time and weakest tags across all assignments from this coach. Read-only aggregation; no schema change.

### Phase 3 — Workflow / async
5. **Email or in-app notification on submission** — Supabase webhook or Resend integration. New table `notification_events` (or external delivery only). Coach preference column on `auth.users` metadata or a new `coach_settings` row.
6. **Spaced repetition review queue** — questions a student got wrong reappear in a generated "Review" assignment after N days. Builds on existing `is_correct`, `tags`, and the duplicate-assignment plumbing from Phase 1. Adds `review_queue` table keyed by `(student_id, question_id)` with next-due timestamp.

### Phase 4 — Imports and accounts
7. **Lichess import** — paste a game URL, fetch PGN server-side via Lichess API. UI-level addition to the new-assignment form.
8. **Optional student accounts** — keep token links as default. Adds `student_users` linking `auth.users.id` to `students.id`; resume across devices, view history. Larger surface; do last.

### Explicitly deferred (do not pick up without re-prompt)
- Engine evaluation panel (Stockfish).
- Multi-coach / studio / club features.
- Variations / sideline editing in PGN.
- PDF export.
- Live realtime coaching session.

## Recommended first feature

**Phase 1, item 1: Duplicate assignment.**

Why:
- Direct, repeatedly-requested coach pain (re-using a position set across students).
- Touches only the coach surface; zero impact on the student token flow or the public API.
- Zero or near-zero schema change; the existing data model already supports it.
- Sets up the plumbing later reused by **spaced repetition** (Phase 3) and **bulk grading** (because both reason about copying questions/evaluations).
- Easy to ship behind a single new server action and a new button on the dashboard / assignment row.

### Migration needs

Two viable paths:

**Option A — no migration.** Implement purely as a server action that:
- Reads the source assignment + its questions (verifying `coach_id`).
- Inserts a new `assignments` row with a fresh `student_token`, `status = 'not_opened'`, target `student_id` from the form.
- Bulk-inserts questions copying `fen`, `side_to_move`, `move_number`, `prompt`, `coach_reference_answer`, `coach_explanation`, `coach_notes`, `tags`, `calculation_depth`, `order_index`.
- Does **not** copy `answers`, `overall_feedback`, `grade`, `first_opened_at`, `submitted_at`, `reviewed_at`, `batch_id`.

**Option B — additive audit column.** A trivial migration `0005_assignment_source.sql`:
```sql
alter table assignments
  add column if not exists source_assignment_id uuid
  references assignments(id) on delete set null;
create index if not exists assignments_source_id_idx
  on assignments (source_assignment_id);
```
Lets the coach see "duplicated from X" later and is harmless if unused. Idempotent, additive, no RLS change needed (existing `coach owns assignments` policy covers it).

Recommend **Option B** — the column is cheap and unlocks future "show duplicates" UX. Both options are safe.

### Risks for this feature

- **`coach_notes` leakage** — the duplicate must keep `coach_notes` server-side only. Already enforced by the student page reading specific columns, but the duplicate action should not change any student-facing read paths. Verify by smoke-testing the student URL on the duplicated assignment.
- **Token collisions** — generate a fresh `student_token`; reuse `lib/assignments/token.generateToken` and rely on the unique index. Catch the unique-violation and retry once.
- **Status assumptions** — duplicates must start at `not_opened`. Don't carry over `first_opened_at`, `submitted_at`, `reviewed_at`, `overall_feedback`, `grade`. Don't copy answers (they belong to the source).
- **Batch semantics** — if duplicating a batched assignment, do not copy `batch_id` (the duplicate is its own assignment, not a batch member). If "duplicate to a whole group" is in scope, treat that as a separate path that creates a new `assignment_batches` row, mirroring the existing `createGroupAssignment` action.
- **Order index** — keep source `order_index` values to preserve question order; they only need to be unique within the new assignment.
- **PGN-locked editing** — the duplicate is `not_opened`, so the editor will treat it as fully editable; verify the editor doesn't carry any "locked" state from the source.
- **RLS** — both reads and writes go through the user-scoped server client; do not introduce the admin client into this path.

## Rules for future coding agents

Read these before writing code in this repo.

1. **No rewrites.** Extend existing files; don't restructure routes, reducers, or the Supabase client layer without explicit approval.
2. **Preserve current flows.** The end-to-end happy path documented under "Implemented features" must keep working. Touch one surface at a time.
3. **Safe migrations only.** Additive, idempotent, guarded with `if not exists` / `do $$` blocks. New columns must be nullable or have a default. Never drop or rename a column without a migration plan and approval.
4. **Old assignments must keep working.** Any new column on `questions`, `answers`, or `assignments` must default to a value that reproduces today's behavior. Test by opening a pre-migration assignment as both coach and student after the change.
5. **Never expose `coach_notes`** to student UIs, student API responses, exports, or notifications. It is coach-private.
6. **Do not add engine analysis** (Stockfish, eval bars, best lines) or **club/org/multi-coach features**. Out of scope for the current direction.
7. **RLS first.** All coach-side reads/writes go through `lib/supabase/server.ts` (or `browser.ts`) and are scoped by `coach_id = auth.uid()`. The admin client (`lib/supabase/admin.ts`) is reserved for the public token endpoints and must continue to authorize by `student_token` match in the query.
8. **Validate at boundaries.** Server actions and route handlers must `zod`-parse their inputs. Don't trust client state.
9. **Token endpoints are sensitive.** Anything under `app/api/public/[token]/` runs with service-role privileges. Every query must filter by `student_token` (directly or via the resolved assignment).
10. **`coach_notes`, `coach_explanation`, accepted moves are coach data.** Only `coach_explanation`, `coach_reference_answer` (after check), `tags`, and `calculation_depth` are surfaced to students. Don't broaden this.
11. **Keep `creator-state/reducer.ts` the single source of truth** for the editor. Don't fork local state inside `BoardPanel` / `QuestionEditor`.
12. **No new top-level dependencies** without explicit approval. Stay on `chess.js`, `react-chessboard`, `zod`, `@supabase/*`, Next.js, Tailwind.
13. **Don't write Playwright/e2e** until the user reopens that work.
14. **Don't generate or modify documentation files** (other than this one and `CLAUDE.md` / `AGENTS.md`) unless asked.
15. **Update this file** when a feature ships, a migration is added, or a known risk is resolved or discovered.

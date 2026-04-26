# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start Next.js dev server on port 3000
npm run build      # Production build
npm run lint       # ESLint
npm run typecheck  # TypeScript type checking (tsc --noEmit)
```

## Current Handoff Notes

Last updated: 2026-04-26.

Recent work changed both the homework assignment editor and the coach-side opening trainer. Keep these scopes separate.

### Important Current State

- `npm run typecheck`, `npm run lint` pass. Dev server runs cleanly.

### Homework Assignment Editor

- `lib/chess/parsePgn.ts` must keep the existing `ParseResult` contract:
  - `plies` remains the backward-compatible flat mainline output.
  - `startFen` remains standard starting position output.
  - Optional `moveTree` and `moveNodes` are now returned for editor navigation.
- The assignment editor is now variation-aware:
  - `components/chess/MoveList.tsx` renders compact indented PGN variations.
  - `creator-state/reducer.ts` tracks both legacy `selectedPlyIndex` and variation-aware `selectedNodeId`.
  - `components/creator/BoardPanel.tsx` uses the selected variation node FEN when present.
  - Questions are still stored by existing FEN fields; no schema change was made.
  - Student token flow does not need to know the PGN tree.
- The `Q` shortcut should work after clicking a move button. Do not re-add a `tag !== 'BUTTON'` guard in `CreatorShell`.
- Homework parser behavior:
  - Supports headers, comments, Lichess/ChessBase comments/markup, NAGs, suffixes, nested variations, castling, checks, mates, promotions, captures, and disambiguation.
  - Extracts mainline for `plies`; preserves full structure for `moveTree`.
  - Fails clearly for `[SetUp "1"]` / `[FEN "..."]` and multiple games.

### Opening Trainer

- Coach-side `/openings` trainer is shipped and working.
- `lib/openings/parseRepertoirePgn.ts` uses `@mliebelt/pgn-parser` to preserve variations and comments for opening repertoires.
- `supabase/migrations/0009_opening_variation_tree.sql` was added:
  - `opening_repertoires.import_report`
  - `opening_positions.comment`
  - `opening_positions.opponent_move_uci`
  - non-unique indexes for parent/fen/line path
  - drops the old unique `(repertoire_id, fen)` index if present
- Existing live DB may still need earlier migrations:
  - `supabase/migrations/0006_hint_try_again.sql`
  - `supabase/migrations/0008_opening_repertoire_trainer.sql`
  - `supabase/migrations/0009_opening_variation_tree.sql`
- **Line-scoped training**: clicking **Train** on a specific line in `LineCoverageExplorer` passes `?line=<leafPositionId>` to the trainer. `OpeningTrainer` builds the ancestor chain from the leaf, walks it linearly, and shows a "Line complete" screen at the end. Without the param the trainer falls back to global priority-based selection.
- Probe fixtures:
  - `test-fixtures/openings/lichess-study-complex.pgn`
  - `test-fixtures/openings/chessbase-complex.pgn`
  - `scripts/probe-pgn.js`

### Do Not Touch Unless Asked

- Student token flow.
- Student answer/self-review APIs.
- Assignment status logic.
- Database schema/migrations, except the already-added opening migration.
- Opening visualizer redesign beyond the current user-approved scope.

## Architecture

This is a chess coaching platform built with **Next.js 14 App Router**, **Supabase** (PostgreSQL + Auth), **chess.js** for game logic, and **react-chessboard** for the board UI.

### Route Structure

Two distinct user flows share no code paths:

- **`/app/(coach)/`** — Authenticated coach routes (middleware enforces auth). Contains dashboard, student management, assignment creation/editing, and review of student submissions.
- **`/app/a/[token]/`** — Public student endpoint accessed via shareable link token. No authentication — identity is the token.

### Core Data Flow

1. Coach creates an assignment with a PGN (game notation string)
2. PGN is parsed into a backward-compatible mainline plus an optional variation tree for editor navigation; coach selects positions and writes questions tied to FEN strings
3. A unique `student_token` is generated and shared with the student
4. Student opens the public link, selects moves on a board, submits answers
5. Coach reviews answers, assigns evaluations (`blunder` | `mistake` | `dubious` | `interesting` | `correct`) and feedback, then grades the assignment

### State Management

**`creator-state/reducer.ts`** is the primary state machine for the assignment editor. It manages: PGN input → parse → mainline/variation move selection → question CRUD → dirty tracking. `CreatorShell.tsx` owns this reducer and passes slices down to `BoardPanel`, `PgnPanel`, `QuestionEditor`, and `QuestionList`.

Student answering state is local `useState` within `StudentShell.tsx` — answers are saved per-question to Supabase before final submission.

### Supabase Clients

Three separate clients depending on context:
- `lib/supabase/server.ts` — Server Components and Route Handlers (uses cookies, `server-only` import)
- `lib/supabase/browser.ts` — Client Components
- `lib/supabase/admin.ts` — Admin operations (bypasses RLS)

`lib/auth.ts` exposes `requireCoach()` (redirects to `/login` if unauthenticated) used at the top of every coach Server Component or Route Handler.

### Key Types

Defined in `lib/types.ts`:
- `Assignment` — includes `pgn`, `status`, `student_token`, `overall_feedback`, `grade`
- `Question` — tied to a `fen` position, has `prompt`, `coach_reference_answer`, `coach_notes`, `tags`
- `Answer` — has `student_move` (SAN notation), `explanation`, `feedback`, `evaluation`
- `AssignmentStatus`: `'not_opened' | 'in_progress' | 'submitted' | 'reviewed'`

### Path Alias

`@/*` maps to the project root (configured in `tsconfig.json`).

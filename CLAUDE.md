# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start Next.js dev server on port 3000
npm run build      # Production build
npm run lint       # ESLint
npm run typecheck  # TypeScript type checking (tsc --noEmit)
```

## Architecture

This is a chess coaching platform built with **Next.js 14 App Router**, **Supabase** (PostgreSQL + Auth), **chess.js** for game logic, and **react-chessboard** for the board UI.

### Route Structure

Two distinct user flows share no code paths:

- **`/app/(coach)/`** — Authenticated coach routes (middleware enforces auth). Contains dashboard, student management, assignment creation/editing, and review of student submissions.
- **`/app/a/[token]/`** — Public student endpoint accessed via shareable link token. No authentication — identity is the token.

### Core Data Flow

1. Coach creates an assignment with a PGN (game notation string)
2. PGN is parsed with chess.js into a move-by-move tree; coach selects positions and writes questions tied to FEN strings
3. A unique `student_token` is generated and shared with the student
4. Student opens the public link, selects moves on a board, submits answers
5. Coach reviews answers, assigns evaluations (`blunder` | `mistake` | `dubious` | `interesting` | `correct`) and feedback, then grades the assignment

### State Management

**`creator-state/reducer.ts`** is the primary state machine for the assignment editor. It manages: PGN input → chess.js parse → ply/move selection → question CRUD → dirty tracking. `CreatorShell.tsx` owns this reducer and passes slices down to `BoardPanel`, `PgnPanel`, `QuestionEditor`, and `QuestionList`.

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

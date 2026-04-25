-- Chess Coach Assignment Tool — initial schema
-- Run this in the Supabase SQL editor after creating your project.

-- Students (coach_id = auth.users.id directly, no coaches table)
create table if not exists students (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  email      text,
  notes      text,
  created_at timestamptz not null default now()
);
create index if not exists students_coach_id_idx on students (coach_id);

-- Assignment status enum
create type assignment_status as enum (
  'not_opened',
  'in_progress',
  'submitted',
  'reviewed'
);

-- Assignments
create table if not exists assignments (
  id               uuid primary key default gen_random_uuid(),
  coach_id         uuid not null references auth.users(id) on delete cascade,
  student_id       uuid not null references students(id) on delete restrict,
  title            text not null,
  pgn              text not null default '',
  status           assignment_status not null default 'not_opened',
  due_date         date,
  student_token    text unique not null,
  overall_feedback text,
  grade            text,
  created_at       timestamptz not null default now(),
  first_opened_at  timestamptz,
  submitted_at     timestamptz,
  reviewed_at      timestamptz
);
create index if not exists assignments_coach_id_idx on assignments (coach_id, created_at desc);
create index if not exists assignments_token_idx   on assignments (student_token);

-- Questions
create table if not exists questions (
  id                    uuid primary key default gen_random_uuid(),
  assignment_id         uuid not null references assignments(id) on delete cascade,
  order_index           int  not null,
  fen                   text not null,
  side_to_move          char(1) not null check (side_to_move in ('w', 'b')),
  move_number           int  not null,
  prompt                text not null,
  coach_reference_answer text,
  coach_notes           text,
  tags                  text[] not null default '{}'
);
create unique index if not exists questions_assignment_order_idx on questions (assignment_id, order_index);

-- Answers (one per question; draft lifecycle separate from submission)
create table if not exists answers (
  id           uuid primary key default gen_random_uuid(),
  question_id  uuid unique not null references questions(id) on delete cascade,
  student_move text,
  explanation  text,
  feedback     text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ─── Row Level Security ──────────────────────────────────────────────────────

alter table students    enable row level security;
alter table assignments enable row level security;
alter table questions   enable row level security;
alter table answers     enable row level security;

-- Students: coach can CRUD their own
create policy "coach owns students"
  on students for all
  using  (coach_id = auth.uid())
  with check (coach_id = auth.uid());

-- Assignments: coach can CRUD their own
create policy "coach owns assignments"
  on assignments for all
  using  (coach_id = auth.uid())
  with check (coach_id = auth.uid());

-- Questions: coach can CRUD questions on their assignments
create policy "coach owns questions"
  on questions for all
  using (
    assignment_id in (
      select id from assignments where coach_id = auth.uid()
    )
  )
  with check (
    assignment_id in (
      select id from assignments where coach_id = auth.uid()
    )
  );

-- Answers: coach can read/update feedback on their assignments' questions
create policy "coach reads answers"
  on answers for all
  using (
    question_id in (
      select q.id from questions q
      join assignments a on a.id = q.assignment_id
      where a.coach_id = auth.uid()
    )
  )
  with check (
    question_id in (
      select q.id from questions q
      join assignments a on a.id = q.assignment_id
      where a.coach_id = auth.uid()
    )
  );

-- Note: student token endpoints use the service-role client and bypass RLS.
-- They authorize by matching student_token in the query itself.

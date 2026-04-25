-- Minimal batch metadata for creating one assignment per group member.
-- Existing student-token assignment flow remains unchanged.

create table if not exists assignment_batches (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null references auth.users(id) on delete cascade,
  group_id   uuid references student_groups(id) on delete set null,
  title      text not null,
  due_date   date,
  created_at timestamptz not null default now()
);

create index if not exists assignment_batches_coach_id_idx
  on assignment_batches (coach_id, created_at desc);

alter table assignment_batches enable row level security;

create policy "coach owns assignment batches"
  on assignment_batches for all
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());

alter table assignments
  add column if not exists batch_id uuid references assignment_batches(id) on delete set null;

create index if not exists assignments_batch_id_idx
  on assignments (batch_id);

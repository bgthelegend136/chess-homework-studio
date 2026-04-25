-- Per-question evaluation set by the coach during review.
alter table answers
  add column if not exists evaluation text
    check (evaluation in ('blunder','mistake','dubious','interesting','correct'));

-- ─── Student groups (MVP) ────────────────────────────────────────────────────
create table if not exists student_groups (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);
create index if not exists student_groups_coach_id_idx on student_groups (coach_id);

create table if not exists student_group_members (
  group_id   uuid not null references student_groups(id) on delete cascade,
  student_id uuid not null references students(id)        on delete cascade,
  primary key (group_id, student_id)
);
create index if not exists student_group_members_student_idx on student_group_members (student_id);

alter table student_groups        enable row level security;
alter table student_group_members enable row level security;

create policy "coach owns groups"
  on student_groups for all
  using  (coach_id = auth.uid())
  with check (coach_id = auth.uid());

create policy "coach owns group members"
  on student_group_members for all
  using (
    group_id in (select id from student_groups where coach_id = auth.uid())
  )
  with check (
    group_id in (select id from student_groups where coach_id = auth.uid())
  );

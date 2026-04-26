-- Coach-only opening repertoire trainer.
-- Run after 0007_notifications.sql.

create table if not exists opening_repertoires (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  side_to_train text not null check (side_to_train in ('white', 'black')),
  pgn text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists opening_repertoires_coach_id_idx
  on opening_repertoires (coach_id, created_at desc);

create table if not exists opening_positions (
  id uuid primary key default gen_random_uuid(),
  repertoire_id uuid not null references opening_repertoires(id) on delete cascade,
  fen text not null,
  expected_move_san text not null,
  expected_move_uci text not null,
  parent_position_id uuid references opening_positions(id) on delete set null,
  line_path text not null,
  ply_index int not null,
  opponent_move_san text,
  is_mainline boolean not null default true,
  annotation text check (annotation in ('!', '!!')),
  priority_weight int not null default 10,
  created_at timestamptz not null default now()
);

create index if not exists opening_positions_repertoire_id_idx
  on opening_positions (repertoire_id, ply_index);

create unique index if not exists opening_positions_repertoire_fen_idx
  on opening_positions (repertoire_id, fen);

create table if not exists opening_attempts (
  id uuid primary key default gen_random_uuid(),
  repertoire_id uuid not null references opening_repertoires(id) on delete cascade,
  position_id uuid not null references opening_positions(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete cascade,
  attempted_move text not null,
  was_correct boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists opening_attempts_coach_id_created_at_idx
  on opening_attempts (coach_id, created_at desc);

create index if not exists opening_attempts_position_id_idx
  on opening_attempts (position_id, created_at desc);

create table if not exists opening_position_progress (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  repertoire_id uuid not null references opening_repertoires(id) on delete cascade,
  position_id uuid not null references opening_positions(id) on delete cascade,
  times_seen int not null default 0,
  correct_count int not null default 0,
  wrong_count int not null default 0,
  current_streak int not null default 0,
  mastery_level text not null default 'new'
    check (mastery_level in ('new', 'learning', 'weak', 'mastered')),
  last_seen_at timestamptz,
  priority_score int not null default 10,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists opening_position_progress_coach_position_idx
  on opening_position_progress (coach_id, position_id);

create index if not exists opening_position_progress_repertoire_id_idx
  on opening_position_progress (repertoire_id, mastery_level);

alter table opening_repertoires enable row level security;
alter table opening_positions enable row level security;
alter table opening_attempts enable row level security;
alter table opening_position_progress enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'opening_repertoires'
      and policyname = 'coach owns opening repertoires'
  ) then
    create policy "coach owns opening repertoires"
      on opening_repertoires for all
      using (coach_id = auth.uid())
      with check (coach_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'opening_positions'
      and policyname = 'coach owns opening positions'
  ) then
    create policy "coach owns opening positions"
      on opening_positions for all
      using (
        repertoire_id in (
          select id from opening_repertoires where coach_id = auth.uid()
        )
      )
      with check (
        repertoire_id in (
          select id from opening_repertoires where coach_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'opening_attempts'
      and policyname = 'coach owns opening attempts'
  ) then
    create policy "coach owns opening attempts"
      on opening_attempts for all
      using (coach_id = auth.uid())
      with check (coach_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'opening_position_progress'
      and policyname = 'coach owns opening progress'
  ) then
    create policy "coach owns opening progress"
      on opening_position_progress for all
      using (coach_id = auth.uid())
      with check (coach_id = auth.uid());
  end if;
end $$;

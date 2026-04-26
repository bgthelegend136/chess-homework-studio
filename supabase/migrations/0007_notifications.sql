-- In-app notifications for coach-visible assignment events.
-- Run after 0006_hint_try_again.sql.

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  assignment_id uuid references assignments(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_coach_id_created_at_idx
  on notifications (coach_id, created_at desc);

create unique index if not exists notifications_assignment_submitted_once_idx
  on notifications (assignment_id, type)
  where type = 'assignment_submitted';

alter table notifications enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'notifications'
      and policyname = 'coach owns notifications'
  ) then
    create policy "coach owns notifications"
      on notifications for all
      using (coach_id = auth.uid())
      with check (coach_id = auth.uid());
  end if;
end $$;

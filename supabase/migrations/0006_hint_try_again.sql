-- Optional hints and one retry for self-review answers.
-- Run after 0005_assignment_source.sql.

alter table questions
  add column if not exists hint text;

alter table answers
  add column if not exists hint_used boolean not null default false;

alter table answers
  add column if not exists attempt_count int not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'answers_attempt_count_nonnegative'
  ) then
    alter table answers
      add constraint answers_attempt_count_nonnegative
      check (attempt_count >= 0);
  end if;
end $$;

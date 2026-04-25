-- Self-review fields for coach-prepared instant feedback.
-- Run after 0001_init.sql and 0002_evaluations_and_groups.sql.

alter table questions
  add column if not exists coach_explanation text;

alter table questions
  add column if not exists calculation_depth text not null default 'none';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'questions_calculation_depth_check'
  ) then
    alter table questions
      add constraint questions_calculation_depth_check
      check (calculation_depth in ('none', 'short', 'long'));
  end if;
end $$;

alter table answers
  add column if not exists is_correct boolean;

-- Track the source assignment a duplicate was created from.
-- Additive, idempotent. Existing assignments keep working with a NULL value.

alter table assignments
  add column if not exists source_assignment_id uuid
    references assignments(id) on delete set null;

create index if not exists assignments_source_assignment_id_idx
  on assignments (source_assignment_id);

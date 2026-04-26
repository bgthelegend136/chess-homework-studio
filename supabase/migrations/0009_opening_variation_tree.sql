-- Variation-aware opening repertoire imports.
-- Run after 0008_opening_repertoire_trainer.sql.

alter table opening_repertoires
  add column if not exists import_report jsonb not null default '{}'::jsonb;

alter table opening_positions
  add column if not exists opponent_move_uci text,
  add column if not exists comment text;

drop index if exists opening_positions_repertoire_fen_idx;

create index if not exists opening_positions_repertoire_parent_idx
  on opening_positions (repertoire_id, parent_position_id);

create index if not exists opening_positions_repertoire_fen_lookup_idx
  on opening_positions (repertoire_id, fen);

create index if not exists opening_positions_repertoire_line_path_idx
  on opening_positions (repertoire_id, line_path);

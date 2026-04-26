'use server';
import { revalidatePath } from 'next/cache';
import { requireCoach } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { parseRepertoirePgn } from '@/lib/openings/parseRepertoirePgn';
import type { OpeningMasteryLevel, OpeningSide } from '@/lib/types';
import { z } from 'zod';

const CreateRepertoireSchema = z.object({
  name: z.string().min(1).max(200),
  side_to_train: z.enum(['white', 'black']),
  pgn: z.string().min(1).max(100000),
});

const RecordAttemptSchema = z.object({
  repertoire_id: z.string().uuid(),
  position_id: z.string().uuid(),
  attempted_move: z.string().min(1).max(20),
  attempted_uci: z.string().min(4).max(5),
});

function masteryLevel(
  wasCorrect: boolean,
  correctCount: number,
  wrongCount: number,
  currentStreak: number,
): OpeningMasteryLevel {
  if (wasCorrect && correctCount >= 3 && currentStreak >= 3 && wrongCount <= correctCount) {
    return 'mastered';
  }
  if (!wasCorrect || wrongCount > correctCount) return 'weak';
  return 'learning';
}

function priorityScore(
  baseWeight: number,
  level: OpeningMasteryLevel,
  wasCorrect: boolean,
): number {
  if (level === 'weak') return baseWeight + 45;
  if (level === 'new') return baseWeight + 30;
  if (level === 'mastered') return Math.max(1, baseWeight - 7);
  return baseWeight + (wasCorrect ? 5 : 25);
}

export async function createOpeningRepertoire(
  input: z.infer<typeof CreateRepertoireSchema>,
): Promise<{ id: string }> {
  const coach = await requireCoach();
  const data = CreateRepertoireSchema.parse(input);
  const positions = parseRepertoirePgn(data.pgn, data.side_to_train as OpeningSide);
  const supabase = createSupabaseServerClient();

  const { data: repertoire, error: repertoireError } = await supabase
    .from('opening_repertoires')
    .insert({
      coach_id: coach.id,
      name: data.name,
      side_to_train: data.side_to_train,
      pgn: data.pgn,
    })
    .select('id')
    .single();

  if (repertoireError || !repertoire) {
    throw new Error(repertoireError?.message ?? 'Could not create repertoire');
  }

  const positionRows = positions.map((position) => ({
    id: position.id,
    repertoire_id: repertoire.id,
    fen: position.fen,
    expected_move_san: position.expected_move_san,
    expected_move_uci: position.expected_move_uci,
    parent_position_id: position.parent_position_id,
    line_path: position.line_path,
    ply_index: position.ply_index,
    opponent_move_san: position.opponent_move_san,
    is_mainline: position.is_mainline,
    annotation: position.annotation,
    priority_weight: position.priority_weight,
  }));

  const { error: positionsError } = await supabase
    .from('opening_positions')
    .insert(positionRows);

  if (positionsError) {
    await supabase.from('opening_repertoires').delete().eq('id', repertoire.id);
    throw new Error(positionsError.message);
  }

  const { error: progressError } = await supabase
    .from('opening_position_progress')
    .insert(
      positionRows.map((position) => ({
        coach_id: coach.id,
        repertoire_id: repertoire.id,
        position_id: position.id,
        mastery_level: 'new',
        priority_score: position.priority_weight + 30,
      })),
    );

  if (progressError) {
    await supabase.from('opening_repertoires').delete().eq('id', repertoire.id);
    throw new Error(progressError.message);
  }

  revalidatePath('/openings');
  return { id: repertoire.id as string };
}

export async function recordOpeningAttempt(
  input: z.infer<typeof RecordAttemptSchema>,
): Promise<{
  wasCorrect: boolean;
  correctMove: string;
  masteryLevel: OpeningMasteryLevel;
  priorityScore: number;
}> {
  const coach = await requireCoach();
  const data = RecordAttemptSchema.parse(input);
  const supabase = createSupabaseServerClient();

  const { data: position, error: positionError } = await supabase
    .from('opening_positions')
    .select(
      'id, repertoire_id, expected_move_san, expected_move_uci, priority_weight, opening_repertoires!inner(coach_id)',
    )
    .eq('id', data.position_id)
    .eq('repertoire_id', data.repertoire_id)
    .single();

  const owner = Array.isArray(position?.opening_repertoires)
    ? position?.opening_repertoires[0]
    : position?.opening_repertoires;

  if (positionError || !position || owner?.coach_id !== coach.id) {
    throw new Error('Opening position not found');
  }

  const wasCorrect = data.attempted_uci === position.expected_move_uci;
  const { error: attemptError } = await supabase.from('opening_attempts').insert({
    repertoire_id: data.repertoire_id,
    position_id: data.position_id,
    coach_id: coach.id,
    attempted_move: data.attempted_move,
    was_correct: wasCorrect,
  });

  if (attemptError) throw new Error(attemptError.message);

  const { data: existingProgress } = await supabase
    .from('opening_position_progress')
    .select('*')
    .eq('coach_id', coach.id)
    .eq('position_id', data.position_id)
    .maybeSingle();

  const timesSeen = (existingProgress?.times_seen ?? 0) + 1;
  const correctCount = (existingProgress?.correct_count ?? 0) + (wasCorrect ? 1 : 0);
  const wrongCount = (existingProgress?.wrong_count ?? 0) + (wasCorrect ? 0 : 1);
  const currentStreak = wasCorrect ? (existingProgress?.current_streak ?? 0) + 1 : 0;
  const level = masteryLevel(wasCorrect, correctCount, wrongCount, currentStreak);
  const score = priorityScore(position.priority_weight, level, wasCorrect);
  const now = new Date().toISOString();

  if (existingProgress) {
    const { error: progressError } = await supabase
      .from('opening_position_progress')
      .update({
        times_seen: timesSeen,
        correct_count: correctCount,
        wrong_count: wrongCount,
        current_streak: currentStreak,
        mastery_level: level,
        last_seen_at: now,
        priority_score: score,
        updated_at: now,
      })
      .eq('id', existingProgress.id);

    if (progressError) throw new Error(progressError.message);
  } else {
    const { error: progressError } = await supabase
      .from('opening_position_progress')
      .insert({
        coach_id: coach.id,
        repertoire_id: data.repertoire_id,
        position_id: data.position_id,
        times_seen: timesSeen,
        correct_count: correctCount,
        wrong_count: wrongCount,
        current_streak: currentStreak,
        mastery_level: level,
        last_seen_at: now,
        priority_score: score,
      });

    if (progressError) throw new Error(progressError.message);
  }

  revalidatePath('/openings');
  revalidatePath(`/openings/${data.repertoire_id}`);

  return {
    wasCorrect,
    correctMove: position.expected_move_san,
    masteryLevel: level,
    priorityScore: score,
  };
}

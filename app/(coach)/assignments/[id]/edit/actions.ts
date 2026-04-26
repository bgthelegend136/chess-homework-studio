'use server';
import { requireCoach } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { DraftQuestion } from '@/creator-state/reducer';
import { CALCULATION_DEPTH_OPTIONS, QUESTION_TAGS } from '@/lib/assignments/labels';
import { z } from 'zod';

async function verifyAssignmentOwnership(
  assignmentId: string,
  coachId: string,
): Promise<{ id: string; status: string; batch_id: string | null }> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('assignments')
    .select('id, status, batch_id')
    .eq('id', assignmentId)
    .eq('coach_id', coachId)
    .single();

  if (error || !data) throw new Error('Assignment not found');
  return data;
}

async function getEditableBatchAssignmentIds(
  assignment: { id: string; batch_id: string | null },
  coachId: string,
): Promise<string[]> {
  if (!assignment.batch_id) return [assignment.id];

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('assignments')
    .select('id')
    .eq('coach_id', coachId)
    .eq('batch_id', assignment.batch_id)
    .eq('status', 'not_opened');

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.id as string);
}

async function getQuestionUpdateTargetIds(
  assignment: { id: string; batch_id: string | null },
  coachId: string,
): Promise<string[]> {
  const ids = await getEditableBatchAssignmentIds(assignment, coachId);
  return Array.from(new Set([assignment.id, ...ids]));
}

async function findSiblingQuestionId(
  assignmentId: string,
  data: z.infer<typeof SaveQuestionSchema>,
): Promise<string | null> {
  const supabase = createSupabaseServerClient();
  const { data: question } = await supabase
    .from('questions')
    .select('id')
    .eq('assignment_id', assignmentId)
    .eq('order_index', data.order_index)
    .maybeSingle();

  return (question?.id as string | undefined) ?? null;
}

export async function savePgn(assignmentId: string, pgn: string): Promise<void> {
  const coach = await requireCoach();
  const assignment = await verifyAssignmentOwnership(assignmentId, coach.id);

  if (assignment.status !== 'not_opened') {
    throw new Error('Assignment is locked for editing');
  }

  const supabase = createSupabaseServerClient();
  const targetIds = await getEditableBatchAssignmentIds(assignment, coach.id);

  const { error } = await supabase
    .from('assignments')
    .update({ pgn })
    .in('id', targetIds);

  if (error) throw new Error(error.message);
}

const SaveQuestionSchema = z.object({
  order_index: z.number().int().min(0),
  fen: z.string().min(1),
  side_to_move: z.enum(['w', 'b']),
  move_number: z.number().int().min(1),
  prompt: z.string().min(1).max(2000),
  coach_reference_answer: z.string().max(2000).optional(),
  coach_explanation: z.string().max(5000).optional(),
  hint: z.string().max(2000).optional(),
  coach_notes: z.string().max(2000).optional(),
  tags: z.array(z.enum(QUESTION_TAGS)).max(7).optional(),
  calculation_depth: z.enum(CALCULATION_DEPTH_OPTIONS).optional(),
});

export async function saveQuestion(
  assignmentId: string,
  questionId: string | undefined,
  draft: DraftQuestion,
): Promise<{ id: string }> {
  const coach = await requireCoach();
  const assignment = await verifyAssignmentOwnership(assignmentId, coach.id);

  if (assignment.status !== 'not_opened' && !questionId) {
    throw new Error('Assignment is locked for new questions');
  }

  const data = SaveQuestionSchema.parse({
    order_index: draft.order_index,
    fen: draft.fen,
    side_to_move: draft.side_to_move,
    move_number: draft.move_number,
    prompt: draft.prompt,
    coach_reference_answer: draft.coach_reference_answer || undefined,
    coach_explanation: draft.coach_explanation || undefined,
    hint: draft.hint || undefined,
    coach_notes: draft.coach_notes || undefined,
    tags: draft.tags.filter((tag) =>
      (QUESTION_TAGS as readonly string[]).includes(tag),
    ),
    calculation_depth: draft.calculation_depth,
  });

  const supabase = createSupabaseServerClient();

  if (questionId) {
    const targetIds = await getQuestionUpdateTargetIds(assignment, coach.id);
    for (const targetAssignmentId of targetIds) {
      const targetQuestionId =
        targetAssignmentId === assignmentId
          ? questionId
          : await findSiblingQuestionId(targetAssignmentId, data);

      if (!targetQuestionId) continue;

      const { error } = await supabase
        .from('questions')
        .update({
          prompt: data.prompt,
          coach_reference_answer: data.coach_reference_answer ?? null,
          coach_explanation: data.coach_explanation ?? null,
          hint: data.hint ?? null,
          coach_notes: data.coach_notes ?? null,
          tags: data.tags ?? [],
          calculation_depth: data.calculation_depth ?? 'none',
          order_index: data.order_index,
        })
        .eq('id', targetQuestionId)
        .eq('assignment_id', targetAssignmentId);

      if (error) throw new Error(error.message);
    }
    return { id: questionId };
  } else {
    const targetIds = await getEditableBatchAssignmentIds(assignment, coach.id);
    const rows = targetIds.map((targetAssignmentId) => ({
      assignment_id: targetAssignmentId,
      order_index: data.order_index,
      fen: data.fen,
      side_to_move: data.side_to_move,
      move_number: data.move_number,
      prompt: data.prompt,
      coach_reference_answer: data.coach_reference_answer ?? null,
      coach_explanation: data.coach_explanation ?? null,
      hint: data.hint ?? null,
      coach_notes: data.coach_notes ?? null,
      tags: data.tags ?? [],
      calculation_depth: data.calculation_depth ?? 'none',
    }));

    const { data: qRows, error } = await supabase
      .from('questions')
      .insert(rows)
      .select('id, assignment_id');

    if (error) throw new Error(error.message);
    const primary = qRows?.find((row) => row.assignment_id === assignmentId);
    return { id: (primary?.id ?? qRows?.[0]?.id) as string };
  }
}

export async function deleteQuestion(
  questionId: string,
  assignmentId: string,
): Promise<void> {
  const coach = await requireCoach();
  const assignment = await verifyAssignmentOwnership(assignmentId, coach.id);

  if (assignment.status !== 'not_opened') {
    throw new Error('Assignment is locked for editing');
  }

  const supabase = createSupabaseServerClient();
  const targetIds = await getEditableBatchAssignmentIds(assignment, coach.id);

  const { data: originalQuestion, error: qErr } = await supabase
    .from('questions')
    .select('order_index')
    .eq('id', questionId)
    .eq('assignment_id', assignmentId)
    .single();

  if (qErr || !originalQuestion) throw new Error('Question not found');

  const { error } = await supabase
    .from('questions')
    .delete()
    .in('assignment_id', targetIds)
    .eq('order_index', originalQuestion.order_index);

  if (error) throw new Error(error.message);
}

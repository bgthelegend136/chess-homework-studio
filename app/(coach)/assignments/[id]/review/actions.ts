'use server';
import { requireCoach } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { markReviewed } from '@/lib/assignments/status';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const EvaluationSchema = z
  .enum(['blunder', 'mistake', 'dubious', 'interesting', 'correct'])
  .nullable();

const ReviewPayloadSchema = z.object({
  perQuestionFeedback: z
    .array(
      z.object({
        answerId: z.string().uuid(),
        feedback: z.string().max(5000),
        evaluation: EvaluationSchema.optional().default(null),
      }),
    )
    .max(200),
  overallFeedback: z.string().max(5000),
  grade: z.string().max(50),
});

export type ReviewPayload = z.infer<typeof ReviewPayloadSchema>;

export async function saveReview(
  assignmentId: string,
  payload: ReviewPayload,
): Promise<{ status: 'reviewed' }> {
  const coach = await requireCoach();
  const data = ReviewPayloadSchema.parse(payload);

  const supabase = createSupabaseServerClient();

  const { data: assignment, error: aErr } = await supabase
    .from('assignments')
    .select('id, status, coach_id')
    .eq('id', assignmentId)
    .eq('coach_id', coach.id)
    .single();

  if (aErr || !assignment) throw new Error('Assignment not found');
  if (assignment.status !== 'submitted' && assignment.status !== 'reviewed') {
    throw new Error(`Cannot review: assignment is ${assignment.status}`);
  }

  if (data.perQuestionFeedback.length > 0) {
    const { data: qRows, error: qErr } = await supabase
      .from('questions')
      .select('id')
      .eq('assignment_id', assignmentId);
    if (qErr) throw new Error(qErr.message);
    const qIds = (qRows ?? []).map((q) => q.id);

    let ownedIds = new Set<string>();
    if (qIds.length > 0) {
      const { data: ownedAnswers, error: ansErr } = await supabase
        .from('answers')
        .select('id')
        .in('question_id', qIds);
      if (ansErr) throw new Error(ansErr.message);
      ownedIds = new Set((ownedAnswers ?? []).map((a) => a.id));
    }

    for (const entry of data.perQuestionFeedback) {
      if (!ownedIds.has(entry.answerId)) {
        throw new Error('Unauthorized answer');
      }
      const { error: upErr } = await supabase
        .from('answers')
        .update({
          feedback: entry.feedback || null,
          evaluation: entry.evaluation ?? null,
        })
        .eq('id', entry.answerId);
      if (upErr) throw new Error(upErr.message);
    }
  }

  if (assignment.status === 'submitted') {
    await markReviewed(
      assignmentId,
      coach.id,
      data.overallFeedback,
      data.grade,
    );
  } else {
    const { error: upErr } = await supabase
      .from('assignments')
      .update({
        overall_feedback: data.overallFeedback || null,
        grade: data.grade || null,
      })
      .eq('id', assignmentId)
      .eq('coach_id', coach.id);
    if (upErr) throw new Error(upErr.message);
  }

  revalidatePath(`/assignments/${assignmentId}/review`);
  revalidatePath('/dashboard');

  return { status: 'reviewed' };
}

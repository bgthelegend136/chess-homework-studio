import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkAcceptedMove } from '@/lib/chess/selfReview';
import { z } from 'zod';

const CheckAnswerSchema = z.object({
  question_id: z.string().uuid(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } },
) {
  const { token } = params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = CheckAnswerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: assignment } = await supabase
    .from('assignments')
    .select('id, status')
    .eq('student_token', token)
    .single();

  if (!assignment) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { data: question } = await supabase
    .from('questions')
    .select('id, fen, coach_reference_answer')
    .eq('id', parsed.data.question_id)
    .eq('assignment_id', assignment.id)
    .single();

  if (!question) {
    return NextResponse.json({ error: 'Question not found' }, { status: 404 });
  }

  const { data: answer } = await supabase
    .from('answers')
    .select('id, student_move, is_correct, attempt_count, hint_used')
    .eq('question_id', question.id)
    .maybeSingle();

  const storedAttemptCount = answer?.attempt_count ?? 0;
  const attemptCount =
    answer?.is_correct !== null && answer?.is_correct !== undefined && storedAttemptCount === 0
      ? 2
      : storedAttemptCount;
  if (attemptCount >= 2) {
    return NextResponse.json(
      { error: 'This answer is already locked.' },
      { status: 409 },
    );
  }

  const result = checkAcceptedMove(
    question.fen,
    answer?.student_move ?? null,
    question.coach_reference_answer,
  );

  if (result.message === 'Choose a move before checking your answer.') {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  const nextAttemptCount = attemptCount + 1;
  const finalResult =
    result.canCheck && (result.isCorrect === true || nextAttemptCount >= 2)
      ? result.isCorrect
      : result.canCheck
        ? false
        : null;

  const { error } = await supabase.from('answers').upsert(
    {
      question_id: question.id,
      student_move: answer?.student_move ?? null,
      is_correct: finalResult,
      attempt_count: result.canCheck ? nextAttemptCount : attemptCount,
      hint_used: answer?.hint_used ?? false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'question_id' },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ...result,
    isCorrect: finalResult,
    attemptCount: result.canCheck ? nextAttemptCount : attemptCount,
    canRetry: result.canCheck && result.isCorrect === false && nextAttemptCount < 2,
  });
}

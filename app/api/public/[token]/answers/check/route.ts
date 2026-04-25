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
    .select('id, student_move')
    .eq('question_id', question.id)
    .maybeSingle();

  const result = checkAcceptedMove(
    question.fen,
    answer?.student_move ?? null,
    question.coach_reference_answer,
  );

  if (result.message === 'Choose a move before checking your answer.') {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  const { error } = await supabase.from('answers').upsert(
    {
      question_id: question.id,
      student_move: answer?.student_move ?? null,
      is_correct: result.canCheck ? result.isCorrect : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'question_id' },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(result);
}

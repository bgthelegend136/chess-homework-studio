import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';

const UpsertAnswerSchema = z.object({
  question_id: z.string().uuid(),
  student_move: z.string().max(10).optional().nullable(),
  explanation: z.string().max(5000).optional().nullable(),
  hint_used: z.boolean().optional(),
});

export async function PUT(
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

  const parsed = UpsertAnswerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  const { question_id, student_move, explanation, hint_used } = parsed.data;
  const supabase = createAdminClient();

  // Verify assignment via token and check it's editable
  const { data: assignment } = await supabase
    .from('assignments')
    .select('id, status')
    .eq('student_token', token)
    .single();

  if (!assignment) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Verify question belongs to this assignment
  const { data: question } = await supabase
    .from('questions')
    .select('id')
    .eq('id', question_id)
    .eq('assignment_id', assignment.id)
    .single();

  if (!question) {
    return NextResponse.json({ error: 'Question not found' }, { status: 404 });
  }

  const { data: existing } = await supabase
    .from('answers')
    .select('id, attempt_count, hint_used')
    .eq('question_id', question_id)
    .maybeSingle();

  const existingAttemptCount = existing?.attempt_count ?? 0;
  const existingHintUsed = existing?.hint_used ?? false;
  const update: Record<string, unknown> = {
    question_id,
    updated_at: new Date().toISOString(),
    hint_used: existingHintUsed || hint_used === true,
  };

  if (student_move !== undefined) update.student_move = student_move ?? null;
  if (explanation !== undefined) update.explanation = explanation ?? null;
  if (student_move !== undefined && existingAttemptCount === 0) {
    update.is_correct = null;
  }

  const { error } = await supabase
    .from('answers')
    .upsert(update, { onConflict: 'question_id' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

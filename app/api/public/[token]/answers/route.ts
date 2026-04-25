import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';

const UpsertAnswerSchema = z.object({
  question_id: z.string().uuid(),
  student_move: z.string().max(10).optional().nullable(),
  explanation: z.string().max(5000).optional().nullable(),
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

  const { question_id, student_move, explanation } = parsed.data;
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

  // Upsert draft answer
  const { error } = await supabase.from('answers').upsert(
    {
      question_id,
      student_move: student_move ?? null,
      explanation: explanation ?? null,
      is_correct: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'question_id' },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { openByToken } from '@/lib/assignments/status';
import { StudentShell } from '@/components/student/StudentShell';
import type { QuestionWithAnswer } from '@/lib/types';

interface Props {
  params: { token: string };
}

export default async function StudentAssignmentPage({ params }: Props) {
  const { token } = params;
  const supabase = createAdminClient();

  // Fetch assignment by token (admin client bypasses RLS; authorized by token match)
  const { data: assignment } = await supabase
    .from('assignments')
    .select('*, students(id, name)')
    .eq('student_token', token)
    .single();

  if (!assignment) notFound();

  // Transition not_opened → in_progress (idempotent)
  if (assignment.status === 'not_opened') {
    await openByToken(token);
    assignment.status = 'in_progress';
    assignment.first_opened_at = new Date().toISOString();
  }

  // Fetch questions + answers
  const { data: questions } = await supabase
    .from('questions')
    .select('*, answers(*)')
    .eq('assignment_id', assignment.id)
    .order('order_index');

  const typedQuestions: QuestionWithAnswer[] = (questions ?? []).map((q) => ({
    ...q,
    answers: Array.isArray(q.answers) ? (q.answers[0] ?? null) : (q.answers ?? null),
  }));

  // Build initial answers map for the client
  const initialAnswers: Record<
    string,
    {
      student_move: string | null;
      explanation: string | null;
      is_correct: boolean | null;
    }
  > = {};
  for (const q of typedQuestions) {
    if (q.answers) {
      initialAnswers[q.id] = {
        student_move: q.answers.student_move,
        explanation: q.answers.explanation,
        is_correct: q.answers.is_correct,
      };
    }
  }

  return (
    <StudentShell
      assignment={assignment}
      questions={typedQuestions}
      token={token}
      initialAnswers={initialAnswers}
    />
  );
}

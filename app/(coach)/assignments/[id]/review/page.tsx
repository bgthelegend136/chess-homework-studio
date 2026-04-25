import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireCoach } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ReviewShell } from '@/components/review/ReviewShell';
import { saveReview, type ReviewPayload } from './actions';
import type { Question, Answer } from '@/lib/types';

interface Props {
  params: { id: string };
}

export default async function AssignmentReviewPage({ params }: Props) {
  const coach = await requireCoach();
  const supabase = createSupabaseServerClient();

  const { data: assignment } = await supabase
    .from('assignments')
    .select('*, students(id, name)')
    .eq('id', params.id)
    .eq('coach_id', coach.id)
    .single();

  if (!assignment) notFound();

  if (assignment.status === 'not_opened' || assignment.status === 'in_progress') {
    redirect(`/assignments/${params.id}/edit`);
  }

  const { data: questions } = await supabase
    .from('questions')
    .select('*')
    .eq('assignment_id', params.id)
    .order('order_index');

  const questionList = (questions ?? []) as Question[];

  let answers: Answer[] = [];
  if (questionList.length > 0) {
    const { data: answerRows } = await supabase
      .from('answers')
      .select('*')
      .in(
        'question_id',
        questionList.map((q) => q.id),
      );
    answers = (answerRows ?? []) as Answer[];
  }

  const answersByQuestion: Record<string, Answer> = {};
  for (const a of answers) answersByQuestion[a.question_id] = a;

  async function handleSaveReview(payload: ReviewPayload) {
    'use server';
    await saveReview(params.id, payload);
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="border-b border-stone-200 bg-white px-4 py-2 flex items-center gap-2 text-sm text-stone-500">
        <Link href="/dashboard" className="hover:text-stone-800 transition-colors">
          Assignments
        </Link>
        <span>/</span>
        <span className="text-stone-800 font-medium truncate max-w-64">
          {assignment.title}
        </span>
        <span className="text-stone-400 text-xs ml-1">
          — {(assignment as { students: { name: string } }).students.name}
        </span>
        <span className="ml-auto text-xs uppercase tracking-wide text-stone-400">
          Answer Analysis
        </span>
      </div>

      <ReviewShell
        assignment={assignment}
        questions={questionList}
        answersByQuestion={answersByQuestion}
        onSaveReview={handleSaveReview}
      />
    </div>
  );
}

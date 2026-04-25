import { notFound } from 'next/navigation';
import { requireCoach } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CreatorShell } from '@/components/creator/CreatorShell';
import { savePgn, saveQuestion, deleteQuestion } from './actions';
import type { DraftQuestion } from '@/creator-state/reducer';
import Link from 'next/link';

interface Props {
  params: { id: string };
}

export default async function AssignmentEditPage({ params }: Props) {
  const coach = await requireCoach();
  const supabase = createSupabaseServerClient();

  const { data: assignment } = await supabase
    .from('assignments')
    .select('*, students(id, name)')
    .eq('id', params.id)
    .eq('coach_id', coach.id)
    .single();

  if (!assignment) notFound();

  const { data: questions } = await supabase
    .from('questions')
    .select('*')
    .eq('assignment_id', params.id)
    .order('order_index');

  let batchLabel: string | null = null;
  if (assignment.batch_id) {
    const { data: batchRows } = await supabase
      .from('assignments')
      .select('id, assignment_batches(group_id, student_groups(name))')
      .eq('batch_id', assignment.batch_id)
      .eq('coach_id', coach.id);

    const firstBatch = batchRows?.[0]?.assignment_batches;
    const batch = Array.isArray(firstBatch) ? firstBatch[0] : firstBatch;
    const groupRows = batch?.student_groups;
    const group = Array.isArray(groupRows) ? groupRows[0] : groupRows;
    batchLabel = `${group?.name ?? 'group'} (${batchRows?.length ?? 0} students)`;
  }

  const host =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  const studentLink = `${host}/a/${assignment.student_token}`;

  async function handleSavePgn(pgn: string) {
    'use server';
    await savePgn(params.id, pgn);
  }

  async function handleSaveQuestion(
    index: number,
    draft: DraftQuestion,
    assignmentId: string,
  ): Promise<{ id: string }> {
    'use server';
    return saveQuestion(assignmentId, draft.id, draft);
  }

  async function handleDeleteQuestion(questionId: string): Promise<void> {
    'use server';
    await deleteQuestion(questionId, params.id);
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Breadcrumb header */}
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
      </div>

      <div className="flex-1 min-h-0 flex flex-col" style={{ height: 'calc(100vh - 96px)' }}>
        <CreatorShell
          assignment={assignment}
          initialQuestions={questions ?? []}
          studentLink={studentLink}
          batchLabel={batchLabel}
          onSavePgn={handleSavePgn}
          onSaveQuestion={handleSaveQuestion}
          onDeleteQuestion={handleDeleteQuestion}
        />
      </div>
    </div>
  );
}

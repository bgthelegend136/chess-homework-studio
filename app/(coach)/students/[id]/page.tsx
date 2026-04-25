import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireCoach } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Badge } from '@/components/ui/Badge';
import { STATUS_LABEL, STATUS_VARIANT } from '@/lib/assignments/labels';
import type { Assignment, Student, StudentGroup } from '@/lib/types';

interface Props {
  params: { id: string };
}

export default async function StudentDetailPage({ params }: Props) {
  const coach = await requireCoach();
  const supabase = createSupabaseServerClient();

  const { data: student } = await supabase
    .from('students')
    .select('*')
    .eq('id', params.id)
    .eq('coach_id', coach.id)
    .single<Student>();

  if (!student) notFound();

  type StudentGroupRow = {
    student_groups:
      | Pick<StudentGroup, 'id' | 'name'>
      | Pick<StudentGroup, 'id' | 'name'>[]
      | null;
  };

  const { data: groupRows } = await supabase
    .from('student_group_members')
    .select('student_groups(id, name)')
    .eq('student_id', params.id);

  const groups = ((groupRows ?? []) as StudentGroupRow[])
    .map((row) =>
      Array.isArray(row.student_groups) ? row.student_groups[0] : row.student_groups,
    )
    .filter((group): group is Pick<StudentGroup, 'id' | 'name'> => Boolean(group))
    .sort((a, b) => a.name.localeCompare(b.name));

  const { data: assignments } = await supabase
    .from('assignments')
    .select('*')
    .eq('coach_id', coach.id)
    .eq('student_id', params.id)
    .order('created_at', { ascending: false });

  const list = (assignments ?? []) as Assignment[];

  const counts = list.reduce(
    (acc, a) => {
      if (a.status === 'submitted' || a.status === 'reviewed') {
        acc.completed += 1;
      } else {
        acc[a.status] += 1;
      }
      return acc;
    },
    { not_opened: 0, in_progress: 0, completed: 0 },
  );

  type WeakQuestionRow = {
    tags: string[] | null;
    answers: { is_correct: boolean | null }[] | { is_correct: boolean | null } | null;
  };

  const assignmentIds = list.map((a) => a.id);
  let weakAreas: Array<[string, number]> = [];
  if (assignmentIds.length > 0) {
    const { data: questionRows } = await supabase
      .from('questions')
      .select('tags, answers(is_correct)')
      .in('assignment_id', assignmentIds);

    const weakCounts: Record<string, number> = {};
    for (const row of ((questionRows ?? []) as WeakQuestionRow[])) {
      const answers = Array.isArray(row.answers)
        ? row.answers
        : row.answers
          ? [row.answers]
          : [];
      if (!answers.some((answer) => answer.is_correct === false)) continue;
      for (const tag of row.tags ?? []) {
        weakCounts[tag] = (weakCounts[tag] ?? 0) + 1;
      }
    }
    weakAreas = Object.entries(weakCounts).sort((a, b) => b[1] - a[1]);
  }

  return (
    <div className="mx-auto max-w-3xl w-full p-6">
      <div className="text-sm text-stone-500 mb-4">
        <Link href="/students" className="hover:text-stone-800">
          Students
        </Link>
        <span className="mx-1">/</span>
        <span className="text-stone-800">{student.name}</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-stone-800">{student.name}</h1>
          {student.email && (
            <p className="text-sm text-stone-500 mt-1">{student.email}</p>
          )}
          <p className="text-xs text-stone-400 mt-1">
            Added {new Date(student.created_at).toLocaleDateString()}
          </p>
        </div>
        <Link
          href={`/assignments/new?student=${student.id}`}
          className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 transition-colors"
        >
          + New assignment
        </Link>
      </div>

      {student.notes && (
        <div className="mb-6 rounded border border-stone-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500 mb-1">
            Notes
          </p>
          <p className="text-sm text-stone-700 whitespace-pre-wrap">{student.notes}</p>
        </div>
      )}

      <div className="mb-6 rounded border border-stone-200 bg-white p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-stone-500 mb-2">
          Groups
        </p>
        {groups.length === 0 ? (
          <p className="text-sm text-stone-500">This student is not in any groups.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {groups.map((group) => (
              <Link
                key={group.id}
                href={`/groups/${group.id}`}
                className="rounded border border-amber-200 bg-amber-50 px-2.5 py-1 text-sm text-amber-800 hover:bg-amber-100"
              >
                {group.name}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Counts */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-6">
        {[
          ['not_opened', 'Not opened', counts.not_opened],
          ['in_progress', 'In progress', counts.in_progress],
          ['completed', 'Completed', counts.completed],
        ].map(([key, label, count]) => (
          <div
            key={key}
            className="rounded border border-stone-200 bg-white px-3 py-2 text-center"
          >
            <div className="text-xl font-semibold text-stone-800">{count}</div>
            <div className="text-xs text-stone-500">{label}</div>
          </div>
        ))}
      </div>

      <div className="mb-6 rounded border border-stone-200 bg-white p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-stone-500 mb-2">
          Recurring weak areas
        </p>
        {weakAreas.length === 0 ? (
          <p className="text-sm text-stone-500">
            No checked incorrect answers with tags yet.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {weakAreas.map(([tag, count]) => (
              <span
                key={tag}
                className="rounded border border-red-200 bg-red-50 px-2.5 py-1 text-sm text-red-800"
              >
                {tag}: {count} wrong
              </span>
            ))}
          </div>
        )}
      </div>

      <h2 className="text-sm font-semibold text-stone-700 mb-2">
        Assignment history ({list.length})
      </h2>
      {list.length === 0 ? (
        <div className="rounded-lg border border-dashed border-stone-300 bg-white p-8 text-center text-stone-500 text-sm">
          No assignments yet for this student.
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-stone-200 divide-y divide-stone-100 overflow-hidden shadow-sm">
          {list.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-4 px-4 py-3 hover:bg-stone-50"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-stone-800 truncate">{a.title}</p>
                <p className="text-xs text-stone-500 mt-0.5">
                  Created {new Date(a.created_at).toLocaleDateString()}
                  {a.due_date && ` · Due ${new Date(a.due_date).toLocaleDateString()}`}
                  {a.reviewed_at &&
                    ` · Completed ${new Date(a.reviewed_at).toLocaleDateString()}`}
                </p>
              </div>
              <Badge variant={STATUS_VARIANT[a.status]}>{STATUS_LABEL[a.status]}</Badge>
              <div className="flex gap-2 shrink-0">
                {a.status !== 'submitted' && a.status !== 'reviewed' && (
                  <Link
                    href={`/assignments/${a.id}/edit`}
                    className="text-xs text-stone-500 hover:text-stone-800 border border-stone-200 rounded px-2.5 py-1"
                  >
                    {a.status === 'not_opened' ? 'Edit' : 'View'}
                  </Link>
                )}
                {(a.status === 'submitted' || a.status === 'reviewed') && (
                  <Link
                    href={`/assignments/${a.id}/review`}
                    className="text-xs text-amber-600 hover:text-amber-800 border border-amber-200 rounded px-2.5 py-1"
                  >
                    Answer Analysis
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

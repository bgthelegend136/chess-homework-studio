import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireCoach } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Student, StudentGroup, StudentGroupWithCount } from '@/lib/types';
import { DuplicateAssignmentForm } from './DuplicateAssignmentForm';

interface Props {
  params: { id: string };
}

export default async function DuplicateAssignmentPage({ params }: Props) {
  const coach = await requireCoach();
  const supabase = createSupabaseServerClient();

  const { data: assignment } = await supabase
    .from('assignments')
    .select('id, title, due_date, students(name)')
    .eq('id', params.id)
    .eq('coach_id', coach.id)
    .single();

  if (!assignment) notFound();

  const { data: students } = await supabase
    .from('students')
    .select('*')
    .eq('coach_id', coach.id)
    .order('name');

  const { data: groups } = await supabase
    .from('student_groups')
    .select('*, student_group_members(student_id)')
    .eq('coach_id', coach.id)
    .order('name');

  type GroupRow = StudentGroup & {
    student_group_members: { student_id: string }[] | null;
  };

  const studentRows = (students ?? []) as Student[];
  const groupRows: StudentGroupWithCount[] = ((groups ?? []) as GroupRow[]).map(
    (group) => ({
      id: group.id,
      coach_id: group.coach_id,
      name: group.name,
      created_at: group.created_at,
      student_count: group.student_group_members?.length ?? 0,
    }),
  );

  const student = Array.isArray(assignment.students)
    ? assignment.students[0]
    : assignment.students;

  return (
    <div className="mx-auto w-full max-w-lg p-6">
      <div className="mb-6 text-sm text-stone-500">
        <Link href="/dashboard" className="hover:text-stone-800">
          Assignments
        </Link>
        <span className="mx-1">/</span>
        <span className="text-stone-800">Duplicate</span>
      </div>

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-stone-800">Duplicate assignment</h1>
        <p className="mt-1 text-sm text-stone-500">
          Copy PGN and questions from {assignment.title}
          {student?.name ? ` for ${student.name}` : ''}. Answers and review notes are
          not copied.
        </p>
      </div>

      <DuplicateAssignmentForm
        sourceId={assignment.id}
        initialTitle={`Copy of ${assignment.title}`.slice(0, 300)}
        initialDueDate={assignment.due_date ?? ''}
        students={studentRows}
        groups={groupRows}
      />
    </div>
  );
}

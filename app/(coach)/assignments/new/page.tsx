import { requireCoach } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Student, StudentGroup } from '@/lib/types';
import { NewAssignmentForm } from './NewAssignmentForm';

interface Props {
  searchParams: { student?: string; group?: string };
}

export default async function NewAssignmentPage({ searchParams }: Props) {
  const coach = await requireCoach();
  const supabase = createSupabaseServerClient();

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

  return (
    <div className="mx-auto max-w-lg w-full p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-stone-800">New assignment</h1>
        <p className="text-sm text-stone-500 mt-1">
          You&apos;ll paste the PGN and create questions on the next screen.
        </p>
      </div>

      <NewAssignmentForm
        students={(students ?? []) as Student[]}
        groups={((groups ?? []) as GroupRow[]).map((group) => ({
          id: group.id,
          coach_id: group.coach_id,
          name: group.name,
          created_at: group.created_at,
          student_count: group.student_group_members?.length ?? 0,
        }))}
        preselectedStudentId={searchParams.student ?? ''}
        preselectedGroupId={searchParams.group ?? ''}
      />
    </div>
  );
}

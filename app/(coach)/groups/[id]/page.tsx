import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireCoach } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Student, StudentGroup } from '@/lib/types';
import {
  AddStudentForm,
  DeleteGroupButton,
  RemoveStudentButton,
  RenameGroupForm,
} from './GroupDetailControls';

interface Props {
  params: { id: string };
}

type MemberRow = {
  student_id: string;
  students:
    | Pick<Student, 'id' | 'name' | 'email'>
    | Pick<Student, 'id' | 'name' | 'email'>[]
    | null;
};

export default async function GroupDetailPage({ params }: Props) {
  const coach = await requireCoach();
  const supabase = createSupabaseServerClient();

  const { data: group } = await supabase
    .from('student_groups')
    .select('*')
    .eq('id', params.id)
    .eq('coach_id', coach.id)
    .single<StudentGroup>();

  if (!group) notFound();

  const { data: memberRows } = await supabase
    .from('student_group_members')
    .select('student_id, students(id, name, email)')
    .eq('group_id', group.id)
    .order('student_id');

  const members = ((memberRows ?? []) as MemberRow[])
    .map((row) => (Array.isArray(row.students) ? row.students[0] : row.students))
    .filter((student): student is Pick<Student, 'id' | 'name' | 'email'> =>
      Boolean(student),
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const memberIds = new Set(members.map((student) => student.id));

  const { data: allStudents } = await supabase
    .from('students')
    .select('id, name, email')
    .eq('coach_id', coach.id)
    .order('name');

  const eligibleStudents = ((allStudents ?? []) as Pick<
    Student,
    'id' | 'name' | 'email'
  >[]).filter((student) => !memberIds.has(student.id));

  return (
    <div className="mx-auto max-w-3xl w-full p-6">
      <div className="text-sm text-stone-500 mb-4">
        <Link href="/groups" className="hover:text-stone-800">
          Groups
        </Link>
        <span className="mx-1">/</span>
        <span className="text-stone-800">{group.name}</span>
      </div>

      <div className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-stone-800">{group.name}</h1>
            <p className="text-xs text-stone-400 mt-1">
              Created {new Date(group.created_at).toLocaleDateString()}
            </p>
          </div>
          <Link
            href={`/assignments/new?group=${group.id}`}
            className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 transition-colors"
          >
            New assignment
          </Link>
        </div>
      </div>

      <div className="mb-6 rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
        <RenameGroupForm groupId={group.id} initialName={group.name} />
      </div>

      <div className="mb-6 rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
        <AddStudentForm groupId={group.id} eligibleStudents={eligibleStudents} />
      </div>

      <h2 className="text-sm font-semibold text-stone-700 mb-2">
        Members ({members.length})
      </h2>
      {members.length === 0 ? (
        <div className="rounded-lg border border-dashed border-stone-300 bg-white p-8 text-center text-stone-500 text-sm">
          No students in this group yet.
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-stone-200 divide-y divide-stone-100 overflow-hidden shadow-sm">
          {members.map((student) => (
            <div
              key={student.id}
              className="flex items-center gap-4 px-4 py-3 hover:bg-stone-50"
            >
              <div className="flex-1 min-w-0">
                <Link
                  href={`/students/${student.id}`}
                  className="text-sm font-medium text-stone-800 hover:text-amber-700 hover:underline"
                >
                  {student.name}
                </Link>
                {student.email && (
                  <p className="text-xs text-stone-500 mt-0.5">{student.email}</p>
                )}
              </div>
              <RemoveStudentButton groupId={group.id} studentId={student.id} />
            </div>
          ))}
        </div>
      )}

      <div className="mt-8">
        <DeleteGroupButton groupId={group.id} />
      </div>
    </div>
  );
}

import Link from 'next/link';
import { requireCoach } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { StudentGroupWithCount } from '@/lib/types';
import { GroupCreateForm } from './GroupCreateForm';

type GroupRow = {
  id: string;
  coach_id: string;
  name: string;
  created_at: string;
  student_group_members: { student_id: string }[] | null;
};

export default async function GroupsPage() {
  const coach = await requireCoach();
  const supabase = createSupabaseServerClient();

  const { data: groups } = await supabase
    .from('student_groups')
    .select('*, student_group_members(student_id)')
    .eq('coach_id', coach.id)
    .order('name');

  const list: StudentGroupWithCount[] = ((groups ?? []) as GroupRow[]).map((g) => ({
    id: g.id,
    coach_id: g.coach_id,
    name: g.name,
    created_at: g.created_at,
    student_count: g.student_group_members?.length ?? 0,
  }));

  return (
    <div className="mx-auto max-w-3xl w-full p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-stone-800">Groups</h1>
        <p className="text-sm text-stone-500 mt-1">
          Organize your students. Assignments still stay individual for now.
        </p>
      </div>

      <div className="mb-6">
        <GroupCreateForm />
      </div>

      {list.length === 0 ? (
        <div className="rounded-lg border border-dashed border-stone-300 bg-white p-12 text-center">
          <p className="text-stone-500">No groups yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-stone-200 divide-y divide-stone-100 overflow-hidden shadow-sm">
          {list.map((group) => (
            <div
              key={group.id}
              className="flex items-center gap-4 px-4 py-3 hover:bg-stone-50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <Link
                  href={`/groups/${group.id}`}
                  className="text-sm font-medium text-stone-800 hover:text-amber-700 hover:underline"
                >
                  {group.name}
                </Link>
                <p className="text-xs text-stone-500 mt-0.5">
                  {group.student_count} student{group.student_count === 1 ? '' : 's'}
                </p>
              </div>
              <Link
                href={`/groups/${group.id}`}
                className="text-xs text-stone-500 hover:text-stone-800 border border-stone-200 rounded px-2.5 py-1 transition-colors"
              >
                Manage
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

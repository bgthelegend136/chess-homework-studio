import Link from 'next/link';
import { requireCoach } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Badge } from '@/components/ui/Badge';
import type { AssignmentWithStudent } from '@/lib/types';
import { STATUS_LABEL, STATUS_VARIANT } from '@/lib/assignments/labels';

export default async function DashboardPage() {
  const coach = await requireCoach();
  const supabase = createSupabaseServerClient();

  const { data: assignments } = await supabase
    .from('assignments')
    .select('*, students(id, name, email)')
    .eq('coach_id', coach.id)
    .order('created_at', { ascending: false })
    .limit(50);

  const typedAssignments = (assignments ?? []) as AssignmentWithStudent[];

  return (
    <div className="mx-auto max-w-4xl w-full p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-stone-800">Assignments</h1>
        <Link
          href="/assignments/new"
          className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 transition-colors"
        >
          + New assignment
        </Link>
      </div>

      {typedAssignments.length === 0 ? (
        <div className="rounded-lg border border-dashed border-stone-300 bg-white p-12 text-center">
          <p className="text-stone-500">No assignments yet.</p>
          <Link
            href="/assignments/new"
            className="mt-3 inline-block text-sm text-amber-600 hover:text-amber-800"
          >
            Create your first assignment →
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-stone-200 divide-y divide-stone-100 overflow-hidden shadow-sm">
          {typedAssignments.map((a) => (
            <div key={a.id} className="flex items-center gap-4 px-4 py-3 hover:bg-stone-50 transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-stone-800 truncate">{a.title}</p>
                <p className="text-xs text-stone-500 mt-0.5">
                  {a.students.name}
                  {a.due_date && ` · Due ${new Date(a.due_date).toLocaleDateString()}`}
                </p>
              </div>

              <Badge variant={STATUS_VARIANT[a.status]}>
                {STATUS_LABEL[a.status]}
              </Badge>

              <div className="flex gap-2 shrink-0">
                {a.status !== 'submitted' && a.status !== 'reviewed' && (
                  <Link
                    href={`/assignments/${a.id}/edit`}
                    className="text-xs text-stone-500 hover:text-stone-800 border border-stone-200 rounded px-2.5 py-1 transition-colors"
                  >
                    {a.status === 'not_opened' ? 'Edit' : 'View'}
                  </Link>
                )}
                {(a.status === 'submitted' || a.status === 'reviewed') && (
                  <Link
                    href={`/assignments/${a.id}/review`}
                    className="text-xs text-amber-600 hover:text-amber-800 border border-amber-200 rounded px-2.5 py-1 transition-colors"
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

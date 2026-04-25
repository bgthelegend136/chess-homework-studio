import Link from 'next/link';
import { requireCoach } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export default async function StudentsPage() {
  const coach = await requireCoach();
  const supabase = createSupabaseServerClient();

  const { data: students } = await supabase
    .from('students')
    .select('*')
    .eq('coach_id', coach.id)
    .order('name');

  return (
    <div className="mx-auto max-w-3xl w-full p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-stone-800">Students</h1>
        <Link
          href="/students/new"
          className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 transition-colors"
        >
          + Add student
        </Link>
      </div>

      {!students?.length ? (
        <div className="rounded-lg border border-dashed border-stone-300 bg-white p-12 text-center">
          <p className="text-stone-500">No students yet.</p>
          <Link
            href="/students/new"
            className="mt-3 inline-block text-sm text-amber-600 hover:text-amber-800"
          >
            Add your first student →
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-stone-200 divide-y divide-stone-100 overflow-hidden shadow-sm">
          {students.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-4 px-4 py-3 hover:bg-stone-50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <Link
                  href={`/students/${s.id}`}
                  className="text-sm font-medium text-stone-800 hover:text-amber-700 hover:underline"
                >
                  {s.name}
                </Link>
                {s.email && (
                  <p className="text-xs text-stone-500 mt-0.5">{s.email}</p>
                )}
              </div>
              <Link
                href={`/students/${s.id}`}
                className="text-xs text-stone-500 hover:text-stone-800 border border-stone-200 rounded px-2.5 py-1 transition-colors"
              >
                View
              </Link>
              <Link
                href={`/assignments/new?student=${s.id}`}
                className="text-xs text-amber-600 hover:text-amber-800 border border-amber-200 rounded px-2.5 py-1 transition-colors"
              >
                New assignment
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

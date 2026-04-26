import Link from 'next/link';
import { requireCoach } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Badge } from '@/components/ui/Badge';
import type { AssignmentWithStudent, Notification } from '@/lib/types';
import { STATUS_LABEL, STATUS_VARIANT } from '@/lib/assignments/labels';
import { markAllNotificationsRead } from './actions';

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

  const { count: unreadCount } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('coach_id', coach.id)
    .is('read_at', null);

  const { data: notifications } = await supabase
    .from('notifications')
    .select('*')
    .eq('coach_id', coach.id)
    .eq('type', 'assignment_submitted')
    .order('created_at', { ascending: false })
    .limit(5);

  const recentNotifications = (notifications ?? []) as Notification[];

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

      <section className="mb-6 rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-stone-800">
              Recent completions
            </h2>
            <p className="mt-0.5 text-xs text-stone-500">
              {unreadCount ?? 0} unread notification
              {(unreadCount ?? 0) === 1 ? '' : 's'}
            </p>
          </div>
          {(unreadCount ?? 0) > 0 && (
            <form action={markAllNotificationsRead}>
              <button
                type="submit"
                className="rounded border border-stone-200 px-2.5 py-1 text-xs text-stone-600 transition-colors hover:bg-stone-50 hover:text-stone-800"
              >
                Mark all read
              </button>
            </form>
          )}
        </div>

        {recentNotifications.length === 0 ? (
          <p className="text-sm text-stone-500">
            No assignment completions yet.
          </p>
        ) : (
          <div className="divide-y divide-stone-100">
            {recentNotifications.map((notification) => (
              <div
                key={notification.id}
                className="flex items-center gap-3 py-2 first:pt-0 last:pb-0"
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    notification.read_at ? 'bg-stone-300' : 'bg-amber-500'
                  }`}
                  title={notification.read_at ? 'Read' : 'Unread'}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-stone-800">
                    {notification.title}
                  </p>
                  <p className="truncate text-xs text-stone-500">
                    {notification.body} ·{' '}
                    {new Date(notification.created_at).toLocaleDateString()}
                  </p>
                </div>
                {notification.assignment_id && (
                  <Link
                    href={`/assignments/${notification.assignment_id}/review`}
                    className="shrink-0 rounded border border-amber-200 px-2.5 py-1 text-xs text-amber-700 transition-colors hover:bg-amber-50"
                  >
                    Answer Analysis
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

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
                <Link
                  href={`/assignments/${a.id}/duplicate`}
                  className="text-xs text-stone-500 hover:text-stone-800 border border-stone-200 rounded px-2.5 py-1 transition-colors"
                >
                  Duplicate
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import Link from 'next/link';
import { requireCoach } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type {
  OpeningPosition,
  OpeningPositionProgress,
  OpeningRepertoire,
} from '@/lib/types';

function percent(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

export default async function OpeningsPage() {
  const coach = await requireCoach();
  const supabase = createSupabaseServerClient();

  const { data: repertoires } = await supabase
    .from('opening_repertoires')
    .select('*')
    .eq('coach_id', coach.id)
    .order('created_at', { ascending: false });

  const list = (repertoires ?? []) as OpeningRepertoire[];
  const repertoireIds = list.map((repertoire) => repertoire.id);

  let positions: OpeningPosition[] = [];
  let progressRows: OpeningPositionProgress[] = [];
  if (repertoireIds.length > 0) {
    const { data: positionRows } = await supabase
      .from('opening_positions')
      .select('*')
      .in('repertoire_id', repertoireIds);
    positions = (positionRows ?? []) as OpeningPosition[];

    const { data: progress } = await supabase
      .from('opening_position_progress')
      .select('*')
      .eq('coach_id', coach.id)
      .in('repertoire_id', repertoireIds);
    progressRows = (progress ?? []) as OpeningPositionProgress[];
  }

  return (
    <div className="mx-auto w-full max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-stone-800">
            Opening repertoires
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Coach-only repertoire drilling. Homework assignments stay separate.
          </p>
        </div>
        <Link
          href="/openings/new"
          className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700"
        >
          + New repertoire
        </Link>
      </div>

      {list.length === 0 ? (
        <div className="rounded-lg border border-dashed border-stone-300 bg-white p-12 text-center">
          <p className="text-stone-500">No opening repertoires yet.</p>
          <Link
            href="/openings/new"
            className="mt-3 inline-block text-sm text-amber-600 hover:text-amber-800"
          >
            Create your first repertoire
          </Link>
        </div>
      ) : (
        <div className="divide-y divide-stone-100 overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
          {list.map((repertoire) => {
            const repertoirePositions = positions.filter(
              (position) => position.repertoire_id === repertoire.id,
            );
            const mastered = progressRows.filter(
              (progress) =>
                progress.repertoire_id === repertoire.id &&
                progress.mastery_level === 'mastered',
            ).length;
            const masteryPct = percent(mastered, repertoirePositions.length);

            return (
              <div
                key={repertoire.id}
                className="flex flex-col gap-3 px-4 py-3 hover:bg-stone-50 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-stone-800">
                    {repertoire.name}
                  </p>
                  <p className="mt-0.5 text-xs text-stone-500">
                    {repertoire.side_to_train === 'white' ? 'White' : 'Black'} ·{' '}
                    {repertoirePositions.length} trainable positions · {masteryPct}%
                    mastered
                  </p>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-stone-100 sm:w-32">
                  <div
                    className="h-full bg-green-500"
                    style={{ width: `${masteryPct}%` }}
                  />
                </div>
                <div className="flex shrink-0 gap-2">
                  <Link
                    href={`/openings/${repertoire.id}`}
                    className="rounded border border-stone-200 px-2.5 py-1 text-xs text-stone-600 transition-colors hover:bg-stone-50 hover:text-stone-800"
                  >
                    View
                  </Link>
                  <Link
                    href={`/openings/${repertoire.id}/train`}
                    className="rounded border border-amber-200 px-2.5 py-1 text-xs text-amber-700 transition-colors hover:bg-amber-50"
                  >
                    Train
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

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
    <div className="min-h-full bg-stone-100">
      <div className="mx-auto w-full max-w-5xl p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-stone-900">
            Repertoire library
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Coach-only opening courses. Homework assignments stay separate.
          </p>
        </div>

        <div className="mb-5 rounded-lg bg-white p-4 shadow-sm">
          <Link
            href="/openings/new"
            className="inline-flex items-center gap-2 rounded-md border border-stone-300 bg-white px-5 py-3 text-base font-semibold text-stone-900 transition-colors hover:border-amber-400 hover:bg-amber-50"
          >
            <span className="text-2xl leading-none">+</span>
            Add to Repertoire
          </Link>
        </div>

        {list.length === 0 ? (
          <div className="rounded-lg border border-dashed border-stone-300 bg-white p-12 text-center shadow-sm">
            <p className="text-stone-500">No opening repertoires yet.</p>
            <Link
              href="/openings/new"
              className="mt-3 inline-block text-sm text-amber-600 hover:text-amber-800"
            >
              Create your first repertoire
            </Link>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((repertoire, index) => {
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
                <Link
                  key={repertoire.id}
                  href={`/openings/${repertoire.id}`}
                  className="group flex min-h-60 flex-col rounded-lg border border-transparent bg-white p-6 shadow-sm transition hover:border-amber-200 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-lg font-semibold text-stone-900">
                      {index + 1}) {repertoire.name}
                    </h2>
                    <span className="rounded-full border border-stone-200 px-2 py-0.5 text-xs capitalize text-stone-500">
                      {repertoire.side_to_train}
                    </span>
                  </div>

                  <div className="mt-auto">
                    <p className="text-sm text-stone-500">{masteryPct}% mastered</p>
                    <p className="mt-5 text-base text-stone-600">
                      {mastered}/{repertoirePositions.length} variations
                    </p>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-200">
                      <div
                        className="h-full bg-green-500 transition-all"
                        style={{ width: `${masteryPct}%` }}
                      />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

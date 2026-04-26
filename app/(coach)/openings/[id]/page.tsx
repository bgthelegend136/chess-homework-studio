import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireCoach } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type {
  OpeningMasteryLevel,
  OpeningPosition,
  OpeningPositionProgress,
  OpeningRepertoire,
} from '@/lib/types';

interface Props {
  params: { id: string };
}

const masteryClasses: Record<OpeningMasteryLevel, string> = {
  new: 'border-stone-200 bg-stone-50 text-stone-700',
  learning: 'border-amber-200 bg-amber-50 text-amber-800',
  weak: 'border-red-200 bg-red-50 text-red-800',
  mastered: 'border-green-200 bg-green-50 text-green-800',
};

function percent(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

export default async function OpeningDetailPage({ params }: Props) {
  const coach = await requireCoach();
  const supabase = createSupabaseServerClient();

  const { data: repertoire } = await supabase
    .from('opening_repertoires')
    .select('*')
    .eq('id', params.id)
    .eq('coach_id', coach.id)
    .single();

  if (!repertoire) notFound();

  const { data: positionRows } = await supabase
    .from('opening_positions')
    .select('*')
    .eq('repertoire_id', params.id)
    .order('ply_index');

  const positions = (positionRows ?? []) as OpeningPosition[];

  const { data: progressRows } = await supabase
    .from('opening_position_progress')
    .select('*')
    .eq('coach_id', coach.id)
    .eq('repertoire_id', params.id);

  const progressByPosition = new Map(
    ((progressRows ?? []) as OpeningPositionProgress[]).map((progress) => [
      progress.position_id,
      progress,
    ]),
  );

  const masteredCount = positions.filter(
    (position) => progressByPosition.get(position.id)?.mastery_level === 'mastered',
  ).length;
  const mainlinePositions = positions.filter((position) => position.is_mainline);
  const mainlineMastered = mainlinePositions.filter(
    (position) => progressByPosition.get(position.id)?.mastery_level === 'mastered',
  ).length;
  const positionMasteryPct = percent(masteredCount, positions.length);
  const mainlineMasteryPct = percent(mainlineMastered, mainlinePositions.length);
  const typedRepertoire = repertoire as OpeningRepertoire;

  return (
    <div className="mx-auto w-full max-w-5xl p-6">
      <div className="mb-6 text-sm text-stone-500">
        <Link href="/openings" className="hover:text-stone-800">
          Openings
        </Link>
        <span className="mx-1">/</span>
        <span className="text-stone-800">{typedRepertoire.name}</span>
      </div>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-stone-500">
            {typedRepertoire.side_to_train === 'white' ? 'White' : 'Black'} repertoire
          </p>
          <h1 className="text-2xl font-semibold text-stone-800">
            {typedRepertoire.name}
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            {positions.length} trainable positions · mainline-only MVP parser
          </p>
        </div>
        <Link
          href={`/openings/${params.id}/train`}
          className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700"
        >
          Start training
        </Link>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
            Position mastery
          </p>
          <p className="mt-2 text-2xl font-semibold text-stone-800">
            {masteredCount}/{positions.length}
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-100">
            <div
              className="h-full bg-green-500"
              style={{ width: `${positionMasteryPct}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-stone-500">{positionMasteryPct}% mastered</p>
        </div>

        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
            Mainline mastery
          </p>
          <p className="mt-2 text-2xl font-semibold text-stone-800">
            {mainlineMastered}/{mainlinePositions.length}
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-100">
            <div
              className="h-full bg-green-500"
              style={{ width: `${mainlineMasteryPct}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-stone-500">{mainlineMasteryPct}% mastered</p>
        </div>
      </div>

      <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-1">
          <h2 className="text-sm font-semibold text-stone-800">
            Repertoire visualizer
          </h2>
          <p className="text-xs text-stone-500">
            Mainline path with mastery color per trainable position. Branch visualizer
            support arrives with reliable variation parsing.
          </p>
        </div>

        {positions.length === 0 ? (
          <p className="text-sm text-stone-500">No trainable positions found.</p>
        ) : (
          <ol className="space-y-2">
            {positions.map((position, index) => {
              const progress = progressByPosition.get(position.id);
              const level = progress?.mastery_level ?? 'new';
              return (
                <li
                  key={position.id}
                  className={`rounded border px-3 py-2 ${masteryClasses[level]}`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium">
                        {index + 1}. {position.opponent_move_san && (
                          <span className="font-normal opacity-75">
                            after {position.opponent_move_san}:{' '}
                          </span>
                        )}
                        <span className="font-mono">{position.expected_move_san}</span>
                        {position.annotation && (
                          <span className="ml-1 font-semibold">
                            {position.annotation}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs opacity-75">
                        {level} · streak {progress?.current_streak ?? 0} ·{' '}
                        {progress?.correct_count ?? 0} correct /{' '}
                        {progress?.wrong_count ?? 0} wrong
                      </p>
                    </div>
                    <Link
                      href={`/openings/${params.id}/train`}
                      className="text-xs font-medium underline decoration-current/30 underline-offset-2"
                    >
                      Train
                    </Link>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}

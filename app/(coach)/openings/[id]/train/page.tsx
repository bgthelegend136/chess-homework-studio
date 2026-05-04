import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireCoach } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type {
  OpeningPosition,
  OpeningPositionProgress,
  OpeningRepertoire,
} from '@/lib/types';
import { OpeningTrainer } from './OpeningTrainer';

interface Props {
  params: { id: string };
  searchParams: { line?: string };
}

export default async function OpeningTrainPage({ params, searchParams }: Props) {
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
    .order('line_path');

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

  return (
    <div className="mx-auto w-full max-w-[1240px] p-4 sm:p-6">
      <div className="mb-6 text-sm text-stone-500">
        <Link href="/openings" className="hover:text-stone-800">
          Openings
        </Link>
        <span className="mx-1">/</span>
        <Link href={`/openings/${params.id}`} className="hover:text-stone-800">
          {(repertoire as OpeningRepertoire).name}
        </Link>
        <span className="mx-1">/</span>
        <span className="text-stone-800">Train</span>
      </div>

      <div className="mb-6">
        <p className="text-xs uppercase tracking-wide text-stone-500">
          Opening trainer
        </p>
        <h1 className="text-2xl font-semibold text-stone-800">
          {(repertoire as OpeningRepertoire).name}
        </h1>
      </div>

      <OpeningTrainer
        repertoire={repertoire as OpeningRepertoire}
        positions={positions.map((position) => ({
          ...position,
          progress: progressByPosition.get(position.id) ?? null,
        }))}
        lineLeafId={searchParams.line}
      />
    </div>
  );
}

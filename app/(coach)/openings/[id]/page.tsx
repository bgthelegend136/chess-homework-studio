import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireCoach } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { OpeningPosition, OpeningPositionProgress, OpeningRepertoire } from '@/lib/types';
import { LineCoverageExplorer } from './LineCoverageExplorer';

interface Props {
  params: { id: string };
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
    .order('line_path');

  const positions = (positionRows ?? []) as OpeningPosition[];

  const { data: progressRows } = await supabase
    .from('opening_position_progress')
    .select('*')
    .eq('coach_id', coach.id)
    .eq('repertoire_id', params.id);

  const typedRepertoire = repertoire as OpeningRepertoire;
  const importReport = typedRepertoire.import_report as {
    branches_detected?: number;
    comments_preserved?: number;
    warnings?: string[];
    skipped_branches?: number;
    parser_mode_used?: string;
  };

  return (
    <div className="min-h-full bg-stone-100">
      <div className="mx-auto w-full max-w-6xl p-6">
        <div className="mb-6 text-sm text-stone-500">
          <Link href="/openings" className="hover:text-stone-800">
            Openings
          </Link>
          <span className="mx-1">/</span>
          <span className="text-stone-800">{typedRepertoire.name}</span>
        </div>

        <div className="mb-6 rounded-lg bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-stone-500">
                {typedRepertoire.side_to_train === 'white' ? 'White' : 'Black'} repertoire
              </p>
              <h1 className="text-2xl font-semibold text-stone-900">
                {typedRepertoire.name}
              </h1>
              <p className="mt-1 text-sm text-stone-500">
                {positions.length} trainable moves imported from the PGN map
              </p>
            </div>
            <Link
              href={`/openings/${params.id}/train`}
              className="rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              Start training
            </Link>
          </div>
        </div>

        <LineCoverageExplorer
          repertoireId={params.id}
          sideToTrain={typedRepertoire.side_to_train}
          positions={positions}
          progressRows={(progressRows ?? []) as OpeningPositionProgress[]}
        />

        <section className="mt-6 rounded-lg bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-stone-800">Import report</h2>
          <div className="mt-3 grid gap-2 text-xs text-stone-600 sm:grid-cols-4">
            <p>Mode: {importReport.parser_mode_used ?? 'unknown'}</p>
            <p>Branches: {importReport.branches_detected ?? 0}</p>
            <p>Comments: {importReport.comments_preserved ?? 0}</p>
            <p>Skipped: {importReport.skipped_branches ?? 0}</p>
          </div>
          {(importReport.warnings?.length ?? 0) > 0 && (
            <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-medium">Warnings</p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {importReport.warnings?.map((warning, index) => (
                  <li key={`${warning}-${index}`}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

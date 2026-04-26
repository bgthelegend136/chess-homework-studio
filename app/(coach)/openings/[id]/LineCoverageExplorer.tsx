'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Board } from '@/components/chess/Board';
import type {
  OpeningMasteryLevel,
  OpeningPosition,
  OpeningPositionProgress,
} from '@/lib/types';

type LineStatus = 'untrained' | 'weak' | 'mastered' | 'trained';
type LineFilter = 'all' | 'trained' | 'mastered' | 'weak' | 'untrained' | 'notMastered';

interface PositionWithProgress extends OpeningPosition {
  progress: OpeningPositionProgress | null;
}

interface LineSummary {
  id: string;
  label: string;
  positions: PositionWithProgress[];
  trainablePositions: PositionWithProgress[];
  movePreview: string;
  divergenceDepth: number;
  sortKey: string;
  isMainline: boolean;
  status: LineStatus;
  seenCount: number;
  masteredCount: number;
  weakCount: number;
}

type LineSummaryBase = Omit<LineSummary, 'label'>;

interface LineCoverageExplorerProps {
  repertoireId: string;
  sideToTrain: 'white' | 'black';
  positions: OpeningPosition[];
  progressRows: OpeningPositionProgress[];
}

const statusClasses: Record<LineStatus, string> = {
  untrained: 'border-stone-200 bg-stone-50 text-stone-700',
  trained: 'border-blue-200 bg-blue-50 text-blue-800',
  weak: 'border-red-200 bg-red-50 text-red-800',
  mastered: 'border-green-200 bg-green-50 text-green-800',
};

function percent(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function positionStatus(position: PositionWithProgress): LineStatus {
  if (!position.progress || position.progress.times_seen === 0) return 'untrained';
  if (position.progress.mastery_level === 'weak') return 'weak';
  if (position.progress.mastery_level === 'mastered') return 'mastered';
  return 'trained';
}

function lineStatus(trainablePositions: PositionWithProgress[]): LineStatus {
  const seenCount = trainablePositions.filter(
    (position) => (position.progress?.times_seen ?? 0) > 0,
  ).length;
  if (seenCount === 0) return 'untrained';
  if (
    trainablePositions.some(
      (position) => position.progress?.mastery_level === 'weak',
    )
  ) {
    return 'weak';
  }
  if (
    trainablePositions.length > 0 &&
    trainablePositions.every(
      (position) => position.progress?.mastery_level === 'mastered',
    )
  ) {
    return 'mastered';
  }
  return 'trained';
}

function moveSequenceFor(position: OpeningPosition): string[] {
  return [
    ...(position.opponent_move_san ? [position.opponent_move_san] : []),
    position.expected_move_san,
  ];
}

function buildLineSummaries(
  positions: OpeningPosition[],
  progressRows: OpeningPositionProgress[],
): LineSummary[] {
  const progressByPosition = new Map(
    progressRows.map((progress) => [progress.position_id, progress]),
  );
  const positionsById = new Map(positions.map((position) => [position.id, position]));
  const parentIds = new Set(
    positions
      .map((position) => position.parent_position_id)
      .filter((id): id is string => Boolean(id)),
  );
  const leafPositions = positions.filter((position) => !parentIds.has(position.id));

  const rawLines = leafPositions
    .map<LineSummaryBase | null>((leaf) => {
      const chain: OpeningPosition[] = [];
      let cursor: OpeningPosition | undefined = leaf;
      while (cursor) {
        chain.push(cursor);
        cursor = cursor.parent_position_id
          ? positionsById.get(cursor.parent_position_id)
          : undefined;
      }
      const ordered = chain.reverse();
      const withProgress = ordered.map((position) => ({
        ...position,
        progress: progressByPosition.get(position.id) ?? null,
      }));
      const trainablePositions = withProgress.filter((position) =>
        Boolean(position.expected_move_san),
      );
      if (trainablePositions.length === 0) return null;

      const moves = withProgress.flatMap(moveSequenceFor);
      const uniqueMoves = moves.filter(
        (move, index) => index === 0 || move !== moves[index - 1],
      );
      const firstBranchIndex = withProgress.findIndex((position) => !position.is_mainline);
      const divergenceDepth =
        firstBranchIndex >= 0 ? firstBranchIndex : Number.MAX_SAFE_INTEGER;
      const seenCount = trainablePositions.filter(
        (position) => (position.progress?.times_seen ?? 0) > 0,
      ).length;
      const masteredCount = trainablePositions.filter(
        (position) => position.progress?.mastery_level === 'mastered',
      ).length;
      const weakCount = trainablePositions.filter(
        (position) => position.progress?.mastery_level === 'weak',
      ).length;

      return {
        id: leaf.id,
        label: '',
        positions: withProgress,
        trainablePositions,
        movePreview: uniqueMoves.join(' '),
        divergenceDepth,
        sortKey: leaf.line_path || uniqueMoves.join(' '),
        isMainline: withProgress.every((position) => position.is_mainline),
        status: lineStatus(trainablePositions),
        seenCount,
        masteredCount,
        weakCount,
      };
    })
    .filter((line): line is LineSummaryBase => Boolean(line));

  rawLines.sort((a, b) => {
    if (a.isMainline !== b.isMainline) return a.isMainline ? -1 : 1;
    const depthDiff = a.divergenceDepth - b.divergenceDepth;
    return (
      depthDiff ||
      a.sortKey.localeCompare(b.sortKey) ||
      a.movePreview.localeCompare(b.movePreview)
    );
  });

  let branchIndex = 0;
  return rawLines.map((line) => ({
    ...line,
    label: line.isMainline ? 'Mainline' : `Branch ${++branchIndex}`,
  }));
}

export function LineCoverageExplorer({
  repertoireId,
  sideToTrain,
  positions,
  progressRows,
}: LineCoverageExplorerProps) {
  const lines = useMemo(
    () => buildLineSummaries(positions, progressRows),
    [positions, progressRows],
  );
  const [selectedLineId, setSelectedLineId] = useState<string | null>(
    lines[0]?.id ?? null,
  );
  const [activeFilter, setActiveFilter] = useState<LineFilter>('all');
  const [expandedLineIds, setExpandedLineIds] = useState<Set<string>>(
    () => new Set(lines[0] ? [lines[0].id] : []),
  );
  const filteredLines = lines.filter((line) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'notMastered') return line.status !== 'mastered';
    return line.status === activeFilter;
  });
  const selectedLine =
    filteredLines.find((line) => line.id === selectedLineId) ??
    filteredLines[0] ??
    lines[0];
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(
    selectedLine?.trainablePositions[0]?.id ?? null,
  );
  const selectedPosition =
    selectedLine?.trainablePositions.find(
      (position) => position.id === selectedPositionId,
    ) ??
    selectedLine?.trainablePositions[0] ??
    null;

  const uniqueTrainable = new Map<string, PositionWithProgress>();
  for (const line of lines) {
    for (const position of line.trainablePositions) {
      uniqueTrainable.set(position.id, position);
    }
  }
  const uniquePositions = Array.from(uniqueTrainable.values());
  const trainedPositionCount = uniquePositions.filter(
    (position) => (position.progress?.times_seen ?? 0) > 0,
  ).length;
  const masteredPositionCount = uniquePositions.filter(
    (position) => position.progress?.mastery_level === 'mastered',
  ).length;
  const trainedLines = lines.filter((line) => line.status === 'trained').length;
  const masteredLines = lines.filter((line) => line.status === 'mastered').length;
  const weakLines = lines.filter((line) => line.status === 'weak').length;
  const untrainedLines = lines.filter((line) => line.status === 'untrained').length;
  const notMasteredLines = lines.length - masteredLines;

  function selectLine(line: LineSummary) {
    setSelectedLineId(line.id);
    setSelectedPositionId(line.trainablePositions[0]?.id ?? null);
  }

  function selectFilter(filter: LineFilter) {
    setActiveFilter(filter);
    const nextLines = lines.filter((line) => {
      if (filter === 'all') return true;
      if (filter === 'notMastered') return line.status !== 'mastered';
      return line.status === filter;
    });
    const nextLine = nextLines[0] ?? null;
    setSelectedLineId(nextLine?.id ?? null);
    setSelectedPositionId(nextLine?.trainablePositions[0]?.id ?? null);
    if (nextLine) {
      setExpandedLineIds((prev) => {
        const next = new Set(prev);
        next.add(nextLine.id);
        return next;
      });
    }
  }

  function toggleExpanded(lineId: string) {
    setExpandedLineIds((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  }

  if (uniquePositions.length === 0) {
    return (
      <section className="rounded-lg border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-500">
        No trainable repertoire moves found for this opening.
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: 'Lines', value: String(lines.length), filter: 'all' as const },
          { label: 'Trained', value: String(trainedLines), filter: 'trained' as const },
          { label: 'Mastered', value: String(masteredLines), filter: 'mastered' as const },
          { label: 'Weak', value: String(weakLines), filter: 'weak' as const },
          { label: 'Untrained', value: String(untrainedLines), filter: 'untrained' as const },
          { label: 'Needs master', value: String(notMasteredLines), filter: 'notMastered' as const },
        ].map(({ label, value, filter }) => (
          <button
            key={label}
            type="button"
            onClick={() => selectFilter(filter)}
            className={`rounded-lg bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
              activeFilter === filter ? 'ring-2 ring-blue-400' : ''
            }`}
          >
            <p className="text-xs uppercase tracking-wide text-stone-500">{label}</p>
            <p className="mt-1 text-xl font-semibold text-stone-900">{value}</p>
          </button>
        ))}
      </div>

      <div className="rounded-lg bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-stone-600">
            Showing{' '}
            <span className="font-semibold text-stone-900">
              {filteredLines.length}
            </span>{' '}
            of {lines.length} lines
            {activeFilter !== 'all' && (
              <>
                {' '}
                filtered by{' '}
                <span className="font-semibold capitalize text-stone-900">
                  {activeFilter === 'notMastered' ? 'needs master' : activeFilter}
                </span>
              </>
            )}
          </p>
          <p className="text-xs text-stone-500">
            Overall coverage: {percent(trainedPositionCount, uniquePositions.length)}%
            trained / {percent(masteredPositionCount, uniquePositions.length)}% mastered
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          {filteredLines.length === 0 && (
            <div className="rounded-lg bg-white p-8 text-center text-sm text-stone-500 shadow-sm">
              No lines match this filter.
            </div>
          )}

          {filteredLines.map((line) => {
            const isSelected = selectedLine?.id === line.id;
            const isExpanded = expandedLineIds.has(line.id);
            const trainedPct = percent(line.seenCount, line.trainablePositions.length);
            const masteredPct = percent(
              line.masteredCount,
              line.trainablePositions.length,
            );

            return (
              <div
                key={line.id}
                className={`overflow-hidden rounded-lg bg-white shadow-sm ${
                  isSelected ? 'ring-2 ring-blue-300' : ''
                }`}
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => selectLine(line)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') selectLine(line);
                  }}
                  className="cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-4 border-b border-stone-100 px-5 py-4">
                    <h3 className="text-lg font-semibold text-stone-900">
                      {line.label}
                    </h3>
                    <div className="flex items-center gap-4 text-stone-400">
                      <span title="Study">▮▮</span>
                      <span title="Video">●▮</span>
                    </div>
                  </div>

                  <div className="px-5 py-5">
                    <p className="font-mono text-base leading-7 text-stone-900">
                      <span className="mr-2 inline-block size-3 rounded-full bg-stone-950" />
                      {line.movePreview}
                    </p>

                    <div className="mt-6 flex items-end justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex items-center gap-3">
                          <span
                            className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium capitalize ${statusClasses[line.status]}`}
                          >
                            {line.status}
                          </span>
                          <span className="text-sm text-stone-500">
                            {line.seenCount}/{line.trainablePositions.length} seen
                            {' · '}
                            {line.masteredCount} mastered
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-stone-200">
                          <div
                            className="h-full bg-blue-500"
                            style={{ width: `${trainedPct}%` }}
                          />
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-stone-200">
                          <div
                            className="h-full bg-green-500"
                            style={{ width: `${masteredPct}%` }}
                          />
                        </div>
                      </div>

                      <div className="relative flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleExpanded(line.id);
                          }}
                          className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
                        >
                          {isExpanded ? 'Hide' : 'View'}
                        </button>
                        <Link
                          href={`/openings/${repertoireId}/train?line=${line.id}`}
                          onClick={(event) => event.stopPropagation()}
                          className="rounded-md border border-blue-200 bg-white px-4 py-2 text-sm font-medium text-stone-900 hover:bg-blue-50"
                        >
                          Learn
                        </Link>
                        <span className="absolute -right-2 -top-2 rounded-full bg-sky-200 px-2 py-0.5 text-xs font-medium text-sky-900">
                          {line.trainablePositions.length}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-stone-100 bg-stone-50 px-5 py-4">
                    <ol className="space-y-2">
                      {line.trainablePositions.map((position, index) => {
                        const status = positionStatus(position);
                        return (
                          <li
                            key={position.id}
                            className="rounded border border-stone-200 bg-white p-3"
                          >
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <p className="text-sm text-stone-800">
                                  <span className="mr-2 text-xs text-stone-500">
                                    {index + 1}.
                                  </span>
                                  {position.opponent_move_san && (
                                    <span className="text-stone-500">
                                      {position.opponent_move_san}{' '}
                                    </span>
                                  )}
                                  <span className="font-mono font-medium">
                                    {position.expected_move_san}
                                  </span>
                                </p>
                                {position.comment && (
                                  <p className="mt-1 text-xs leading-5 text-stone-600">
                                    {position.comment}
                                  </p>
                                )}
                              </div>
                              <div className="text-xs text-stone-500">
                                <span
                                  className={`mr-2 inline-flex rounded border px-1.5 py-0.5 capitalize ${statusClasses[status]}`}
                                >
                                  {status}
                                </span>
                                streak {position.progress?.current_streak ?? 0} /{' '}
                                {position.progress?.correct_count ?? 0} correct /{' '}
                                {position.progress?.wrong_count ?? 0} wrong
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <aside className="rounded-lg bg-white p-4 shadow-sm lg:sticky lg:top-6 lg:self-start">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
            Board preview
          </p>
          <h3 className="mt-1 text-sm font-semibold text-stone-800">
            {selectedLine?.label ?? 'Line'}
          </h3>
          {selectedPosition && (
            <div className="mt-3">
              <Board
                fen={selectedPosition.fen}
                orientation={sideToTrain}
                draggable={false}
                width={320}
              />
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {selectedLine?.trainablePositions.map((position, index) => {
              const active = selectedPosition?.id === position.id;
              return (
                <button
                  key={position.id}
                  type="button"
                  onClick={() => setSelectedPositionId(position.id)}
                  className={`rounded border px-2 py-1 text-xs ${
                    active
                      ? 'border-amber-300 bg-amber-50 text-amber-900'
                      : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
                  }`}
                >
                  {index + 1}.{' '}
                  {position.opponent_move_san
                    ? `${position.opponent_move_san} `
                    : ''}
                  {position.expected_move_san}
                </button>
              );
            })}
          </div>
        </aside>
      </div>
    </section>
  );
}

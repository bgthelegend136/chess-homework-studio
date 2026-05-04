'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Chess } from 'chess.js';
import {
  BookOpen,
  Eye,
  EyeOff,
  MessageSquare,
  Play,
} from 'lucide-react';
import { Board } from '@/components/chess/Board';
import type {
  OpeningMasteryLevel,
  OpeningPosition,
  OpeningPositionProgress,
} from '@/lib/types';

const MOVE_PREVIEW_LIMIT = 15;

interface PlyEntry {
  key: string;
  label: string;
  san: string;
  fen: string;
  positionId: string;
  kind: 'opponent' | 'expected';
}

function buildPlyEntries(positions: PositionWithProgress[]): PlyEntry[] {
  const entries: PlyEntry[] = [];
  for (const position of positions) {
    if (!position.expected_move_san) continue;
    const expectedPly = position.ply_index;
    const expectedMoveNumber = Math.floor(expectedPly / 2) + 1;
    const expectedIsWhite = expectedPly % 2 === 0;
    if (position.opponent_move_san) {
      const opponentPly = expectedPly - 1;
      const opponentMoveNumber = Math.floor(opponentPly / 2) + 1;
      const opponentIsWhite = opponentPly % 2 === 0;
      const prefix = opponentIsWhite ? `${opponentMoveNumber}.` : `${opponentMoveNumber}...`;
      entries.push({
        key: `${position.id}-opp`,
        label: `${prefix} ${position.opponent_move_san}`,
        san: position.opponent_move_san,
        fen: position.fen,
        positionId: position.id,
        kind: 'opponent',
      });
    }
    let expectedFen = position.fen;
    try {
      const chess = new Chess(position.fen);
      chess.move(position.expected_move_san);
      expectedFen = chess.fen();
    } catch {
      // fall back to the pre-move fen if the SAN can't be replayed
    }
    const prefix = expectedIsWhite ? `${expectedMoveNumber}.` : `${expectedMoveNumber}...`;
    entries.push({
      key: `${position.id}-exp`,
      label: `${prefix} ${position.expected_move_san}`,
      san: position.expected_move_san,
      fen: expectedFen,
      positionId: position.id,
      kind: 'expected',
    });
  }
  return entries;
}

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

  const plies = useMemo<PlyEntry[]>(
    () => (selectedLine ? buildPlyEntries(selectedLine.trainablePositions) : []),
    [selectedLine],
  );
  const [selectedPlyKey, setSelectedPlyKey] = useState<string | null>(null);
  useEffect(() => {
    setSelectedPlyKey(plies[0]?.key ?? null);
  }, [plies]);
  const activePlyIndex = Math.max(
    0,
    plies.findIndex((ply) => ply.key === selectedPlyKey),
  );
  const activePly = plies[activePlyIndex] ?? null;
  const activePlyButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (plies.length === 0) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          target.isContentEditable
        ) {
          return;
        }
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      event.preventDefault();
      setSelectedPlyKey((current) => {
        const idx = plies.findIndex((ply) => ply.key === current);
        const safeIdx = idx < 0 ? 0 : idx;
        const nextIdx =
          event.key === 'ArrowRight'
            ? Math.min(plies.length - 1, safeIdx + 1)
            : Math.max(0, safeIdx - 1);
        return plies[nextIdx]?.key ?? current;
      });
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [plies]);

  useEffect(() => {
    activePlyButtonRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedPlyKey]);

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
      <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white p-1 shadow-sm">
        <div className="flex min-w-max gap-1">
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
              className={`rounded-md px-3 py-2 text-left transition-colors ${
                activeFilter === filter
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-stone-600 hover:bg-stone-50'
              }`}
            >
              <p className="text-[11px] uppercase tracking-wide opacity-75">{label}</p>
              <p className="text-lg font-semibold leading-5">{value}</p>
            </button>
          ))}
        </div>
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

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-3">
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
                  <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-4 py-3">
                    <h3 className="text-base font-semibold text-stone-900">
                      {line.label}
                    </h3>
                    <div className="flex items-center gap-2 text-stone-400">
                      {line.positions.some((position) => position.comment) && (
                        <MessageSquare
                          className="size-4"
                          aria-label="Line has imported PGN comments"
                        />
                      )}
                      <BookOpen className="size-4" aria-label="Study line" />
                    </div>
                  </div>

                  <div className="px-4 py-3">
                    <p className="truncate font-mono text-sm leading-6 text-stone-900">
                      <span className="mr-2 inline-block size-3 rounded-full bg-stone-950 align-middle" />
                      {(() => {
                        const tokens = line.movePreview.split(' ');
                        if (tokens.length <= MOVE_PREVIEW_LIMIT) return line.movePreview;
                        return `${tokens.slice(0, MOVE_PREVIEW_LIMIT).join(' ')} ...`;
                      })()}
                    </p>

                    <div className="mt-3 flex items-end justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium capitalize ${statusClasses[line.status]}`}
                          >
                            {line.status}
                          </span>
                          <span className="text-sm text-stone-500">
                            {line.seenCount}/{line.trainablePositions.length} seen
                            {' - '}
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
                          className="inline-flex size-9 items-center justify-center rounded-md border border-stone-300 bg-white text-stone-700 hover:bg-stone-50"
                          aria-label={isExpanded ? 'Hide line moves' : 'Show line moves'}
                          title={isExpanded ? 'Hide line moves' : 'Show line moves'}
                        >
                          {isExpanded ? (
                            <EyeOff className="size-4" />
                          ) : (
                            <Eye className="size-4" />
                          )}
                        </button>
                        <Link
                          href={`/openings/${repertoireId}/train?line=${line.id}`}
                          onClick={(event) => event.stopPropagation()}
                          className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-stone-900 hover:bg-blue-50"
                        >
                          <Play className="size-4" />
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
                        const isActivePosition =
                          isSelected && activePly?.positionId === position.id;
                        return (
                          <li
                            key={position.id}
                            ref={(el) => {
                              if (isActivePosition && el) {
                                el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                              }
                            }}
                            className={`rounded border p-3 transition-colors ${
                              isActivePosition
                                ? 'border-amber-300 bg-amber-50'
                                : 'border-stone-200 bg-white'
                            }`}
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
          {(activePly || selectedPosition) && (
            <div className="mt-3">
              <Board
                fen={activePly?.fen ?? selectedPosition!.fen}
                orientation={sideToTrain}
                draggable={false}
                width={420}
              />
            </div>
          )}
          <p className="mt-2 text-[11px] text-stone-400">
            Left / Right to step through moves
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {plies.map((ply) => {
              const active = ply.key === activePly?.key;
              return (
                <button
                  key={ply.key}
                  ref={active ? activePlyButtonRef : undefined}
                  type="button"
                  onClick={() => {
                    setSelectedPlyKey(ply.key);
                    setSelectedPositionId(ply.positionId);
                  }}
                  className={`rounded border px-2 py-1 text-xs ${
                    active
                      ? 'border-amber-300 bg-amber-50 text-amber-900'
                      : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
                  }`}
                >
                  {ply.label}
                </button>
              );
            })}
          </div>
        </aside>
      </div>
    </section>
  );
}

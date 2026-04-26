'use client';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Board } from '@/components/chess/Board';
import { Button } from '@/components/ui/Button';
import { validateMove } from '@/lib/chess/validateMove';
import type {
  OpeningAnnotation,
  OpeningMasteryLevel,
  OpeningPosition,
  OpeningPositionProgress,
  OpeningRepertoire,
} from '@/lib/types';
import { recordOpeningAttempt } from '../../actions';

interface TrainingPosition extends OpeningPosition {
  progress: Pick<
    OpeningPositionProgress,
    | 'mastery_level'
    | 'priority_score'
    | 'current_streak'
    | 'correct_count'
    | 'wrong_count'
  > | null;
}

interface OpeningTrainerProps {
  repertoire: OpeningRepertoire;
  positions: TrainingPosition[];
  lineLeafId?: string;
}

function buildLineChain(
  positions: TrainingPosition[],
  leafId: string,
): TrainingPosition[] {
  const byId = new Map(positions.map((p) => [p.id, p]));
  const chain: TrainingPosition[] = [];
  let cursor = byId.get(leafId);
  while (cursor) {
    chain.push(cursor);
    cursor = cursor.parent_position_id ? byId.get(cursor.parent_position_id) : undefined;
  }
  return chain.reverse().filter((p) => Boolean(p.expected_move_san));
}

type Feedback =
  | {
      kind: 'correct';
      lineComplete: boolean;
      comment: string | null;
    }
  | {
      kind: 'incorrect';
      revealed: boolean;
      correctMove: string;
      comment: string | null;
    };

function annotationBoost(annotation: OpeningAnnotation | null): number {
  if (annotation === '!!') return 15;
  if (annotation === '!') return 8;
  return 0;
}

function levelBoost(level: OpeningMasteryLevel): number {
  if (level === 'weak') return 120;
  if (level === 'new') return 70;
  if (level === 'learning') return 35;
  return -30;
}

function effectiveScore(position: TrainingPosition): number {
  const level = position.progress?.mastery_level ?? 'new';
  return (
    (position.progress?.priority_score ?? position.priority_weight) +
    levelBoost(level) +
    (position.is_mainline ? 16 : 0) +
    annotationBoost(position.annotation)
  );
}

function chooseByPriority(
  positions: TrainingPosition[],
  previousId: string | null,
  cursor: number,
): TrainingPosition {
  const sorted = [...positions].sort((a, b) => {
    const scoreDiff = effectiveScore(b) - effectiveScore(a);
    return scoreDiff || a.line_path.localeCompare(b.line_path);
  });
  const top = sorted.slice(0, Math.min(5, sorted.length));
  const filtered = top.length > 1 ? top.filter((p) => p.id !== previousId) : top;
  return filtered[cursor % filtered.length] ?? sorted[0];
}

export function OpeningTrainer({
  repertoire,
  positions,
  lineLeafId,
}: OpeningTrainerProps) {
  const [positionState, setPositionState] = useState(positions);
  const lineChain = useMemo(
    () => (lineLeafId ? buildLineChain(positionState, lineLeafId) : []),
    [positionState, lineLeafId],
  );
  const isLineMode = lineLeafId !== undefined && lineChain.length > 0;
  const [lineIndex, setLineIndex] = useState(0);
  const [lineComplete, setLineComplete] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [current, setCurrent] = useState<TrainingPosition | null>(() => {
    if (lineLeafId) {
      const chain = buildLineChain(positions, lineLeafId);
      if (chain.length > 0) return chain[0];
    }
    return positions.length > 0 ? chooseByPriority(positions, null, 0) : null;
  });
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [sessionStats, setSessionStats] = useState({ correct: 0, incorrect: 0 });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const advanceRef = useRef<(() => void) | null>(null);

  const childrenByParent = useMemo(() => {
    const map = new Map<string, TrainingPosition[]>();
    for (const position of positionState) {
      if (!position.parent_position_id) continue;
      const list = map.get(position.parent_position_id) ?? [];
      list.push(position);
      map.set(position.parent_position_id, list);
    }
    for (const [key, children] of Array.from(map.entries())) {
      map.set(
        key,
        children.sort((a: TrainingPosition, b: TrainingPosition) => {
          const scoreDiff = effectiveScore(b) - effectiveScore(a);
          return scoreDiff || a.line_path.localeCompare(b.line_path);
        }),
      );
    }
    return map;
  }, [positionState]);

  useEffect(() => {
    if (!feedback || feedback.kind !== 'correct') return;
    const timer = setTimeout(() => {
      advanceRef.current?.();
    }, 650);
    return () => clearTimeout(timer);
  }, [feedback]);

  if (!current) {
    return (
      <div className="rounded-lg border border-dashed border-stone-300 bg-white p-8 text-center text-stone-500">
        No trainable positions in this repertoire.
      </div>
    );
  }

  if (isLineMode && lineComplete) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-8 text-center text-green-900">
        <p className="text-lg font-semibold">Line complete</p>
        <p className="mt-2 text-sm">
          You finished every move in this line. Pick another line to continue.
        </p>
        <a
          href={`/openings/${repertoire.id}`}
          className="mt-4 inline-block rounded border border-green-300 bg-white px-3 py-1.5 text-sm font-medium text-green-800 hover:bg-green-100"
        >
          Back to opening
        </a>
      </div>
    );
  }

  const accuracyTotal = sessionStats.correct + sessionStats.incorrect;
  const accuracy =
    accuracyTotal > 0 ? Math.round((sessionStats.correct / accuracyTotal) * 100) : 0;
  const sideLabel = repertoire.side_to_train === 'white' ? 'White' : 'Black';

  function chooseChild(fromPosition: TrainingPosition): TrainingPosition | null {
    const children = childrenByParent.get(fromPosition.id) ?? [];
    if (children.length === 0) return null;
    return chooseByPriority(children, null, cursor);
  }

  function advance(fromPosition: TrainingPosition) {
    setFeedback(null);
    if (isLineMode) {
      const nextIndex = lineIndex + 1;
      if (nextIndex < lineChain.length) {
        setLineIndex(nextIndex);
        setCurrent(lineChain[nextIndex]);
      } else {
        setLineComplete(true);
      }
      return;
    }
    const child = chooseChild(fromPosition);
    if (child) {
      setCurrent(child);
      return;
    }
    const nextCursor = cursor + 1;
    setCursor(nextCursor);
    setCurrent(chooseByPriority(positionState, fromPosition.id, nextCursor));
  }

  function updateProgress(positionId: string, wasCorrect: boolean, response: {
    masteryLevel: OpeningMasteryLevel;
    priorityScore: number;
  }) {
    setPositionState((prev) =>
      prev.map((position) =>
        position.id === positionId
          ? {
              ...position,
              progress: {
                mastery_level: response.masteryLevel,
                priority_score: response.priorityScore,
                current_streak: wasCorrect
                  ? (position.progress?.current_streak ?? 0) + 1
                  : 0,
                correct_count:
                  (position.progress?.correct_count ?? 0) + (wasCorrect ? 1 : 0),
                wrong_count:
                  (position.progress?.wrong_count ?? 0) + (wasCorrect ? 0 : 1),
              },
            }
          : position,
      ),
    );
  }

  function handleDrop(from: string, to: string): boolean {
    if (!current || feedback || isPending) return false;
    const result = validateMove(current.fen, from, to);
    if (!result) return false;

    const snapshot = current;
    setError(null);
    startTransition(async () => {
      try {
        const response = await recordOpeningAttempt({
          repertoire_id: repertoire.id,
          position_id: snapshot.id,
          attempted_move: result.san,
          attempted_uci: `${result.from}${result.to}`,
        });
        const wasCorrect = response.wasCorrect;

        setSessionStats((prev) => ({
          correct: prev.correct + (wasCorrect ? 1 : 0),
          incorrect: prev.incorrect + (wasCorrect ? 0 : 1),
        }));
        updateProgress(snapshot.id, wasCorrect, response);
        advanceRef.current = () => advance(snapshot);

        if (wasCorrect) {
          const atLineEnd = isLineMode
            ? lineIndex + 1 >= lineChain.length
            : !chooseChild(snapshot);
          setFeedback({
            kind: 'correct',
            lineComplete: atLineEnd,
            comment: snapshot.comment,
          });
        } else {
          setFeedback({
            kind: 'incorrect',
            revealed: false,
            correctMove: response.correctMove,
            comment: snapshot.comment,
          });
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Could not record attempt');
      }
    });

    return true;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,520px)_1fr]">
      <div>
        <Board
          fen={current.fen}
          orientation={repertoire.side_to_train}
          draggable={!feedback && !isPending}
          onPieceDrop={handleDrop}
          width={520}
        />
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
            Current position
          </p>
          <h2 className="mt-1 text-xl font-semibold text-stone-800">
            Play {sideLabel}&apos;s repertoire move
          </h2>
          <p className="mt-2 text-sm text-stone-500">
            {current.opponent_move_san
              ? `Opponent just played ${current.opponent_move_san}.`
              : 'Start of repertoire.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded border border-stone-200 bg-stone-50 px-2 py-0.5 text-stone-700">
              {current.progress?.mastery_level ?? 'new'}
            </span>
            <span
              className={`rounded border px-2 py-0.5 ${
                current.is_mainline
                  ? 'border-blue-200 bg-blue-50 text-blue-800'
                  : 'border-purple-200 bg-purple-50 text-purple-800'
              }`}
            >
              {current.is_mainline ? 'mainline' : 'branch'}
            </span>
            {current.annotation && (
              <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-800">
                {current.annotation}
              </span>
            )}
            <span className="rounded border border-stone-200 bg-white px-2 py-0.5 text-stone-700">
              score {effectiveScore(current)}
            </span>
          </div>
        </section>

        {feedback && (
          <section
            className={`rounded-lg border p-4 shadow-sm ${
              feedback.kind === 'correct'
                ? 'border-green-200 bg-green-50 text-green-900'
                : 'border-red-200 bg-red-50 text-red-900'
            }`}
          >
            <p className="font-semibold">
              {feedback.kind === 'correct' ? 'Correct' : 'Wrong'}
            </p>

            {feedback.kind === 'correct' && feedback.lineComplete && feedback.comment && (
              <p className="mt-2 text-sm leading-6">{feedback.comment}</p>
            )}

            {feedback.kind === 'incorrect' && !feedback.revealed && (
              <Button
                type="button"
                variant="secondary"
                className="mt-3 bg-white"
                onClick={() =>
                  setFeedback({
                    ...feedback,
                    revealed: true,
                  })
                }
              >
                Show answer
              </Button>
            )}

            {feedback.kind === 'incorrect' && feedback.revealed && (
              <>
                <p className="mt-2 text-sm">
                  Correct move: <span className="font-mono">{feedback.correctMove}</span>
                </p>
                {feedback.comment && (
                  <p className="mt-2 text-sm leading-6">{feedback.comment}</p>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-3 bg-white"
                  onClick={() => advanceRef.current?.()}
                >
                  Continue
                </Button>
              </>
            )}
          </section>
        )}

        {error && (
          <p className="rounded border border-red-100 bg-red-50 p-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
            Session stats
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded border border-stone-200 bg-stone-50 p-2">
              <p className="text-lg font-semibold text-stone-800">
                {sessionStats.correct}
              </p>
              <p className="text-xs text-stone-500">Correct</p>
            </div>
            <div className="rounded border border-stone-200 bg-stone-50 p-2">
              <p className="text-lg font-semibold text-stone-800">
                {sessionStats.incorrect}
              </p>
              <p className="text-xs text-stone-500">Wrong</p>
            </div>
            <div className="rounded border border-stone-200 bg-stone-50 p-2">
              <p className="text-lg font-semibold text-stone-800">{accuracy}%</p>
              <p className="text-xs text-stone-500">Accuracy</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

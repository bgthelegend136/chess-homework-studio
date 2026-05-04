'use client';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Chess } from 'chess.js';
import { CheckCircle2, Eye, Play, XCircle } from 'lucide-react';
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

type TrainerPhase =
  | 'awaiting-user'
  | 'saving-attempt'
  | 'showing-correct'
  | 'showing-opponent'
  | 'revealed-answer'
  | 'line-complete';

type DisplayPosition = {
  fen: string;
  phase: TrainerPhase;
  promptPositionId: string;
  lastMove?: {
    san: string;
    from: string;
    to: string;
    kind: 'user' | 'opponent' | 'answer';
  };
};

type NextSelection = {
  position: TrainingPosition | null;
  lineIndex: number;
  cursor: number;
  complete: boolean;
};

function playSan(
  fen: string,
  san: string | null,
): DisplayPosition['lastMove'] & { fen: string } | null {
  if (!san) return null;
  try {
    const chess = new Chess(fen);
    const move = chess.move(san, { strict: false });
    if (!move) return null;
    return {
      fen: chess.fen(),
      san: move.san,
      from: move.from,
      to: move.to,
      kind: 'answer',
    };
  } catch {
    return null;
  }
}

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

function initialTrainingPosition(
  positions: TrainingPosition[],
  lineLeafId?: string,
): TrainingPosition | null {
  if (lineLeafId) {
    const chain = buildLineChain(positions, lineLeafId);
    if (chain.length > 0) return chain[0];
  }
  return positions.length > 0 ? chooseByPriority(positions, null, 0) : null;
}

function displayFor(position: TrainingPosition | null): DisplayPosition | null {
  if (!position) return null;
  return {
    fen: position.fen,
    phase: 'awaiting-user',
    promptPositionId: position.id,
  };
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
  const [current, setCurrent] = useState<TrainingPosition | null>(() =>
    initialTrainingPosition(positions, lineLeafId),
  );
  const [display, setDisplay] = useState<DisplayPosition | null>(() =>
    displayFor(initialTrainingPosition(positions, lineLeafId)),
  );
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [sessionStats, setSessionStats] = useState({ correct: 0, incorrect: 0 });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const timersRef = useRef<number[]>([]);

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

  function clearAdvanceTimers() {
    for (const timer of timersRef.current) window.clearTimeout(timer);
    timersRef.current = [];
  }

  function scheduleAdvance(callback: () => void, delay: number) {
    const timer = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((item) => item !== timer);
      callback();
    }, delay);
    timersRef.current.push(timer);
  }

  useEffect(() => {
    clearAdvanceTimers();
    setPositionState(positions);
    const initial = initialTrainingPosition(positions, lineLeafId);
    setLineIndex(0);
    setLineComplete(false);
    setCursor(0);
    setCurrent(initial);
    setDisplay(displayFor(initial));
    setFeedback(null);
    setError(null);
    setSessionStats({ correct: 0, incorrect: 0 });
    return clearAdvanceTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions, lineLeafId, repertoire.id]);

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

  const activeCurrent = current;
  const accuracyTotal = sessionStats.correct + sessionStats.incorrect;
  const accuracy =
    accuracyTotal > 0 ? Math.round((sessionStats.correct / accuracyTotal) * 100) : 0;
  const sideLabel = repertoire.side_to_train === 'white' ? 'White' : 'Black';

  function chooseChild(fromPosition: TrainingPosition): TrainingPosition | null {
    const children = childrenByParent.get(fromPosition.id) ?? [];
    if (children.length === 0) return null;
    return chooseByPriority(children, null, cursor);
  }

  function nextSelection(fromPosition: TrainingPosition): NextSelection {
    if (isLineMode) {
      const nextIndex = lineIndex + 1;
      if (nextIndex < lineChain.length) {
        return {
          position: lineChain[nextIndex],
          lineIndex: nextIndex,
          cursor,
          complete: false,
        };
      }
      return { position: null, lineIndex, cursor, complete: true };
    }

    const child = chooseChild(fromPosition);
    if (child) {
      return { position: child, lineIndex, cursor, complete: false };
    }

    const nextCursor = cursor + 1;
    return {
      position: chooseByPriority(positionState, fromPosition.id, nextCursor),
      lineIndex,
      cursor: nextCursor,
      complete: false,
    };
  }

  function commitSelection(selection: NextSelection, fallbackFen: string) {
    setFeedback(null);
    if (selection.complete || !selection.position) {
      setLineComplete(true);
      setDisplay({
        fen: fallbackFen,
        phase: 'line-complete',
        promptPositionId: activeCurrent.id,
      });
      return;
    }

    setLineIndex(selection.lineIndex);
    setCursor(selection.cursor);
    setCurrent(selection.position);
    setDisplay({
      fen: selection.position.fen,
      phase: 'awaiting-user',
      promptPositionId: selection.position.id,
    });
  }

  function continueToNextPosition(fromPosition: TrainingPosition, afterFen: string) {
    const selection = nextSelection(fromPosition);
    if (selection.complete || !selection.position) {
      scheduleAdvance(() => commitSelection(selection, afterFen), 450);
      return;
    }

    const opponentMove = playSan(afterFen, selection.position.opponent_move_san);
    if (opponentMove) {
      setFeedback(null);
      setLineIndex(selection.lineIndex);
      setCursor(selection.cursor);
      setCurrent(selection.position);
      setDisplay({
        fen: opponentMove.fen,
        phase: 'showing-opponent',
        promptPositionId: selection.position.id,
        lastMove: {
          san: opponentMove.san,
          from: opponentMove.from,
          to: opponentMove.to,
          kind: 'opponent',
        },
      });
      scheduleAdvance(() => commitSelection(selection, opponentMove.fen), 650);
      return;
    }

    scheduleAdvance(() => commitSelection(selection, selection.position!.fen), 250);
  }

  function revealCorrectMove() {
    if (!feedback || feedback.kind !== 'incorrect') return;
    const answerMove = playSan(activeCurrent.fen, feedback.correctMove);
    if (answerMove) {
      setDisplay({
        fen: answerMove.fen,
        phase: 'revealed-answer',
        promptPositionId: activeCurrent.id,
        lastMove: {
          san: answerMove.san,
          from: answerMove.from,
          to: answerMove.to,
          kind: 'answer',
        },
      });
    }
    setFeedback({
      ...feedback,
      revealed: true,
    });
  }

  function continueAfterIncorrect() {
    if (!feedback || feedback.kind !== 'incorrect') return;
    const answerMove = playSan(activeCurrent.fen, feedback.correctMove);
    continueToNextPosition(activeCurrent, answerMove?.fen ?? activeCurrent.fen);
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
    if (!current || display?.phase !== 'awaiting-user' || isPending) return false;
    const result = validateMove(current.fen, from, to);
    if (!result) return false;

    const snapshot = current;
    setError(null);
    setDisplay({
      fen: display?.fen ?? current.fen,
      phase: 'saving-attempt',
      promptPositionId: snapshot.id,
    });
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

        if (wasCorrect) {
          const selection = nextSelection(snapshot);
          const atLineEnd = selection.complete;
          setDisplay({
            fen: result.afterFen,
            phase: 'showing-correct',
            promptPositionId: snapshot.id,
            lastMove: {
              san: result.san,
              from: result.from,
              to: result.to,
              kind: 'user',
            },
          });
          setFeedback({
            kind: 'correct',
            lineComplete: atLineEnd,
            comment: snapshot.comment,
          });
          scheduleAdvance(() => continueToNextPosition(snapshot, result.afterFen), 550);
        } else {
          setDisplay({
            fen: snapshot.fen,
            phase: 'awaiting-user',
            promptPositionId: snapshot.id,
          });
          setFeedback({
            kind: 'incorrect',
            revealed: false,
            correctMove: response.correctMove,
            comment: snapshot.comment,
          });
        }
      } catch (e: unknown) {
        setDisplay({
          fen: snapshot.fen,
          phase: 'awaiting-user',
          promptPositionId: snapshot.id,
        });
        setError(e instanceof Error ? e.message : 'Could not record attempt');
      }
    });

    return true;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,560px)_1fr]">
      <div>
        <Board
          fen={display?.fen ?? current.fen}
          orientation={repertoire.side_to_train}
          draggable={display?.phase === 'awaiting-user' && !isPending}
          onPieceDrop={handleDrop}
          width={560}
          lastMoveSquares={
            display?.lastMove ? [display.lastMove.from, display.lastMove.to] : null
          }
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
          {display?.phase === 'saving-attempt' && (
            <p className="mt-2 text-sm font-medium text-blue-700">Saving move...</p>
          )}
          {display?.phase === 'showing-opponent' && display.lastMove && (
            <p className="mt-2 text-sm font-medium text-blue-700">
              Opponent replies {display.lastMove.san}
            </p>
          )}
          {current.comment && (
            <div className="mt-3 rounded border border-blue-100 bg-blue-50 p-3 text-sm leading-6 text-blue-950">
              {current.comment}
            </div>
          )}
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
            <p className="flex items-center gap-2 font-semibold">
              {feedback.kind === 'correct' ? (
                <>
                  <CheckCircle2 className="size-5" />
                  Correct
                </>
              ) : (
                <>
                  <XCircle className="size-5" />
                  Wrong
                </>
              )}
            </p>

            {feedback.kind === 'correct' && feedback.comment && (
              <p className="mt-2 text-sm leading-6">{feedback.comment}</p>
            )}

            {feedback.kind === 'incorrect' && !feedback.revealed && (
              <Button
                type="button"
                variant="secondary"
                className="mt-3 gap-2 bg-white"
                onClick={revealCorrectMove}
              >
                <Eye className="size-4" />
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
                  className="mt-3 gap-2 bg-white"
                  onClick={continueAfterIncorrect}
                >
                  <Play className="size-4" />
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

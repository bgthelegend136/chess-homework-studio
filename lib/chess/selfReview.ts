import { Chess } from 'chess.js';

export interface SelfReviewCheck {
  acceptedMoves: string[];
  invalidAcceptedMoves: string[];
  canCheck: boolean;
  isCorrect: boolean | null;
  message: string | null;
}

export function splitAcceptedMoves(value: string | null | undefined): string[] {
  return (value ?? '')
    .split(/[\n,]/)
    .map((move) => move.trim())
    .filter(Boolean);
}

function normalizeSan(fen: string, moveText: string): string | null {
  try {
    const chess = new Chess(fen);
    const move = chess.move(moveText, { strict: false });
    return move?.san ?? null;
  } catch {
    return normalizeLooseSan(fen, moveText);
  }
}

function simplifySan(moveText: string): string {
  return moveText
    .trim()
    .replace(/^\d+\.(\.\.)?/, '')
    .replace(/^\.{1,3}/, '')
    .replace(/[+#?!]/g, '')
    .replace(/[x=\-]/g, '')
    .toLowerCase();
}

function normalizeLooseSan(fen: string, moveText: string): string | null {
  const simplified = simplifySan(moveText);
  if (!simplified) return null;

  try {
    const chess = new Chess(fen);
    const matches = chess
      .moves()
      .filter((legalMove) => simplifySan(legalMove) === simplified);

    return matches.length === 1 ? matches[0] : null;
  } catch {
    return null;
  }
}

export function checkAcceptedMove(
  fen: string,
  studentMove: string | null | undefined,
  acceptedMoveText: string | null | undefined,
): SelfReviewCheck {
  const acceptedMoves = splitAcceptedMoves(acceptedMoveText);

  if (acceptedMoves.length === 0) {
    return {
      acceptedMoves,
      invalidAcceptedMoves: [],
      canCheck: false,
      isCorrect: null,
      message: 'This question has no self-review answer configured yet.',
    };
  }

  if (!studentMove?.trim()) {
    return {
      acceptedMoves,
      invalidAcceptedMoves: [],
      canCheck: true,
      isCorrect: null,
      message: 'Choose a move before checking your answer.',
    };
  }

  const normalizedAccepted = acceptedMoves.map((move) => ({
    original: move,
    san: normalizeSan(fen, move),
  }));
  const invalidAcceptedMoves = normalizedAccepted
    .filter((move) => move.san === null)
    .map((move) => move.original);

  if (invalidAcceptedMoves.length > 0) {
    return {
      acceptedMoves,
      invalidAcceptedMoves,
      canCheck: false,
      isCorrect: null,
      message:
        'This answer cannot be checked safely. Ask your coach to update the accepted move notation.',
    };
  }

  const normalizedStudentMove = normalizeSan(fen, studentMove);
  if (!normalizedStudentMove) {
    return {
      acceptedMoves,
      invalidAcceptedMoves: [],
      canCheck: false,
      isCorrect: null,
      message: 'This answer cannot be checked safely because the move could not be read.',
    };
  }

  const acceptedSan = new Set(
    normalizedAccepted
      .map((move) => move.san)
      .filter((move): move is string => move !== null),
  );

  return {
    acceptedMoves,
    invalidAcceptedMoves: [],
    canCheck: true,
    isCorrect: acceptedSan.has(normalizedStudentMove),
    message: null,
  };
}

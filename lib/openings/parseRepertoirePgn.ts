import { Chess } from 'chess.js';
import type { OpeningAnnotation, OpeningSide } from '@/lib/types';

const { parseGame } = require('@mliebelt/pgn-parser') as {
  parseGame: (pgn: string, options?: { startRule?: string }) => ParsedPgnGame;
};

type PgnNag = string | number | { value?: string | number };

interface ParsedPgnMove {
  moveNumber: number | null;
  notation?: { notation?: string };
  variations?: ParsedPgnMove[][];
  nag?: PgnNag | PgnNag[] | null;
  commentDiag?: {
    comment?: string;
    colorFields?: string[];
    colorArrows?: string[];
  } | null;
  commentAfter?: string;
}

interface ParsedPgnGame {
  moves: ParsedPgnMove[];
}

export interface OpeningImportReport {
  trainable_positions_created: number;
  mainline_positions: number;
  variation_positions: number;
  branches_detected: number;
  comments_preserved: number;
  warnings: string[];
  skipped_branches: number;
  parser_mode_used: 'variation_tree';
}

export interface ParsedOpeningPosition {
  id: string;
  fen: string;
  expected_move_san: string;
  expected_move_uci: string;
  parent_position_id: string | null;
  line_path: string;
  ply_index: number;
  opponent_move_san: string | null;
  opponent_move_uci: string | null;
  is_mainline: boolean;
  annotation: OpeningAnnotation | null;
  comment: string | null;
  priority_weight: number;
}

export interface ParsedOpeningRepertoire {
  positions: ParsedOpeningPosition[];
  importReport: OpeningImportReport;
}

interface WalkContext {
  parentTrainableId: string | null;
  lastOpponentSan: string | null;
  lastOpponentUci: string | null;
  lastOpponentComment: string | null;
  isMainline: boolean;
  linePath: string;
  plyOffset: number;
}

interface WalkState {
  positions: ParsedOpeningPosition[];
  report: OpeningImportReport;
}

function emptyReport(): OpeningImportReport {
  return {
    trainable_positions_created: 0,
    mainline_positions: 0,
    variation_positions: 0,
    branches_detected: 0,
    comments_preserved: 0,
    warnings: [],
    skipped_branches: 0,
    parser_mode_used: 'variation_tree',
  };
}

function cleanComment(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/\[%csl\s[^\]]*\]/g, '')
    .replace(/\[%cal\s[^\]]*\]/g, '')
    .replace(/\[%clk\s[^\]]*\]/g, '')
    .replace(/\[%eval\s[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || null;
}

function annotationFromNag(nag: ParsedPgnMove['nag']): OpeningAnnotation | null {
  const values = Array.isArray(nag) ? nag : nag ? [nag] : [];
  let annotation: OpeningAnnotation | null = null;

  for (const value of values) {
    const raw =
      typeof value === 'object' && value !== null ? value.value : value;
    const normalized =
      typeof raw === 'string' ? raw.replace(/^\$/, '') : String(raw);

    if (normalized === '3') annotation = '!!';
    if (normalized === '1' && annotation !== '!!') annotation = '!';
  }

  return annotation;
}

function priorityFor(
  annotation: OpeningAnnotation | null,
  isMainline: boolean,
): number {
  const annotationWeight = annotation === '!!' ? 8 : annotation === '!' ? 4 : 0;
  return 10 + annotationWeight + (isMainline ? 6 : 0);
}

function uciFromMove(move: { from: string; to: string; promotion?: string }): string {
  return `${move.from}${move.to}${move.promotion ?? ''}`;
}

function plyIndexFor(move: ParsedPgnMove, turn: 'w' | 'b', fallback: number): number {
  if (typeof move.moveNumber === 'number') {
    return (move.moveNumber - 1) * 2 + (turn === 'w' ? 0 : 1);
  }
  return fallback;
}

function pathSegment(index: number): string {
  return String(index).padStart(4, '0');
}

function walkMoves(
  moves: ParsedPgnMove[],
  chess: Chess,
  sideToTrain: OpeningSide,
  context: WalkContext,
  state: WalkState,
): WalkContext {
  const trainColor = sideToTrain === 'white' ? 'w' : 'b';
  let parentTrainableId = context.parentTrainableId;
  let lastOpponentSan = context.lastOpponentSan;
  let lastOpponentUci = context.lastOpponentUci;
  let lastOpponentComment = context.lastOpponentComment;
  let plyOffset = context.plyOffset;

  for (let moveIndex = 0; moveIndex < moves.length; moveIndex++) {
    const move = moves[moveIndex];
    const san = move.notation?.notation;
    if (!san) {
      state.report.warnings.push(
        `Skipped a move without SAN at ${context.linePath}.${moveIndex}.`,
      );
      state.report.skipped_branches++;
      continue;
    }

    const fenBefore = chess.fen();
    const turn = chess.turn();
    const parentBeforeMove = parentTrainableId;
    const opponentSanBeforeMove = lastOpponentSan;
    const opponentUciBeforeMove = lastOpponentUci;
    const opponentCommentBeforeMove = lastOpponentComment;
    const plyBeforeMove = plyOffset;
    const movePath = `${context.linePath}.${pathSegment(moveIndex)}`;

    let played: ReturnType<Chess['move']>;
    try {
      played = chess.move(san);
    } catch {
      state.report.warnings.push(
        `Illegal SAN "${san}" at ${movePath}; skipped the rest of that branch.`,
      );
      state.report.skipped_branches++;
      break;
    }

    if (!played) {
      state.report.warnings.push(
        `Could not apply SAN "${san}" at ${movePath}; skipped the rest of that branch.`,
      );
      state.report.skipped_branches++;
      break;
    }

    const playedUci = uciFromMove(played);
    const comment = cleanComment(
      move.commentDiag?.comment ?? move.commentAfter ?? null,
    );
    if (comment) state.report.comments_preserved++;

    if (turn === trainColor) {
      const id = crypto.randomUUID();
      const positionComment = [opponentCommentBeforeMove, comment]
        .filter(Boolean)
        .join('\n\n') || null;
      const position: ParsedOpeningPosition = {
        id,
        fen: fenBefore,
        expected_move_san: played.san,
        expected_move_uci: playedUci,
        parent_position_id: parentBeforeMove,
        line_path: movePath,
        ply_index: plyIndexFor(move, turn, plyBeforeMove),
        opponent_move_san: opponentSanBeforeMove,
        opponent_move_uci: opponentUciBeforeMove,
        is_mainline: context.isMainline,
        annotation: annotationFromNag(move.nag),
        comment: positionComment,
        priority_weight: priorityFor(annotationFromNag(move.nag), context.isMainline),
      };

      state.positions.push(position);
      state.report.trainable_positions_created++;
      if (context.isMainline) state.report.mainline_positions++;
      else state.report.variation_positions++;
      parentTrainableId = id;
    } else {
      lastOpponentSan = played.san;
      lastOpponentUci = playedUci;
      lastOpponentComment = comment;
    }

    for (
      let variationIndex = 0;
      variationIndex < (move.variations ?? []).length;
      variationIndex++
    ) {
      state.report.branches_detected++;
      const variationMoves = move.variations?.[variationIndex] ?? [];
      const variationChess = new Chess(fenBefore);
      walkMoves(
        variationMoves,
        variationChess,
        sideToTrain,
        {
          parentTrainableId: parentBeforeMove,
          lastOpponentSan: opponentSanBeforeMove,
          lastOpponentUci: opponentUciBeforeMove,
          lastOpponentComment: opponentCommentBeforeMove,
          isMainline: false,
          linePath: `${movePath}.var${pathSegment(variationIndex)}`,
          plyOffset: plyBeforeMove,
        },
        state,
      );
    }

    plyOffset++;
  }

  return {
    parentTrainableId,
    lastOpponentSan,
    lastOpponentUci,
    lastOpponentComment,
    isMainline: context.isMainline,
    linePath: context.linePath,
    plyOffset,
  };
}

export function parseRepertoirePgn(
  pgn: string,
  sideToTrain: OpeningSide,
): ParsedOpeningRepertoire {
  if (/^\s*\[FEN\s+/m.test(pgn) || /^\s*\[SetUp\s+"1"\s*\]/m.test(pgn)) {
    throw new Error('Custom starting FEN PGNs are not supported.');
  }

  let game: ParsedPgnGame;
  try {
    game = parseGame(pgn, { startRule: 'game' });
  } catch (e) {
    throw new Error(
      `Could not parse opening PGN: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (!game.moves?.length) {
    throw new Error('PGN contains no moves.');
  }

  const state: WalkState = {
    positions: [],
    report: emptyReport(),
  };

  walkMoves(
    game.moves,
    new Chess(),
    sideToTrain,
    {
      parentTrainableId: null,
      lastOpponentSan: null,
      lastOpponentUci: null,
      lastOpponentComment: null,
      isMainline: true,
      linePath: 'main',
      plyOffset: 0,
    },
    state,
  );

  if (state.positions.length === 0) {
    throw new Error('No trainable positions found for the chosen side.');
  }

  return {
    positions: state.positions,
    importReport: state.report,
  };
}

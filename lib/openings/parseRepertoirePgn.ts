import { Chess } from 'chess.js';
import type { OpeningAnnotation, OpeningSide } from '@/lib/types';

export interface ParsedOpeningPosition {
  id: string;
  fen: string;
  expected_move_san: string;
  expected_move_uci: string;
  parent_position_id: string | null;
  line_path: string;
  ply_index: number;
  opponent_move_san: string | null;
  is_mainline: boolean;
  annotation: OpeningAnnotation | null;
  priority_weight: number;
}

interface MoveToken {
  san: string;
  annotation: OpeningAnnotation | null;
}

function stripHeaders(pgn: string): string {
  return pgn
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('['))
    .join('\n');
}

function stripVariations(text: string): string {
  let result = '';
  let depth = 0;
  for (const ch of text) {
    if (ch === '(') depth++;
    else if (ch === ')') { if (depth > 0) depth--; }
    else if (depth === 0) result += ch;
  }
  return result;
}

function extractMoveTokens(pgn: string): MoveToken[] {
  if (/^\s*\[FEN\s+/m.test(pgn) || /^\s*\[SetUp\s+"1"\s*\]/m.test(pgn)) {
    throw new Error('Custom starting FEN PGNs are not supported.');
  }

  const movetext = stripVariations(stripHeaders(pgn))
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/;[^\n\r]*/g, ' ')
    .replace(/\$\d+/g, ' ')
    .replace(/\d+\.(\.\.)?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!movetext) return [];

  return movetext
    .split(' ')
    .filter((token) => token && !['1-0', '0-1', '1/2-1/2', '*'].includes(token))
    .map((token) => {
      const suffixMatch = token.match(/([!?]{1,2})$/);
      const suffix = suffixMatch?.[1] ?? '';
      // Strip ? annotations silently; only keep ! and !!
      const annotation: OpeningAnnotation | null = (suffix === '!' || suffix === '!!') ? (suffix as OpeningAnnotation) : null;
      const san = suffix ? token.slice(0, -suffix.length) : token;
      return { san, annotation };
    })
    .filter((token) => Boolean(token.san));
}

function priorityFor(annotation: OpeningAnnotation | null): number {
  if (annotation === '!!') return 18;
  if (annotation === '!') return 14;
  return 10;
}

function uciFromMove(move: { from: string; to: string; promotion?: string }): string {
  return `${move.from}${move.to}${move.promotion ?? ''}`;
}

function buildMainlinePgn(pgn: string): string {
  const headers = pgn
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith('['))
    .join('\n');
  const movetext = stripVariations(stripHeaders(pgn))
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/;[^\n\r]*/g, ' ')
    .replace(/\$\d+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (headers ? headers + '\n\n' : '') + movetext;
}

export function parseRepertoirePgn(
  pgn: string,
  sideToTrain: OpeningSide,
): ParsedOpeningPosition[] {
  const tokens = extractMoveTokens(pgn);
  if (tokens.length === 0) {
    throw new Error('PGN contains no moves.');
  }

  // Build a mainline-only PGN for chess.js (deeply nested variations crash its parser)
  const mainlinePgn = buildMainlinePgn(pgn);
  const chess = new Chess();
  try {
    chess.loadPgn(mainlinePgn);
  } catch (e) {
    throw new Error(
      `Could not parse PGN: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const history = chess.history({ verbose: true });
  if (history.length !== tokens.length) {
    throw new Error('Could not safely align PGN moves with annotations.');
  }

  const trainColor = sideToTrain === 'white' ? 'w' : 'b';
  const replay = new Chess();
  const positions: ParsedOpeningPosition[] = [];
  let lastTrainablePositionId: string | null = null;
  let previousMoveSan: string | null = null;

  for (let i = 0; i < history.length; i++) {
    const move = history[i];
    const token = tokens[i];
    const fenBefore = replay.fen();
    const turn = replay.turn();
    const played = replay.move(move.san);

    if (turn === trainColor) {
      const id = crypto.randomUUID();
      positions.push({
        id,
        fen: fenBefore,
        expected_move_san: played.san,
        expected_move_uci: uciFromMove(played),
        parent_position_id: lastTrainablePositionId,
        line_path: `main.${positions.length}`,
        ply_index: i,
        opponent_move_san: previousMoveSan,
        is_mainline: true,
        annotation: token.annotation,
        priority_weight: priorityFor(token.annotation),
      });
      lastTrainablePositionId = id;
    }

    previousMoveSan = played.san;
  }

  if (positions.length === 0) {
    throw new Error('No trainable positions found for the chosen side.');
  }

  return positions;
}

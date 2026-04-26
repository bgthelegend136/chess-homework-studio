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

function extractMoveTokens(pgn: string): MoveToken[] {
  if (/[()]/.test(pgn)) {
    throw new Error(
      'This MVP supports mainline PGNs only. Remove parenthesized variations and try again.',
    );
  }
  if (/^\s*\[FEN\s+/m.test(pgn) || /^\s*\[SetUp\s+"1"\s*\]/m.test(pgn)) {
    throw new Error('Custom starting FEN PGNs are not supported in this MVP.');
  }

  const movetext = stripHeaders(pgn)
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/;[^\n\r]*/g, ' ')
    .replace(/\$\d+/g, ' ')
    .replace(/\d+\.(\.\.)?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!movetext) return [];

  return movetext
    .split(' ')
    .filter((token) => !['1-0', '0-1', '1/2-1/2', '*'].includes(token))
    .map((token) => {
      const suffixMatch = token.match(/([!?]{1,2})$/);
      const suffix = suffixMatch?.[1] ?? '';
      if (suffix.includes('?')) {
        throw new Error(
          'Only ! and !! annotations are supported in this MVP. Remove ? annotations and try again.',
        );
      }
      const annotation = suffix === '!' || suffix === '!!' ? suffix : null;
      return {
        san: annotation ? token.slice(0, -annotation.length) : token,
        annotation,
      };
    });
}

function priorityFor(annotation: OpeningAnnotation | null): number {
  if (annotation === '!!') return 18;
  if (annotation === '!') return 14;
  return 10;
}

function uciFromMove(move: { from: string; to: string; promotion?: string }): string {
  return `${move.from}${move.to}${move.promotion ?? ''}`;
}

export function parseRepertoirePgn(
  pgn: string,
  sideToTrain: OpeningSide,
): ParsedOpeningPosition[] {
  const tokens = extractMoveTokens(pgn);
  if (tokens.length === 0) {
    throw new Error('PGN contains no moves.');
  }

  const chess = new Chess();
  try {
    chess.loadPgn(pgn.trim());
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

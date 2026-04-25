import { Chess } from 'chess.js';

export interface Ply {
  index: number;
  moveNumber: number;
  color: 'w' | 'b';
  san: string;
  fen: string;
}

export interface ParseResult {
  plies: Ply[];
  startFen: string;
}

export function parsePgn(pgn: string): ParseResult {
  const chess = new Chess();

  // Minimal pre-sanitation: normalize whitespace only
  const sanitized = pgn.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  try {
    chess.loadPgn(sanitized);
  } catch (e) {
    throw new Error(
      `Could not parse PGN: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const history = chess.history({ verbose: true });

  if (history.length === 0) {
    throw new Error(
      'PGN contains no moves. Please paste a game with at least one move.',
    );
  }

  // Replay from scratch to get accurate FEN at every ply
  const replay = new Chess();
  const startFen = replay.fen();

  const plies: Ply[] = [];
  for (let i = 0; i < history.length; i++) {
    const move = history[i];
    replay.move(move.san);
    plies.push({
      index: i,
      moveNumber: Math.floor(i / 2) + 1,
      color: move.color as 'w' | 'b',
      san: move.san,
      fen: replay.fen(),
    });
  }

  return { plies, startFen };
}

export function plyLabel(ply: Ply): string {
  return ply.color === 'w'
    ? `${ply.moveNumber}. ${ply.san}`
    : `${ply.moveNumber}...${ply.san}`;
}

export function sideToMoveFromFen(fen: string): 'w' | 'b' {
  return fen.split(' ')[1] as 'w' | 'b';
}

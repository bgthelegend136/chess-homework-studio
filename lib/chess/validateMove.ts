import { Chess } from 'chess.js';

export interface MoveResult {
  san: string;
  from: string;
  to: string;
  afterFen: string;
}

export function validateMove(
  fen: string,
  from: string,
  to: string,
): MoveResult | null {
  try {
    const chess = new Chess(fen);
    const move = chess.move({ from, to, promotion: 'q' });
    if (!move) return null;
    return {
      san: move.san,
      from: move.from,
      to: move.to,
      afterFen: chess.fen(),
    };
  } catch {
    return null;
  }
}

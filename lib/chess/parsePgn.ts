import { Chess } from 'chess.js';

const { parseGame } = require('@mliebelt/pgn-parser') as {
  parseGame: (pgn: string, options?: { startRule?: string }) => ParsedPgnGame;
};

interface ParsedPgnMove {
  moveNumber: number | null;
  notation?: { notation?: string };
  variations?: ParsedPgnMove[][];
  commentDiag?: {
    comment?: string;
  } | null;
  commentAfter?: string;
}

interface ParsedPgnGame {
  moves?: ParsedPgnMove[];
}

export interface Ply {
  index: number;
  moveNumber: number;
  color: 'w' | 'b';
  san: string;
  fen: string;
}

export interface PgnMoveNode extends Ply {
  id: string;
  fenBefore: string;
  parentId: string | null;
  children: PgnMoveNode[];
  variations: PgnMoveNode[][];
  isMainline: boolean;
  comment: string | null;
  label: string;
  depth: number;
}

export interface ParseResult {
  plies: Ply[];
  startFen: string;
  moveTree?: PgnMoveNode[];
  moveNodes?: PgnMoveNode[];
}

function hasUnsupportedStartPosition(pgn: string): boolean {
  return /^\s*\[FEN\s+"[^"]+"\s*\]/m.test(pgn) || /^\s*\[SetUp\s+"1"\s*\]/m.test(pgn);
}

function hasMultipleGames(pgn: string): boolean {
  const eventHeaders = pgn.match(/^\s*\[Event\s+"[^"]*"\s*\]/gm);
  if (eventHeaders && eventHeaders.length > 1) return true;

  return /(1-0|0-1|1\/2-1\/2|\*)\s*\n\s*\[[A-Za-z0-9_]+\s+"/.test(pgn);
}

function stripAnnotationSuffix(san: string): string {
  return san.replace(/[!?]+$/g, '');
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

function mainlineSansFromParsedGame(game: ParsedPgnGame): string[] {
  return (game.moves ?? [])
    .map((move) => move.notation?.notation)
    .filter((san): san is string => Boolean(san))
    .map(stripAnnotationSuffix);
}

function plyFromMove(index: number, move: ReturnType<Chess['move']>, fen: string): Ply {
  return {
    index,
    moveNumber: Math.floor(index / 2) + 1,
    color: move.color as 'w' | 'b',
    san: move.san,
    fen,
  };
}

interface TreeBuildState {
  nodes: PgnMoveNode[];
  nextIndex: number;
}

function buildMoveTreeFromParsedMoves(
  moves: ParsedPgnMove[],
  chess: Chess,
  parentId: string | null,
  path: string,
  depth: number,
  isMainline: boolean,
  state: TreeBuildState,
): PgnMoveNode[] {
  const nodes: PgnMoveNode[] = [];
  let previousNodeId = parentId;

  for (let moveIndex = 0; moveIndex < moves.length; moveIndex++) {
    const parsedMove = moves[moveIndex];
    const parsedSan = parsedMove.notation?.notation;
    if (!parsedSan) continue;

    const san = stripAnnotationSuffix(parsedSan);
    const fenBefore = chess.fen();
    const nodePath = `${path}.${String(moveIndex).padStart(4, '0')}`;

    let move: ReturnType<Chess['move']>;
    try {
      move = chess.move(san);
    } catch (e) {
      throw new Error(
        `Could not parse PGN: illegal move ${parsedMove.moveNumber ?? '?'} ${san}${
          e instanceof Error ? ` (${e.message})` : ''
        }`,
      );
    }

    if (!move) {
      throw new Error(
        `Could not parse PGN: illegal move ${parsedMove.moveNumber ?? '?'} ${san}`,
      );
    }

    const ply = plyFromMove(state.nextIndex, move, chess.fen());
    state.nextIndex++;

    const node: PgnMoveNode = {
      ...ply,
      id: nodePath,
      fenBefore,
      parentId: previousNodeId,
      children: [],
      variations: [],
      isMainline,
      comment: cleanComment(parsedMove.commentDiag?.comment ?? parsedMove.commentAfter),
      label: plyLabel(ply),
      depth,
    };

    state.nodes.push(node);
    nodes.push(node);

    for (
      let variationIndex = 0;
      variationIndex < (parsedMove.variations ?? []).length;
      variationIndex++
    ) {
      const variationMoves = parsedMove.variations?.[variationIndex] ?? [];
      const variationChess = new Chess(fenBefore);
      const variationNodes = buildMoveTreeFromParsedMoves(
        variationMoves,
        variationChess,
        previousNodeId,
        `${nodePath}.var${String(variationIndex).padStart(4, '0')}`,
        depth + 1,
        false,
        state,
      );
      if (variationNodes.length > 0) node.variations.push(variationNodes);
    }

    previousNodeId = node.id;
  }

  for (let i = 0; i < nodes.length - 1; i++) {
    nodes[i].children.push(nodes[i + 1]);
  }

  return nodes;
}

function parseVariationTree(pgn: string): Pick<ParseResult, 'moveTree' | 'moveNodes'> | null {
  try {
    const game = parseGame(pgn, { startRule: 'game' });
    if (!game.moves?.length) return null;
    const state: TreeBuildState = { nodes: [], nextIndex: 0 };
    const moveTree = buildMoveTreeFromParsedMoves(
      game.moves,
      new Chess(),
      null,
      'main',
      0,
      true,
      state,
    );
    return { moveTree, moveNodes: state.nodes };
  } catch {
    return null;
  }
}

function removeHeaders(pgn: string): string {
  return pgn
    .split('\n')
    .filter((line) => !/^\s*\[[A-Za-z0-9_]+\s+".*"\s*\]\s*$/.test(line))
    .join('\n');
}

function collectMainlineText(pgn: string): string {
  let braceDepth = 0;
  let parenDepth = 0;
  let output = '';

  for (const char of removeHeaders(pgn)) {
    if (braceDepth > 0) {
      if (char === '}') braceDepth--;
      continue;
    }

    if (char === '{') {
      braceDepth++;
      continue;
    }

    if (parenDepth > 0) {
      if (char === '(') parenDepth++;
      if (char === ')') parenDepth--;
      continue;
    }

    if (char === '(') {
      parenDepth++;
      continue;
    }

    output += char;
  }

  return output;
}

function isMoveNumberToken(token: string): boolean {
  return /^\d+\.(\.\.)?$/.test(token) || /^\d+\.\.\.$/.test(token);
}

function isResultToken(token: string): boolean {
  return token === '*' || token === '1-0' || token === '0-1' || token === '1/2-1/2';
}

function isNagToken(token: string): boolean {
  return /^\$\d+$/.test(token);
}

function mainlineSansFromFallbackScanner(pgn: string): string[] {
  const mainlineText = collectMainlineText(pgn);
  const sans: string[] = [];

  for (const rawToken of mainlineText.split(/\s+/)) {
    const token = rawToken.trim();
    if (!token) continue;

    if (isMoveNumberToken(token) || isResultToken(token) || isNagToken(token)) {
      continue;
    }

    const tokenWithoutMoveNumber = token.replace(/^\d+\.(\.\.)?/, '');
    if (
      !tokenWithoutMoveNumber ||
      isResultToken(tokenWithoutMoveNumber) ||
      isNagToken(tokenWithoutMoveNumber)
    ) {
      continue;
    }

    sans.push(stripAnnotationSuffix(tokenWithoutMoveNumber));
  }

  return sans;
}

function extractMainlineSans(pgn: string): string[] {
  try {
    const game = parseGame(pgn, { startRule: 'game' });
    const sans = mainlineSansFromParsedGame(game);
    if (sans.length > 0) return sans;
  } catch {
    // Fall back to a conservative mainline-only scanner below.
  }

  return mainlineSansFromFallbackScanner(pgn);
}

function replaySans(sans: string[]): ParseResult {
  if (sans.length === 0) {
    throw new Error(
      'PGN contains no moves. Please paste a game with at least one move.',
    );
  }

  const replay = new Chess();
  const startFen = replay.fen();
  const plies: Ply[] = [];

  for (let i = 0; i < sans.length; i++) {
    const san = sans[i];
    const moveNumber = Math.floor(i / 2) + 1;

    let move: ReturnType<Chess['move']>;
    try {
      move = replay.move(san);
    } catch (e) {
      throw new Error(
        `Could not parse PGN: illegal move ${moveNumber}${i % 2 === 0 ? '.' : '...'} ${san}${
          e instanceof Error ? ` (${e.message})` : ''
        }`,
      );
    }

    if (!move) {
      throw new Error(
        `Could not parse PGN: illegal move ${moveNumber}${i % 2 === 0 ? '.' : '...'} ${san}`,
      );
    }

    plies.push({
      index: i,
      moveNumber,
      color: move.color as 'w' | 'b',
      san: move.san,
      fen: replay.fen(),
    });
  }

  return { plies, startFen };
}

export function parsePgn(pgn: string): ParseResult {
  const sanitized = pgn.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  if (hasUnsupportedStartPosition(sanitized)) {
    throw new Error(
      'Could not parse PGN: custom starting FEN PGNs are not supported for homework assignments.',
    );
  }

  if (hasMultipleGames(sanitized)) {
    throw new Error(
      'Could not parse PGN: multiple games are not supported for homework assignments. Please paste one game.',
    );
  }

  const result = replaySans(extractMainlineSans(sanitized));
  const tree = parseVariationTree(sanitized);

  return tree ? { ...result, ...tree } : result;
}

export function plyLabel(ply: Ply): string {
  return ply.color === 'w'
    ? `${ply.moveNumber}. ${ply.san}`
    : `${ply.moveNumber}...${ply.san}`;
}

export function sideToMoveFromFen(fen: string): 'w' | 'b' {
  return fen.split(' ')[1] as 'w' | 'b';
}

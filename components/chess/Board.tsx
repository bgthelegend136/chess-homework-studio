'use client';
import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess, type Square } from 'chess.js';

interface BoardProps {
  fen: string;
  orientation?: 'white' | 'black';
  onPieceDrop?: (from: string, to: string) => boolean;
  draggable?: boolean;
  width?: number;
  arrows?: Array<[string, string, string?]>;
}

export function Board({
  fen,
  orientation = 'white',
  onPieceDrop,
  draggable = false,
  width = 480,
  arrows,
}: BoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [boardWidth, setBoardWidth] = useState(width);
  const [activeSquare, setActiveSquare] = useState<string | null>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    function updateWidth() {
      const available = node?.clientWidth || width;
      setBoardWidth(Math.max(180, Math.floor(Math.min(width, available))));
    }

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, [width]);

  useEffect(() => {
    setActiveSquare(null);
  }, [fen]);

  function getLegalTargets(square: string | null): string[] {
    if (!square || !draggable) return [];
    try {
      const chess = new Chess(fen);
      return chess
        .moves({ square: square as Square, verbose: true })
        .map((move) => move.to);
    } catch {
      return [];
    }
  }

  function getCheckedKingSquare(): string | null {
    try {
      const chess = new Chess(fen);
      if (!chess.isCheck()) return null;
      const turn = chess.turn();
      for (const row of chess.board()) {
        for (const piece of row) {
          if (piece?.type === 'k' && piece.color === turn) {
            return piece.square;
          }
        }
      }
    } catch {
      return null;
    }
    return null;
  }

  function canSelectSquare(square: string, piece: string | undefined): boolean {
    if (!draggable || !piece) return false;
    try {
      const chess = new Chess(fen);
      const boardPiece = chess.get(square as Square);
      return boardPiece?.color === chess.turn();
    } catch {
      return false;
    }
  }

  function handleSquareClick(square: string, piece: string | undefined) {
    const targets = getLegalTargets(activeSquare);
    if (activeSquare && targets.includes(square) && onPieceDrop) {
      onPieceDrop(activeSquare, square);
      setActiveSquare(null);
      return;
    }

    if (canSelectSquare(square, piece)) {
      setActiveSquare(square);
      return;
    }

    setActiveSquare(null);
  }

  const legalTargets = getLegalTargets(activeSquare);
  const checkedKingSquare = getCheckedKingSquare();
  const customSquareStyles: Record<string, CSSProperties> = {};

  if (checkedKingSquare) {
    customSquareStyles[checkedKingSquare] = {
      background:
        'radial-gradient(circle, rgba(220,38,38,0.72) 0%, rgba(220,38,38,0.35) 46%, rgba(220,38,38,0.12) 72%)',
      boxShadow: 'inset 0 0 0 3px rgba(185,28,28,0.75)',
    };
  }

  if (activeSquare) {
    customSquareStyles[activeSquare] = {
      ...customSquareStyles[activeSquare],
      backgroundColor: 'rgba(250, 204, 21, 0.55)',
      boxShadow: 'inset 0 0 0 3px rgba(217,119,6,0.75)',
    };
  }

  for (const target of legalTargets) {
    customSquareStyles[target] = {
      ...customSquareStyles[target],
      background:
        'radial-gradient(circle, rgba(34,197,94,0.55) 0%, rgba(34,197,94,0.36) 24%, transparent 28%)',
    };
  }

  return (
    <div ref={containerRef} style={{ width, maxWidth: '100%' }}>
      <Chessboard
        position={fen}
        boardOrientation={orientation}
        onPieceDrop={onPieceDrop}
        onPieceDragBegin={(_piece, sourceSquare) => setActiveSquare(sourceSquare)}
        onPieceDragEnd={() => setActiveSquare(null)}
        onSquareClick={handleSquareClick}
        arePiecesDraggable={draggable}
        boardWidth={boardWidth}
        customArrows={arrows as unknown as undefined}
        customSquareStyles={customSquareStyles}
        customBoardStyle={{
          borderRadius: '4px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
        }}
        customDarkSquareStyle={{ backgroundColor: '#b58863' }}
        customLightSquareStyle={{ backgroundColor: '#f0d9b5' }}
      />
    </div>
  );
}

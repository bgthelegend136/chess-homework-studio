'use client';
import type { PgnMoveNode, Ply } from '@/lib/chess/parsePgn';

interface MoveListProps {
  plies: Ply[];
  selectedIndex: number;
  moveTree?: PgnMoveNode[];
  selectedNodeId?: string | null;
  questionFens?: Set<string>;
  questionPlyIndices?: Set<number>;
  onSelect: (index: number) => void;
  onSelectNode?: (id: string) => void;
  readOnly?: boolean;
}

export function MoveList({
  plies,
  selectedIndex,
  moveTree = [],
  selectedNodeId = null,
  questionFens = new Set(),
  questionPlyIndices = new Set(),
  onSelect,
  onSelectNode,
  readOnly = false,
}: MoveListProps) {
  if (plies.length === 0) {
    return (
      <p className="text-sm text-stone-400 text-center py-6">
        Paste a PGN to see moves
      </p>
    );
  }

  if (moveTree.length > 0 && onSelectNode) {
    const nodeClass = (node: PgnMoveNode) => {
      const isSelected = node.id === selectedNodeId;
      const hasQuestion = questionFens.has(node.fen);
      return [
        'px-1.5 py-0.5 rounded text-sm font-mono cursor-pointer transition-colors',
        isSelected
          ? 'bg-amber-100 text-amber-900 font-semibold ring-1 ring-amber-400'
          : 'text-stone-700 hover:bg-stone-100',
        hasQuestion ? 'underline decoration-amber-500 decoration-2' : '',
      ].join(' ');
    };

    const selectNode = onSelectNode;
    const renderLine = (nodes: PgnMoveNode[], depth: number): React.ReactNode => {
      const rows: React.ReactNode[] = [];
      let row: React.ReactNode[] = [];
      let rowMoveNumber: number | null = null;

      function flushRow(key: string) {
        if (row.length === 0) return;
        rows.push(
          <div
            key={key}
            className="flex flex-wrap items-center gap-x-1 gap-y-0.5 border-l border-stone-200 pl-2"
            style={{ marginLeft: depth * 14 }}
          >
            <span className="w-7 shrink-0 text-right text-xs text-stone-400 font-mono">
              {rowMoveNumber}.
            </span>
            {row}
          </div>,
        );
        row = [];
        rowMoveNumber = null;
      }

      nodes.forEach((node) => {
        if (rowMoveNumber === null) rowMoveNumber = node.moveNumber;
        if (rowMoveNumber !== node.moveNumber || node.color === 'w') {
          flushRow(`row-${node.id}`);
          rowMoveNumber = node.moveNumber;
        }

        if (node.color === 'b' && row.length === 0) {
          row.push(
            <span key={`${node.id}-ellipsis`} className="px-1 text-stone-300">
              ...
            </span>,
          );
        }

        row.push(
          <button
            key={node.id}
            className={nodeClass(node)}
            onClick={() => selectNode(node.id)}
            title={readOnly ? undefined : 'Click to view position - Q to add question'}
          >
            {node.san}
            {questionFens.has(node.fen) && (
              <span className="ml-1 text-amber-500 text-xs">*</span>
            )}
          </button>,
        );

        node.variations.forEach((variation, variationIndex) => {
          flushRow(`before-var-${node.id}-${variationIndex}`);
          rows.push(
            <div key={`var-${node.id}-${variationIndex}`} className="my-0.5">
              {renderLine(variation, depth + 1)}
            </div>,
          );
        });
      });

      flushRow(`end-${nodes[nodes.length - 1]?.id ?? depth}`);
      return rows;
    };

    return (
      <div className="flex flex-col gap-0.5 text-sm select-none">
        {renderLine(moveTree, 0)}
      </div>
    );
  }

  // Group into move pairs for display
  const movePairs: Array<{ moveNumber: number; white?: Ply; black?: Ply }> = [];
  for (let i = 0; i < plies.length; i++) {
    const ply = plies[i];
    if (ply.color === 'w') {
      movePairs.push({ moveNumber: ply.moveNumber, white: ply });
    } else {
      const last = movePairs[movePairs.length - 1];
      if (last && last.moveNumber === ply.moveNumber) {
        last.black = ply;
      } else {
        movePairs.push({ moveNumber: ply.moveNumber, black: ply });
      }
    }
  }

  const chipClass = (ply: Ply) => {
    const isSelected = ply.index === selectedIndex;
    const hasQuestion = questionPlyIndices.has(ply.index);
    return [
      'px-2 py-0.5 rounded text-sm font-mono cursor-pointer transition-colors',
      isSelected
        ? 'bg-amber-100 text-amber-900 font-semibold ring-1 ring-amber-400'
        : 'text-stone-700 hover:bg-stone-100',
      hasQuestion ? 'underline decoration-amber-500 decoration-2' : '',
    ].join(' ');
  };

  return (
    <div className="flex flex-col gap-0.5 text-sm select-none">
      {movePairs.map(({ moveNumber, white, black }) => (
        <div key={moveNumber} className="flex items-center gap-1">
          <span className="w-7 shrink-0 text-right text-xs text-stone-400 font-mono">
            {moveNumber}.
          </span>
          {white ? (
            <button
              className={chipClass(white)}
              onClick={() => onSelect(white.index)}
              title={readOnly ? undefined : 'Click to view position • Q to add question'}
            >
              {white.san}
              {questionPlyIndices.has(white.index) && (
                <span className="ml-1 text-amber-500 text-xs">★</span>
              )}
            </button>
          ) : (
            <span className="px-2 py-0.5 text-stone-300">…</span>
          )}
          {black ? (
            <button
              className={chipClass(black)}
              onClick={() => onSelect(black.index)}
              title={readOnly ? undefined : 'Click to view position • Q to add question'}
            >
              {black.san}
              {questionPlyIndices.has(black.index) && (
                <span className="ml-1 text-amber-500 text-xs">★</span>
              )}
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { MoveList } from '@/components/chess/MoveList';
import { parsePgn } from '@/lib/chess/parsePgn';
import type { CreatorAction, CreatorState } from '@/creator-state/reducer';

interface PgnPanelProps {
  state: CreatorState;
  dispatch: React.Dispatch<CreatorAction>;
  onPgnSave: (pgn: string) => Promise<void>;
  readOnly?: boolean;
}

export function PgnPanel({
  state,
  dispatch,
  onPgnSave,
  readOnly = state.readOnly,
}: PgnPanelProps) {
  const [editing, setEditing] = useState(!state.pgn);
  const [draft, setDraft] = useState(state.pgn);
  const [localError, setLocalError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const questionPlyIndices = new Set(
    state.questions
      .map((q) => {
        const ply = state.plies.find((p) => p.fen === q.fen);
        return ply?.index ?? -1;
      })
      .filter((i) => i !== -1),
  );
  const questionFens = new Set(state.questions.map((q) => q.fen));

  function handleParse() {
    setLocalError(null);
    if (!draft.trim()) {
      setLocalError('Please paste a PGN first.');
      return;
    }
    if (state.questions.length > 0) {
      const ok = window.confirm(
        'Re-parsing will update the move list. Existing question positions may no longer match. Continue?',
      );
      if (!ok) return;
    }
    try {
      const result = parsePgn(draft);
      dispatch({ type: 'PGN_PARSED', pgn: draft, ...result });
      setEditing(false);
      setSaving(true);
      onPgnSave(draft).finally(() => setSaving(false));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLocalError(msg);
      dispatch({ type: 'PGN_PARSE_ERROR', pgn: draft, error: msg });
    }
  }

  if (editing || !state.plies.length) {
    return (
      <div className="flex flex-col gap-3">
        <label
          htmlFor="pgn-input"
          className="text-xs font-medium uppercase tracking-wide text-stone-500"
        >
          PGN
        </label>
        <textarea
          id="pgn-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={7}
          placeholder={`[Event "..."]\n1. e4 e5 2. Nf3 ...`}
          className="w-full resize-none rounded border border-stone-300 bg-white px-3 py-2 text-xs font-mono text-stone-800 placeholder:text-stone-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          disabled={readOnly}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleParse();
          }}
        />
        {(localError || state.parseError) && (
          <p className="rounded border border-red-100 bg-red-50 p-2 text-xs text-red-600">
            {localError ?? state.parseError}
          </p>
        )}
        {!readOnly && (
          <Button variant="secondary" onClick={handleParse} disabled={saving}>
            {saving ? 'Saving...' : 'Paste / re-parse'}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium uppercase tracking-wide text-stone-500">
          Move list
        </label>
        {!readOnly && (
          <button
            onClick={() => {
              setDraft(state.pgn);
              setEditing(true);
            }}
            className="text-xs text-stone-400 transition-colors hover:text-stone-600"
          >
            edit PGN
          </button>
        )}
      </div>
      <p className="text-xs text-stone-400">
        Click a move to jump the board{readOnly ? '' : ' - Q to add question'}
      </p>
      <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden pr-1">
        <MoveList
          plies={state.plies}
          moveTree={state.moveTree}
          selectedIndex={state.selectedPlyIndex}
          selectedNodeId={state.selectedNodeId}
          questionPlyIndices={questionPlyIndices}
          questionFens={questionFens}
          onSelect={(index) => dispatch({ type: 'SELECT_PLY', index })}
          onSelectNode={(id) => dispatch({ type: 'SELECT_NODE', id })}
          readOnly={readOnly}
        />
      </div>
    </div>
  );
}

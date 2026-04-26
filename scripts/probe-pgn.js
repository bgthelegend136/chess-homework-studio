// Development verification script for the opening trainer parser.
// Run with: node scripts/probe-pgn.js [white|black] [fixture-path]
// Defaults to white + both fixtures.

const { parseGame } = require('@mliebelt/pgn-parser');
const { Chess } = require('chess.js');
const fs = require('fs');
const path = require('path');

// ── NAG → annotation map ─────────────────────────────────────────────────────
const NAG_ANNOTATION = { 1: '!', 3: '!!' };

// ── Strip Lichess/CB visual markup from comment text ──────────────────────────
function cleanComment(raw) {
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

// ── Walk the PGN move tree, emitting trainable positions ─────────────────────
function walkMoves(moves, chess, sideToTrain, parentId, isMainline, linePath, report) {
  const trainColor = sideToTrain === 'white' ? 'w' : 'b';
  const positions = [];
  let lastTrainableId = parentId;
  let lastOpponentSan = null;
  let lastOpponentUci = null;

  for (const move of moves) {
    const san = move.notation.notation;
    const fenBefore = chess.fen();
    const turn = chess.turn();

    // Validate and apply the move
    let played;
    try {
      played = chess.move(san);
    } catch {
      report.warnings.push(`Illegal SAN "${san}" at path ${linePath} — branch skipped`);
      report.skipped_branches++;
      return positions; // abandon this subtree
    }

    const uci = `${played.from}${played.to}${played.promotion ?? ''}`;

    // Extract annotation from NAG
    const nagArr = move.nag ? (Array.isArray(move.nag) ? move.nag : [move.nag]) : [];
    const annotation = nagArr.reduce((acc, n) => {
      const num = typeof n === 'object' ? n.value ?? n : n;
      return NAG_ANNOTATION[num] ?? acc;
    }, null);

    // Extract and clean comment
    const rawComment = move.commentDiag?.comment ?? null;
    const hasMarkup = (move.commentDiag?.colorFields?.length > 0) ||
                      (move.commentDiag?.colorArrows?.length > 0);
    const comment = cleanComment(rawComment);
    if (hasMarkup) report.comments_stripped_markup++;
    if (comment) report.comments_preserved++;

    if (turn === trainColor) {
      const id = `pos_${positions.length + report.trainable_positions}`;
      const pos = {
        id,
        fen: fenBefore,
        expected_move_san: played.san,
        expected_move_uci: uci,
        parent_position_id: lastTrainableId,
        line_path: linePath,
        ply_index: (move.moveNumber - 1) * 2 + (turn === 'w' ? 0 : 1),
        opponent_move_san: lastOpponentSan,
        opponent_move_uci: lastOpponentUci,
        is_mainline: isMainline,
        annotation,
        comment,
        priority_weight: 10 + (annotation === '!!' ? 8 : annotation === '!' ? 4 : 0) + (isMainline ? 6 : 0),
      };
      positions.push(pos);
      lastTrainableId = id;
      report.trainable_positions++;
      if (isMainline) report.mainline_positions++;
      else report.variation_positions++;
    }

    lastOpponentSan = turn !== trainColor ? played.san : lastOpponentSan;
    lastOpponentUci = turn !== trainColor ? uci : lastOpponentUci;

    // Recurse into variations (each uses a fresh Chess clone at the state BEFORE this move)
    for (let vi = 0; vi < (move.variations ?? []).length; vi++) {
      report.branches_detected++;
      const varChess = new Chess(fenBefore);
      const varPath = `${linePath}.var${vi}`;
      const subPositions = walkMoves(
        move.variations[vi],
        varChess,
        sideToTrain,
        lastTrainableId,
        false, // variations are never mainline
        varPath,
        report,
      );
      positions.push(...subPositions);
    }
  }

  return positions;
}

// ── Probe one fixture ─────────────────────────────────────────────────────────
function probeFixture(fixturePath, sideToTrain) {
  const label = path.basename(fixturePath);
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`Fixture : ${label}`);
  console.log(`Side    : ${sideToTrain}`);
  console.log('═'.repeat(60));

  const pgn = fs.readFileSync(fixturePath, 'utf8');

  let game;
  try {
    game = parseGame(pgn, { startRule: 'game' });
  } catch (e) {
    console.error(`PARSE ERROR: ${e.message}`);
    return;
  }

  const report = {
    trainable_positions: 0,
    mainline_positions: 0,
    variation_positions: 0,
    branches_detected: 0,
    comments_preserved: 0,
    comments_stripped_markup: 0,
    warnings: [],
    skipped_branches: 0,
  };

  const chess = new Chess();
  const positions = walkMoves(game.moves, chess, sideToTrain, null, true, 'main', report);

  // Deduplicate on (fen, expected_move_san)
  const seen = new Map();
  const deduped = [];
  for (const pos of positions) {
    const key = `${pos.fen}|${pos.expected_move_san}`;
    if (!seen.has(key)) {
      seen.set(key, true);
      deduped.push(pos);
    }
  }
  const dups = positions.length - deduped.length;

  console.log(`\nImport Report`);
  console.log(`  Trainable positions : ${report.trainable_positions}${dups > 0 ? ` (${dups} duplicates removed → ${deduped.length} stored)` : ''}`);
  console.log(`  Mainline            : ${report.mainline_positions}`);
  console.log(`  Variation branches  : ${report.variation_positions}`);
  console.log(`  Branches detected   : ${report.branches_detected}`);
  console.log(`  Comments preserved  : ${report.comments_preserved}`);
  console.log(`  Markup strips       : ${report.comments_stripped_markup}`);
  if (report.skipped_branches > 0) {
    console.log(`  ⚠ Skipped branches : ${report.skipped_branches}`);
  }
  if (report.warnings.length > 0) {
    console.log(`\nWarnings:`);
    report.warnings.forEach(w => console.log(`  ⚠ ${w}`));
  }

  console.log(`\nFirst 10 trainable positions:`);
  deduped.slice(0, 10).forEach((pos, i) => {
    const mainTag = pos.is_mainline ? '[main]' : '[var] ';
    const annot = pos.annotation ? ` ${pos.annotation}` : '';
    const opp = pos.opponent_move_san ? `after ${pos.opponent_move_san} → ` : 'opening → ';
    const comment = pos.comment ? ` | "${pos.comment.slice(0, 60)}${pos.comment.length > 60 ? '…' : ''}"` : '';
    console.log(`  ${String(i + 1).padStart(2)}. ${mainTag} ${opp}${pos.expected_move_san}${annot}  (${pos.line_path})${comment}`);
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
const side = process.argv[2] || 'white';
const fixtures = process.argv[3]
  ? [process.argv[3]]
  : [
      'test-fixtures/openings/lichess-study-complex.pgn',
      'test-fixtures/openings/chessbase-complex.pgn',
    ];

for (const f of fixtures) {
  probeFixture(f, side);
}

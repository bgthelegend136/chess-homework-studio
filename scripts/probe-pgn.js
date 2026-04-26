// Development verification script for the opening trainer parser.
// Run with: node scripts/probe-pgn.js [white|black] [fixture-path]
// Defaults to white + both fixtures.

const { parseGame } = require('@mliebelt/pgn-parser');
const { Chess } = require('chess.js');
const fs = require('fs');
const path = require('path');

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

function annotationFromNag(nag) {
  const values = Array.isArray(nag) ? nag : nag ? [nag] : [];
  let annotation = null;
  for (const value of values) {
    const raw = typeof value === 'object' && value !== null ? value.value : value;
    const normalized = typeof raw === 'string' ? raw.replace(/^\$/, '') : String(raw);
    if (normalized === '3') annotation = '!!';
    if (normalized === '1' && annotation !== '!!') annotation = '!';
  }
  return annotation;
}

function uciFromMove(move) {
  return `${move.from}${move.to}${move.promotion || ''}`;
}

function pathSegment(index) {
  return String(index).padStart(4, '0');
}

function walkMoves(moves, chess, sideToTrain, context, state) {
  const trainColor = sideToTrain === 'white' ? 'w' : 'b';
  let parentTrainableId = context.parentTrainableId;
  let lastOpponentSan = context.lastOpponentSan;
  let lastOpponentUci = context.lastOpponentUci;
  let lastOpponentComment = context.lastOpponentComment;
  let plyOffset = context.plyOffset;

  for (let moveIndex = 0; moveIndex < moves.length; moveIndex++) {
    const move = moves[moveIndex];
    const san = move.notation && move.notation.notation;
    if (!san) {
      state.report.warnings.push(`Skipped a move without SAN at ${context.linePath}.${moveIndex}.`);
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

    let played;
    try {
      played = chess.move(san);
    } catch {
      state.report.warnings.push(`Illegal SAN "${san}" at ${movePath}; skipped the rest of that branch.`);
      state.report.skipped_branches++;
      break;
    }

    const comment = cleanComment(
      (move.commentDiag && move.commentDiag.comment) || move.commentAfter || null,
    );
    if (comment) state.report.comments_preserved++;

    if (turn === trainColor) {
      const positionComment = [opponentCommentBeforeMove, comment]
        .filter(Boolean)
        .join('\n\n') || null;
      const position = {
        id: `pos_${state.positions.length}`,
        fen: fenBefore,
        expected_move_san: played.san,
        expected_move_uci: uciFromMove(played),
        parent_position_id: parentBeforeMove,
        line_path: movePath,
        ply_index:
          typeof move.moveNumber === 'number'
            ? (move.moveNumber - 1) * 2 + (turn === 'w' ? 0 : 1)
            : plyBeforeMove,
        opponent_move_san: opponentSanBeforeMove,
        opponent_move_uci: opponentUciBeforeMove,
        is_mainline: context.isMainline,
        annotation: annotationFromNag(move.nag),
        comment: positionComment,
      };
      state.positions.push(position);
      state.report.trainable_positions_created++;
      if (context.isMainline) state.report.mainline_positions++;
      else state.report.variation_positions++;
      parentTrainableId = position.id;
    } else {
      lastOpponentSan = played.san;
      lastOpponentUci = uciFromMove(played);
      lastOpponentComment = comment;
    }

    for (let variationIndex = 0; variationIndex < (move.variations || []).length; variationIndex++) {
      state.report.branches_detected++;
      walkMoves(
        move.variations[variationIndex],
        new Chess(fenBefore),
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
}

function probeFixture(fixturePath, sideToTrain) {
  const label = path.basename(fixturePath);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Fixture : ${label}`);
  console.log(`Side    : ${sideToTrain}`);
  console.log('='.repeat(60));

  const pgn = fs.readFileSync(fixturePath, 'utf8');
  let game;
  try {
    game = parseGame(pgn, { startRule: 'game' });
  } catch (e) {
    console.error(`PARSE ERROR: ${e.message}`);
    return;
  }

  const state = {
    positions: [],
    report: {
      trainable_positions_created: 0,
      mainline_positions: 0,
      variation_positions: 0,
      branches_detected: 0,
      comments_preserved: 0,
      warnings: [],
      skipped_branches: 0,
      parser_mode_used: 'variation_tree',
    },
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

  console.log('\nImport Report');
  console.log(`  Trainable positions : ${state.report.trainable_positions_created}`);
  console.log(`  Mainline            : ${state.report.mainline_positions}`);
  console.log(`  Variation positions : ${state.report.variation_positions}`);
  console.log(`  Branches detected   : ${state.report.branches_detected}`);
  console.log(`  Comments preserved  : ${state.report.comments_preserved}`);
  console.log(`  Skipped branches    : ${state.report.skipped_branches}`);
  if (state.report.warnings.length > 0) {
    console.log('\nWarnings:');
    state.report.warnings.forEach((warning) => console.log(`  - ${warning}`));
  }

  console.log('\nFirst 10 trainable positions:');
  state.positions.slice(0, 10).forEach((pos, index) => {
    const mainTag = pos.is_mainline ? '[main]' : '[branch]';
    const annot = pos.annotation ? ` ${pos.annotation}` : '';
    const opp = pos.opponent_move_san ? `after ${pos.opponent_move_san} -> ` : 'opening -> ';
    const comment = pos.comment
      ? ` | "${pos.comment.slice(0, 60)}${pos.comment.length > 60 ? '...' : ''}"`
      : '';
    console.log(
      `  ${String(index + 1).padStart(2)}. ${mainTag} ${opp}${pos.expected_move_san}${annot} (${pos.line_path})${comment}`,
    );
  });
}

const side = process.argv[2] || 'white';
const fixtures = process.argv[3]
  ? [process.argv[3]]
  : [
      'test-fixtures/openings/lichess-study-complex.pgn',
      'test-fixtures/openings/chessbase-complex.pgn',
    ];

for (const fixture of fixtures) {
  probeFixture(fixture, side);
}

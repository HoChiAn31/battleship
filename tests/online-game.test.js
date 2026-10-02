import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CELL, ONLINE_PHASE, SHOT_RESULT } from '../js/constants.js';
import { createPlayer, randomizeFleet } from '../js/board.js';
import {
  applyFleet,
  createOnlineGame,
  fireAt,
  getPlayerView,
  requestRematch,
  submitFleet,
} from '../js/online-game.js';
import { generateRoomCode, isValidRoomCode, normalizeRoomCode } from '../js/net.js';

function randomFleet() {
  const player = createPlayer('tmp');
  randomizeFleet(player);
  return player.ships.map(({ id, cells }) => ({ id, cells }));
}

function findCell(player, state) {
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 10; col++) {
      if (player.board[row][col].state === state) return { row, col };
    }
  }
  return null;
}

// Player 1 (index 0) always goes first so tests are deterministic.
function gameInBattle() {
  const game = createOnlineGame();
  submitFleet(game, 0, randomFleet());
  submitFleet(game, 1, randomFleet(), () => 0);
  return game;
}

test('battle starts only after both players submit a valid fleet', () => {
  const game = createOnlineGame();
  assert.equal(game.phase, ONLINE_PHASE.SETUP);

  assert.equal(submitFleet(game, 1, randomFleet()), true);
  assert.equal(game.phase, ONLINE_PHASE.SETUP);
  assert.equal(submitFleet(game, 1, randomFleet()), false, 'cannot resubmit once ready');

  assert.equal(submitFleet(game, 0, randomFleet(), () => 0.9), true);
  assert.equal(game.phase, ONLINE_PHASE.BATTLE);
  assert.equal(game.currentPlayer, 1);
});

test('tampered fleets are rejected', () => {
  const fleet = randomFleet();

  const missingShip = fleet.slice(1);
  assert.equal(applyFleet(createPlayer('x'), missingShip), false);

  const wrongSize = fleet.map((ship, i) => (i === 0 ? { ...ship, cells: ship.cells.slice(1) } : ship));
  assert.equal(applyFleet(createPlayer('x'), wrongSize), false);

  const overlapping = fleet.map((ship, i) =>
    i === 1 ? { ...ship, cells: fleet[0].cells.slice(0, ship.cells.length) } : ship
  );
  assert.equal(applyFleet(createPlayer('x'), overlapping), false);

  const diagonal = fleet.map((ship, i) =>
    i === 4 ? { ...ship, cells: [{ row: 0, col: 0 }, { row: 1, col: 1 }] } : ship
  );
  assert.equal(applyFleet(createPlayer('x'), diagonal), false);

  assert.equal(applyFleet(createPlayer('x'), 'nope'), false);
  assert.equal(applyFleet(createPlayer('x'), fleet), true);
});

test('players can only fire on their own turn and turns alternate', () => {
  const game = gameInBattle();
  const miss = findCell(game.players[1], CELL.EMPTY);

  assert.equal(fireAt(game, 1, 0, 0), null, 'not player 2 turn');
  assert.equal(fireAt(game, 0, miss.row, miss.col).result, SHOT_RESULT.MISS);
  assert.equal(game.currentPlayer, 1);
  assert.deepEqual(game.lastShot, { by: 0, ...miss, result: SHOT_RESULT.MISS });
  assert.equal(game.shotCount, 1);

  assert.equal(fireAt(game, 0, 0, 0), null, 'cannot fire twice');
  const hit = findCell(game.players[0], CELL.SHIP);
  assert.equal(fireAt(game, 1, hit.row, hit.col).result, SHOT_RESULT.HIT);
  assert.equal(game.currentPlayer, 0);

  assert.equal(fireAt(game, 0, miss.row, miss.col).result, SHOT_RESULT.ALREADY_SHOT);
  assert.equal(game.currentPlayer, 0, 'repeat shot does not use up the turn');
  assert.equal(fireAt(game, 0, 'a', 1), null);
});

test('player view hides unsunk enemy ships until the game ends', () => {
  const game = gameInBattle();
  const view = getPlayerView(game, 0);

  assert.equal(view.me, 0);
  assert.equal(findCell(view.player, CELL.SHIP) !== null, true, 'own ships are visible');
  assert.equal(findCell(view.opponent, CELL.SHIP), null, 'enemy ships are hidden');
  assert.ok(view.opponent.ships.every((ship) => ship.cells.length === 0));

  view.player.board[0][0].state = 'CHANGED';
  assert.notEqual(game.players[0].board[0][0].state, 'CHANGED', 'view is a copy');
});

test('sinking the whole fleet ends the game, reveals boards and allows a rematch', () => {
  const game = gameInBattle();
  const targets = game.players[1].ships.flatMap((ship) => ship.cells);
  const p2Misses = [];
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 10; col++) {
      if (game.players[0].board[row][col].state === CELL.EMPTY) p2Misses.push({ row, col });
    }
  }

  targets.forEach(({ row, col }, i) => {
    assert.ok(fireAt(game, 0, row, col));
    if (i < targets.length - 1) fireAt(game, 1, p2Misses[i].row, p2Misses[i].col);
  });

  assert.equal(game.phase, ONLINE_PHASE.GAME_OVER);
  assert.equal(game.winner, 0);
  assert.equal(game.lastShot.result, SHOT_RESULT.SUNK);
  assert.equal(fireAt(game, 1, 0, 0), null);

  const loserView = getPlayerView(game, 1);
  assert.ok(findCell(loserView.opponent, CELL.SHIP), 'winner fleet revealed after the game');

  assert.equal(requestRematch(game, 0), true);
  assert.equal(game.phase, ONLINE_PHASE.GAME_OVER);
  assert.equal(requestRematch(game, 1), true);
  assert.equal(game.phase, ONLINE_PHASE.SETUP);
  assert.equal(game.round, 2);
  assert.deepEqual(game.ready, [false, false]);
});

test('room codes', () => {
  const code = generateRoomCode();
  assert.equal(code.length, 6);
  assert.equal(isValidRoomCode(code), true);
  assert.equal(normalizeRoomCode(' ab-c 12x9 '), 'ABC12X');
  assert.equal(normalizeRoomCode(null), '');
  assert.equal(isValidRoomCode('ABC'), false);
});

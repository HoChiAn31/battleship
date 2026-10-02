import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CELL, PHASE, SHOT_RESULT } from '../js/constants.js';
import { randomizeFleet } from '../js/board.js';
import {
  beginTurn,
  confirmSetup,
  continueToPlayer2Setup,
  createGame,
  endTurn,
  fire,
  getSetupPlayer,
  startBattle,
  startNewGame,
} from '../js/game.js';

function findCell(player, wantShip) {
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 10; col++) {
      const wantedState = wantShip ? CELL.SHIP : CELL.EMPTY;
      if (player.board[row][col].state === wantedState) return { row, col };
    }
  }
  return null;
}

function gameInBattle() {
  const game = startNewGame();
  randomizeFleet(game.players[0]);
  confirmSetup(game);
  continueToPlayer2Setup(game);
  randomizeFleet(game.players[1]);
  confirmSetup(game);
  startBattle(game);
  beginTurn(game);
  return game;
}

test('new game starts on the start screen', () => {
  assert.equal(createGame().phase, PHASE.START);
  assert.equal(startNewGame().phase, PHASE.PLAYER_1_SETUP);
});

test('setup flow: cannot be ready until all ships are placed', () => {
  const game = startNewGame();
  assert.equal(getSetupPlayer(game), game.players[0]);
  assert.equal(confirmSetup(game), false);
  assert.equal(game.phase, PHASE.PLAYER_1_SETUP);

  randomizeFleet(game.players[0]);
  assert.equal(confirmSetup(game), true);
  assert.equal(game.phase, PHASE.PLAYER_1_READY);
  assert.equal(getSetupPlayer(game), null);

  assert.equal(continueToPlayer2Setup(game), true);
  assert.equal(game.phase, PHASE.PLAYER_2_SETUP);
  assert.equal(getSetupPlayer(game), game.players[1]);

  randomizeFleet(game.players[1]);
  assert.equal(confirmSetup(game), true);
  assert.equal(game.phase, PHASE.BOTH_READY);

  assert.equal(startBattle(game), true);
  assert.equal(game.phase, PHASE.PASS_DEVICE);
  assert.equal(game.currentPlayer, 0);

  assert.equal(beginTurn(game), true);
  assert.equal(game.phase, PHASE.BATTLE);
});

test('turns alternate and a player can only fire once per turn', () => {
  const game = gameInBattle();
  const target = findCell(game.players[1], false);

  assert.equal(endTurn(game), false, 'cannot end turn before firing');
  assert.equal(fire(game, target.row, target.col).result, SHOT_RESULT.MISS);

  const another = findCell(game.players[1], false);
  assert.equal(fire(game, another.row, another.col), null, 'second shot is rejected');

  assert.equal(endTurn(game), true);
  assert.equal(game.currentPlayer, 1);
  assert.equal(game.phase, PHASE.PASS_DEVICE);
  assert.equal(fire(game, 0, 0), null, 'cannot fire on the pass-device screen');

  beginTurn(game);
  assert.equal(game.hasFired, false);
  assert.equal(game.lastShot, null);
  assert.deepEqual(game.incomingShot, { ...target, result: SHOT_RESULT.MISS });
  const hitTarget = findCell(game.players[0], true);
  assert.equal(fire(game, hitTarget.row, hitTarget.col).result, SHOT_RESULT.HIT);
  endTurn(game);
  assert.equal(game.currentPlayer, 0);
});

test('firing at an already shot cell does not use up the turn', () => {
  const game = gameInBattle();
  const target = findCell(game.players[1], false);
  fire(game, target.row, target.col);
  endTurn(game);
  beginTurn(game);
  const p2Target = findCell(game.players[0], false);
  fire(game, p2Target.row, p2Target.col);
  endTurn(game);
  beginTurn(game);

  assert.equal(fire(game, target.row, target.col).result, SHOT_RESULT.ALREADY_SHOT);
  assert.equal(game.hasFired, false);
  const fresh = findCell(game.players[1], false);
  assert.ok(fire(game, fresh.row, fresh.col));
  assert.equal(game.hasFired, true);
});

test('sinking every enemy ship ends the game and blocks further shots', () => {
  const game = gameInBattle();
  const enemyShipCells = game.players[1].ships.flatMap((ship) => ship.cells);

  for (const [index, { row, col }] of enemyShipCells.entries()) {
    const shot = fire(game, row, col);
    assert.ok(shot);
    if (index === enemyShipCells.length - 1) break;
    endTurn(game);
    beginTurn(game);
    const p2Target = findCell(game.players[0], false);
    fire(game, p2Target.row, p2Target.col);
    endTurn(game);
    beginTurn(game);
  }

  assert.equal(game.phase, PHASE.GAME_OVER);
  assert.equal(game.winner, 0);
  assert.equal(fire(game, 9, 9), null);
  assert.equal(endTurn(game), false);
});

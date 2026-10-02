import { PHASE, SHOT_RESULT } from './constants.js';
import { createPlayer, isFleetPlaced, isFleetSunk, receiveShot } from './board.js';

export function createGame() {
  return {
    phase: PHASE.START,
    players: [createPlayer('Player 1'), createPlayer('Player 2')],
    currentPlayer: 0,
    hasFired: false,
    lastShot: null, // shot fired by the current player this turn
    incomingShot: null, // shot the opponent fired at the current player last turn
    winner: null,
  };
}

export function startNewGame() {
  const game = createGame();
  game.phase = PHASE.PLAYER_1_SETUP;
  return game;
}

export function isSetupPhase(game) {
  return game.phase === PHASE.PLAYER_1_SETUP || game.phase === PHASE.PLAYER_2_SETUP;
}

export function getSetupPlayer(game) {
  if (game.phase === PHASE.PLAYER_1_SETUP) return game.players[0];
  if (game.phase === PHASE.PLAYER_2_SETUP) return game.players[1];
  return null;
}

export function getCurrentPlayer(game) {
  return game.players[game.currentPlayer];
}

export function getOpponent(game) {
  return game.players[1 - game.currentPlayer];
}

export function confirmSetup(game) {
  const player = getSetupPlayer(game);
  if (!player || !isFleetPlaced(player)) return false;

  game.phase = game.phase === PHASE.PLAYER_1_SETUP ? PHASE.PLAYER_1_READY : PHASE.BOTH_READY;
  return true;
}

export function continueToPlayer2Setup(game) {
  if (game.phase !== PHASE.PLAYER_1_READY) return false;
  game.phase = PHASE.PLAYER_2_SETUP;
  return true;
}

export function startBattle(game) {
  if (game.phase !== PHASE.BOTH_READY) return false;
  game.currentPlayer = 0;
  game.phase = PHASE.PASS_DEVICE;
  return true;
}

export function beginTurn(game) {
  if (game.phase !== PHASE.PASS_DEVICE) return false;
  game.phase = PHASE.BATTLE;
  game.hasFired = false;
  game.incomingShot = game.lastShot;
  game.lastShot = null;
  return true;
}

// Returns the shot result, or null when firing is not allowed right now.
export function fire(game, row, col) {
  if (game.phase !== PHASE.BATTLE || game.hasFired) return null;

  const opponent = getOpponent(game);
  const shot = receiveShot(opponent, row, col);
  if (shot.result === SHOT_RESULT.ALREADY_SHOT || shot.result === SHOT_RESULT.INVALID) {
    return shot;
  }

  game.hasFired = true;
  game.lastShot = { row, col, ...shot };

  if (isFleetSunk(opponent)) {
    game.winner = game.currentPlayer;
    game.phase = PHASE.GAME_OVER;
  }
  return shot;
}

export function endTurn(game) {
  if (game.phase !== PHASE.BATTLE || !game.hasFired) return false;
  game.currentPlayer = 1 - game.currentPlayer;
  game.phase = PHASE.PASS_DEVICE;
  return true;
}

// Online match rules. The host keeps the authoritative game; each player only ever
// receives getPlayerView(), which hides the opponent's unsunk ships.
import { CELL, ONLINE_PHASE, ORIENTATION, SHIP_STATE, SHOT_RESULT } from './constants.js';
import { createPlayer, findShip, isFleetPlaced, isFleetSunk, placeShip, receiveShot } from './board.js';

export function createOnlineGame(round = 1) {
  return {
    phase: ONLINE_PHASE.SETUP,
    round,
    players: [createPlayer('Player 1'), createPlayer('Player 2')],
    ready: [false, false],
    currentPlayer: 0,
    shotCount: 0,
    lastShot: null, // { by, row, col, result, shipName?, shipId? }
    winner: null,
    rematch: [false, false],
  };
}

// Rebuilds a fleet from [{ id, cells }] using the normal placement rules, so a
// tampered layout (overlaps, wrong sizes, off-board) is rejected.
export function applyFleet(player, ships) {
  if (!Array.isArray(ships)) return false;

  for (const entry of ships) {
    const ship = findShip(player, entry?.id);
    const cells = entry?.cells;
    if (!ship || !Array.isArray(cells) || cells.length !== ship.size) return false;
    if (!cells.every((cell) => Number.isInteger(cell?.row) && Number.isInteger(cell?.col))) return false;

    const [first, second] = cells;
    const orientation = first.row === second.row ? ORIENTATION.HORIZONTAL : ORIENTATION.VERTICAL;
    if (!placeShip(player, ship.id, first.row, first.col, orientation)) return false;

    const matches = ship.cells.every((cell, i) => cell.row === cells[i].row && cell.col === cells[i].col);
    if (!matches) return false;
  }
  return isFleetPlaced(player);
}

export function submitFleet(game, playerIndex, ships, random = Math.random) {
  if (game.phase !== ONLINE_PHASE.SETUP || game.ready[playerIndex]) return false;

  const player = createPlayer(game.players[playerIndex].name);
  if (!applyFleet(player, ships)) return false;

  game.players[playerIndex] = player;
  game.ready[playerIndex] = true;
  if (game.ready.every(Boolean)) {
    game.phase = ONLINE_PHASE.BATTLE;
    game.currentPlayer = random() < 0.5 ? 0 : 1;
  }
  return true;
}

// Returns the shot result, or null when this player may not fire right now.
export function fireAt(game, playerIndex, row, col) {
  if (game.phase !== ONLINE_PHASE.BATTLE || game.currentPlayer !== playerIndex) return null;
  if (!Number.isInteger(row) || !Number.isInteger(col)) return null;

  const opponent = game.players[1 - playerIndex];
  const shot = receiveShot(opponent, row, col);
  if (shot.result === SHOT_RESULT.ALREADY_SHOT || shot.result === SHOT_RESULT.INVALID) {
    return shot;
  }

  game.shotCount += 1;
  game.lastShot = { by: playerIndex, row, col, ...shot };

  if (isFleetSunk(opponent)) {
    game.winner = playerIndex;
    game.phase = ONLINE_PHASE.GAME_OVER;
  } else {
    game.currentPlayer = 1 - playerIndex;
  }
  return shot;
}

export function requestRematch(game, playerIndex) {
  if (game.phase !== ONLINE_PHASE.GAME_OVER) return false;

  game.rematch[playerIndex] = true;
  if (game.rematch.every(Boolean)) {
    Object.assign(game, createOnlineGame(game.round + 1));
  }
  return true;
}

function maskPlayer(player) {
  return {
    name: player.name,
    board: player.board.map((row) =>
      row.map((cell) => {
        if (cell.state === CELL.SUNK) return { ...cell };
        if (cell.state === CELL.SHIP) return { state: CELL.EMPTY, shipId: null };
        return { state: cell.state, shipId: null };
      })
    ),
    ships: player.ships.map((ship) =>
      ship.state === SHIP_STATE.SUNK
        ? structuredClone(ship)
        : { ...ship, cells: [], hits: 0 }
    ),
  };
}

export function getPlayerView(game, me) {
  const opponent = game.players[1 - me];
  return {
    phase: game.phase,
    round: game.round,
    me,
    currentPlayer: game.currentPlayer,
    shotCount: game.shotCount,
    lastShot: game.lastShot ? { ...game.lastShot } : null,
    winner: game.winner,
    ready: [...game.ready],
    rematch: [...game.rematch],
    player: structuredClone(game.players[me]),
    // The whole board is revealed once the game is over.
    opponent: game.phase === ONLINE_PHASE.GAME_OVER ? structuredClone(opponent) : maskPlayer(opponent),
  };
}

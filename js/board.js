import {
  BOARD_SIZE,
  CELL,
  ORIENTATION,
  SHIP_STATE,
  SHIP_TYPES,
  SHOT_RESULT,
} from './constants.js';

export function createBoard() {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => ({ state: CELL.EMPTY, shipId: null }))
  );
}

export function createFleet() {
  return SHIP_TYPES.map((type) => ({
    ...type,
    cells: [],
    hits: 0,
    state: SHIP_STATE.ALIVE,
  }));
}

export function createPlayer(name) {
  return { name, board: createBoard(), ships: createFleet() };
}

export function findShip(player, shipId) {
  return player.ships.find((ship) => ship.id === shipId);
}

export function isInsideBoard(row, col) {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

export function getShipCells(row, col, size, orientation) {
  const cells = [];
  for (let i = 0; i < size; i++) {
    if (orientation === ORIENTATION.HORIZONTAL) {
      cells.push({ row, col: col + i });
    } else {
      cells.push({ row: row + i, col });
    }
  }
  return cells;
}

// A cell already occupied by the same ship counts as free, so a ship can be moved
// onto a position that overlaps its old one.
export function canPlaceShip(player, shipId, row, col, orientation) {
  const ship = findShip(player, shipId);
  if (!ship) return false;

  const cells = getShipCells(row, col, ship.size, orientation);
  return cells.every((cell) => {
    if (!isInsideBoard(cell.row, cell.col)) return false;
    const boardCell = player.board[cell.row][cell.col];
    return boardCell.state === CELL.EMPTY || boardCell.shipId === shipId;
  });
}

export function removeShip(player, shipId) {
  const ship = findShip(player, shipId);
  if (!ship) return;

  for (const { row, col } of ship.cells) {
    player.board[row][col] = { state: CELL.EMPTY, shipId: null };
  }
  ship.cells = [];
}

export function placeShip(player, shipId, row, col, orientation) {
  if (!canPlaceShip(player, shipId, row, col, orientation)) return false;

  const ship = findShip(player, shipId);
  removeShip(player, shipId);
  ship.cells = getShipCells(row, col, ship.size, orientation);
  for (const cell of ship.cells) {
    player.board[cell.row][cell.col] = { state: CELL.SHIP, shipId };
  }
  return true;
}

export function resetFleet(player) {
  player.board = createBoard();
  player.ships = createFleet();
}

export function randomizeFleet(player, random = Math.random) {
  resetFleet(player);
  for (const ship of player.ships) {
    let placed = false;
    while (!placed) {
      const orientation = random() < 0.5 ? ORIENTATION.HORIZONTAL : ORIENTATION.VERTICAL;
      const row = Math.floor(random() * BOARD_SIZE);
      const col = Math.floor(random() * BOARD_SIZE);
      placed = placeShip(player, ship.id, row, col, orientation);
    }
  }
}

export function isShipPlaced(ship) {
  return ship.cells.length === ship.size;
}

export function isFleetPlaced(player) {
  return player.ships.every(isShipPlaced);
}

export function isFleetSunk(player) {
  return player.ships.every((ship) => ship.state === SHIP_STATE.SUNK);
}

export function receiveShot(player, row, col) {
  if (!isInsideBoard(row, col)) return { result: SHOT_RESULT.INVALID };

  const cell = player.board[row][col];

  if (cell.state === CELL.HIT || cell.state === CELL.MISS || cell.state === CELL.SUNK) {
    return { result: SHOT_RESULT.ALREADY_SHOT };
  }

  if (cell.state === CELL.EMPTY) {
    cell.state = CELL.MISS;
    return { result: SHOT_RESULT.MISS };
  }

  const ship = findShip(player, cell.shipId);
  cell.state = CELL.HIT;
  ship.hits += 1;

  if (ship.hits < ship.size) {
    return { result: SHOT_RESULT.HIT, shipName: ship.name };
  }

  ship.state = SHIP_STATE.SUNK;
  for (const shipCell of ship.cells) {
    player.board[shipCell.row][shipCell.col].state = CELL.SUNK;
  }
  return { result: SHOT_RESULT.SUNK, shipName: ship.name, shipId: ship.id };
}

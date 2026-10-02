import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CELL, ORIENTATION, SHIP_STATE, SHOT_RESULT } from '../js/constants.js';
import {
  canPlaceShip,
  createPlayer,
  findShip,
  isFleetPlaced,
  isFleetSunk,
  placeShip,
  randomizeFleet,
  receiveShot,
  removeShip,
  resetFleet,
} from '../js/board.js';

const { HORIZONTAL, VERTICAL } = ORIENTATION;

function shipCells(player, shipId) {
  return findShip(player, shipId).cells;
}

test('places a ship horizontally', () => {
  const player = createPlayer('P1');
  assert.equal(placeShip(player, 'carrier', 0, 0, HORIZONTAL), true);
  assert.deepEqual(shipCells(player, 'carrier'), [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
    { row: 0, col: 2 },
    { row: 0, col: 3 },
    { row: 0, col: 4 },
  ]);
  assert.equal(player.board[0][4].state, CELL.SHIP);
  assert.equal(player.board[0][4].shipId, 'carrier');
  assert.equal(player.board[0][5].state, CELL.EMPTY);
});

test('places a ship vertically', () => {
  const player = createPlayer('P1');
  assert.equal(placeShip(player, 'destroyer', 3, 7, VERTICAL), true);
  assert.deepEqual(shipCells(player, 'destroyer'), [
    { row: 3, col: 7 },
    { row: 4, col: 7 },
  ]);
  assert.equal(player.board[4][7].state, CELL.SHIP);
});

test('rejects a ship that goes outside the board', () => {
  const player = createPlayer('P1');
  assert.equal(placeShip(player, 'carrier', 0, 6, HORIZONTAL), false);
  assert.equal(placeShip(player, 'carrier', 6, 0, VERTICAL), false);
  assert.equal(placeShip(player, 'destroyer', 9, 9, HORIZONTAL), false);
  assert.equal(shipCells(player, 'carrier').length, 0);
  // Exactly touching the edge is fine.
  assert.equal(placeShip(player, 'carrier', 0, 5, HORIZONTAL), true);
  assert.equal(placeShip(player, 'battleship', 6, 0, VERTICAL), true);
});

test('rejects overlapping ships', () => {
  const player = createPlayer('P1');
  placeShip(player, 'carrier', 2, 2, HORIZONTAL);
  assert.equal(canPlaceShip(player, 'battleship', 0, 4, VERTICAL), false);
  assert.equal(placeShip(player, 'battleship', 0, 4, VERTICAL), false);
  assert.equal(shipCells(player, 'battleship').length, 0);
  assert.equal(player.board[2][4].shipId, 'carrier');
});

test('moving a ship keeps the board consistent (rotate in place)', () => {
  const player = createPlayer('P1');
  placeShip(player, 'cruiser', 4, 4, HORIZONTAL);
  // Re-placing the same ship over its own cells is allowed.
  assert.equal(placeShip(player, 'cruiser', 4, 4, VERTICAL), true);
  assert.equal(player.board[4][5].state, CELL.EMPTY);
  assert.equal(player.board[6][4].shipId, 'cruiser');
});

test('failed move keeps the ship where it was', () => {
  const player = createPlayer('P1');
  placeShip(player, 'cruiser', 4, 4, HORIZONTAL);
  assert.equal(placeShip(player, 'cruiser', 9, 9, VERTICAL), false);
  assert.equal(shipCells(player, 'cruiser').length, 3);
  assert.equal(player.board[4][6].shipId, 'cruiser');
});

test('removeShip and resetFleet clear the board', () => {
  const player = createPlayer('P1');
  placeShip(player, 'cruiser', 0, 0, HORIZONTAL);
  removeShip(player, 'cruiser');
  assert.equal(player.board[0][0].state, CELL.EMPTY);
  assert.equal(shipCells(player, 'cruiser').length, 0);

  randomizeFleet(player);
  resetFleet(player);
  assert.equal(isFleetPlaced(player), false);
  assert.ok(player.board.flat().every((cell) => cell.state === CELL.EMPTY));
});

test('randomizeFleet places every ship without overlap', () => {
  for (let i = 0; i < 200; i++) {
    const player = createPlayer('P1');
    randomizeFleet(player);
    assert.equal(isFleetPlaced(player), true);
    const shipCellCount = player.board.flat().filter((cell) => cell.state === CELL.SHIP).length;
    assert.equal(shipCellCount, 5 + 4 + 3 + 3 + 2);
  }
});

test('receiveShot: miss, hit, already shot, sunk', () => {
  const player = createPlayer('P2');
  placeShip(player, 'destroyer', 0, 0, HORIZONTAL);

  assert.equal(receiveShot(player, 5, 5).result, SHOT_RESULT.MISS);
  assert.equal(player.board[5][5].state, CELL.MISS);
  assert.equal(receiveShot(player, 5, 5).result, SHOT_RESULT.ALREADY_SHOT);

  assert.equal(receiveShot(player, 0, 0).result, SHOT_RESULT.HIT);
  assert.equal(player.board[0][0].state, CELL.HIT);
  assert.equal(receiveShot(player, 0, 0).result, SHOT_RESULT.ALREADY_SHOT);

  const shot = receiveShot(player, 0, 1);
  assert.equal(shot.result, SHOT_RESULT.SUNK);
  assert.equal(shot.shipName, 'Destroyer');
  assert.equal(findShip(player, 'destroyer').state, SHIP_STATE.SUNK);
  assert.equal(player.board[0][0].state, CELL.SUNK);
  assert.equal(player.board[0][1].state, CELL.SUNK);
  assert.equal(receiveShot(player, 0, 1).result, SHOT_RESULT.ALREADY_SHOT);

  assert.equal(receiveShot(player, 10, 0).result, SHOT_RESULT.INVALID);
});

test('isFleetSunk is true only when every ship is sunk', () => {
  const player = createPlayer('P2');
  randomizeFleet(player);
  const allShipCells = player.ships.flatMap((ship) => ship.cells);
  const lastCell = allShipCells.pop();
  for (const { row, col } of allShipCells) receiveShot(player, row, col);
  assert.equal(isFleetSunk(player), false);
  receiveShot(player, lastCell.row, lastCell.col);
  assert.equal(isFleetSunk(player), true);
});

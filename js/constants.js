export const BOARD_SIZE = 10;

export const ROW_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

export const SHIP_TYPES = [
  { id: 'carrier', name: 'Carrier', size: 5 },
  { id: 'battleship', name: 'Battleship', size: 4 },
  { id: 'cruiser', name: 'Cruiser', size: 3 },
  { id: 'submarine', name: 'Submarine', size: 3 },
  { id: 'destroyer', name: 'Destroyer', size: 2 },
];

export const CELL = {
  EMPTY: 'EMPTY',
  SHIP: 'SHIP',
  HIT: 'HIT',
  MISS: 'MISS',
  SUNK: 'SUNK',
};

export const SHIP_STATE = {
  ALIVE: 'ALIVE',
  SUNK: 'SUNK',
};

export const ORIENTATION = {
  HORIZONTAL: 'HORIZONTAL',
  VERTICAL: 'VERTICAL',
};

export const SHOT_RESULT = {
  MISS: 'MISS',
  HIT: 'HIT',
  SUNK: 'SUNK',
  ALREADY_SHOT: 'ALREADY_SHOT',
  INVALID: 'INVALID',
};

export const PHASE = {
  START: 'START',
  PLAYER_1_SETUP: 'PLAYER_1_SETUP',
  PLAYER_1_READY: 'PLAYER_1_READY',
  PLAYER_2_SETUP: 'PLAYER_2_SETUP',
  BOTH_READY: 'BOTH_READY',
  PASS_DEVICE: 'PASS_DEVICE',
  BATTLE: 'BATTLE',
  GAME_OVER: 'GAME_OVER',
};

import { ORIENTATION, SHOT_RESULT } from './constants.js';
import {
  canPlaceShip,
  findShip,
  getShipCells,
  isInsideBoard,
  isShipPlaced,
  placeShip,
  randomizeFleet,
  resetFleet,
} from './board.js';
import {
  beginTurn,
  confirmSetup,
  continueToPlayer2Setup,
  createGame,
  endTurn,
  fire,
  getSetupPlayer,
  isSetupPhase,
  startBattle,
  startNewGame,
} from './game.js';
import { renderApp } from './ui.js';

const app = document.getElementById('app');

let game = createGame();

// UI-only state: it changes how things look, not the rules of the game.
const view = {
  selectedShipId: null,
  orientation: ORIENTATION.HORIZONTAL,
  hoverCell: null,
  message: '',
  showHelp: false,
};

function resetSetupView() {
  const player = getSetupPlayer(game);
  view.selectedShipId = player ? player.ships[0].id : null;
  view.orientation = ORIENTATION.HORIZONTAL;
  view.hoverCell = null;
  view.message = '';
}

function selectNextUnplacedShip(player) {
  const next = player.ships.find((ship) => !isShipPlaced(ship));
  view.selectedShipId = next ? next.id : null;
}

function toggleOrientation() {
  view.orientation =
    view.orientation === ORIENTATION.HORIZONTAL ? ORIENTATION.VERTICAL : ORIENTATION.HORIZONTAL;
}

function getShipOrientation(ship) {
  if (ship.cells.length < 2) return view.orientation;
  return ship.cells[0].row === ship.cells[1].row ? ORIENTATION.HORIZONTAL : ORIENTATION.VERTICAL;
}

function handlePlace(row, col) {
  const player = getSetupPlayer(game);

  if (!view.selectedShipId) {
    view.message = 'Select a ship from the list first.';
    return;
  }

  if (placeShip(player, view.selectedShipId, row, col, view.orientation)) {
    selectNextUnplacedShip(player);
  } else {
    view.message = "The ship doesn't fit there.";
  }
}

function handleFire(row, col) {
  const shot = fire(game, row, col);
  if (shot && shot.result === SHOT_RESULT.ALREADY_SHOT) {
    view.message = 'You already fired at that cell. Pick another one.';
  }
}

function newGame() {
  game = startNewGame();
  resetSetupView();
}

function goToMainMenu() {
  game = createGame();
  view.showHelp = false;
}

const actions = {
  'two-players': newGame,
  'show-help': () => (view.showHelp = true),
  'close-help': () => (view.showHelp = false),

  'select-ship': (el) => {
    const ship = findShip(getSetupPlayer(game), el.dataset.shipId);
    view.selectedShipId = ship.id;
    if (isShipPlaced(ship)) view.orientation = getShipOrientation(ship);
  },
  place: (el) => handlePlace(Number(el.dataset.row), Number(el.dataset.col)),
  rotate: toggleOrientation,
  randomize: () => {
    randomizeFleet(getSetupPlayer(game));
    view.selectedShipId = null;
  },
  reset: () => {
    resetFleet(getSetupPlayer(game));
    resetSetupView();
  },
  ready: () => {
    if (confirmSetup(game)) resetSetupView();
  },
  'continue-setup': () => {
    continueToPlayer2Setup(game);
    resetSetupView();
  },
  'start-battle': () => startBattle(game),

  'begin-turn': () => beginTurn(game),
  fire: (el) => handleFire(Number(el.dataset.row), Number(el.dataset.col)),
  'end-turn': () => endTurn(game),
  quit: () => {
    if (window.confirm('Quit this game and return to the main menu?')) goToMainMenu();
  },

  'play-again': newGame,
  'main-menu': goToMainMenu,
};

function render() {
  app.innerHTML = renderApp(game, view);
  updatePreview();
}

// Hover preview is drawn by toggling classes so the board isn't re-rendered on every mouse move.
function updatePreview() {
  const board = app.querySelector('[data-board="setup"]');
  if (!board) return;

  board.querySelectorAll('.cell--preview, .cell--invalid').forEach((cell) => {
    cell.classList.remove('cell--preview', 'cell--invalid');
  });

  const player = getSetupPlayer(game);
  if (!view.hoverCell || !view.selectedShipId) return;

  const { row, col } = view.hoverCell;
  const ship = findShip(player, view.selectedShipId);
  const valid = canPlaceShip(player, ship.id, row, col, view.orientation);
  const className = valid ? 'cell--preview' : 'cell--invalid';

  for (const cell of getShipCells(row, col, ship.size, view.orientation)) {
    if (!isInsideBoard(cell.row, cell.col)) continue;
    const element = board.querySelector(`[data-row="${cell.row}"][data-col="${cell.col}"]`);
    element.classList.add(className);
  }
}

app.addEventListener('click', (event) => {
  const element = event.target.closest('[data-action]');
  if (!element || element.disabled) return;

  const action = actions[element.dataset.action];
  if (!action) return;

  view.message = '';
  action(element);
  render();
});

app.addEventListener('mouseover', (event) => {
  if (!isSetupPhase(game)) return;

  const cell = event.target.closest('[data-board="setup"] .cell');
  const hoverCell = cell ? { row: Number(cell.dataset.row), col: Number(cell.dataset.col) } : null;
  const unchanged =
    hoverCell?.row === view.hoverCell?.row && hoverCell?.col === view.hoverCell?.col;
  if (unchanged) return;

  view.hoverCell = hoverCell;
  updatePreview();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && view.showHelp) {
    view.showHelp = false;
    render();
  }
  if ((event.key === 'r' || event.key === 'R') && isSetupPhase(game)) {
    toggleOrientation();
    render();
  }
});

render();

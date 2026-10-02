import { ONLINE_PHASE, ORIENTATION, SHOT_RESULT } from './constants.js';
import {
  canPlaceShip,
  createPlayer,
  findShip,
  getShipCells,
  isInsideBoard,
  isShipPlaced,
  placeShip,
  randomizeFleet,
  resetFleet,
} from './board.js';
import { createOnlineGame, fireAt, getPlayerView, requestRematch, submitFleet } from './online-game.js';
import { hostRoom, isValidRoomCode, joinRoom, normalizeRoomCode } from './net.js';
import { celebrateVictory, playShotEffect } from './effects.js';
import { renderApp } from './ui.js';

const app = document.getElementById('app');

// UI-only state: it changes how things look, not the rules of the game.
const view = {
  selectedShipId: null,
  orientation: ORIENTATION.HORIZONTAL,
  hoverCell: null,
  message: '',
  showHelp: false,
};

const online = {
  status: 'menu', // 'menu' | 'hosting' | 'joining' | 'playing' | 'disconnected'
  session: null,
  attempt: 0, // bumped on every new session so callbacks from an old one are ignored
  me: 0, // 0 = host, 1 = guest
  code: '',
  codeInput: '',
  error: '',
  game: null, // authoritative game, host only
  state: null, // what this player is allowed to see
  setupPlayer: createPlayer('You'),
  fleetSent: false,
  peerLost: false,
  selfOffline: false,
};

const isHost = () => online.me === 0;

/* ---------- Setup ---------- */

function inSetup() {
  const state = online.state;
  return (
    online.status === 'playing' &&
    state?.phase === ONLINE_PHASE.SETUP &&
    !online.fleetSent &&
    !state.ready[online.me]
  );
}

function resetSetupView() {
  view.selectedShipId = online.setupPlayer.ships[0].id;
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
  const player = online.setupPlayer;

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

/* ---------- Effects ---------- */

// Effects need the freshly rendered cells, so they run right after the next render.
let pendingEffects = [];

function queueShotEffect(boardId, shot, target) {
  const cells = shot.result === SHOT_RESULT.SUNK ? findShip(target, shot.shipId).cells : [shot];
  pendingEffects.push(() => {
    const elements = cells
      .map(({ row, col }) => app.querySelector(`[data-board="${boardId}"] [data-row="${row}"][data-col="${col}"]`))
      .filter(Boolean);
    playShotEffect(elements, shot.result);
  });
}

function flushEffects() {
  if (!pendingEffects.length) return;
  const effects = pendingEffects;
  pendingEffects = [];
  requestAnimationFrame(() => effects.forEach((effect) => effect()));
}

/* ---------- Session ---------- */

function leaveSession() {
  online.attempt += 1;
  online.session?.close();
  online.session = null;
}

function resetOnline(status) {
  leaveSession();
  Object.assign(online, {
    status,
    code: '',
    error: '',
    game: null,
    state: null,
    fleetSent: false,
    peerLost: false,
    selfOffline: false,
  });
}

// Wraps network callbacks so they are dropped once the user has left that session.
function guarded(handlers) {
  const attempt = online.attempt;
  const wrapped = {};
  for (const [name, fn] of Object.entries(handlers)) {
    wrapped[name] = (...args) => {
      if (attempt === online.attempt) fn(...args);
    };
  }
  return wrapped;
}

function handleNetError(message) {
  if (online.status === 'playing') {
    handleDisconnect();
    return;
  }
  resetOnline('menu');
  online.error = message;
  render();
}

function handleDisconnect() {
  resetOnline('disconnected');
  render();
}

const connectionHandlers = {
  onClose: handleDisconnect,
  onError: handleNetError,
  onPeerStatus: (isOnline) => {
    online.peerLost = !isOnline;
    render();
  },
  onSelfStatus: (isOnline) => {
    online.selfOffline = !isOnline;
    render();
  },
};

function applyState(next) {
  const prev = online.state;
  online.state = next;

  if (!prev || next.round !== prev.round) {
    online.setupPlayer = createPlayer('You');
    online.fleetSent = false;
    resetSetupView();
  }

  if (next.lastShot && next.shotCount !== prev?.shotCount) {
    const mine = next.lastShot.by === next.me;
    queueShotEffect(mine ? 'enemy' : 'own', next.lastShot, mine ? next.opponent : next.player);
  }
  if (next.phase === ONLINE_PHASE.GAME_OVER && prev?.phase !== ONLINE_PHASE.GAME_OVER && next.winner === next.me) {
    pendingEffects.push(celebrateVictory);
  }
  render();
}

// Host only: share the new state with both players.
function publish() {
  if (!online.game) return;
  online.session?.send({ type: 'state', state: getPlayerView(online.game, 1) });
  applyState(getPlayerView(online.game, 0));
}

function handleGuestMessage(message) {
  const hostGame = online.game;
  if (!hostGame || !message) return;

  if (message.type === 'fleet') submitFleet(hostGame, 1, message.ships);
  else if (message.type === 'fire') fireAt(hostGame, 1, message.row, message.col);
  else if (message.type === 'rematch') requestRematch(hostGame, 1);
  else return;
  publish();
}

async function startSession(connect, handlers) {
  const attempt = online.attempt;
  try {
    const session = await connect(guarded({ ...connectionHandlers, ...handlers }));
    if (attempt === online.attempt) online.session = session;
    else session.close();
  } catch (error) {
    if (attempt === online.attempt) handleNetError(error.message);
  }
}

function createRoom() {
  resetOnline('hosting');
  online.me = 0;

  startSession(hostRoom, {
    onReady: (code) => {
      online.code = code;
      render();
    },
    onConnected: () => {
      online.status = 'playing';
      online.game = createOnlineGame();
      publish();
    },
    onMessage: handleGuestMessage,
    // After either side reconnects, resend the state in case updates were missed.
    onReconnect: publish,
  });
}

function joinRoomWithCode(code) {
  resetOnline('joining');
  online.me = 1;
  online.code = code;
  render();

  startSession((handlers) => joinRoom(code, handlers), {
    onConnected: () => {
      online.status = 'playing';
      render();
    },
    onMessage: (message) => {
      if (message?.type === 'state') applyState(message.state);
    },
  });
}

/* ---------- Player actions ---------- */

function submitOnlineFleet() {
  const ships = online.setupPlayer.ships.map(({ id, cells }) => ({ id, cells }));
  online.fleetSent = true;
  if (isHost()) {
    submitFleet(online.game, 0, ships);
    publish();
  } else {
    online.session?.send({ type: 'fleet', ships });
  }
}

function handleFire(row, col) {
  const state = online.state;
  if (state?.phase !== ONLINE_PHASE.BATTLE || state.currentPlayer !== online.me) return;

  if (isHost()) {
    const shot = fireAt(online.game, 0, row, col);
    if (shot?.result === SHOT_RESULT.ALREADY_SHOT) {
      view.message = 'You already fired at that cell. Pick another one.';
    } else if (shot) {
      publish();
    }
    return;
  }
  online.session?.send({ type: 'fire', row, col });
}

function handleRematch() {
  if (isHost()) {
    requestRematch(online.game, 0);
    publish();
  } else {
    online.session?.send({ type: 'rematch' });
    online.state.rematch[online.me] = true;
  }
}

function copyToClipboard(text) {
  navigator.clipboard
    ?.writeText(text)
    .then(() => (view.message = 'Copied!'))
    .catch(() => (view.message = text))
    .finally(render);
}

function inviteLink() {
  return `${location.origin}${location.pathname}?room=${online.code}`;
}

function goToMainMenu() {
  resetOnline('menu');
  view.showHelp = false;
  view.message = '';
}

const actions = {
  'show-help': () => (view.showHelp = true),
  'close-help': () => (view.showHelp = false),

  'create-room': createRoom,
  'leave-online': () => resetOnline('menu'),
  'copy-code': () => copyToClipboard(online.code),
  'copy-link': () => copyToClipboard(inviteLink()),

  'select-ship': (el) => {
    const ship = findShip(online.setupPlayer, el.dataset.shipId);
    view.selectedShipId = ship.id;
    if (isShipPlaced(ship)) view.orientation = getShipOrientation(ship);
  },
  place: (el) => handlePlace(Number(el.dataset.row), Number(el.dataset.col)),
  rotate: toggleOrientation,
  randomize: () => {
    randomizeFleet(online.setupPlayer);
    view.selectedShipId = null;
  },
  reset: () => {
    resetFleet(online.setupPlayer);
    resetSetupView();
  },
  ready: submitOnlineFleet,

  fire: (el) => handleFire(Number(el.dataset.row), Number(el.dataset.col)),
  rematch: handleRematch,
  quit: () => {
    if (window.confirm('Leave this room? Your opponent will be disconnected.')) goToMainMenu();
  },
  'main-menu': goToMainMenu,
};

/* ---------- Rendering & events ---------- */

function render() {
  app.innerHTML = renderApp(online, view);
  updatePreview();
  flushEffects();
}

// Hover preview is drawn by toggling classes so the board isn't re-rendered on every mouse move.
function updatePreview() {
  const board = app.querySelector('[data-board="setup"]');
  if (!board) return;

  board.querySelectorAll('.cell--preview, .cell--invalid').forEach((cell) => {
    cell.classList.remove('cell--preview', 'cell--invalid');
  });

  const player = online.setupPlayer;
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

app.addEventListener('submit', (event) => {
  if (!event.target.matches('[data-form="join-room"]')) return;
  event.preventDefault();

  const code = normalizeRoomCode(event.target.elements.code.value);
  online.codeInput = code;
  if (!isValidRoomCode(code)) {
    online.error = 'Room codes are 6 letters or numbers.';
    render();
    return;
  }
  joinRoomWithCode(code);
});

app.addEventListener('input', (event) => {
  if (event.target.id !== 'room-code') return;
  event.target.value = normalizeRoomCode(event.target.value);
  online.codeInput = event.target.value;
});

app.addEventListener('mouseover', (event) => {
  if (!inSetup()) return;

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
  if ((event.key === 'r' || event.key === 'R') && inSetup()) {
    toggleOrientation();
    render();
  }
});

// Invite links look like ?room=ABC123 and drop the player straight into that room.
const invitedCode = normalizeRoomCode(new URLSearchParams(location.search).get('room'));
if (invitedCode) {
  history.replaceState(null, '', location.pathname);
  online.codeInput = invitedCode;
  if (isValidRoomCode(invitedCode)) joinRoomWithCode(invitedCode);
}

render();

import {
  BOARD_SIZE,
  CELL,
  ONLINE_PHASE,
  ORIENTATION,
  PHASE,
  ROW_LABELS,
  SHIP_STATE,
  SHOT_RESULT,
} from './constants.js';
import { findShip, isFleetPlaced, isShipPlaced } from './board.js';
import { getCurrentPlayer, getOpponent, getSetupPlayer } from './game.js';

export function renderApp(game, view) {
  switch (game.phase) {
    case PHASE.START:
      return renderStart(view);
    case PHASE.PLAYER_1_SETUP:
    case PHASE.PLAYER_2_SETUP:
      return renderSetup(getSetupPlayer(game), view, { title: `${getSetupPlayer(game).name} - Deploy Your Fleet` });
    case PHASE.PLAYER_1_READY:
      return renderMessageScreen({
        title: 'Player 1 Ready!',
        text: 'Pass the device to Player 2.',
        note: 'Player 2: no peeking at the screen until it says so!',
        action: 'continue-setup',
        label: 'Continue',
      });
    case PHASE.BOTH_READY:
      return renderMessageScreen({
        title: 'Both fleets are ready!',
        text: 'Pass the device to Player 1 to begin.',
        action: 'start-battle',
        label: 'Start Battle',
      });
    case PHASE.PASS_DEVICE:
      return renderMessageScreen({
        eyebrow: 'Pass the device',
        title: `It's ${getCurrentPlayer(game).name}'s turn.`,
        note: 'Press continue only when the other player is not looking.',
        action: 'begin-turn',
        label: 'Continue',
      });
    case PHASE.BATTLE:
      return renderLocalBattle(game, view);
    case PHASE.GAME_OVER:
      return renderLocalBattle(game, view) + renderVictory(game);
    default:
      return '';
  }
}

function coordinate(row, col) {
  return `${ROW_LABELS[row]}${col + 1}`;
}

function cellKey(row, col) {
  return `${row},${col}`;
}

/* ---------- Start ---------- */

function renderStart(view) {
  return `
    <section class="screen screen--center">
      <div class="card start-card">
        <h1 class="logo">BATTLESHIPS</h1>
        <p class="tagline">2-player naval combat - same device or online</p>
        <div class="stack">
          <button class="btn btn--primary btn--large" data-action="two-players">2 Players (Same Device)</button>
          <button class="btn btn--primary btn--large" data-action="online-menu">Play Online</button>
          <button class="btn btn--large" data-action="show-help">How to Play</button>
        </div>
      </div>
    </section>
    ${view.showHelp ? renderHowToPlay() : ''}
  `;
}

function renderHowToPlay() {
  return `
    <div class="overlay">
      <div class="card modal" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <h2 id="help-title">How to Play</h2>
        <ol class="help-list">
          <li>Each player secretly places 5 ships on a 10×10 board. Ships can't overlap or leave the board.</li>
          <li>Players take turns firing at one cell on the enemy board.</li>
          <li><span class="legend legend--hit">●</span> Red means <strong>HIT</strong>, <span class="legend legend--miss">✕</span> means <strong>MISS</strong>.</li>
          <li>When every cell of a ship is hit, the ship is <strong>SUNK</strong>.</li>
          <li>Sink the whole enemy fleet to win!</li>
          <li><strong>Same device:</strong> pass the device between turns and don't peek at your opponent's fleet.</li>
          <li><strong>Online:</strong> one player creates a room and shares the 6-character code (or invite link); the other joins with it.</li>
        </ol>
        <button class="btn btn--primary" data-action="close-help">Got it</button>
      </div>
    </div>
  `;
}

/* ---------- Message / pass-device screens ---------- */

function renderMessageScreen({ eyebrow = '', title, text = '', note = '', action, label, secondary = '' }) {
  return `
    <section class="screen screen--center">
      <div class="card message-card">
        ${eyebrow ? `<p class="eyebrow">${eyebrow}</p>` : ''}
        <h2 class="message-title">${title}</h2>
        ${text ? `<p class="message-text">${text}</p>` : ''}
        ${note ? `<p class="message-note">${note}</p>` : ''}
        ${action ? `<button class="btn btn--primary btn--large" data-action="${action}">${label}</button>` : ''}
        ${secondary}
      </div>
    </section>
  `;
}

/* ---------- Board ---------- */

// boardId: 'setup' | 'own' | 'enemy'
// showShips: false hides SHIP cells (enemy board).
// clickAction: data-action for clickable cells, or null for a read-only board.
function renderBoard({ board, boardId, showShips, clickAction = null, animateKeys = new Set() }) {
  let html = `<div class="board ${clickAction ? 'board--interactive' : ''}" data-board="${boardId}">`;
  html += '<div class="board-label"></div>';
  for (let col = 0; col < BOARD_SIZE; col++) {
    html += `<div class="board-label">${col + 1}</div>`;
  }

  for (let row = 0; row < BOARD_SIZE; row++) {
    html += `<div class="board-label">${ROW_LABELS[row]}</div>`;
    for (let col = 0; col < BOARD_SIZE; col++) {
      html += renderCell(board[row][col], row, col, { showShips, clickAction, animateKeys });
    }
  }
  return html + '</div>';
}

function renderCell(cell, row, col, { showShips, clickAction, animateKeys }) {
  const state = cell.state === CELL.SHIP && !showShips ? CELL.EMPTY : cell.state;
  const marker = { HIT: '●', SUNK: '●', MISS: '✕' }[state] || '';
  const classes = ['cell', `cell--${state.toLowerCase()}`];
  if (animateKeys.has(cellKey(row, col))) classes.push('cell--animate');

  const label = `${coordinate(row, col)} ${state.toLowerCase()}`;
  const position = `data-row="${row}" data-col="${col}"`;
  if (!clickAction) {
    return `<div class="${classes.join(' ')}" ${position} aria-label="${label}">${marker}</div>`;
  }

  const alreadyShot = state === CELL.HIT || state === CELL.MISS || state === CELL.SUNK;
  const disabled = clickAction === 'fire' && alreadyShot;
  return `<button class="${classes.join(' ')}" data-action="${clickAction}" ${position}
    aria-label="${label}" ${disabled ? 'disabled' : ''}>${marker}</button>`;
}

/* ---------- Setup ---------- */

function renderSetup(player, view, { title, badge = '', note = '' }) {
  const isHorizontal = view.orientation === ORIENTATION.HORIZONTAL;

  const shipItems = player.ships
    .map((ship) => {
      const classes = ['ship-item'];
      if (ship.id === view.selectedShipId) classes.push('is-selected');
      if (isShipPlaced(ship)) classes.push('is-placed');
      const blocks = '<span class="ship-block"></span>'.repeat(ship.size);
      return `
        <li>
          <button class="${classes.join(' ')}" data-action="select-ship" data-ship-id="${ship.id}">
            <span class="ship-name">${ship.name}</span>
            <span class="ship-blocks">${blocks}</span>
            <span class="ship-check">${isShipPlaced(ship) ? '✓' : ''}</span>
          </button>
        </li>`;
    })
    .join('');

  return `
    <section class="screen setup">
      <header class="screen-header">
        ${badge}
        <h2>${title}</h2>
        <p class="hint">Select a ship, then tap the board to place it. Select a placed ship to move it. Press <kbd>R</kbd> to rotate.</p>
        ${note ? `<p class="opponent-note">${note}</p>` : ''}
      </header>
      <div class="setup-layout">
        <div class="board-wrap">
          ${renderBoard({ board: player.board, boardId: 'setup', showShips: true, clickAction: 'place' })}
        </div>
        <aside class="card setup-panel">
          <ul class="ship-list">${shipItems}</ul>
          <div class="button-row">
            <button class="btn" data-action="rotate">Rotate: ${isHorizontal ? 'Horizontal ↔' : 'Vertical ↕'}</button>
            <button class="btn" data-action="randomize">Randomize</button>
            <button class="btn" data-action="reset">Reset</button>
          </div>
          <p class="setup-message" role="status">${view.message}</p>
          <button class="btn btn--primary btn--large btn--block" data-action="ready"
            ${isFleetPlaced(player) ? '' : 'disabled'}>Ready</button>
        </aside>
      </div>
    </section>
  `;
}

/* ---------- Battle ---------- */

function getShotKeys(target, shot) {
  if (!shot) return new Set();
  if (shot.result === SHOT_RESULT.SUNK) {
    const ship = findShip(target, shot.shipId);
    return new Set(ship.cells.map((cell) => cellKey(cell.row, cell.col)));
  }
  return new Set([cellKey(shot.row, shot.col)]);
}

function renderFleetStatus(player, title) {
  const items = player.ships
    .map((ship) => {
      const sunk = ship.state === SHIP_STATE.SUNK;
      return `<li class="${sunk ? 'is-sunk' : ''}">${sunk ? '✓' : '○'} ${ship.name}</li>`;
    })
    .join('');
  return `
    <div class="fleet-status">
      <h4>${title}</h4>
      <ul>${items}</ul>
    </div>
  `;
}

function renderShotStatus(shot, message, idleText) {
  if (message) {
    return `<p class="status">${message}</p>`;
  }
  if (!shot) {
    return `<p class="status">${idleText}</p>`;
  }

  const where = coordinate(shot.row, shot.col);
  if (shot.result === SHOT_RESULT.MISS) {
    return `<p class="status status--miss">MISS <span class="status-detail">at ${where}</span></p>`;
  }
  if (shot.result === SHOT_RESULT.HIT) {
    return `<p class="status status--hit">HIT! <span class="status-detail">at ${where}</span></p>`;
  }
  return `
    <p class="status status--sunk">SHIP SUNK!</p>
    <p class="status-detail">You sunk the ${shot.shipName}!</p>
  `;
}

function renderIncomingShot(shot, enemyName) {
  if (!shot) return '';

  const where = coordinate(shot.row, shot.col);
  let text = `${enemyName} fired at ${where} and missed.`;
  if (shot.result === SHOT_RESULT.HIT) text = `${enemyName} hit your ship at ${where}!`;
  if (shot.result === SHOT_RESULT.SUNK) text = `${enemyName} sunk your ${shot.shipName}!`;
  return `<p class="incoming">${text}</p>`;
}

function renderRoomBadge(code) {
  return code ? `<span class="room-badge">Room <strong>${code}</strong></span>` : '';
}

function renderBattle({
  title,
  incomingHtml,
  statusHtml,
  actionHtml = '',
  player,
  opponent,
  canFire,
  ownShot,
  enemyShot,
  revealEnemy = false,
  roomCode = '',
}) {
  return `
    <section class="screen battle">
      <header class="battle-header">
        <h1 class="logo logo--small">BATTLESHIPS</h1>
        ${renderRoomBadge(roomCode)}
        <button class="btn btn--small btn--ghost" data-action="quit">Menu</button>
      </header>

      <div class="turn-banner">
        <h2 class="turn-title">${title}</h2>
        ${incomingHtml}
        <div class="turn-status">${statusHtml}</div>
        ${actionHtml}
      </div>

      <div class="boards">
        <section class="board-panel board-panel--own">
          <h3>Your Fleet</h3>
          ${renderBoard({
            board: player.board,
            boardId: 'own',
            showShips: true,
            animateKeys: getShotKeys(player, ownShot),
          })}
          ${renderFleetStatus(player, 'Your Ships')}
        </section>
        <section class="board-panel board-panel--enemy ${canFire ? 'is-active' : ''}">
          <h3>Enemy Fleet</h3>
          ${renderBoard({
            board: opponent.board,
            boardId: 'enemy',
            showShips: revealEnemy,
            clickAction: canFire ? 'fire' : null,
            animateKeys: getShotKeys(opponent, enemyShot),
          })}
          ${renderFleetStatus(opponent, 'Enemy Fleet')}
        </section>
      </div>
    </section>
  `;
}

function renderLocalBattle(game, view) {
  const player = getCurrentPlayer(game);
  const opponent = getOpponent(game);
  const canFire = game.phase === PHASE.BATTLE && !game.hasFired;
  const showEndTurn = game.phase === PHASE.BATTLE && game.hasFired;

  return renderBattle({
    title: `${player.name}'s turn`,
    incomingHtml: renderIncomingShot(game.incomingShot, opponent.name),
    statusHtml: renderShotStatus(game.lastShot, view.message, 'Select a cell to fire'),
    actionHtml: showEndTurn ? '<button class="btn btn--primary" data-action="end-turn">End Turn</button>' : '',
    player,
    opponent,
    canFire,
    ownShot: game.incomingShot,
    enemyShot: game.lastShot,
  });
}

/* ---------- Victory ---------- */

function renderVictory(game) {
  const winner = game.players[game.winner];
  return `
    <div class="overlay overlay--victory">
      <div class="card modal victory" role="dialog" aria-modal="true" aria-labelledby="victory-title">
        <p class="eyebrow">${winner.name}</p>
        <h2 id="victory-title" class="victory-title">YOU WIN!</h2>
        <p class="message-text">Enemy fleet destroyed!</p>
        <div class="stack">
          <button class="btn btn--primary btn--large" data-action="play-again">Play Again</button>
          <button class="btn btn--large" data-action="main-menu">Main Menu</button>
        </div>
      </div>
    </div>
  `;
}

/* ---------- Online ---------- */

// online: the online session state kept in main.js.
export function renderOnline(online, view) {
  switch (online.status) {
    case 'menu':
      return renderOnlineMenu(online);
    case 'hosting':
      return renderHosting(online, view);
    case 'joining':
      return renderMessageScreen({
        eyebrow: `Room ${online.code}`,
        title: 'Joining room…',
        note: 'Connecting to your friend.',
        secondary: '<button class="btn btn--ghost" data-action="leave-online">Cancel</button>',
      });
    case 'playing':
      return renderOnlineGame(online, view);
    case 'disconnected':
      return renderMessageScreen({
        eyebrow: 'Connection lost',
        title: 'Your opponent left the game',
        note: 'The online match has ended.',
        action: 'main-menu',
        label: 'Main Menu',
      });
    default:
      return '';
  }
}

function renderOnlineMenu(online) {
  return `
    <section class="screen screen--center">
      <div class="card start-card">
        <h2 class="message-title">Play Online</h2>
        <p class="tagline">Create a room and share the code with a friend, or join theirs.</p>
        <div class="stack">
          <button class="btn btn--primary btn--large" data-action="create-room">Create Room</button>
          <div class="divider"><span>or join a room</span></div>
          <form class="join-form" data-form="join-room">
            <input id="room-code" class="code-input" name="code" maxlength="6" placeholder="CODE"
              autocomplete="off" autocapitalize="characters" spellcheck="false"
              aria-label="Room code" value="${online.codeInput}" />
            <button class="btn btn--large" type="submit">Join</button>
          </form>
          <p class="setup-message" role="alert">${online.error}</p>
          <button class="btn btn--ghost" data-action="main-menu">Back</button>
        </div>
      </div>
    </section>
  `;
}

function renderHosting(online, view) {
  if (!online.code) {
    return renderMessageScreen({
      title: 'Creating room…',
      secondary: '<button class="btn btn--ghost" data-action="leave-online">Cancel</button>',
    });
  }

  return `
    <section class="screen screen--center">
      <div class="card message-card">
        <p class="eyebrow">Room created</p>
        <h2 class="message-title">Share this code</h2>
        <div class="room-code" aria-label="Room code">${online.code}</div>
        <div class="button-row">
          <button class="btn" data-action="copy-code">Copy Code</button>
          <button class="btn" data-action="copy-link">Copy Invite Link</button>
        </div>
        <p class="copy-message" role="status">${view.message}</p>
        <p class="message-note waiting">Waiting for your friend to join<span class="dots"></span></p>
        <button class="btn btn--ghost" data-action="leave-online">Cancel</button>
      </div>
    </section>
  `;
}

function renderOnlineGame(online, view) {
  const state = online.state;
  if (!state) {
    return renderMessageScreen({ eyebrow: `Room ${online.code}`, title: 'Connected!', note: 'Loading the game…' });
  }

  if (state.phase === ONLINE_PHASE.SETUP) {
    const opponentReady = state.ready[1 - state.me];
    if (online.fleetSent || state.ready[state.me]) {
      return renderMessageScreen({
        eyebrow: `Room ${online.code}`,
        title: 'Fleet deployed!',
        text: opponentReady ? 'Starting the battle…' : 'Waiting for your opponent to finish deploying.',
        note: '<span class="waiting">Hang tight<span class="dots"></span></span>',
        secondary: '<button class="btn btn--ghost" data-action="quit">Leave Game</button>',
      });
    }
    return renderSetup(online.setupPlayer, view, {
      title: 'Deploy Your Fleet',
      badge: renderRoomBadge(online.code),
      note: opponentReady ? 'Your opponent is ready!' : 'Your opponent is deploying their fleet…',
    });
  }

  return renderOnlineBattle(online, view) + (state.phase === ONLINE_PHASE.GAME_OVER ? renderOnlineResult(state) : '');
}

function renderOnlineBattle(online, view) {
  const state = online.state;
  const myTurn = state.phase === ONLINE_PHASE.BATTLE && state.currentPlayer === state.me;
  const shot = state.lastShot;
  const myShot = shot && shot.by === state.me ? shot : null;
  const theirShot = shot && shot.by !== state.me ? shot : null;

  let title = myTurn ? 'Your turn' : "Opponent's turn";
  if (state.phase === ONLINE_PHASE.GAME_OVER) title = state.winner === state.me ? 'Victory!' : 'Defeat';

  return renderBattle({
    title,
    incomingHtml: renderIncomingShot(theirShot, 'Opponent'),
    statusHtml: renderShotStatus(
      myShot,
      view.message,
      myTurn ? 'Select a cell to fire' : 'Waiting for your opponent to fire…'
    ),
    player: state.player,
    opponent: state.opponent,
    canFire: myTurn,
    ownShot: theirShot,
    enemyShot: myShot,
    revealEnemy: state.phase === ONLINE_PHASE.GAME_OVER,
    roomCode: online.code,
  });
}

function renderOnlineResult(state) {
  const won = state.winner === state.me;
  const waiting = state.rematch[state.me];
  const opponentWantsRematch = state.rematch[1 - state.me];

  return `
    <div class="overlay overlay--victory">
      <div class="card modal victory ${won ? '' : 'victory--lost'}" role="dialog" aria-modal="true" aria-labelledby="victory-title">
        <p class="eyebrow">${won ? 'Victory' : 'Defeat'}</p>
        <h2 id="victory-title" class="victory-title">${won ? 'YOU WIN!' : 'YOU LOSE'}</h2>
        <p class="message-text">${won ? 'Enemy fleet destroyed!' : 'Your fleet was destroyed.'}</p>
        ${opponentWantsRematch && !waiting ? '<p class="message-note">Your opponent wants a rematch!</p>' : ''}
        <div class="stack">
          <button class="btn btn--primary btn--large" data-action="rematch" ${waiting ? 'disabled' : ''}>
            ${waiting ? 'Waiting for opponent…' : 'Rematch'}
          </button>
          <button class="btn btn--large" data-action="main-menu">Main Menu</button>
        </div>
      </div>
    </div>
  `;
}

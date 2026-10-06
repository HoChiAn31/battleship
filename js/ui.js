import { BOARD_SIZE, CELL, ONLINE_PHASE, ORIENTATION, ROW_LABELS, SHIP_STATE, SHOT_RESULT } from './constants.js';
import { findShip, isFleetPlaced, isShipPlaced } from './board.js';

// online: the online session state kept in main.js.
export function renderApp(online, view) {
  switch (online.status) {
    case 'menu':
      return renderHome(online, view);
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
      return renderConnectionBanner(online) + renderGame(online, view);
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

function coordinate(row, col) {
  return `${ROW_LABELS[row]}${col + 1}`;
}

function cellKey(row, col) {
  return `${row},${col}`;
}

/* ---------- Home ---------- */

function renderHome(online, view) {
  return `
    <section class="screen screen--center">
      <div class="card start-card">
        <h1 class="logo">BATTLESHIPS</h1>
        <p class="tagline">Online 2-player naval combat</p>
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
          <button class="btn btn--ghost" data-action="show-help">How to Play</button>
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
          <li>One player creates a room and shares the 6-character code (or invite link). The other player joins with it.</li>
          <li>Each player secretly places 5 ships on a 10×10 board. Ships can't overlap or leave the board.</li>
          <li>On your turn, fire at one cell on the enemy board.</li>
          <li><span class="legend legend--hit">●</span> Red means <strong>HIT</strong> and you fire again. <span class="legend legend--miss">✕</span> means <strong>MISS</strong> and the turn passes to your opponent.</li>
          <li>When every cell of a ship is hit, the ship is <strong>SUNK</strong>.</li>
          <li>Sink the whole enemy fleet to win!</li>
        </ol>
        <button class="btn btn--primary" data-action="close-help">Got it</button>
      </div>
    </div>
  `;
}

/* ---------- Message screens ---------- */

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

function renderConnectionBanner(online) {
  let text = '';
  if (online.selfOffline) text = 'You are offline. Reconnecting…';
  else if (online.peerLost) text = 'Your opponent lost connection. Waiting for them to come back…';
  return text ? `<p class="connection-banner" role="status">${text}</p>` : '';
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

function renderRoomBadge(code) {
  return code ? `<span class="room-badge">Room <strong>${code}</strong></span>` : '';
}

/* ---------- Setup ---------- */

function renderSetup(player, view, { badge, note }) {
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
        <h2>Deploy Your Fleet</h2>
        <p class="hint">Select a ship, then tap the board to place it. Select a placed ship to move it. Press <kbd>R</kbd> to rotate.</p>
        <p class="opponent-note">${note}</p>
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
          <button class="btn btn--ghost btn--block leave-btn" data-action="quit">Leave Room</button>
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

// fireAgain: the player keeps the turn after this shot.
function renderShotStatus(shot, message, idleText, fireAgain) {
  if (message) {
    return `<p class="status">${message}</p>`;
  }
  if (!shot) {
    return `<p class="status">${idleText}</p>`;
  }

  const where = coordinate(shot.row, shot.col);
  const again = fireAgain ? '<p class="status-detail status-again">Fire again!</p>' : '';
  if (shot.result === SHOT_RESULT.MISS) {
    return `<p class="status status--miss">MISS <span class="status-detail">at ${where}</span></p>`;
  }
  if (shot.result === SHOT_RESULT.HIT) {
    return `<p class="status status--hit">HIT! <span class="status-detail">at ${where}</span></p>${again}`;
  }
  return `
    <p class="status status--sunk">SHIP SUNK!</p>
    <p class="status-detail">You sunk the ${shot.shipName}!</p>
    ${again}
  `;
}

function renderIncomingShot(shot) {
  if (!shot) return '';

  const where = coordinate(shot.row, shot.col);
  let text = `Opponent fired at ${where} and missed.`;
  if (shot.result === SHOT_RESULT.HIT) text = `Opponent hit your ship at ${where}!`;
  if (shot.result === SHOT_RESULT.SUNK) text = `Opponent sunk your ${shot.shipName}!`;
  return `<p class="incoming">${text}</p>`;
}

function renderGame(online, view) {
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
        secondary: '<button class="btn btn--ghost" data-action="quit">Leave Room</button>',
      });
    }
    return renderSetup(online.setupPlayer, view, {
      badge: renderRoomBadge(online.code),
      note: opponentReady ? 'Your opponent is ready!' : 'Your opponent is deploying their fleet…',
    });
  }

  return renderBattle(online, view) + (state.phase === ONLINE_PHASE.GAME_OVER ? renderResult(state) : '');
}

function renderBattle(online, view) {
  const state = online.state;
  const { player, opponent } = state;
  const isOver = state.phase === ONLINE_PHASE.GAME_OVER;
  const myTurn = state.phase === ONLINE_PHASE.BATTLE && state.currentPlayer === state.me;
  const shot = state.lastShot;
  const myShot = shot && shot.by === state.me ? shot : null;
  const theirShot = shot && shot.by !== state.me ? shot : null;

  let title = myTurn ? 'Your turn' : "Opponent's turn";
  if (isOver) title = state.winner === state.me ? 'Victory!' : 'Defeat';
  const idleText = myTurn ? 'Select a cell to fire' : 'Waiting for your opponent to fire…';

  return `
    <section class="screen battle">
      <header class="battle-header">
        <h1 class="logo logo--small">BATTLESHIPS</h1>
        ${renderRoomBadge(online.code)}
        <button class="btn btn--small btn--ghost" data-action="quit">Leave</button>
      </header>

      <div class="turn-banner ${myTurn ? 'is-my-turn' : ''}">
        <h2 class="turn-title">${title}</h2>
        ${renderIncomingShot(theirShot)}
        <div class="turn-status">${renderShotStatus(myShot, view.message, idleText, myTurn)}</div>
      </div>

      <div class="boards">
        <section class="board-panel board-panel--own">
          <h3>Your Fleet</h3>
          ${renderBoard({
            board: player.board,
            boardId: 'own',
            showShips: true,
            animateKeys: getShotKeys(player, theirShot),
          })}
          ${renderFleetStatus(player, 'Your Ships')}
        </section>
        <section class="board-panel board-panel--enemy ${myTurn ? 'is-active' : ''}">
          <h3>Enemy Fleet</h3>
          ${renderBoard({
            board: opponent.board,
            boardId: 'enemy',
            showShips: isOver,
            clickAction: myTurn ? 'fire' : null,
            animateKeys: getShotKeys(opponent, myShot),
          })}
          ${renderFleetStatus(opponent, 'Enemy Fleet')}
        </section>
      </div>
    </section>
  `;
}

function renderResult(state) {
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

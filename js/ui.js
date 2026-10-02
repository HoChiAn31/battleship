import { BOARD_SIZE, CELL, ORIENTATION, PHASE, ROW_LABELS, SHIP_STATE, SHOT_RESULT } from './constants.js';
import { findShip, isFleetPlaced, isShipPlaced } from './board.js';
import { getCurrentPlayer, getOpponent, getSetupPlayer } from './game.js';

export function renderApp(game, view) {
  switch (game.phase) {
    case PHASE.START:
      return renderStart(view);
    case PHASE.PLAYER_1_SETUP:
    case PHASE.PLAYER_2_SETUP:
      return renderSetup(game, view);
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
      return renderBattle(game, view);
    case PHASE.GAME_OVER:
      return renderBattle(game, view) + renderVictory(game);
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
        <p class="tagline">Local 2-player naval combat</p>
        <div class="stack">
          <button class="btn btn--primary btn--large" data-action="two-players">2 Players</button>
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
          <li>Pass the device between turns and don't peek at your opponent's fleet.</li>
        </ol>
        <button class="btn btn--primary" data-action="close-help">Got it</button>
      </div>
    </div>
  `;
}

/* ---------- Message / pass-device screens ---------- */

function renderMessageScreen({ eyebrow = '', title, text = '', note = '', action, label }) {
  return `
    <section class="screen screen--center">
      <div class="card message-card">
        ${eyebrow ? `<p class="eyebrow">${eyebrow}</p>` : ''}
        <h2 class="message-title">${title}</h2>
        ${text ? `<p class="message-text">${text}</p>` : ''}
        ${note ? `<p class="message-note">${note}</p>` : ''}
        <button class="btn btn--primary btn--large" data-action="${action}">${label}</button>
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

function renderSetup(game, view) {
  const player = getSetupPlayer(game);
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
        <h2>${player.name} - Deploy Your Fleet</h2>
        <p class="hint">Select a ship, then tap the board to place it. Select a placed ship to move it. Press <kbd>R</kbd> to rotate.</p>
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

function renderShotStatus(game, view) {
  const shot = game.lastShot;

  if (view.message) {
    return `<p class="status">${view.message}</p>`;
  }
  if (!shot) {
    return '<p class="status">Select a cell to fire</p>';
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

function renderIncomingShot(game) {
  const shot = game.incomingShot;
  if (!shot) return '';

  const enemyName = getOpponent(game).name;
  const where = coordinate(shot.row, shot.col);
  let text = `${enemyName} fired at ${where} and missed.`;
  if (shot.result === SHOT_RESULT.HIT) text = `${enemyName} hit your ship at ${where}!`;
  if (shot.result === SHOT_RESULT.SUNK) text = `${enemyName} sunk your ${shot.shipName}!`;
  return `<p class="incoming">${text}</p>`;
}

function renderBattle(game, view) {
  const player = getCurrentPlayer(game);
  const opponent = getOpponent(game);
  const canFire = game.phase === PHASE.BATTLE && !game.hasFired;
  const showEndTurn = game.phase === PHASE.BATTLE && game.hasFired;

  return `
    <section class="screen battle">
      <header class="battle-header">
        <h1 class="logo logo--small">BATTLESHIPS</h1>
        <button class="btn btn--small btn--ghost" data-action="quit">Menu</button>
      </header>

      <div class="turn-banner">
        <h2 class="turn-title">${player.name}'s turn</h2>
        ${renderIncomingShot(game)}
        <div class="turn-status">${renderShotStatus(game, view)}</div>
        ${showEndTurn ? '<button class="btn btn--primary" data-action="end-turn">End Turn</button>' : ''}
      </div>

      <div class="boards">
        <section class="board-panel board-panel--own">
          <h3>Your Fleet</h3>
          ${renderBoard({
            board: player.board,
            boardId: 'own',
            showShips: true,
            animateKeys: getShotKeys(player, game.incomingShot),
          })}
          ${renderFleetStatus(player, 'Your Ships')}
        </section>
        <section class="board-panel board-panel--enemy ${canFire ? 'is-active' : ''}">
          <h3>Enemy Fleet</h3>
          ${renderBoard({
            board: opponent.board,
            boardId: 'enemy',
            showShips: false,
            clickAction: canFire ? 'fire' : null,
            animateKeys: getShotKeys(opponent, game.lastShot),
          })}
          ${renderFleetStatus(opponent, 'Enemy Fleet')}
        </section>
      </div>
    </section>
  `;
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

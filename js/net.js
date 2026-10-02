// Peer-to-peer rooms over WebRTC. PeerJS's public broker is only used to find the
// other player; game messages then go directly between the two browsers.
const PEERJS_URL = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
const PEER_ID_PREFIX = 'hca31-battleship-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const JOIN_TIMEOUT_MS = 15000;

export const ROOM_CODE_LENGTH = 6;

export function generateRoomCode(random = Math.random) {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += CODE_CHARS[Math.floor(random() * CODE_CHARS.length)];
  }
  return code;
}

export function normalizeRoomCode(input) {
  return String(input ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, ROOM_CODE_LENGTH);
}

export function isValidRoomCode(code) {
  return new RegExp(`^[A-Z0-9]{${ROOM_CODE_LENGTH}}$`).test(code);
}

let peerJsPromise = null;

function loadPeerJs() {
  if (window.Peer) return Promise.resolve(window.Peer);

  peerJsPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = PEERJS_URL;
    script.onload = () => resolve(window.Peer);
    script.onerror = () => {
      peerJsPromise = null;
      script.remove();
      reject(new Error('Could not load online play. Check your internet connection.'));
    };
    document.head.appendChild(script);
  });
  return peerJsPromise;
}

function describeError(err) {
  switch (err?.type) {
    case 'peer-unavailable':
      return 'Room not found. Check the code and try again.';
    case 'browser-incompatible':
      return 'This browser does not support online play.';
    case 'unavailable-id':
      return 'Could not create a room. Please try again.';
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
      return 'Could not reach the game server. Check your internet connection.';
    default:
      return 'Connection error. Please try again.';
  }
}

// handlers: { onReady(code), onConnected(), onMessage(msg), onClose(), onError(message) }
// Every callback fires at most once per event, and none fire after session.close().
function createSession(role, handlers) {
  let peer = null;
  let conn = null;
  let connected = false;
  let closed = false;

  const session = {
    role,
    code: null,
    send(message) {
      if (conn?.open) conn.send(message);
    },
    close() {
      closed = true;
      peer?.destroy();
    },
  };

  function attach(connection) {
    conn = connection;
    conn.on('open', () => {
      if (closed) return;
      connected = true;
      handlers.onConnected();
    });
    conn.on('data', (data) => {
      if (!closed) handlers.onMessage(data);
    });
    const lost = () => {
      if (closed) return;
      closed = true;
      peer?.destroy();
      handlers.onClose();
    };
    conn.on('close', lost);
    conn.on('error', lost);
  }

  function fail(err) {
    // Broker hiccups don't matter once the direct connection is up.
    if (closed || connected) return;
    closed = true;
    peer?.destroy();
    handlers.onError(typeof err === 'string' ? err : describeError(err));
  }

  function setPeer(newPeer) {
    peer = newPeer;
    peer.on('disconnected', () => {
      if (!closed && !peer.destroyed) peer.reconnect();
    });
  }

  return { session, attach, fail, setPeer, isClosed: () => closed, hasConnection: () => conn !== null };
}

export async function hostRoom(handlers) {
  const Peer = await loadPeerJs();
  const ctx = createSession('host', handlers);

  const open = (attempt) => {
    const code = generateRoomCode();
    const peer = new Peer(PEER_ID_PREFIX + code);
    ctx.setPeer(peer);

    peer.on('open', () => {
      if (ctx.isClosed()) return;
      ctx.session.code = code;
      handlers.onReady(code);
    });
    peer.on('connection', (incoming) => {
      if (ctx.hasConnection()) {
        incoming.on('open', () => incoming.close());
        return;
      }
      ctx.attach(incoming);
    });
    peer.on('error', (err) => {
      if (err.type === 'unavailable-id' && attempt < 5) {
        peer.destroy();
        open(attempt + 1);
        return;
      }
      ctx.fail(err);
    });
  };

  open(0);
  return ctx.session;
}

export async function joinRoom(code, handlers) {
  const Peer = await loadPeerJs();
  const ctx = createSession('guest', handlers);
  ctx.session.code = code;

  const peer = new Peer();
  ctx.setPeer(peer);

  const timeout = setTimeout(() => {
    ctx.fail('Could not connect to the room. Check the code and try again.');
  }, JOIN_TIMEOUT_MS);

  peer.on('open', () => {
    if (ctx.isClosed()) return;
    const conn = peer.connect(PEER_ID_PREFIX + code, { reliable: true, serialization: 'json' });
    conn.on('open', () => clearTimeout(timeout));
    ctx.attach(conn);
  });
  peer.on('error', (err) => {
    clearTimeout(timeout);
    ctx.fail(err);
  });

  return ctx.session;
}

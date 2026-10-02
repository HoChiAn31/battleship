// Online rooms relayed through a public MQTT broker over secure WebSockets.
// A relay works on any network that can open web pages, unlike direct WebRTC,
// which fails behind strict NATs and firewalls.
const MQTT_URL = 'https://unpkg.com/mqtt@5.10.1/dist/mqtt.min.js';
const BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt'];
const TOPIC_ROOT = 'hca31-battleship/v1';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CONNECT_TIMEOUT_MS = 8000;
const JOIN_TIMEOUT_MS = 15000;
const JOIN_RETRY_MS = 2000;
const PEER_LOST_TIMEOUT_MS = 60000;

export const ROOM_CODE_LENGTH = 6;

const SERVER_ERROR = 'Could not reach the game server. Check your internet connection.';

// The first character also encodes which broker the room lives on, so the guest
// connects to the same broker the host ended up using.
export function generateRoomCode(random = Math.random, brokerIndex = 0) {
  const firstChars = [...CODE_CHARS].filter((_, i) => i % BROKERS.length === brokerIndex);
  let code = firstChars[Math.floor(random() * firstChars.length)];
  for (let i = 1; i < ROOM_CODE_LENGTH; i++) {
    code += CODE_CHARS[Math.floor(random() * CODE_CHARS.length)];
  }
  return code;
}

export function brokerIndexForCode(code) {
  return Math.max(0, CODE_CHARS.indexOf(code[0])) % BROKERS.length;
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

let mqttPromise = null;

function loadMqtt() {
  if (window.mqtt) return Promise.resolve(window.mqtt);

  mqttPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = MQTT_URL;
    script.onload = () => resolve(window.mqtt);
    script.onerror = () => {
      mqttPromise = null;
      script.remove();
      reject(new Error('Could not load online play. Check your internet connection.'));
    };
    document.head.appendChild(script);
  });
  return mqttPromise;
}

function randomId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function roomTopics(code) {
  const base = `${TOPIC_ROOT}/${code}`;
  return { presence: `${base}/presence`, host: `${base}/host`, guest: `${base}/guest` };
}

function parse(payload) {
  try {
    const text = payload.toString();
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function connectBroker(mqtt, url, clientId, will) {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect(url, {
      clientId,
      clean: true,
      keepalive: 10,
      reconnectPeriod: 2000,
      connectTimeout: CONNECT_TIMEOUT_MS,
      will: { ...will, payload: JSON.stringify(will.payload), qos: 1 },
    });
    // Without a listener, an 'error' event would throw; reconnects are automatic.
    client.on('error', () => {});
    const timer = setTimeout(() => {
      client.end(true);
      reject(new Error(SERVER_ERROR));
    }, CONNECT_TIMEOUT_MS);
    client.once('connect', () => {
      clearTimeout(timer);
      resolve(client);
    });
  });
}

// Shared plumbing for both sides: JSON publishing, connection status callbacks,
// and giving up on an opponent who dropped and never came back.
function createLink(client, handlers, { outbox, me }) {
  let closed = false;
  let lost = false;
  let lostTimer = null;

  const link = {
    get closed() {
      return closed;
    },
    publish(topic, message, options = {}) {
      client.publish(topic, JSON.stringify({ ...message, from: me }), { qos: 1, ...options });
    },
    send(message, extra = {}) {
      link.publish(outbox, { type: 'data', data: message, ...extra });
    },
    peerLost() {
      lost = true;
      handlers.onPeerStatus?.(false);
      clearTimeout(lostTimer);
      lostTimer = setTimeout(() => link.end(handlers.onClose), PEER_LOST_TIMEOUT_MS);
    },
    peerBack() {
      if (!lost) return;
      lost = false;
      clearTimeout(lostTimer);
      handlers.onPeerStatus?.(true);
    },
    end(callback, beforeEnd) {
      if (closed) return;
      closed = true;
      clearTimeout(lostTimer);
      beforeEnd?.();
      client.end(false);
      callback?.();
    },
  };

  client.on('offline', () => !closed && handlers.onSelfStatus?.(false));
  client.on('connect', () => !closed && handlers.onSelfStatus?.(true));
  return link;
}

// handlers: { onReady(code), onConnected(), onMessage(msg), onClose(), onError(message),
//             onPeerStatus(online), onSelfStatus(online), onReconnect() }
export async function hostRoom(handlers) {
  const mqtt = await loadMqtt();
  const me = randomId();

  for (let brokerIndex = 0; brokerIndex < BROKERS.length; brokerIndex++) {
    const code = generateRoomCode(Math.random, brokerIndex);
    const topics = roomTopics(code);
    let client;
    try {
      client = await connectBroker(mqtt, BROKERS[brokerIndex], me, {
        topic: topics.guest,
        payload: { type: 'lost', from: me },
      });
    } catch {
      continue;
    }
    return startHost(client, code, topics, me, handlers);
  }
  throw new Error(SERVER_ERROR);
}

function startHost(client, code, topics, me, handlers) {
  let guestId = null;
  const link = createLink(client, handlers, { outbox: topics.guest, me });

  const announce = () =>
    link.publish(topics.presence, { host: me, full: guestId !== null }, { retain: true });

  client.subscribe(topics.host, { qos: 1 });
  announce();

  client.on('connect', () => {
    if (link.closed) return;
    announce();
    if (guestId) handlers.onReconnect?.();
  });

  client.on('message', (topic, payload) => {
    const message = parse(payload);
    if (link.closed || !message?.from) return;

    if (message.type === 'join') {
      if (guestId && message.from !== guestId) {
        link.publish(topics.guest, { type: 'full', to: message.from });
        return;
      }
      const isNewGuest = guestId === null;
      guestId = message.from;
      link.publish(topics.guest, { type: 'welcome', to: guestId });
      if (isNewGuest) {
        announce();
        handlers.onConnected();
      }
      return;
    }

    if (message.from !== guestId) return;
    if (message.type === 'leave') link.end(handlers.onClose);
    else if (message.type === 'lost') link.peerLost();
    else if (message.type === 'hello') {
      // The guest may have missed updates while offline.
      link.peerBack();
      handlers.onReconnect?.();
    } else if (message.type === 'data') {
      link.peerBack();
      handlers.onMessage(message.data);
    }
  });

  handlers.onReady(code);

  return {
    role: 'host',
    code,
    send: (message) => link.send(message, { to: guestId }),
    close: () =>
      link.end(null, () => {
        if (guestId) link.publish(topics.guest, { type: 'leave', to: guestId });
        client.publish(topics.presence, '', { qos: 1, retain: true });
      }),
  };
}

export async function joinRoom(code, handlers) {
  const mqtt = await loadMqtt();
  const me = randomId();
  const topics = roomTopics(code);

  const client = await connectBroker(mqtt, BROKERS[brokerIndexForCode(code)], me, {
    topic: topics.host,
    payload: { type: 'lost', from: me },
  });

  const link = createLink(client, handlers, { outbox: topics.host, me });
  let hostId = null;
  let joined = false;
  let retryTimer = null;

  const fail = (message) => {
    clearInterval(retryTimer);
    clearTimeout(joinTimer);
    link.end(() => handlers.onError(message));
  };

  const joinTimer = setTimeout(() => {
    fail(hostId ? 'Could not connect to the room. Please try again.' : 'Room not found. Check the code and try again.');
  }, JOIN_TIMEOUT_MS);

  const requestJoin = () => link.publish(topics.host, { type: 'join' });

  client.subscribe([topics.presence, topics.guest], { qos: 1 });

  client.on('connect', () => {
    if (!link.closed && joined) link.publish(topics.host, { type: 'hello' });
  });

  client.on('message', (topic, payload) => {
    if (link.closed) return;
    const message = parse(payload);

    if (topic === topics.presence) {
      if (!message) {
        // The host cleared the room: it was closed before we got in, or the host left.
        if (joined) link.end(handlers.onClose);
        else if (hostId) fail('Room not found. Check the code and try again.');
        return;
      }
      if (joined || hostId) return;
      if (message.full) {
        fail('This room is already full.');
        return;
      }
      hostId = message.host;
      requestJoin();
      retryTimer = setInterval(requestJoin, JOIN_RETRY_MS);
      return;
    }

    if (!message || message.from !== hostId || (message.to && message.to !== me)) return;

    if (message.type === 'welcome') {
      if (joined) return;
      joined = true;
      clearInterval(retryTimer);
      clearTimeout(joinTimer);
      handlers.onConnected();
    } else if (message.type === 'full') {
      fail('This room is already full.');
    } else if (message.type === 'leave') {
      link.end(handlers.onClose);
    } else if (message.type === 'lost') {
      link.peerLost();
    } else if (message.type === 'data') {
      link.peerBack();
      handlers.onMessage(message.data);
    }
  });

  return {
    role: 'guest',
    code,
    send: (message) => link.send(message),
    close: () => {
      clearInterval(retryTimer);
      clearTimeout(joinTimer);
      link.end(null, () => link.publish(topics.host, { type: 'leave' }));
    },
  };
}

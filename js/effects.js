import { SHOT_RESULT } from './constants.js';

const FIRE_COLORS = ['#fff6c2', '#ffd23f', '#ff9f1c', '#ff5a2e', '#ff3b4f'];
const WATER_COLORS = ['#e6f6ff', '#9fdcff', '#3fc1ff'];

let layer = null;

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function getLayer() {
  if (!layer || !layer.isConnected) {
    layer = document.createElement('div');
    layer.className = 'fx-layer';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);
  }
  return layer;
}

function spawn(className, x, y, size) {
  const el = document.createElement('span');
  el.className = className;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  getLayer().appendChild(el);
  return el;
}

function play(el, keyframes, options) {
  const animation = el.animate(keyframes, { fill: 'forwards', ...options });
  animation.onfinish = () => el.remove();
  animation.oncancel = () => el.remove();
}

function centerOf(el) {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, size: rect.width };
}

function random(min, max) {
  return min + Math.random() * (max - min);
}

function burst(x, y, { count, colors, distance, size, duration, gravity = 0 }) {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + random(-0.3, 0.3);
    const dist = distance * random(0.45, 1);
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    const particleSize = size * random(0.6, 1.4);
    const color = colors[Math.floor(Math.random() * colors.length)];

    const particle = spawn('fx-particle', x, y, particleSize);
    particle.style.background = color;
    particle.style.boxShadow = `0 0 ${particleSize * 1.6}px ${color}`;

    play(
      particle,
      [
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.85)`, opacity: 1, offset: 0.55 },
        { transform: `translate(calc(-50% + ${dx * 1.15}px), calc(-50% + ${dy * 1.15 + gravity}px)) scale(0.2)`, opacity: 0 },
      ],
      { duration: duration * random(0.8, 1.2), easing: 'cubic-bezier(0.15, 0.7, 0.3, 1)' }
    );
  }
}

function flash(x, y, size, duration = 450) {
  play(
    spawn('fx-flash', x, y, size),
    [
      { transform: 'translate(-50%, -50%) scale(0.2)', opacity: 1 },
      { transform: 'translate(-50%, -50%) scale(1.6)', opacity: 0.9, offset: 0.35 },
      { transform: 'translate(-50%, -50%) scale(2.2)', opacity: 0 },
    ],
    { duration, easing: 'ease-out' }
  );
}

function shockwave(x, y, size) {
  play(
    spawn('fx-ring', x, y, size),
    [
      { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0.9 },
      { transform: 'translate(-50%, -50%) scale(4)', opacity: 0 },
    ],
    { duration: 700, easing: 'cubic-bezier(0.2, 0.6, 0.3, 1)' }
  );
}

function shakeScreen() {
  document.getElementById('app')?.animate(
    [
      { transform: 'translate(0, 0)' },
      { transform: 'translate(-7px, 4px)' },
      { transform: 'translate(6px, -5px)' },
      { transform: 'translate(-5px, -3px)' },
      { transform: 'translate(4px, 5px)' },
      { transform: 'translate(-2px, 2px)' },
      { transform: 'translate(0, 0)' },
    ],
    { duration: 500, easing: 'ease-out' }
  );
}

function explode(cell, big) {
  const { x, y, size } = centerOf(cell);
  flash(x, y, size * (big ? 1.8 : 1.3));
  burst(x, y, {
    count: big ? 22 : 14,
    colors: FIRE_COLORS,
    distance: size * (big ? 2.6 : 1.7),
    size: Math.max(4, size * 0.16),
    duration: big ? 900 : 650,
    gravity: big ? 24 : 10,
  });
}

function splash(cell) {
  const { x, y, size } = centerOf(cell);
  burst(x, y, {
    count: 10,
    colors: WATER_COLORS,
    distance: size * 1.1,
    size: Math.max(3, size * 0.12),
    duration: 550,
    gravity: size * 0.6,
  });
}

// cells: board cell elements involved in the shot (every ship cell when it sinks).
export function playShotEffect(cells, result) {
  if (!cells.length || prefersReducedMotion()) return;

  if (result === SHOT_RESULT.MISS) {
    splash(cells[0]);
    return;
  }
  if (result === SHOT_RESULT.HIT) {
    explode(cells[0], false);
    return;
  }

  cells.forEach((cell, i) => setTimeout(() => explode(cell, true), i * 110));
  const middle = centerOf(cells[Math.floor(cells.length / 2)]);
  setTimeout(() => shockwave(middle.x, middle.y, middle.size * 2), cells.length * 55);
  shakeScreen();
}

export function celebrateVictory() {
  if (prefersReducedMotion()) return;

  for (let i = 0; i < 9; i++) {
    setTimeout(() => {
      const x = random(0.12, 0.88) * window.innerWidth;
      const y = random(0.12, 0.5) * window.innerHeight;
      const hue = Math.floor(random(0, 360));
      const colors = [`hsl(${hue} 100% 65%)`, `hsl(${(hue + 40) % 360} 100% 70%)`, '#ffffff'];
      flash(x, y, 40, 350);
      burst(x, y, { count: 36, colors, distance: random(90, 160), size: 5, duration: 1400, gravity: 70 });
    }, 500 + i * 330);
  }
}

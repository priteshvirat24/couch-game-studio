// Couch Game Studio engine.
// One engine, any GameSpec. Four genres (catcher, runner, maze, shooter),
// stackable modifiers, up to 4 co-op players (TV remote + phones).
// Pure canvas 2D, no dependencies, sized for a 1280x720 TV frame.

export const W = 1280;
export const H = 720;
const HUD_H = 64;
const PLAYER_COLORS = ['#ffd166', '#06d6a0', '#ef476f', '#4cc9f0'];

// ---------------------------------------------------------------- sprites ---

// Twemoji file name for an emoji (strip FE0F unless it's a ZWJ sequence).
export function emojiCode(e) {
  const cps = Array.from(e).map((c) => c.codePointAt(0).toString(16));
  return (cps.includes('200d') ? cps : cps.filter((c) => c !== 'fe0f')).join('-');
}

const spriteCache = new Map();
export function loadSprite(src) {
  if (spriteCache.has(src)) return spriteCache.get(src);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
  spriteCache.set(src, p);
  return p;
}

// Sprites render as images (identical on every device). If an image can't load,
// we fall back to drawing the emoji as text.
class SpriteBook {
  constructor() { this.map = new Map(); }
  async add(key, emoji, imageSrc) {
    const img = await loadSprite(imageSrc || `/emoji/${emojiCode(emoji)}.svg`);
    this.map.set(key, { img, emoji });
  }
  draw(ctx, key, x, y, size, { rot = 0, alpha = 1, flip = false } = {}) {
    const s = this.map.get(key);
    if (!s) return;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    if (flip) ctx.scale(-1, 1);
    if (s.img) {
      const ar = s.img.naturalWidth && s.img.naturalHeight ? s.img.naturalWidth / s.img.naturalHeight : 1;
      const w = ar >= 1 ? size : size * ar;
      const h = ar >= 1 ? size / ar : size;
      ctx.drawImage(s.img, -w / 2, -h / 2, w, h);
    } else {
      ctx.font = `${Math.round(size * 0.9)}px "Apple Color Emoji","Noto Color Emoji","Segoe UI Emoji",sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(s.emoji, 0, size * 0.05);
    }
    ctx.restore();
  }
}

// ------------------------------------------------------------------ audio ---

class Sfx {
  constructor() { this.ctx = null; this.muted = false; }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) this.ctx = new AC();
  }
  tone(freq, dur, { type = 'sine', vol = 0.15, slide = 0, delay = 0 } = {}) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  collect() { this.tone(660, 0.09, { type: 'triangle' }); this.tone(990, 0.12, { type: 'triangle', delay: 0.06 }); }
  hit() { this.tone(180, 0.25, { type: 'sawtooth', vol: 0.12, slide: -120 }); }
  shoot() { this.tone(880, 0.08, { type: 'square', vol: 0.05, slide: -500 }); }
  pop() { this.tone(300, 0.12, { type: 'triangle', vol: 0.12, slide: 500 }); }
  jump() { this.tone(400, 0.12, { type: 'sine', vol: 0.1, slide: 300 }); }
  win() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, { type: 'triangle', delay: i * 0.12 })); }
  lose() { [392, 330, 262].forEach((f, i) => this.tone(f, 0.3, { type: 'sine', delay: i * 0.18 })); }
}
export const sfx = new Sfx();

// Tiny procedural chiptune: bass + arpeggio + hi-hat, scheduled with lookahead so it
// never drifts. Key and tempo come from the game so every game sounds a bit different.
class Music {
  constructor(sfx) { this.sfx = sfx; this.timer = null; }
  start({ genre = 'catcher', speed = 4, seed = 0 } = {}) {
    this.stop();
    const ctx = this.sfx.ctx;
    if (!ctx || this.sfx.muted) return;
    const roots = [196, 220, 247, 262, 294];
    const root = roots[seed % roots.length];
    const minor = genre === 'maze' || genre === 'shooter';
    const scale = minor ? [0, 3, 5, 7, 10, 12] : [0, 2, 4, 7, 9, 12];
    const bpm = { catcher: 120, runner: 140, maze: 108, shooter: 132 }[genre] + speed * 3;
    const step = 60 / bpm / 2; // eighth notes
    const prog = minor ? [0, 5, 3, 4] : [0, 3, 4, 0];
    const master = ctx.createGain();
    master.gain.value = 0.055;
    master.connect(ctx.destination);
    this.master = master;
    let n = 0;
    let t = ctx.currentTime + 0.1;
    const note = (freq, at, dur, type, vol) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, at);
      g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g).connect(master); o.start(at); o.stop(at + dur + 0.02);
    };
    const hat = (at) => {
      const len = Math.floor(ctx.sampleRate * 0.03);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource(); const g = ctx.createGain();
      src.buffer = buf; g.gain.value = 0.35; src.connect(g).connect(master); src.start(at);
    };
    const semis = (r, k) => r * Math.pow(2, k / 12);
    const tick = () => {
      while (t < ctx.currentTime + 0.25) {
        const bar = Math.floor(n / 8) % prog.length;
        const chordRoot = semis(root, scale[prog[bar] % scale.length]);
        if (n % 4 === 0) note(chordRoot / 2, t, step * 3.5, 'triangle', 0.9);
        const arp = [0, 2, 4, 2, 0, 4, 2, 5][n % 8];
        note(semis(chordRoot, scale[arp % scale.length]) * 2, t, step * 0.9, 'square', 0.22);
        if (n % 2 === 1) hat(t);
        t += step; n += 1;
      }
    };
    tick();
    this.timer = setInterval(tick, 100);
  }
  duck(on) { if (this.master) this.master.gain.value = on ? 0.015 : 0.055; }
  stop() {
    clearInterval(this.timer); this.timer = null;
    if (this.master) { try { this.master.disconnect(); } catch {} this.master = null; }
  }
}
export const music = new Music(sfx);

// ---------------------------------------------------------------- helpers ---

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const hits = (a, ar, b, br) => dist2(a, b) < (ar + br) ** 2;

function weightedGoodie(goodies) {
  // Higher-point goodies are rarer.
  const weights = goodies.map((g) => 1 / Math.sqrt(g.points));
  let r = Math.random() * weights.reduce((s, w) => s + w, 0);
  for (let i = 0; i < goodies.length; i++) { r -= weights[i]; if (r <= 0) return i; }
  return 0;
}

// =================================================================== Game ===

export class Game {
  constructor(canvas, spec, { onEvent = () => {} } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    canvas.width = W;
    canvas.height = H;
    this.spec = spec;
    this.onEvent = onEvent;
    this.sprites = new SpriteBook();
    this.mods = new Set(spec.modifiers || []);
    this.running = false;
    this.state = 'loading';
    this.players = [];
    this.inputs = new Map(); // playerId -> {left,right,up,down,action}
    this.particles = [];
    this.floaters = [];
    this.trail = [];
    this.shake = 0;
    this.t = 0;
    this.score = 0;
    this.lives = spec.rules.lives;
    this.goal = spec.rules.goalScore;
    this.timeScale = this.mods.has('slow_motion') ? 0.7 : 1;
    this.heroSize = 100 * (this.mods.has('giant_hero') ? 1.55 : this.mods.has('tiny_hero') ? 0.65 : 1);
    this.addPlayer('tv');
    this._loop = this._loop.bind(this);
  }

  async load() {
    const s = this.spec;
    const jobs = [this.sprites.add('hero', s.hero.emoji, s.hero.image)];
    s.goodies.forEach((g, i) => jobs.push(this.sprites.add(`g${i}`, g.emoji)));
    s.hazards.forEach((h, i) => jobs.push(this.sprites.add(`h${i}`, h.emoji)));
    s.theme.scenery.forEach((e, i) => jobs.push(this.sprites.add(`s${i}`, e)));
    jobs.push(this.sprites.add('proj', s.projectile));
    jobs.push(this.sprites.add('goal', s.goal));
    jobs.push(this.sprites.add('heart', '❤️'));
    jobs.push(this.sprites.add('star', '⭐'));
    await Promise.all(jobs);
    // Scenery sits on the horizon (or floats behind the maze/space), dim, so it never looks like a pickup.
    const horizon = s.genre === 'catcher' || s.genre === 'runner';
    this.scenery = Array.from({ length: horizon ? 9 : 6 }, (_, i) => {
      const size = horizon ? rand(90, 150) : rand(70, 120);
      return {
        key: s.theme.scenery.length ? `s${i % s.theme.scenery.length}` : null,
        x: (i + rand(0.1, 0.9)) * ((W + 200) / (horizon ? 9 : 6)) - 100,
        y: horizon ? H - 96 - size * 0.42 : rand(HUD_H + 60, H - 80),
        size, speed: rand(0.25, 0.45),
      };
    }).filter((d) => d.key);
    this.setup();
    this.state = 'ready';
  }

  // ---------------------------------------------------------- players ---
  addPlayer(id) {
    if (this.players.some((p) => p.id === id) || this.players.length >= 4) return false;
    const idx = this.players.length;
    const p = { id, idx, color: PLAYER_COLORS[idx], x: W / 2, y: H - 120, vx: 0, vy: 0, onGround: true, jumps: 0, inv: 0, cool: 0, face: 1, cell: null, stepT: 0 };
    this.players.push(p);
    this.inputs.set(id, { left: false, right: false, up: false, down: false, action: false });
    if (this.state !== 'loading') this.placePlayer(p);
    this.onEvent({ type: 'players', count: this.players.length });
    return true;
  }
  removePlayer(id) {
    if (id === 'tv') return;
    this.players = this.players.filter((p) => p.id !== id);
    this.players.forEach((p, i) => { p.idx = i; p.color = PLAYER_COLORS[i]; });
    this.inputs.delete(id);
    this.onEvent({ type: 'players', count: this.players.length });
  }
  input(id, action, down) {
    const inp = this.inputs.get(id);
    if (!inp) return;
    if (this.mods.has('reverse_controls')) {
      if (action === 'left') action = 'right'; else if (action === 'right') action = 'left';
    }
    const was = inp[action];
    inp[action] = down;
    if (down && !was) this.onPress(this.players.find((p) => p.id === id), action);
  }

  // ------------------------------------------------------------ setup ---
  setup() {
    const g = this.spec.genre;
    this.items = [];
    this.shots = [];
    this.spawnT = 1;
    this.boss = null;
    this.bossDone = false;
    const speed = this.spec.rules.speed;
    const lava = this.mods.has('lava_floor') ? 1.2 : 1;
    this.fallSpeed = (110 + speed * 38) * lava;
    this.spawnEvery = Math.max(0.32, 1.55 - this.spec.rules.spawnRate * 0.12);
    this.groundY = H - 96;
    if (g === 'runner') {
      this.scroll = (240 + speed * 38) * lava;
      this.distance = 0;
    }
    if (g === 'maze') this.buildMaze();
    this.players.forEach((p) => this.placePlayer(p));
  }

  placePlayer(p) {
    const g = this.spec.genre;
    const n = this.players.length;
    if (g === 'catcher' || g === 'shooter') {
      p.x = W / 2 + (p.idx - (n - 1) / 2) * 140;
      p.y = g === 'shooter' ? H - 90 : this.groundY - this.heroSize / 2 + 6;
    } else if (g === 'runner') {
      p.x = 210 + p.idx * 95;
      p.y = this.groundY - this.heroSize / 2;
      p.vy = 0; p.onGround = true; p.jumps = 0;
    } else if (g === 'maze') {
      p.cell = { c: 0, r: 0 };
      const { x, y } = this.cellCenter(0, 0);
      p.x = x; p.y = y; p.tx = x; p.ty = y;
    }
  }

  // ------------------------------------------------------------- loop ---
  start() {
    if (this.running) return;
    sfx.unlock();
    this.running = true;
    this.state = 'countdown';
    this.countdown = 3.2;
    const seed = [...this.spec.title].reduce((a, c) => a + c.charCodeAt(0), 0);
    music.start({ genre: this.spec.genre, speed: this.spec.rules.speed, seed });
    this.last = performance.now();
    requestAnimationFrame(this._loop);
  }
  pause() { if (this.state === 'play' || this.state === 'countdown') { this.state = 'paused'; music.duck(true); this.onEvent({ type: 'paused' }); } }
  resume() { if (this.state === 'paused') { this.state = 'play'; music.duck(false); this.last = performance.now(); } }
  stop() { this.running = false; music.stop(); }

  _loop(now) {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.last) / 1000) * this.timeScale;
    this.last = now;
    if (this.state === 'play') this.update(dt);
    else if (this.state === 'countdown') {
      const before = Math.ceil(this.countdown - 0.2);
      this.countdown -= dt / this.timeScale;
      const after = Math.ceil(this.countdown - 0.2);
      if (after !== before) after > 0 ? sfx.tone(520, 0.12, { type: 'triangle', vol: 0.12 }) : sfx.tone(1040, 0.3, { type: 'triangle', vol: 0.14 });
      if (this.countdown <= 0) this.state = 'play';
    }
    this.updateFx(dt);
    this.draw();
    requestAnimationFrame(this._loop);
  }

  update(dt) {
    this.t += dt;
    for (const p of this.players) { p.inv = Math.max(0, p.inv - dt); p.cool = Math.max(0, p.cool - dt); }
    const g = this.spec.genre;
    if (g === 'catcher') this.updateCatcher(dt);
    else if (g === 'runner') this.updateRunner(dt);
    else if (g === 'maze') this.updateMaze(dt);
    else this.updateShooter(dt);
    if (this.mods.has('rainbow_trail') && Math.floor(this.t * 30) !== Math.floor((this.t - dt) * 30)) {
      for (const p of this.players) this.trail.push({ x: p.x, y: p.y + this.heroSize * 0.25, life: 0.6, hue: (this.t * 360) % 360 });
    }
    if (this.mods.has('boss') && !this.boss && !this.bossDone && g !== 'maze' && this.score >= this.goal * 0.6) this.spawnBoss();
  }

  // -------------------------------------------------------- scoring ---
  addPoints(n, x, y) {
    const pts = n * (this.mods.has('double_points') ? 2 : 1);
    this.score += pts;
    this.floaters.push({ x, y, text: `+${pts}`, life: 0.9, color: '#fff' });
    this.burst(x, y, this.mods.has('confetti') ? 26 : 10, true);
    sfx.collect();
    this.onEvent({ type: 'score', score: this.score, goal: this.goal });
    if (this.spec.genre !== 'maze' && this.score >= this.goal) this.finish(true);
  }
  hurt(p) {
    if (p.inv > 0 || this.state !== 'play') return;
    this.lives -= 1;
    p.inv = 1.4;
    this.shake = 0.35;
    this.burst(p.x, p.y, 16, false);
    sfx.hit();
    this.onEvent({ type: 'lives', lives: this.lives });
    if (this.lives <= 0) this.finish(false);
  }
  finish(won) {
    if (this.state !== 'play') return;
    this.state = won ? 'win' : 'lose';
    music.stop();
    if (won) { sfx.win(); for (let i = 0; i < 6; i++) this.burst(rand(200, W - 200), rand(150, 450), 30, true); }
    else sfx.lose();
    setTimeout(() => this.onEvent({ type: 'end', won, score: this.score }), won ? 1400 : 900);
  }

  // ===================================================== CATCHER ===
  updateCatcher(dt) {
    const speed = 560;
    for (const p of this.players) {
      const inp = this.inputs.get(p.id);
      p.vx = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      if (p.vx) p.face = p.vx;
      p.x = clamp(p.x + p.vx * speed * dt, this.heroSize / 2, W - this.heroSize / 2);
      if (this.mods.has('bouncy')) p.y = this.groundY - this.heroSize / 2 + 6 - Math.abs(Math.sin(this.t * 6 + p.idx)) * 26;
    }
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = this.spawnEvery * rand(0.7, 1.3) / Math.sqrt(this.players.length);
      const good = Math.random() < 0.62;
      const idx = good ? weightedGoodie(this.spec.goodies) : Math.floor(Math.random() * this.spec.hazards.length);
      this.items.push({ good, idx, x: rand(50, W - 50), y: HUD_H - 20, vy: this.fallSpeed * rand(0.8, 1.25), rot: rand(-1, 1), spin: rand(-2, 2), size: good ? 72 : 76 });
    }
    const wind = this.mods.has('wind') ? Math.sin(this.t * 0.8) * 90 : 0;
    for (const it of this.items) {
      it.y += it.vy * dt;
      it.x = clamp(it.x + wind * dt, 30, W - 30);
      it.rot += it.spin * dt;
      for (const p of this.players) {
        if (!it.dead && hits(it, it.size * 0.42, p, this.heroSize * 0.42)) {
          it.dead = true;
          if (it.good) this.addPoints(this.spec.goodies[it.idx].points, it.x, it.y);
          else this.hurt(p);
        }
      }
      if (it.y > H + 40) it.dead = true;
    }
    this.updateBoss(dt);
    this.items = this.items.filter((i) => !i.dead);
  }

  // ====================================================== RUNNER ===
  onPress(p, action) {
    if (!p || this.state !== 'play') return;
    const g = this.spec.genre;
    if (g === 'runner' && (action === 'up' || action === 'action')) {
      if (p.onGround || p.jumps < 2) {
        p.vy = this.mods.has('bouncy') ? -1180 : -980;
        p.onGround = false;
        p.jumps += 1;
        sfx.jump();
        this.burst(p.x, p.y + this.heroSize / 2, 6, false, '#ffffffaa');
      }
    }
    if (g === 'shooter' && action === 'action') this.fire(p);
    if (g === 'maze') p.stepT = 0; // react instantly to a new press
  }

  updateRunner(dt) {
    this.distance += this.scroll * dt;
    for (const p of this.players) {
      const inp = this.inputs.get(p.id);
      // Holding jump floats a little longer: friendlier for small kids.
      const grav = (inp.up || inp.action) && p.vy < 0 ? 1700 : 2600;
      p.vy += grav * dt;
      p.y += p.vy * dt;
      const floor = this.groundY - this.heroSize / 2;
      if (p.y >= floor) { p.y = floor; p.vy = 0; p.onGround = true; p.jumps = 0; }
    }
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = this.spawnEvery * rand(0.9, 1.6) + 0.35;
      const r = Math.random();
      if (r < 0.5) {
        const flying = this.spec.rules.speed >= 6 && Math.random() < 0.3;
        this.items.push({ good: false, idx: Math.floor(Math.random() * this.spec.hazards.length), x: W + 60, y: flying ? this.groundY - 175 : this.groundY - 34, size: 68, passed: false });
      } else {
        const n = Math.random() < 0.4 ? 3 : 1;
        const y = this.groundY - rand(120, 260);
        const idx = weightedGoodie(this.spec.goodies);
        for (let i = 0; i < n; i++) this.items.push({ good: true, idx, x: W + 60 + i * 80, y: y - Math.sin(i / 2 * Math.PI) * 30, size: 58 });
      }
    }
    const v = this.scroll;
    for (const it of this.items) {
      it.x -= v * dt;
      for (const p of this.players) {
        if (!it.dead && hits(it, it.size * 0.38, p, this.heroSize * 0.38)) {
          if (it.good) { it.dead = true; this.addPoints(this.spec.goodies[it.idx].points, it.x, it.y); }
          else this.hurt(p);
        }
      }
      // A cleared obstacle is worth a point, so every jump feels rewarded.
      if (!it.good && !it.passed && it.x < Math.min(...this.players.map((p) => p.x)) - 50) { it.passed = true; if (this.state === 'play') this.addPoints(1, it.x, it.y - 60); }
      if (it.x < -100) it.dead = true;
    }
    this.updateBoss(dt);
    this.items = this.items.filter((i) => !i.dead);
  }

  // ======================================================== MAZE ===
  buildMaze() {
    const cols = 17, rows = 9;
    const size = Math.floor(Math.min((W - 80) / cols, (H - HUD_H - 40) / rows));
    this.maze = { cols, rows, size, ox: Math.round((W - cols * size) / 2), oy: HUD_H + Math.round((H - HUD_H - rows * size) / 2) };
    // walls[r][c] = {n,e,s,w}
    const walls = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ n: true, e: true, s: true, w: true })));
    const seen = Array.from({ length: rows }, () => Array(cols).fill(false));
    const stack = [[0, 0]];
    seen[0][0] = true;
    const dirs = [[0, -1, 'n', 's'], [1, 0, 'e', 'w'], [0, 1, 's', 'n'], [-1, 0, 'w', 'e']];
    while (stack.length) {
      const [c, r] = stack[stack.length - 1];
      const opts = dirs.filter(([dc, dr]) => { const nc = c + dc, nr = r + dr; return nc >= 0 && nr >= 0 && nc < cols && nr < rows && !seen[nr][nc]; });
      if (!opts.length) { stack.pop(); continue; }
      const [dc, dr, a, b] = pick(opts);
      walls[r][c][a] = false; walls[r + dr][c + dc][b] = false;
      seen[r + dr][c + dc] = true;
      stack.push([c + dc, r + dr]);
    }
    // Knock out extra walls so there are loops: no frustrating dead ends for little kids.
    for (let i = 0; i < cols * rows * 0.18; i++) {
      const c = Math.floor(rand(0, cols - 1)), r = Math.floor(rand(0, rows));
      walls[r][c].e = false; walls[r][c + 1].w = false;
    }
    this.maze.walls = walls;
    const open = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (c + r > 3) open.push({ c, r });
    open.sort(() => Math.random() - 0.5);
    const count = clamp(Math.round(this.goal / 2), 6, 16);
    this.items = open.slice(0, count).map((cell) => {
      const { x, y } = this.cellCenter(cell.c, cell.r);
      const idx = weightedGoodie(this.spec.goodies);
      return { good: true, idx, x, y, size: size * 0.62, bob: rand(0, 6) };
    });
    this.goal = this.items.reduce((s, it) => s + this.spec.goodies[it.idx].points, 0) * (this.mods.has('double_points') ? 2 : 1);
    this.mazeExit = { c: cols - 1, r: rows - 1, open: false };
    const nHaz = clamp(1 + Math.floor(this.spec.rules.spawnRate / 3) + (this.mods.has('boss') ? 1 : 0), 1, 5);
    this.chasers = Array.from({ length: nHaz }, (_, i) => {
      const cell = open[open.length - 1 - i];
      const { x, y } = this.cellCenter(cell.c, cell.r);
      return { cell: { ...cell }, x, y, tx: x, ty: y, idx: i % this.spec.hazards.length, stepT: 0, boss: this.mods.has('boss') && i === nHaz - 1 };
    });
    this.heroSize = Math.min(this.heroSize, size * 0.82);
  }
  cellCenter(c, r) { const m = this.maze; return { x: m.ox + c * m.size + m.size / 2, y: m.oy + r * m.size + m.size / 2 }; }
  canMove(cell, dir) {
    const w = this.maze.walls[cell.r][cell.c];
    return !w[dir];
  }
  stepCell(cell, dir) {
    const d = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[dir];
    return { c: cell.c + d[0], r: cell.r + d[1] };
  }

  updateMaze(dt) {
    const stepTime = Math.max(0.09, 0.17 - this.spec.rules.speed * 0.006);
    const glide = (o, spd) => {
      const k = Math.min(1, dt * spd);
      o.x += (o.tx - o.x) * k; o.y += (o.ty - o.y) * k;
    };
    for (const p of this.players) {
      const inp = this.inputs.get(p.id);
      p.stepT -= dt;
      const dir = inp.up ? 'n' : inp.down ? 's' : inp.left ? 'w' : inp.right ? 'e' : null;
      if (dir && p.stepT <= 0 && this.canMove(p.cell, dir)) {
        p.cell = this.stepCell(p.cell, dir);
        const c = this.cellCenter(p.cell.c, p.cell.r);
        p.tx = c.x; p.ty = c.y; p.stepT = stepTime;
        if (dir === 'w') p.face = -1; if (dir === 'e') p.face = 1;
      }
      glide(p, 22);
      for (const it of this.items) {
        if (!it.dead && hits(it, it.size * 0.4, p, this.heroSize * 0.35)) { it.dead = true; this.addPoints(this.spec.goodies[it.idx].points, it.x, it.y); }
      }
      if (this.mazeExit.open && p.cell.c === this.mazeExit.c && p.cell.r === this.mazeExit.r) this.finish(true);
    }
    this.items = this.items.filter((i) => !i.dead);
    if (!this.items.length && !this.mazeExit.open) {
      this.mazeExit.open = true;
      const { x, y } = this.cellCenter(this.mazeExit.c, this.mazeExit.r);
      this.floaters.push({ x, y: y - 40, text: 'Exit open!', life: 2, color: '#ffd166' });
      sfx.win();
    }
    const chaseTime = Math.max(0.22, 0.6 - this.spec.rules.speed * 0.035);
    for (const h of this.chasers) {
      h.stepT -= dt;
      if (h.stepT <= 0) {
        h.stepT = chaseTime * (h.boss ? 0.75 : 1);
        const moves = ['n', 's', 'e', 'w'].filter((d) => this.canMove(h.cell, d));
        let dir = pick(moves);
        // Sometimes step toward the nearest player, but never relentlessly.
        if (Math.random() < (h.boss ? 0.6 : 0.35)) {
          const target = this.players.reduce((best, p) => (!best || dist2(p, h) < dist2(best, h) ? p : best), null);
          if (target) {
            const best = moves.map((d) => ({ d, c: this.stepCell(h.cell, d) }))
              .sort((a, b) => (Math.abs(a.c.c - target.cell.c) + Math.abs(a.c.r - target.cell.r)) - (Math.abs(b.c.c - target.cell.c) + Math.abs(b.c.r - target.cell.r)))[0];
            if (best) dir = best.d;
          }
        }
        if (dir && (!h.prev || moves.length === 1 || dir !== { n: 's', s: 'n', e: 'w', w: 'e' }[h.prev])) {
          h.cell = this.stepCell(h.cell, dir); h.prev = dir;
          const c = this.cellCenter(h.cell.c, h.cell.r); h.tx = c.x; h.ty = c.y;
        }
      }
      glide(h, 10);
      for (const p of this.players) {
        if (p.inv <= 0 && hits(h, this.maze.size * 0.32, p, this.maze.size * 0.32)) {
          this.hurt(p);
          if (this.state === 'play') { p.cell = { c: 0, r: 0 }; const c = this.cellCenter(0, 0); p.tx = c.x; p.ty = c.y; }
        }
      }
    }
  }

  // ===================================================== SHOOTER ===
  fire(p) {
    if (p.cool > 0) return;
    p.cool = 0.22;
    this.shots.push({ x: p.x, y: p.y - this.heroSize / 2, vy: -900 });
    sfx.shoot();
  }

  updateShooter(dt) {
    const speed = 620;
    for (const p of this.players) {
      const inp = this.inputs.get(p.id);
      p.vx = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      p.x = clamp(p.x + p.vx * speed * dt, this.heroSize / 2, W - this.heroSize / 2);
      if (inp.action) this.fire(p); // hold to auto-fire
      if (this.mods.has('bouncy')) p.y = H - 90 - Math.abs(Math.sin(this.t * 5 + p.idx)) * 20;
    }
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = this.spawnEvery * rand(0.8, 1.3) / Math.sqrt(this.players.length);
      const good = Math.random() < 0.2;
      const idx = good ? weightedGoodie(this.spec.goodies) : Math.floor(Math.random() * this.spec.hazards.length);
      this.items.push({ good, idx, x: rand(60, W - 60), y: HUD_H - 10, vy: this.fallSpeed * (good ? 1.1 : rand(0.55, 0.85)), phase: rand(0, 6), size: good ? 60 : 72 });
    }
    for (const s of this.shots) { s.y += s.vy * dt; if (s.y < HUD_H - 30) s.dead = true; }
    const wind = this.mods.has('wind') ? Math.sin(this.t * 0.8) * 70 : 0;
    for (const it of this.items) {
      it.y += it.vy * dt;
      it.x = clamp(it.x + (Math.sin(this.t * 2 + it.phase) * 50 + wind) * dt, 30, W - 30);
      if (!it.good) {
        for (const s of this.shots) {
          if (!s.dead && !it.dead && hits(it, it.size * 0.45, s, 16)) { s.dead = true; it.dead = true; sfx.pop(); this.addPoints(1, it.x, it.y); }
        }
      }
      for (const p of this.players) {
        if (!it.dead && hits(it, it.size * 0.4, p, this.heroSize * 0.4)) {
          it.dead = true;
          if (it.good) this.addPoints(this.spec.goodies[it.idx].points, it.x, it.y); else this.hurt(p);
        }
      }
      if (!it.dead && it.y > H - 20) {
        it.dead = true;
        if (!it.good) this.hurt(this.players[0]); // an invader got through
      }
    }
    this.updateBoss(dt);
    this.shots = this.shots.filter((s) => !s.dead);
    this.items = this.items.filter((i) => !i.dead);
  }

  // ========================================================= BOSS ===
  spawnBoss() {
    this.boss = { x: W / 2, y: HUD_H + 140, size: 190, hp: this.spec.genre === 'shooter' ? 12 : 1, maxHp: 12, idx: 0, t: 0, dropT: 1.5 };
    this.floaters.push({ x: W / 2, y: H / 2, text: 'BOSS!', life: 1.6, color: '#ef476f', big: true });
    this.shake = 0.5;
    sfx.hit();
  }
  updateBoss(dt) {
    const b = this.boss;
    if (!b) return;
    b.t += dt;
    const g = this.spec.genre;
    if (g === 'shooter') {
      b.x = W / 2 + Math.sin(b.t * 0.9) * (W / 2 - 160);
      b.dropT -= dt;
      if (b.dropT <= 0) { b.dropT = 1.1; this.items.push({ good: false, idx: 0, x: b.x, y: b.y + 70, vy: this.fallSpeed * 0.9, phase: 0, size: 56 }); }
      for (const s of this.shots) {
        if (!s.dead && hits(b, b.size * 0.42, s, 16)) {
          s.dead = true; b.hp -= 1; this.burst(s.x, s.y, 8, true); sfx.pop();
          if (b.hp <= 0) { this.boss = null; this.bossDone = true; this.addPoints(10, b.x, b.y); return; }
        }
      }
    } else if (g === 'catcher') {
      // The boss sweeps across dropping a rain of hazards, then leaves.
      b.x = -150 + b.t * 260;
      b.dropT -= dt;
      if (b.dropT <= 0) { b.dropT = 0.45; this.items.push({ good: false, idx: Math.floor(Math.random() * this.spec.hazards.length), x: clamp(b.x, 40, W - 40), y: b.y + 60, vy: this.fallSpeed, rot: 0, spin: 2, size: 66 }); }
      if (b.x > W + 200) { this.boss = null; this.bossDone = true; }
    } else if (g === 'runner') {
      // A giant obstacle rolls in; clearing it is worth a lot.
      if (!b.placed) { b.placed = true; b.x = W + 160; b.y = this.groundY - 95; b.size = 170; }
      b.x -= this.scroll * 0.9 * dt;
      for (const p of this.players) if (hits(b, b.size * 0.36, p, this.heroSize * 0.36)) this.hurt(p);
      if (b.x < -200) { this.boss = null; this.bossDone = true; if (this.state === 'play') this.addPoints(5, 200, this.groundY - 200); }
    }
  }

  // =========================================================== FX ===
  burst(x, y, n, colorful, fixed) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), s = rand(120, 420);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120, life: rand(0.5, 1), size: rand(5, 11), color: fixed || (colorful ? `hsl(${rand(0, 360)},90%,60%)` : '#ffffffcc') });
    }
  }
  updateFx(dt) {
    for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 700 * dt; p.life -= dt; }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const f of this.floaters) { f.y -= 60 * dt; f.life -= dt; }
    this.floaters = this.floaters.filter((f) => f.life > 0);
    for (const t of this.trail) t.life -= dt;
    this.trail = this.trail.filter((t) => t.life > 0);
    this.shake = Math.max(0, this.shake - dt);
  }

  // ========================================================= DRAW ===
  draw() {
    const ctx = this.ctx;
    const s = this.spec;
    ctx.save();
    if (this.shake > 0) ctx.translate(rand(-1, 1) * this.shake * 22, rand(-1, 1) * this.shake * 22);

    // Sky
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, s.theme.skyTop);
    sky.addColorStop(1, s.theme.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(-30, -30, W + 60, H + 60);

    // Parallax scenery
    for (const d of this.scenery || []) {
      let x = d.x;
      if (s.genre === 'runner') x = ((d.x - (this.distance || 0) * d.speed) % (W + 200) + W + 200) % (W + 200) - 100;
      else x = d.x + Math.sin(this.t * 0.2 + d.y) * 20;
      this.sprites.draw(ctx, d.key, x, d.y, d.size, { alpha: s.genre === 'maze' ? 0.18 : 0.3 });
    }

    // Ground
    if (s.genre !== 'maze' && s.genre !== 'shooter') {
      let ground = s.theme.ground;
      if (this.mods.has('lava_floor')) {
        const glow = 0.5 + 0.5 * Math.sin(this.t * 4);
        ground = `rgb(${200 + glow * 55},${60 + glow * 60},20)`;
      }
      ctx.fillStyle = ground;
      ctx.fillRect(-30, this.groundY, W + 60, H - this.groundY + 30);
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      const off = s.genre === 'runner' ? (this.distance || 0) % 80 : 0;
      for (let x = -off; x < W + 80; x += 80) ctx.fillRect(x, this.groundY, 40, 10);
    }

    if (s.genre === 'maze') this.drawMaze(ctx);

    // Rainbow trail
    for (const t of this.trail) {
      ctx.fillStyle = `hsla(${t.hue},95%,60%,${t.life})`;
      ctx.beginPath(); ctx.arc(t.x, t.y, 14 * t.life + 4, 0, Math.PI * 2); ctx.fill();
    }

    // Items
    for (const it of this.items || []) {
      const key = it.good ? `g${it.idx}` : `h${it.idx}`;
      const bob = it.bob !== undefined ? Math.sin(this.t * 3 + it.bob) * 5 : 0;
      // Gold glow = grab it. Red glow = avoid it. Readable at a glance from the couch.
      const pulse = 0.85 + Math.sin(this.t * 6 + it.x) * 0.15;
      const glow = ctx.createRadialGradient(it.x, it.y + bob, it.size * 0.15, it.x, it.y + bob, it.size * 0.72 * pulse);
      glow.addColorStop(0, it.good ? 'rgba(255,230,120,0.75)' : 'rgba(255,60,80,0.55)');
      glow.addColorStop(1, it.good ? 'rgba(255,230,120,0)' : 'rgba(255,60,80,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(it.x, it.y + bob, it.size * 0.72 * pulse, 0, Math.PI * 2); ctx.fill();
      this.sprites.draw(ctx, key, it.x, it.y + bob, it.size, { rot: it.rot || 0 });
    }

    // Maze chasers + exit
    if (s.genre === 'maze') {
      if (this.mazeExit) {
        const { x, y } = this.cellCenter(this.mazeExit.c, this.mazeExit.r);
        this.sprites.draw(ctx, 'goal', x, y, this.maze.size * 0.75, { alpha: this.mazeExit.open ? 1 : 0.25, rot: this.mazeExit.open ? Math.sin(this.t * 4) * 0.15 : 0 });
      }
      for (const h of this.chasers) this.sprites.draw(ctx, `h${h.idx}`, h.x, h.y, this.maze.size * (h.boss ? 0.95 : 0.7));
    }

    // Shots
    for (const sh of this.shots || []) this.sprites.draw(ctx, 'proj', sh.x, sh.y, 34, { rot: this.t * 10 });

    // Boss
    if (this.boss) {
      const b = this.boss;
      this.sprites.draw(ctx, `h${b.idx}`, b.x, b.y + Math.sin(this.t * 3) * 8, b.size);
      if (s.genre === 'shooter') {
        ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(b.x - 80, b.y - b.size / 2 - 22, 160, 12);
        ctx.fillStyle = '#ef476f'; ctx.fillRect(b.x - 80, b.y - b.size / 2 - 22, 160 * (b.hp / b.maxHp), 12);
      }
    }

    // Heroes
    for (const p of this.players) {
      if (p.inv > 0 && Math.floor(p.inv * 12) % 2 === 0) continue;
      const size = this.heroSize;
      // Ground shadow
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath(); ctx.ellipse(p.x, p.y + size * 0.48, size * 0.35, size * 0.09, 0, 0, Math.PI * 2); ctx.fill();
      if (this.players.length > 1 || this.spec.hero.image) {
        ctx.strokeStyle = p.color; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(p.x, p.y, size * 0.56, 0, Math.PI * 2); ctx.stroke();
      }
      const squash = s.genre === 'runner' && !p.onGround ? 0.08 : 0;
      const tilt = (s.genre === 'catcher' || s.genre === 'shooter') ? p.vx * 0.12 : s.genre === 'runner' ? (p.onGround ? Math.sin(this.t * 14) * 0.06 : -0.15) : 0;
      // The rocket emoji is drawn at 45°; point it straight up when it's flying a shooter.
      const base = s.genre === 'shooter' && this.spec.hero.emoji === '🚀' && !this.spec.hero.image ? -Math.PI / 4 : 0;
      this.sprites.draw(ctx, 'hero', p.x, p.y, size * (1 + squash), { rot: base + tilt, flip: !base && p.face < 0 && !this.spec.hero.image });
      if (this.players.length > 1) {
        ctx.fillStyle = p.color; ctx.font = 'bold 22px system-ui,sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(p.idx === 0 ? 'TV' : `P${p.idx + 1}`, p.x, p.y - size * 0.62 - 14);
      }
    }

    // Particles + floaters
    for (const pt of this.particles) {
      ctx.globalAlpha = Math.max(0, pt.life);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
    }
    ctx.globalAlpha = 1;
    for (const f of this.floaters) {
      ctx.globalAlpha = Math.min(1, f.life * 2);
      ctx.font = `900 ${f.big ? 96 : 40}px system-ui,sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = f.big ? 10 : 6; ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    if (this.mods.has('night')) this.drawNight(ctx);
    ctx.restore();
    this.drawHud(ctx);
    if (this.state === 'countdown') this.drawCountdown(ctx);
  }

  drawCountdown(ctx) {
    const n = Math.ceil(this.countdown - 0.2);
    const frac = this.countdown - 0.2 - Math.floor(this.countdown - 0.2);
    const label = n > 0 ? String(n) : 'GO!';
    const scale = 1 + (n > 0 ? frac : Math.max(0, this.countdown / 0.2)) * 0.6;
    ctx.save();
    ctx.fillStyle = 'rgba(10,8,30,0.35)';
    ctx.fillRect(0, HUD_H, W, H - HUD_H);
    ctx.translate(W / 2, H / 2);
    ctx.scale(scale, scale);
    ctx.font = '900 150px system-ui,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 16; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.strokeText(label, 0, 0);
    ctx.fillStyle = n > 0 ? '#fff' : '#ffd166'; ctx.fillText(label, 0, 0);
    ctx.restore();
    ctx.font = '700 34px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
    ctx.fillText(this.spec.narration.intro, W / 2, H / 2 + 130);
  }

  drawMaze(ctx) {
    const m = this.maze;
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(m.ox - 6, m.oy - 6, m.cols * m.size + 12, m.rows * m.size + 12);
    ctx.strokeStyle = this.mods.has('lava_floor') ? `hsl(${15 + Math.sin(this.t * 4) * 10},95%,50%)` : this.spec.theme.ground;
    ctx.lineWidth = Math.max(6, m.size * 0.12);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let r = 0; r < m.rows; r++) {
      for (let c = 0; c < m.cols; c++) {
        const w = m.walls[r][c];
        const x = m.ox + c * m.size, y = m.oy + r * m.size;
        if (w.n) { ctx.moveTo(x, y); ctx.lineTo(x + m.size, y); }
        if (w.w) { ctx.moveTo(x, y); ctx.lineTo(x, y + m.size); }
        if (c === m.cols - 1 && w.e) { ctx.moveTo(x + m.size, y); ctx.lineTo(x + m.size, y + m.size); }
        if (r === m.rows - 1 && w.s) { ctx.moveTo(x, y + m.size); ctx.lineTo(x + m.size, y + m.size); }
      }
    }
    ctx.stroke();
  }

  drawNight(ctx) {
    if (!this.nightCanvas) {
      this.nightCanvas = document.createElement('canvas');
      this.nightCanvas.width = W; this.nightCanvas.height = H;
    }
    const n = this.nightCanvas.getContext('2d');
    n.globalCompositeOperation = 'source-over';
    n.clearRect(0, 0, W, H);
    n.fillStyle = 'rgba(5,5,25,0.78)';
    n.fillRect(0, 0, W, H);
    n.globalCompositeOperation = 'destination-out';
    for (const p of this.players) {
      const r = 230 + Math.sin(this.t * 3) * 8;
      const g = n.createRadialGradient(p.x, p.y, 20, p.x, p.y, r);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      n.fillStyle = g;
      n.beginPath(); n.arc(p.x, p.y, r, 0, Math.PI * 2); n.fill();
    }
    ctx.drawImage(this.nightCanvas, 0, 0);
  }

  drawHud(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fillRect(0, 0, W, HUD_H);
    ctx.textBaseline = 'middle';
    ctx.font = '800 28px system-ui,sans-serif';
    ctx.textAlign = 'left'; ctx.fillStyle = '#fff';
    ctx.fillText(this.spec.title, 24, HUD_H / 2);
    // Goal progress bar
    const bw = 360, bx = W / 2 - bw / 2, by = HUD_H / 2 - 12;
    ctx.fillStyle = 'rgba(255,255,255,0.22)'; roundRect(ctx, bx, by, bw, 24, 12); ctx.fill();
    ctx.fillStyle = '#ffd166'; roundRect(ctx, bx, by, Math.max(24, bw * Math.min(1, this.score / this.goal)), 24, 12); ctx.fill();
    this.sprites.draw(ctx, 'star', bx - 26, HUD_H / 2, 34);
    ctx.textAlign = 'center'; ctx.fillStyle = '#1b1b2f'; ctx.font = '800 18px system-ui,sans-serif';
    ctx.fillText(`${this.score} / ${this.goal}`, W / 2, HUD_H / 2 + 1);
    // Lives
    for (let i = 0; i < this.lives; i++) this.sprites.draw(ctx, 'heart', W - 36 - i * 42, HUD_H / 2, 34);
    if (this.state === 'paused') {
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fff'; ctx.font = '900 72px system-ui,sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Paused', W / 2, H / 2);
    }
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

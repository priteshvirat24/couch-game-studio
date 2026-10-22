// Phone companion: say/type a game idea, snap a drawing as the hero,
// remix the game on the TV, and play as a controller.

const $ = (id) => document.getElementById(id);
const room = (location.pathname.split('/p/')[1] || new URLSearchParams(location.search).get('room') || '').toUpperCase().slice(0, 4);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

const state = { ws: null, name: store.get('cgs-name') || '', screen: 'arcade', gameId: null, genre: null, title: '', heroImage: null, busy: false };

$('roomLabel').textContent = room || '?';
$('nameInput').value = state.name;

function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toast.h);
  toast.h = setTimeout(() => t.classList.remove('show'), 2600);
}
const buzz = (ms = 15) => { try { navigator.vibrate?.(ms); } catch {} };

// --------------------------------------------------------------- views
function view(name) { for (const v of document.querySelectorAll('.view')) v.classList.toggle('active', v.id === name); }
function tab(name) {
  for (const t of document.querySelectorAll('.tab')) t.classList.toggle('active', t.dataset.tab === name);
  for (const p of document.querySelectorAll('.panel')) p.classList.toggle('active', p.id === `panel-${name}`);
}
for (const t of document.querySelectorAll('.tab')) t.addEventListener('click', () => !t.disabled && tab(t.dataset.tab));

// ----------------------------------------------------------------- join
function join() {
  const name = $('nameInput').value.trim().slice(0, 16) || 'Player';
  state.name = name;
  store.set('cgs-name', name);
  view('create');
  connect();
}
$('joinBtn').addEventListener('click', join);
$('nameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });

// ------------------------------------------------------------ websocket
function send(msg) { if (state.ws?.readyState === 1) state.ws.send(JSON.stringify(msg)); }
function setStatus(on, text) { $('status').classList.toggle('on', on); $('statusText').textContent = text; }

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws?room=${room}&role=phone`);
  state.ws = ws;
  ws.onopen = () => { send({ t: 'hello', name: state.name }); setStatus(true, `Room ${room}`); };
  ws.onclose = () => { setStatus(false, 'Reconnecting…'); setTimeout(connect, 1500); };
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === 'welcome') {
      if (!m.tvConnected) toast('Open Couch Game Studio on the TV');
      applyScreen(m.screen, m.gameId);
    } else if (m.t === 'screen') {
      applyScreen(m.screen, m.gameId, m.title, m.genre);
    } else if (m.t === 'creating') {
      overlay(true, m.remix ? 'Remixing…' : `Making ${m.author === state.name ? 'your' : `${m.author}'s`} game…`);
    } else if (m.t === 'created') {
      overlay(false);
      buzz([30, 40, 30]);
      toast(`“${m.game.title}” is on the TV!`);
    } else if (m.t === 'create_failed') {
      overlay(false);
      toast('That one fizzled. Try again!');
    } else if (m.t === 'reaction') {
      toast(m.text);
      buzz(40);
    } else if (m.t === 'tv_left') {
      toast('The TV disconnected');
    }
  };
}

function applyScreen(screen, gameId, title, genre) {
  state.screen = screen;
  if (gameId) state.gameId = gameId;
  if (title) state.title = title;
  if (genre) state.genre = genre;
  const hasGame = !!state.gameId && screen !== 'arcade';
  $('remixTab').disabled = !hasGame;
  $('remixTitle').textContent = state.title ? `“${state.title}”` : 'this game';
  if (state.genre) {
    $('pad').dataset.genre = state.genre;
    $('actionBtn').textContent = { runner: 'JUMP', shooter: 'ZAP', catcher: 'GO', maze: 'GO' }[state.genre];
  }
  $('padTitle').textContent = screen === 'play' ? `Playing “${state.title}”` : state.title ? `Next up: “${state.title}”` : 'Waiting for a game on the TV…';
  // Jump straight to the controller while a game is running.
  if (screen === 'play') tab('pad');
  else if (screen === 'end' || screen === 'intro') { if (document.querySelector('.tab.active')?.dataset.tab === 'pad') tab('remix'); }
  else if (screen === 'arcade' && document.querySelector('.tab.active')?.dataset.tab !== 'make') tab('make');
}

function overlay(on, text) {
  state.busy = on;
  $('overlay').classList.toggle('hidden', !on);
  if (text) $('overlayText').textContent = text;
}

// --------------------------------------------------------------- voice
// Web Speech API where available (Chrome/Android, Safari on HTTPS). Otherwise
// the keyboard's own dictation mic works on every phone.
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
function setupMic(btn, label, input, idleText) {
  if (!SR) {
    btn.addEventListener('click', () => { input.focus(); toast('Tap the 🎤 on your keyboard to talk'); });
    label.textContent = 'Type it, or use your keyboard’s 🎤';
    return;
  }
  let rec = null;
  btn.addEventListener('click', () => {
    if (rec) { rec.stop(); return; }
    rec = new SR();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    const before = input.value;
    btn.classList.add('listening');
    label.textContent = 'Listening… tell me everything!';
    buzz(20);
    rec.onresult = (e) => {
      const text = [...e.results].map((r) => r[0].transcript).join(' ');
      input.value = (before ? `${before} ` : '') + text;
    };
    rec.onerror = (e) => { if (e.error === 'not-allowed') toast('Mic blocked. Type it, or use your keyboard 🎤'); };
    rec.onend = () => { rec = null; btn.classList.remove('listening'); label.textContent = idleText; };
    rec.start();
  });
}
setupMic($('micBtn'), $('micLabel'), $('promptInput'), 'Tap and tell me your idea');
setupMic($('remixMicBtn'), $('remixMicLabel'), $('remixInput'), '“make it faster”');

// --------------------------------------------------------------- ideas
const IDEAS = [
  ['🐶🌮', 'My dog catches falling tacos and dodges broccoli'],
  ['🦖🌋', 'A dinosaur running through a volcano jumping over rocks'],
  ['🐰👻', 'A bunny in a spooky maze collecting carrots, avoid ghosts'],
  ['🚀👾', 'A rocket zapping aliens in space with a giant boss'],
  ['🦄🧁', 'A unicorn catching cupcakes with a rainbow trail'],
  ['🐧🐟', 'A penguin in a snowy maze finding fish'],
];
$('ideas').innerHTML = IDEAS.map(([e, t]) => `<button class="idea" data-t="${t}">${e} ${t.split(' ').slice(0, 4).join(' ')}…</button>`).join('');
$('ideas').addEventListener('click', (e) => { const b = e.target.closest('.idea'); if (b) { $('promptInput').value = b.dataset.t; buzz(); } });
const REMIXES = ['⚡ make it faster', '🐢 make it easier', '🌋 add lava', '🌙 make it night', '🦕 give me a boss', '🌈 rainbow trail', '🔁 reverse controls', '💥 double points', '🧊 put it in the snow'];
$('remixIdeas').innerHTML = REMIXES.map((t) => `<button class="idea" data-t="${t.slice(t.indexOf(' ') + 1)}">${t}</button>`).join('');
$('remixIdeas').addEventListener('click', (e) => { const b = e.target.closest('.idea'); if (b) { $('remixInput').value = b.dataset.t; buzz(); } });

// -------------------------------------------------------- photo → hero
// Center-crop to a square, shrink to 256px, and (optionally) knock out the
// background by sampling the border color. Great for crayon drawings on paper.
let photoImg = null;
$('photoInput').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  photoImg = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  renderPhoto();
  $('photoPreview').classList.remove('hidden');
  buzz();
});
$('bgToggle').addEventListener('change', () => photoImg && renderPhoto());
$('photoClear').addEventListener('click', () => { photoImg = null; state.heroImage = null; $('photoPreview').classList.add('hidden'); $('photoInput').value = ''; });

function renderPhoto() {
  const c = $('photoCanvas');
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const s = Math.min(photoImg.naturalWidth, photoImg.naturalHeight);
  ctx.clearRect(0, 0, 256, 256);
  ctx.drawImage(photoImg, (photoImg.naturalWidth - s) / 2, (photoImg.naturalHeight - s) / 2, s, s, 0, 0, 256, 256);
  if ($('bgToggle').checked) removeBackground(ctx);
  state.heroImage = c.toDataURL('image/png');
}

function removeBackground(ctx) {
  const img = ctx.getImageData(0, 0, 256, 256);
  const d = img.data;
  // Average the border pixels to estimate the background color.
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < 256; i++) {
    for (const [x, y] of [[i, 0], [i, 255], [0, i], [255, i]]) {
      const k = (y * 256 + x) * 4; r += d[k]; g += d[k + 1]; b += d[k + 2]; n++;
    }
  }
  r /= n; g /= n; b /= n;
  // Flood-fill from the edges so we only remove background connected to the border.
  const seen = new Uint8Array(256 * 256);
  const stack = [];
  for (let i = 0; i < 256; i++) stack.push(i, 255 * 256 + i, i * 256, i * 256 + 255);
  const near = (k, tol) => { const p = k * 4; return Math.abs(d[p] - r) + Math.abs(d[p + 1] - g) + Math.abs(d[p + 2] - b) < tol; };
  while (stack.length) {
    const k = stack.pop();
    if (seen[k] || !near(k, 110)) continue;
    seen[k] = 1;
    d[k * 4 + 3] = 0;
    const x = k % 256, y = (k / 256) | 0;
    if (x > 0) stack.push(k - 1); if (x < 255) stack.push(k + 1);
    if (y > 0) stack.push(k - 256); if (y < 255) stack.push(k + 256);
  }
  // Soften the edge a little.
  for (let k = 0; k < 256 * 256; k++) {
    if (seen[k]) continue;
    const x = k % 256, y = (k / 256) | 0;
    if ((x > 0 && seen[k - 1]) || (x < 255 && seen[k + 1]) || (y > 0 && seen[k - 256]) || (y < 255 && seen[k + 256])) d[k * 4 + 3] = 160;
  }
  ctx.putImageData(img, 0, 0);
}

// -------------------------------------------------------- make / remix
async function post(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

$('makeBtn').addEventListener('click', async () => {
  const prompt = $('promptInput').value.trim();
  if (prompt.length < 3) { toast('Tell me your game idea first!'); return; }
  if (state.busy) return;
  overlay(true, 'Making your game…');
  buzz(30);
  try {
    await post('/api/games', { prompt, author: state.name, room, heroImage: state.heroImage });
    $('promptInput').value = '';
  } catch (e) {
    toast(e.message);
  } finally {
    overlay(false);
  }
});

$('remixBtn').addEventListener('click', async () => {
  const instruction = $('remixInput').value.trim();
  if (!state.gameId) { toast('Pick a game on the TV first'); return; }
  if (instruction.length < 2) { toast('What should change?'); return; }
  if (state.busy) return;
  overlay(true, 'Remixing…');
  buzz(30);
  try {
    await post(`/api/games/${state.gameId}/remix`, { instruction, author: state.name, room });
    $('remixInput').value = '';
  } catch (e) {
    toast(e.message);
  } finally {
    overlay(false);
  }
});

// ------------------------------------------------------------ controller
// Multi-touch: every button tracks its own pointer so you can run + jump at once.
for (const b of document.querySelectorAll('.pb')) {
  const a = b.dataset.a;
  const down = (e) => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); b.classList.add('pressed'); send({ t: 'input', action: a, down: true }); buzz(8); };
  const up = (e) => { e.preventDefault(); if (!b.classList.contains('pressed')) return; b.classList.remove('pressed'); send({ t: 'input', action: a, down: false }); };
  b.addEventListener('pointerdown', down);
  b.addEventListener('pointerup', up);
  b.addEventListener('pointercancel', up);
  b.addEventListener('lostpointercapture', up);
  b.addEventListener('contextmenu', (e) => e.preventDefault());
}
for (const b of document.querySelectorAll('[data-nav]')) b.addEventListener('click', () => { send({ t: 'nav', action: b.dataset.nav }); buzz(); });

// ----------------------------------------------------------------- boot
if (!room) {
  document.body.innerHTML = '<h1 style="padding:20px">Scan the QR code on the TV to join.</h1>';
} else if (state.name) {
  view('create');
  connect();
} else {
  view('join');
}

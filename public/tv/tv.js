// TV app: Family Arcade, creation "magic" screen, intro cards, play, pause, end.
// Built for a Fire TV remote: D-pad, OK/Select, Back, Play/Pause.

import { Game, emojiCode, sfx, config as engineConfig } from '/engine/engine.js';

engineConfig.emojiBase = '/emoji'; // served (and cached) by the studio server

const $ = (id) => document.getElementById(id);
const emojiSrc = (e) => `/emoji/${emojiCode(e)}.svg`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PLAYER_COLORS = ['#ffd166', '#06d6a0', '#ef476f', '#4cc9f0'];

// ------------------------------------------------------------ stage scale
function fit() {
  const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  const st = $('stage');
  st.style.transform = `scale(${s})`;
  st.style.left = `${(window.innerWidth - 1920 * s) / 2}px`;
  st.style.top = `${(window.innerHeight - 1080 * s) / 2}px`;
}
window.addEventListener('resize', fit);
fit();

// ------------------------------------------------------------------ state
const state = {
  screen: 'arcade',
  games: [],
  freshIds: new Set(),
  current: null, // full game record
  game: null,    // Game engine instance
  room: null,
  ws: null,
  phones: new Map(), // id -> {name, color}
  focus: { arcade: 0 },
};

window.__cgs = state; // handy for debugging and scripted demo captures

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

// ------------------------------------------------------------ read-aloud
// Many of our players can't read yet, so the TV reads titles and results out loud.
const speech = { on: store.get('cgs-tts') !== 'off' };
function say(text) {
  if (!speech.on || !text || !('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95; u.pitch = 1.1;
    speechSynthesis.speak(u);
  } catch { /* some TV WebViews have no voices */ }
}
function hush() { try { window.speechSynthesis?.cancel(); } catch {} }
function renderTts() {
  const b = $('btnTts');
  b.textContent = speech.on ? '🔊 Read aloud: on' : '🔈 Read aloud: off';
  b.setAttribute('aria-pressed', String(speech.on));
}

// ------------------------------------------------------------------ api
async function api(path, opts = {}) {
  const res = await fetch(path, { headers: { 'content-type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || res.statusText), { status: res.status });
  return data;
}

// --------------------------------------------------------------- screens
function show(name) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('active', s.id === name);
  state.screen = name;
  const g = state.current?.spec;
  sendWs({ t: 'screen', screen: name, gameId: state.current?.id || null, title: g?.title || '', genre: g?.genre || '' });
  refocus();
}

// --------------------------------------------------------- focus engine
// Spatial navigation: move to the nearest focusable in the pressed direction.
function focusables() {
  if (!$('confirm').classList.contains('hidden')) return [...$('confirm').querySelectorAll('.focusable')];
  const scr = $(state.screen);
  const menu = scr.querySelector('.pause-menu:not(.hidden)');
  return [...(menu || scr).querySelectorAll('.focusable')].filter((el) => el.offsetParent !== null);
}
function setFocus(el) {
  for (const f of document.querySelectorAll('.focused')) f.classList.remove('focused');
  if (!el) return;
  el.classList.add('focused');
  if (state.screen === 'arcade') {
    const i = [...$('shelf').children].indexOf(el);
    if (i >= 0) { state.focus.arcade = i; scrollShelf(i); }
  }
}
function current() { return document.querySelector('.focused'); }
function refocus() {
  const list = focusables();
  if (!list.length) return setFocus(null);
  if (state.screen === 'arcade') return setFocus(list[Math.min(state.focus.arcade, list.length - 1)]);
  setFocus(list[0]);
}
function move(dir) {
  const list = focusables();
  const cur = current();
  if (!cur || !list.includes(cur)) return setFocus(list[0]);
  const a = cur.getBoundingClientRect();
  const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best = null, bestScore = Infinity;
  for (const el of list) {
    if (el === cur) continue;
    const b = el.getBoundingClientRect();
    const bx = b.left + b.width / 2, by = b.top + b.height / 2;
    const dx = bx - ax, dy = by - ay;
    const ok = (dir === 'left' && dx < -5) || (dir === 'right' && dx > 5) || (dir === 'up' && dy < -5) || (dir === 'down' && dy > 5);
    if (!ok) continue;
    const main = dir === 'left' || dir === 'right' ? Math.abs(dx) : Math.abs(dy);
    const cross = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
    const score = main + cross * 2;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (best) { setFocus(best); sfx.unlock(); sfx.tone(520, 0.05, { type: 'triangle', vol: 0.05 }); }
}
function scrollShelf(i) {
  const shelf = $('shelf');
  const cardW = 400; // card + gap
  const visible = Math.floor((1920 - 192) / cardW);
  const first = Math.max(0, Math.min(i - Math.floor(visible / 2), shelf.children.length - visible));
  shelf.scrollLeft = first * cardW;
  for (const c of shelf.children) c.style.transform = '';
}

// --------------------------------------------------------------- arcade
function artHtml(spec, big = false) {
  const scn = (spec.theme.scenery || []).map((e, i) => {
    const pos = big ? [[60, 70], [520, 110], [300, 40]][i] : [[22, 30], [250, 50], [140, 14]][i];
    return `<img class="scn" src="${emojiSrc(e)}" style="left:${pos[0]}px;top:${pos[1]}px" alt="">`;
  }).join('');
  const heroSrc = spec.hero.image || emojiSrc(spec.hero.emoji);
  const ground = spec.genre === 'shooter' ? 'transparent' : spec.theme.ground;
  return `<div style="position:absolute;inset:0;background:linear-gradient(${spec.theme.skyTop},${spec.theme.skyBottom})"></div>${scn}<div class="ground" style="background:${ground}"></div><img class="hero" src="${heroSrc}" alt="">`;
}

const GENRE_LABEL = { catcher: 'Catch', runner: 'Run & Jump', maze: 'Maze', shooter: 'Zap' };

function renderArcade() {
  const shelf = $('shelf');
  const cards = [`<div class="game-card new focusable" data-act="surprise">
      <div><div class="big">🎲</div><div class="title">Surprise me!</div><div class="by">No phone? I'll dream one up</div></div>
    </div>`];
  for (const g of state.games) {
    cards.push(`<div class="game-card focusable" data-id="${esc(g.id)}">
      <div class="art">${artHtml({ ...g, hero: g.hero, theme: g.theme, genre: g.genre })}</div>
      <div class="badge">${esc(GENRE_LABEL[g.genre] || g.genre)}</div>
      ${state.freshIds.has(g.id) ? '<div class="fresh">NEW</div>' : ''}
      <div class="meta"><div class="title">${esc(g.title)}</div><div class="by">by ${esc(g.author)}${g.remixOf ? ' · remix' : ''}</div>${g.best ? `<div class="best">🏆 ${esc(g.best.name)} · ${g.best.score}</div>` : ''}</div>
    </div>`);
  }
  shelf.innerHTML = cards.join('');
  if (state.screen === 'arcade') refocus();
}

async function loadArcade() {
  state.games = await api('/api/games');
  renderArcade();
}

const SURPRISES = [
  'A penguin sliding through a snowy maze collecting fish while avoiding polar bears',
  'A cat astronaut zapping space mice with lasers',
  'A frog jumping over logs in a swamp collecting flies, super fast',
  'A unicorn catching falling cupcakes and dodging rain clouds, with a rainbow trail',
  'My grandma running through the city collecting samosas and jumping over traffic cones',
  'A shark in the ocean catching fish but avoiding bombs at night',
  'A robot in a castle maze finding gears while ghosts chase it',
];

// --------------------------------------------------------------- create
const STEPS = ['Reading your idea', 'Choosing the hero', 'Painting the world', 'Hiding the treasure', 'Teaching the baddies', 'Testing the fun'];
let stepTimer = null;
function showCreating(prompt, author, remix) {
  creatingSince = performance.now();
  $('createError').classList.add('hidden');
  if (state.game) state.game.pause();
  $('createBy').textContent = remix ? `${author} wants to remix it` : `${author} says`;
  $('createQuote').textContent = `“${prompt}”`;
  const steps = $('createSteps');
  steps.innerHTML = '';
  let i = 0;
  clearInterval(stepTimer);
  const tick = () => {
    const prev = steps.lastElementChild;
    if (prev) prev.classList.add('done');
    if (i < STEPS.length) {
      const d = document.createElement('div');
      d.textContent = `${STEPS[i++]}…`;
      steps.appendChild(d);
      if (steps.children.length > 4) steps.firstElementChild.remove();
    }
  };
  tick();
  stepTimer = setInterval(tick, 900);
  show('creating');
  sfx.unlock();
  sfx.tone(440, 0.4, { type: 'sine', vol: 0.08, slide: 440 });
}
function doneCreating() { clearInterval(stepTimer); }

async function surprise() {
  const prompt = SURPRISES[Math.floor(Math.random() * SURPRISES.length)];
  showCreating(prompt, 'The TV', false);
  try {
    const { game } = await api('/api/games', { method: 'POST', body: { prompt, author: 'The TV', room: state.room } });
    // The websocket "created" event normally drives the UI; this is the fallback when no socket.
    if (!state.ws || state.ws.readyState !== 1) onCreated(game);
  } catch (e) {
    doneCreating();
    toast(e.message);
    show('arcade');
  }
}

// The "imagining" screen stays up for a beat even when generation is instant:
// the moment of anticipation is part of the magic.
let creatingSince = 0;
const MIN_MAGIC_MS = 3600;
async function onCreated(game) {
  const wait = MIN_MAGIC_MS - (performance.now() - creatingSince);
  if (state.screen === 'creating' && wait > 0) await new Promise((r) => setTimeout(r, wait));
  doneCreating();
  state.freshIds.add(game.id);
  loadArcade().catch(() => {});
  openIntro(game);
}

// ---------------------------------------------------------------- intro
const HOW = {
  catcher: ['◀ ▶ move', 'Catch the goodies', 'Dodge the baddies'],
  runner: ['OK or ▲ jump', 'Press twice to double-jump', 'Grab goodies in the air'],
  maze: ['◀ ▶ ▲ ▼ walk', 'Collect everything', 'Then find the exit'],
  shooter: ['◀ ▶ move', 'OK to zap (hold for auto)', 'Catch goodies for bonus'],
};
async function openIntro(gameOrId) {
  const game = typeof gameOrId === 'string' ? await api(`/api/games/${gameOrId}`) : gameOrId;
  state.current = game;
  const s = game.spec;
  $('introArt').innerHTML = artHtml(s, true);
  $('introGenre').textContent = GENRE_LABEL[s.genre] || s.genre;
  $('introTitle').textContent = s.title;
  $('introTagline').textContent = s.tagline;
  $('introNarration').textContent = s.narration.intro;
  $('introHow').innerHTML = HOW[s.genre].map((h) => `<span>${esc(h)}</span>`).join('');
  const goodies = s.goodies.map((g) => `<img src="${emojiSrc(g.emoji)}" alt="${esc(g.name)}">`).join('');
  const hazards = s.hazards.map((h) => `<img src="${emojiSrc(h.emoji)}" alt="${esc(h.name)}">`).join('');
  const mods = (s.modifiers || []).map((m) => m.replace('_', ' ')).join(' · ');
  $('introCast').innerHTML = `<span class="grp">Get ${goodies}</span><span class="grp">Avoid ${hazards}</span>${mods ? `<span class="grp">✨ ${esc(mods)}</span>` : ''}`;
  $('introBy').textContent = `Made by ${game.author} · “${game.prompt}”`;
  const t = game.playtest;
  $('introTested').innerHTML = t
    ? `🤖 Robot-tested ${t.runs}× · <b>${Math.round(t.kidWinRate * 100)}%</b> of kid runs won · about <b>${Math.max(10, Math.round(t.avgWinSeconds / 5) * 5)}s</b> to win${t.difficulty === 'hard' ? ' · 🔥 hard mode' : t.difficulty === 'easy' ? ' · 🌱 easy mode' : ''}`
    : '';
  renderBoard($('introBoard'), game.scores, null, '🏆 Family best');
  show('intro');
  say(`${s.title}. ${s.narration.intro}`);
}

function renderBoard(el, scores, highlightAt, label) {
  if (!scores?.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<span class="row">${label}</span>` + scores.slice(0, 3).map((r, i) =>
    `<span class="row${r.at === highlightAt ? ' me' : ''}">${['🥇', '🥈', '🥉'][i]} ${esc(r.name)} · ${r.score}${r.won ? '' : ' (so close)'}</span>`).join('');
}

// Who's on the couch right now, for the scoreboard.
function teamName() {
  const names = [...state.phones.values()].map((p) => p.name).filter((n) => n && n !== 'Player');
  if (!names.length) return 'Family';
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} & ${names.at(-1)}`;
}

// ----------------------------------------------------------------- play
async function startGame() {
  const rec = state.current;
  if (!rec) return;
  if (state.game) state.game.stop();
  const game = new Game($('canvas'), rec.spec, { onEvent: onGameEvent });
  state.game = game;
  for (const id of state.phones.keys()) game.addPlayer(id);
  show('play');
  $('pauseMenu').classList.add('hidden');
  await game.load();
  game.start();
  api(`/api/games/${rec.id}/played`, { method: 'POST' }).catch(() => {});
}

function onGameEvent(e) {
  if (e.type === 'end') {
    const s = state.current.spec;
    $('endEmoji').innerHTML = `<img src="${s.hero.image || emojiSrc(s.hero.emoji)}" alt="">`;
    $('endTitle').textContent = e.won ? 'You did it!' : 'So close!';
    $('endLine').textContent = e.won ? s.narration.win : s.narration.lose;
    $('endScore').textContent = `⭐ ${e.score} points`;
    $('endBoard').innerHTML = '';
    const seconds = state.game.t || 0;
    state.game.stop();
    show('end');
    say(e.won ? `You did it! ${s.narration.win}` : `So close! ${s.narration.lose}`);
    sendWs({ t: 'reaction', text: e.won ? '🎉 You won!' : '😅 Try again!' });
    const rec = state.current;
    api(`/api/games/${rec.id}/scores`, { method: 'POST', body: { name: teamName(), score: e.score, won: e.won, seconds } })
      .then(({ rank, scores }) => {
        rec.scores = scores;
        const mine = rank ? scores[rank - 1] : null;
        renderBoard($('endBoard'), scores, mine?.at, rank === 1 && e.won ? '🎉 New family record!' : '🏆 Family best');
        if (rank === 1 && e.won) { sfx.win(); say('New family record!'); }
      })
      .catch(() => {});
  }
}

function pauseGame() {
  if (state.screen !== 'play' || !state.game) return;
  if (['play', 'countdown'].includes(state.game.state)) {
    state.game.pause();
    $('pauseMenu').classList.remove('hidden');
    refocus();
  } else if (state.game.state === 'paused') resumeGame();
}
function resumeGame() {
  $('pauseMenu').classList.add('hidden');
  state.game?.resume();
}

function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toast.h);
  toast.h = setTimeout(() => t.classList.remove('show'), 2400);
}

// ------------------------------------------------------------- actions
function activate(el) {
  if (!el) return;
  sfx.unlock();
  if (state.screen === 'arcade') {
    if (el.dataset.act === 'surprise') return surprise();
    if (el.dataset.id) return openIntro(el.dataset.id);
  }
  if (el.id === 'btnTts') { speech.on = !speech.on; store.set('cgs-tts', speech.on ? 'on' : 'off'); renderTts(); if (speech.on) say('Read aloud is on'); else hush(); return; }
  if (el.id === 'btnHide') return askConfirm();
  if (el.dataset.confirm) return closeConfirm(el.dataset.confirm === 'yes');
  if (el.id === 'btnPlay' || el.id === 'btnAgain') return startGame();
  if (el.id === 'btnBack' || el.id === 'btnEndArcade') return backToArcade();
  const act = el.dataset.act;
  if (act === 'resume') return resumeGame();
  if (act === 'restart') return startGame();
  if (act === 'exit') return backToArcade();
}
// Grown-ups can tidy the arcade; it's a soft delete the server can undo.
function askConfirm() {
  $('confirmTitle').textContent = `Remove “${state.current?.spec.title}”?`;
  $('confirm').classList.remove('hidden');
  setFocus($('confirm').querySelector('[data-confirm="no"]'));
}
async function closeConfirm(yes) {
  $('confirm').classList.add('hidden');
  if (!yes || !state.current) return refocus();
  try {
    await api(`/api/games/${state.current.id}/hidden`, { method: 'POST', body: { hidden: true } });
    toast('Removed from the arcade');
    state.current = null;
    await loadArcade();
    show('arcade');
  } catch { toast('Could not remove that game'); refocus(); }
}

function backToArcade() {
  hush();
  state.game?.stop();
  state.game = null;
  show('arcade');
}
function back() {
  if (!$('confirm').classList.contains('hidden')) return closeConfirm(false);
  if (state.screen === 'play') return pauseGame();
  if (state.screen === 'intro' || state.screen === 'end') return backToArcade();
  // On the home screen, Back hands control to the TV (Vega host closes the app).
  if (state.screen === 'arcade' && window.ReactNativeWebView) window.ReactNativeWebView.postMessage('exit');
}

// --------------------------------------------------------------- input
const KEYMAP = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  Left: 'left', Right: 'right', Up: 'up', Down: 'down',
  Enter: 'ok', ' ': 'ok', Select: 'ok', Accept: 'ok',
  Escape: 'back', Backspace: 'back', GoBack: 'back', BrowserBack: 'back',
  MediaPlayPause: 'playpause', MediaPlay: 'playpause', MediaPause: 'playpause', p: 'playpause',
};
const CODEMAP = { 37: 'left', 39: 'right', 38: 'up', 40: 'down', 13: 'ok', 23: 'ok', 4: 'back', 8: 'back', 27: 'back', 179: 'playpause', 85: 'playpause' };
const keyAction = (e) => KEYMAP[e.key] || CODEMAP[e.keyCode];

document.addEventListener('keydown', (e) => {
  const a = keyAction(e);
  if (!a) return;
  e.preventDefault();
  const playing = state.screen === 'play' && state.game && ['play', 'countdown'].includes(state.game.state);
  if (playing) {
    if (a === 'back' || a === 'playpause') return pauseGame();
    state.game.input('tv', a === 'ok' ? 'action' : a, true);
    return;
  }
  if (a === 'back') return back();
  if (a === 'playpause') return state.screen === 'play' ? pauseGame() : activate(current());
  if (a === 'ok') return activate(current());
  move(a);
});
document.addEventListener('keyup', (e) => {
  const a = keyAction(e);
  if (!a || !state.game) return;
  if (['left', 'right', 'up', 'down'].includes(a)) state.game.input('tv', a, false);
  if (a === 'ok') state.game.input('tv', 'action', false);
});
// Mouse/touch support for laptops and judges clicking around.
document.addEventListener('click', (e) => {
  const el = e.target.closest('.focusable');
  if (el) { setFocus(el); activate(el); }
});
document.addEventListener('mousemove', () => { document.body.style.cursor = 'default'; clearTimeout(window.__cur); window.__cur = setTimeout(() => { document.body.style.cursor = 'none'; }, 2000); });

// Emoji cheers from the couch float up over whatever is on screen.
function cheer(emoji, name) {
  const layer = state.screen === 'play' ? $('reactions') : null;
  if (!layer) return toast(`${name}: ${emoji}`);
  const el = document.createElement('span');
  el.style.left = `${8 + Math.random() * 84}%`;
  el.innerHTML = `${esc(emoji)}<small>${esc(name)}</small>`;
  layer.appendChild(el);
  setTimeout(() => el.remove(), 2700);
}

// ------------------------------------------------------------ websocket
function sendWs(msg) { if (state.ws?.readyState === 1) state.ws.send(JSON.stringify(msg)); }

function renderPlayers() {
  const chips = [...state.phones.values()].map((p) => `<span class="chip" style="background:${p.color}">${esc(p.name)}</span>`);
  $('playerChips').innerHTML = chips.join('') || '<span style="color:var(--muted);font-size:22px">No phones yet</span>';
}

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws?room=${state.room}&role=tv`);
  state.ws = ws;
  ws.onopen = () => sendWs({ t: 'screen', screen: state.screen, gameId: state.current?.id || null, title: state.current?.spec?.title || '', genre: state.current?.spec?.genre || '' });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === 'join') {
      const color = PLAYER_COLORS[(state.phones.size + 1) % 4];
      state.phones.set(m.id, { name: m.name, color });
      renderPlayers();
      if (state.game && state.game.addPlayer(m.id)) toast(`${m.name} joined the game!`);
      else toast(`${m.name} connected`);
    } else if (m.t === 'leave') {
      const p = state.phones.get(m.id);
      state.phones.delete(m.id);
      state.game?.removePlayer(m.id);
      renderPlayers();
      if (p) toast(`${p.name} left`);
    } else if (m.t === 'players') {
      // Phones that were already connected before this TV page loaded.
      for (const p of m.players) if (!state.phones.has(p.id)) state.phones.set(p.id, { name: p.name, color: PLAYER_COLORS[(state.phones.size + 1) % 4] });
      renderPlayers();
    } else if (m.t === 'input') {
      state.game?.input(m.id, m.action, m.down);
    } else if (m.t === 'nav') {
      if (m.action === 'pause') pauseGame();
      else if (m.action === 'play') { if (state.screen === 'play' && state.game?.state === 'paused') resumeGame(); else if (state.screen === 'intro') startGame(); }
      else if (m.action === 'again') { if (state.current) startGame(); }
      else if (m.action === 'back') back();
    } else if (m.t === 'creating') {
      showCreating(m.prompt, m.author, m.remix);
    } else if (m.t === 'created') {
      onCreated(m.game);
    } else if (m.t === 'react') {
      cheer(m.emoji, m.name);
    } else if (m.t === 'create_failed') {
      doneCreating();
      if (m.error && state.screen === 'creating') {
        $('createError').textContent = m.error;
        $('createError').classList.remove('hidden');
        say(m.error);
        setTimeout(() => { if (state.screen === 'creating') show(state.current ? 'intro' : 'arcade'); }, 4200);
      } else {
        toast('Hmm, that one fizzled. Try again!');
        show(state.current ? 'intro' : 'arcade');
      }
    }
  };
  ws.onclose = () => setTimeout(connect, 1500);
}

// ----------------------------------------------------------------- boot
async function boot() {
  let room = store.get('cgs-room');
  const info = room ? await api(`/api/rooms/${room}`) : await api('/api/rooms', { method: 'POST' });
  state.room = info.code;
  store.set('cgs-room', info.code);
  $('roomCode').textContent = info.code;
  $('joinUrl').textContent = info.phoneUrl.replace(/^https?:\/\//, '');
  $('qr').src = `/api/rooms/${info.code}/qr.svg`;
  renderPlayers();
  renderTts();
  connect();
  await loadArcade();
  show('arcade');
  // Deep links for demos/recording: /tv/?game=seed-dino (&autoplay=1)
  const params = new URLSearchParams(location.search);
  if (params.get('game')) {
    await openIntro(params.get('game')).catch(() => {});
    if (params.get('autoplay')) startGame();
  }
}
boot().catch((e) => { console.error(e); toast('Could not reach the studio server'); });

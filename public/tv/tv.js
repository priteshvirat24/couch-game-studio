// TV app: Family Arcade, creation "magic" screen, intro cards, play, pause, end.
// Built for a Fire TV remote: D-pad, OK/Select, Back, Play/Pause.

import { Game, emojiCode, sfx, config as engineConfig } from '/engine/engine.js';

import { icon, hydrateIcons } from '/assets/icons.js';

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
// New lines interrupt the old one; `queue` lets a follow-up (e.g. "New record!") wait its turn.
function say(text, { queue = false } = {}) {
  if (!speech.on || !text || !('speechSynthesis' in window)) return;
  try {
    if (!queue) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95; u.pitch = 1.1;
    speechSynthesis.speak(u);
  } catch { /* some TV WebViews have no voices */ }
}
function hush() { try { window.speechSynthesis?.cancel(); } catch {} }
function renderTts() {
  const b = $('btnTts');
  b.innerHTML = `${icon(speech.on ? 'volume' : 'volumeOff', { size: 30 })}Read aloud ${speech.on ? 'on' : 'off'}`;
  b.setAttribute('aria-pressed', String(speech.on));
}

// ------------------------------------------------------------------ api
async function api(path, opts = {}) {
  const res = await fetch(path, { headers: { 'content-type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || res.statusText), { status: res.status });
  return data;
}
// Server errors are already kid-friendly sentences; network failures are not.
const friendly = (e, fallback = 'Hmm, that one fizzled. Try again!') => (e?.status && e.status < 500 && e.message ? e.message : fallback);

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
    const i = [...$('shelf').querySelectorAll('.focusable')].indexOf(el);
    if (i >= 0) { state.focus.arcade = i; scrollShelf(el); }
  }
}
function current() { return document.querySelector('.focused'); }
function refocus() {
  const list = focusables();
  if (!list.length) return setFocus(null);
  if (state.screen === 'arcade') {
    // Land on the game shelf (not the settings pill) so OK immediately plays or makes a game.
    // Prefer the game we just came back from: new games can shift the shelf under the old index.
    const cards = [...$('shelf').querySelectorAll('.focusable')];
    const id = state.current?.id;
    const back = id && cards.find((c) => c.dataset.id === id);
    return setFocus(back || cards[Math.min(state.focus.arcade, cards.length - 1)] || list[0]);
  }
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
    // Left/right stay on the same row: past the last card nothing happens (no jump to the pill).
    if ((dir === 'left' || dir === 'right') && (b.bottom < a.top || b.top > a.bottom)) continue;
    const ok =(dir === 'left' && dx < -5) || (dir === 'right' && dx > 5) || (dir === 'up' && dy < -5) || (dir === 'down' && dy > 5);
    if (!ok) continue;
    const main = dir === 'left' || dir === 'right' ? Math.abs(dx) : Math.abs(dy);
    const cross = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
    const score = main + cross * 2;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (best) { setFocus(best); sfx.unlock(); sfx.tone(520, 0.05, { type: 'triangle', vol: 0.05 }); }
}
// Keep the focused card roughly centred, measured from the real layout (stage px, unscaled),
// and clamped so the first and last cards sit fully inside the shelf padding.
function scrollShelf(card) {
  const shelf = $('shelf');
  const max = shelf.scrollWidth - shelf.clientWidth;
  const target = card.offsetLeft - shelf.offsetLeft + card.offsetWidth / 2 - shelf.clientWidth / 2;
  shelf.scrollLeft = Math.max(0, Math.min(max, Math.round(target)));
}

// --------------------------------------------------------------- arcade
function artHtml(spec, big = false) {
  const scn = (spec.theme.scenery || []).map((e, i) => {
    const pos = big ? [[60, 70], [520, 110], [300, 40]][i] : [[22, 30], [250, 50], [140, 14]][i];
    return `<img class="scn" src="${emojiSrc(e)}" style="left:${pos[0]}px;top:${pos[1]}px" alt="">`;
  }).join('');
  const heroSrc = spec.hero.image || emojiSrc(spec.hero.emoji);
  const ground = spec.genre === 'shooter' ? 'transparent' : spec.theme.ground;
  return `<div class="bg" style="background:linear-gradient(${spec.theme.skyTop},${spec.theme.skyBottom})"></div>${scn}<div class="ground" style="background:${ground}"></div><img class="hero" src="${heroSrc}" alt="">`;
}

const GENRE_LABEL = { catcher: 'Catch', runner: 'Run & Jump', maze: 'Maze', shooter: 'Zap' };
const GENRE_ICON = { catcher: 'star', runner: 'up', maze: 'dpad', shooter: 'bolt' };

function renderArcade() {
  const shelf = $('shelf');
  const cards = [`<div class="game-card new focusable" role="button" data-act="surprise" aria-label="Surprise me: the TV imagines a game">
      <div class="new-inner"><span class="new-icon">${icon('dice', { size: 140 })}</span><div class="title">Surprise me!</div><div class="by">No phone handy? The TV will imagine one.</div></div>
    </div>`];
  // An empty arcade still explains itself (first run, or every game tidied away).
  if (!state.games.length) {
    cards.push(`<div class="game-card empty" aria-hidden="true"><div class="new-inner"><span class="new-icon">${icon('phone', { size: 96 })}</span><div class="title">No games yet</div><div class="by">Scan the code with a phone and say your idea. It shows up right here.</div></div></div>`);
  }
  for (const g of state.games) {
    cards.push(`<div class="game-card focusable" role="button" data-id="${esc(g.id)}" aria-label="${esc(`${g.title}, by ${g.author}`)}">
      <div class="art">${artHtml({ ...g, hero: g.hero, theme: g.theme, genre: g.genre })}</div>
      ${state.freshIds.has(g.id) ? '<div class="fresh">NEW</div>' : ''}
      <div class="meta"><div class="title">${esc(g.title)}</div><div class="by"><span class="genre">${esc(GENRE_LABEL[g.genre] || g.genre)}</span> · by ${esc(g.author)}${g.remixOf ? ' · remix' : ''}</div>${g.best ? `<div class="best">${icon('trophy', { size: 24 })}<span>${esc(g.best.name)}</span> · ${g.best.score}</div>` : ''}</div>
      <div class="go">${icon('play', { size: 22 })}Play</div>
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
const STEPS = ['Reading your idea', 'Painting the world', 'Teaching the baddies', 'Robots testing the fun'];
const STEP_MS = 1000;
const QUOTE_WORDS = 28; // long ideas are trimmed on screen so the steps stay visible
let stepTimer = null;
let failTimer = null;
function showCreating(prompt, author, remix) {
  creatingSince = performance.now();
  clearTimeout(failTimer);
  $('createError').classList.add('hidden');
  // Remember where we came from so a failed attempt can put things back.
  if (state.screen !== 'creating') state.returnTo = state.screen;
  if (state.game) state.game.pause();
  $('pauseMenu').classList.add('hidden');
  $('createBy').innerHTML = `${icon(remix ? 'remix' : 'sparkles', { size: 40 })}<span class="who">${esc(author)}</span> ${remix ? 'wants to remix it' : 'imagined'}`;
  // Their words arrive one at a time: this is their idea coming to life.
  const all = String(prompt ?? '').split(/\s+/).filter(Boolean);
  const words = all.slice(0, QUOTE_WORDS);
  if (all.length > words.length) words[words.length - 1] += '…';
  const quote = $('createQuote');
  quote.classList.toggle('long', words.length > 12);
  quote.classList.toggle('longer', words.length > 20);
  quote.innerHTML = `<span class="mark">“</span>${words.map((w, i) => `<span class="w" style="animation-delay:${(i * 0.09).toFixed(2)}s">${esc(w)}</span>`).join(' ')}<span class="w mark" style="animation-delay:${(words.length * 0.09).toFixed(2)}s">”</span>`;
  // One track in four parts. The last part keeps creeping until the game arrives, however long the model takes.
  const steps = $('createSteps');
  steps.style.setProperty('--step-ms', `${STEP_MS}ms`);
  steps.innerHTML = STEPS.map((t, k) => `<div class="step${k === STEPS.length - 1 ? ' last' : ''}"><span class="track"><i></i></span>${t}</div>`).join('');
  let i = 0;
  clearInterval(stepTimer);
  const tick = () => {
    [...steps.children].forEach((el, k) => {
      el.classList.toggle('done', k < i);
      el.classList.toggle('now', k === i);
    });
    if (i < STEPS.length - 1) i += 1;
    else clearInterval(stepTimer);
  };
  tick();
  stepTimer = setInterval(tick, STEP_MS);
  show('creating');
  sfx.unlock();
  sfx.tone(440, 0.4, { type: 'sine', vol: 0.08, slide: 440 });
}
function doneCreating() { clearInterval(stepTimer); clearTimeout(failTimer); }

// Back to wherever the family was before the attempt (a paused game reopens its pause menu).
function leaveCreating() {
  doneCreating();
  if (state.screen !== 'creating') return;
  const to = state.returnTo;
  if (to === 'play' && state.game) {
    show('play');
    $('pauseMenu').classList.remove('hidden');
    refocus();
  } else show(to === 'intro' || to === 'end' ? (state.current ? to : 'arcade') : 'arcade');
}

async function surprise() {
  const prompt = SURPRISES[Math.floor(Math.random() * SURPRISES.length)];
  showCreating(prompt, 'The TV', false);
  try {
    const { game } = await api('/api/games', { method: 'POST', body: { prompt, author: 'The TV', room: state.room } });
    // The websocket "created" event normally drives the UI; this is the fallback when no socket.
    if (!state.ws || state.ws.readyState !== 1) onCreated(game);
  } catch (e) {
    toast(friendly(e));
    leaveCreating();
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
  openIntro(game).catch(() => {});
}

// ---------------------------------------------------------------- intro
const HOW = {
  catcher: [['dpad', 'Left and right to move'], ['star', 'Catch the goodies'], ['bolt', 'Dodge the baddies']],
  runner: [['ok', 'OK to jump, twice for a double'], ['star', 'Grab goodies in the air'], ['bolt', 'Hop over the baddies']],
  maze: [['dpad', 'Arrows to walk'], ['star', 'Collect every goodie'], ['home', 'Then find the exit']],
  shooter: [['dpad', 'Left and right to move'], ['ok', 'OK to zap (hold it)'], ['star', 'Catch goodies for bonus']],
};
const MOD_LABEL = { night: 'Night', lava_floor: 'Lava floor', giant_hero: 'Giant hero', tiny_hero: 'Tiny hero', double_points: 'Double points', reverse_controls: 'Backwards controls', wind: 'Windy', rainbow_trail: 'Rainbow trail', slow_motion: 'Slow-mo', bouncy: 'Bouncy', boss: 'Boss fight', confetti: 'Confetti' };
async function openIntro(gameOrId) {
  let game = gameOrId;
  if (typeof gameOrId === 'string') {
    try { game = await api(`/api/games/${gameOrId}`); } catch (e) {
      // Removed on another TV, or the server blinked: stay put and refresh the shelf.
      toast(friendly(e, 'Could not open that game. Try again!'));
      loadArcade().catch(() => {});
      throw e;
    }
  }
  // A game left running behind the intro (e.g. a remix arrived mid-play) would keep its music going.
  if (state.game) { state.game.stop(); state.game = null; }
  state.current = game;
  const s = game.spec;
  $('introArt').innerHTML = artHtml(s, true);
  $('introGenre').innerHTML = `${icon(GENRE_ICON[s.genre] || 'gamepad', { size: 30 })}${esc(GENRE_LABEL[s.genre] || s.genre)}`;
  $('introTitle').textContent = s.title;
  $('introTitle').classList.toggle('long', s.title.length > 24);
  $('introTagline').textContent = s.tagline;
  $('introNarration').textContent = s.narration.intro;
  $('introHow').innerHTML = HOW[s.genre].map(([ic, text]) => `<div class="tile"><span class="icon">${icon(ic, { size: 30 })}</span>${esc(text)}</div>`).join('');
  const goodies = s.goodies.map((g) => `<img src="${emojiSrc(g.emoji)}" alt="${esc(g.name)}">`).join('');
  const hazards = s.hazards.map((h) => `<img src="${emojiSrc(h.emoji)}" alt="${esc(h.name)}">`).join('');
  const mods = (s.modifiers || []).map((m) => `<span>${esc(MOD_LABEL[m] || m)}</span>`).join('');
  $('introCast').innerHTML = `<div class="group grab"><span class="label">Grab</span><span class="items">${goodies}</span></div>`
    + `<div class="group dodge"><span class="label">Dodge</span><span class="items">${hazards}</span></div>`
    + (mods ? `<div class="mods">${mods}</div>` : '');
  $('introBy').textContent = `Made by ${game.author} · “${game.prompt}”`;
  const t = game.playtest;
  const mode = t?.difficulty === 'hard' ? ` · ${icon('bolt', { size: 22 })} hard mode` : t?.difficulty === 'easy' ? ` · ${icon('leaf', { size: 22 })} easy mode` : '';
  $('introTested').innerHTML = t
    ? `${icon('robot', { size: 30 })}<span>Robots played it ${t.runs}×: kids won <b>${Math.round(t.kidWinRate * 100)}%</b>, in about <b>${Math.max(10, Math.round(t.avgWinSeconds / 5) * 5)}s</b>${mode}</span>`
    : '';
  const best = game.scores?.[0];
  $('introBoard').innerHTML = best ? `<span class="row">${icon('trophy', { size: 24 })}Family best: <b>${esc(best.name)}</b> · ${best.score}</span>` : '';
  show('intro');
  say(`${s.title}. ${s.narration.intro}`);
}

// The family podium on the end screen: top three, with this run highlighted.
function renderPodium(el, scores, highlightAt, record) {
  if (!scores?.length) { el.innerHTML = ''; return; }
  el.innerHTML = scores.slice(0, 3).map((r, i) => `<li class="${r.at === highlightAt ? 'me' : ''}">
      <span class="rank">${i + 1}</span><span class="who">${esc(r.name)}</span><span class="pts">${r.score} pts${r.won ? '' : ' · so close'}</span>
      ${r.at === highlightAt && record ? `<span class="record">New record!</span>` : ''}
    </li>`).join('');
}

// One short burst of confetti, only when someone wins.
function celebrate() {
  const box = $('confetti');
  const colors = ['#ffd166', '#06d6a0', '#ff6b81', '#4cc9f0', '#ff9f43'];
  box.innerHTML = Array.from({ length: 70 }, (_, i) => {
    const left = Math.random() * 100;
    const delay = Math.random() * 0.6;
    const dur = 2.2 + Math.random() * 1.4;
    return `<i style="left:${left.toFixed(1)}%;background:${colors[i % colors.length]};animation-delay:${delay.toFixed(2)}s;animation-duration:${dur.toFixed(2)}s"></i>`;
  }).join('');
  clearTimeout(celebrate.h);
  celebrate.h = setTimeout(() => { box.innerHTML = ''; }, 4200);
}

// Who's on the couch right now, for the scoreboard.
function teamName() {
  // Two phones can share a name (siblings, a re-joined phone): list each name once.
  const names = [...new Set([...state.phones.values()].map((p) => p.name).filter((n) => n && n !== 'Player'))];
  if (!names.length) return 'Family';
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} & ${names.at(-1)}`;
}

// ----------------------------------------------------------------- play
async function startGame() {
  const rec = state.current;
  if (!rec) return;
  if (state.game) state.game.stop();
  hush();
  // Events from a game we've already left (e.g. its delayed "end") must not pull the TV back.
  let game = null; // the constructor already emits events, so this is assigned after
  game = new Game($('canvas'), rec.spec, { onEvent: (e) => { if (game && state.game === game) onGameEvent(e); } });
  state.game = game;
  for (const id of state.phones.keys()) game.addPlayer(id);
  $('pauseMenu').classList.add('hidden');
  show('play');
  try { await game.load(); } catch (e) {
    console.error(e);
    if (state.game === game) { toast('That game would not load. Try another!'); backToArcade(); }
    return;
  }
  if (state.game !== game) return; // they backed out while it loaded
  game.start();
  api(`/api/games/${rec.id}/played`, { method: 'POST' }).catch(() => {});
}

function onGameEvent(e) {
  if (e.type === 'end' && state.screen === 'play') {
    const s = state.current.spec;
    $('endEmoji').innerHTML = `<img src="${s.hero.image || emojiSrc(s.hero.emoji)}" alt="">`;
    $('endTitle').textContent = e.won ? 'You did it!' : 'So close!';
    $('endLine').textContent = e.won ? s.narration.win : s.narration.lose;
    $('endScore').innerHTML = `${icon('star', { size: 40 })}${e.score} points`;
    $('endBoard').innerHTML = '';
    if (e.won) celebrate();
    const seconds = state.game.t || 0;
    state.game.stop();
    show('end');
    say(e.won ? `You did it! ${s.narration.win}` : `So close! ${s.narration.lose}`);
    sendWs({ t: 'reaction', text: e.won ? '🎉 You won!' : '😅 Try again!' });
    const rec = state.current;
    if (!e.won && !e.score) return; // nothing scored: no podium entry
    api(`/api/games/${rec.id}/scores`, { method: 'POST', body: { name: teamName(), score: e.score, won: e.won, seconds } })
      .then(({ rank, scores }) => {
        rec.scores = scores;
        const mine = rank ? scores[rank - 1] : null;
        renderPodium($('endBoard'), scores, mine?.at, rank === 1 && e.won);
        if (rank === 1 && e.won) { sfx.win(); say('New family record!', { queue: true }); }
      })
      .catch(() => {});
  }
}

function pauseGame() {
  if (state.screen !== 'play') return;
  if (!state.game) return backToArcade();
  if (['play', 'countdown'].includes(state.game.state)) {
    state.game.pause();
    $('pauseMenu').classList.remove('hidden');
    refocus();
  } else if (state.game.state === 'paused') resumeGame();
  // Still loading: Back means "never mind". (Just won/lost: the end screen is a beat away.)
  else if (['loading', 'ready'].includes(state.game.state)) backToArcade();
}
function resumeGame() {
  $('pauseMenu').classList.add('hidden');
  setFocus(null);
  state.game?.resume();
}

function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toast.h);
  toast.h = setTimeout(() => t.classList.remove('show'), Math.max(2400, String(text).length * 60));
}

// ------------------------------------------------------------- actions
function activate(el) {
  if (!el) return;
  sfx.unlock();
  // A short dip on OK so the press feels heard (the CSS keeps it to 80ms).
  el.classList.add('pressed');
  setTimeout(() => el.classList.remove('pressed'), 120);
  if (state.screen === 'arcade') {
    if (el.dataset.act === 'surprise') return surprise();
    if (el.dataset.id) return openIntro(el.dataset.id).catch(() => {});
  }
  if (el.id === 'btnTts') { speech.on = !speech.on; store.set('cgs-tts', speech.on ? 'on' : 'off'); renderTts(); if (speech.on) say('Read aloud is on'); else hush(); return; }
  if (el.id === 'btnHide') return askConfirm();
  if (el.id === 'btnRetry') return retryBoot();
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
  if (!yes || !state.current) return setFocus($('btnHide'));
  try {
    await api(`/api/games/${state.current.id}/hidden`, { method: 'POST', body: { hidden: true } });
    toast('Removed from the arcade');
    state.current = null;
    await loadArcade().catch(() => {});
    show('arcade');
  } catch { toast('Could not remove that game'); setFocus($('btnHide')); }
}

function backToArcade() {
  hush();
  state.game?.stop();
  state.game = null;
  $('pauseMenu').classList.add('hidden');
  show('arcade');
}
function back() {
  if (!$('confirm').classList.contains('hidden')) return closeConfirm(false);
  if (state.screen === 'play') return pauseGame();
  if (state.screen === 'intro' || state.screen === 'end') return backToArcade();
  // On the home screen, Back hands control to the TV (Vega host closes the app).
  if ((state.screen === 'arcade' || state.screen === 'offline') && window.ReactNativeWebView) window.ReactNativeWebView.postMessage('exit');
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
  // This room moved to another screen; someone pressing a button here wants it back.
  if (!state.ws && booted) connect();
  const playing = state.screen === 'play' && state.game && ['play', 'countdown'].includes(state.game.state);
  if (playing) {
    if (a === 'back' || a === 'playpause') return pauseGame();
    state.game.input('tv', a === 'ok' ? 'action' : a, true);
    return;
  }
  // Holding OK must not fire it again and again (e.g. several "Surprise me" requests).
  if (e.repeat && a !== 'left' && a !== 'right' && a !== 'up' && a !== 'down') return;
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

const MAX_CHIPS = 6; // the join card has room for about two rows
function renderPlayers() {
  const all = [...state.phones.values()];
  const chips = all.slice(0, MAX_CHIPS).map((p) => `<span class="chip" style="background:${p.color}"><span class="dot">${icon('user', { size: 16 })}</span><span class="name">${esc(p.name)}</span></span>`);
  if (all.length > MAX_CHIPS) chips.push(`<span class="chip more">+${all.length - MAX_CHIPS}</span>`);
  $('playerChips').innerHTML = chips.join('') || '<span class="empty">No phones yet. Scan the code to join!</span>';
}
const nextColor = () => PLAYER_COLORS[(state.phones.size + 1) % PLAYER_COLORS.length];

// A small pill so a dropped connection is visible without getting in the way.
function netStatus(text) {
  const el = $('netStatus');
  el.classList.toggle('hidden', !text);
  if (text && el.lastChild?.textContent !== text) el.innerHTML = `<span class="dot"></span>${esc(text)}`;
}

let retryMs = 1500;
function connect() {
  clearTimeout(connect.h);
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws?room=${state.room}&role=tv`);
  state.ws = ws;
  ws.onopen = () => {
    retryMs = 1500;
    netStatus('');
    sendWs({ t: 'screen', screen: state.screen, gameId: state.current?.id || null, title: state.current?.spec?.title || '', genre: state.current?.spec?.genre || '' });
  };
  ws.onmessage = (ev) => {
    let m;
    try { m = JSON.parse(ev.data); } catch { return; }
    if (m.t === 'join') {
      const known = state.phones.get(m.id);
      state.phones.set(m.id, { name: m.name, color: known?.color || nextColor() });
      renderPlayers();
      if (state.game && state.game.addPlayer(m.id)) toast(`${m.name} joined the game!`);
      else if (!known || known.name !== m.name) toast(`${m.name} connected`);
    } else if (m.t === 'leave') {
      const p = state.phones.get(m.id);
      state.phones.delete(m.id);
      state.game?.removePlayer(m.id);
      renderPlayers();
      if (p) toast(`${p.name} left`);
    } else if (m.t === 'players') {
      // The room's phones right now (on first connect and after every reconnect):
      // drop anyone who left while we were offline, keep colours for those still here.
      const ids = new Set(m.players.map((p) => p.id));
      for (const id of state.phones.keys()) if (!ids.has(id)) { state.phones.delete(id); state.game?.removePlayer(id); }
      for (const p of m.players) {
        const known = state.phones.get(p.id);
        state.phones.set(p.id, { name: p.name, color: known?.color || nextColor() });
        state.game?.addPlayer(p.id);
      }
      renderPlayers();
    } else if (m.t === 'input') {
      state.game?.input(m.id, m.action, m.down);
    } else if (m.t === 'nav') {
      if (m.action === 'pause') pauseGame();
      else if (m.action === 'play') { if (state.screen === 'play' && state.game?.state === 'paused') resumeGame(); else if (state.screen === 'intro') startGame(); }
      else if (m.action === 'again') { if (state.current && ['intro', 'end', 'play'].includes(state.screen)) startGame(); }
      else if (m.action === 'back' && state.screen !== 'arcade') back(); // a phone never closes the TV app
    } else if (m.t === 'creating') {
      showCreating(m.prompt, m.author, m.remix);
    } else if (m.t === 'created') {
      onCreated(m.game);
    } else if (m.t === 'react') {
      cheer(m.emoji, m.name);
    } else if (m.t === 'create_failed') {
      if (state.screen !== 'creating') return doneCreating();
      if (m.error) {
        // A safety nudge: give everyone time to read (and hear) it before moving on.
        doneCreating();
        $('createError').textContent = m.error;
        $('createError').classList.remove('hidden');
        say(m.error);
        failTimer = setTimeout(leaveCreating, 4200);
      } else {
        toast('Hmm, that one fizzled. Try again!');
        leaveCreating();
      }
    }
  };
  ws.onclose = (ev) => {
    if (state.ws !== ws) return;
    if (ev.code === 4000) {
      // Another TV opened this room. Don't fight over it; take it back on the next button press.
      state.ws = null;
      netStatus('Playing on another screen');
      return;
    }
    netStatus('Reconnecting…');
    connect.h = setTimeout(connect, retryMs);
    retryMs = Math.min(retryMs * 1.6, 10000);
  };
}

// ----------------------------------------------------------------- boot
// Boot is safe to retry: each step is skipped once it has worked.
let booted = false;
async function boot() {
  if (!state.room) {
    const saved = store.get('cgs-room');
    const info = saved ? await api(`/api/rooms/${saved}`).catch(() => api('/api/rooms', { method: 'POST' })) : await api('/api/rooms', { method: 'POST' });
    state.room = info.code;
    store.set('cgs-room', info.code);
    $('roomCode').textContent = info.code;
    $('joinUrl').textContent = info.phoneUrl.replace(/^https?:\/\//, '');
    $('qr').innerHTML = `<img src="/api/rooms/${info.code}/qr.svg" alt="" width="176" height="176">`;
    connect();
  }
  await loadArcade();
  booted = true;
  show('arcade');
  // Deep links for demos/recording: /tv/?game=seed-dino (&autoplay=1)
  const params = new URLSearchParams(location.search);
  if (params.get('game')) {
    try {
      await openIntro(params.get('game'));
      if (params.get('autoplay')) startGame();
    } catch { /* openIntro already said so */ }
  }
}
// Server unreachable: say so kindly on screen, and keep trying in the background.
function bootFailed(e) {
  console.warn('[boot]', e?.message || e);
  show('offline');
  clearTimeout(bootFailed.h);
  bootFailed.h = setTimeout(retryBoot, 5000);
}
function retryBoot() {
  if (booted) return;
  clearTimeout(bootFailed.h);
  $('offlineText').textContent = 'Trying again…';
  boot().catch((e) => { $('offlineText').textContent = 'Still can’t reach it. We’ll keep trying.'; bootFailed(e); });
}

hydrateIcons();
renderPlayers();
renderTts();
boot().catch(bootFailed);

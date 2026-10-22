// Couch Game Studio server.
// - Serves the TV app (/tv), the phone companion (/p/:room) and the engine.
// - Pairs phones to a TV "room" over WebSocket (controllers + create/remix).
// - Turns descriptions into GameSpecs (server/llm.js) and keeps the Family Arcade.

import express from 'express';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createSpec, remixSpec, llmStatus } from './llm.js';
import { normalizeSpec } from './spec.js';
import { SEED_GAMES } from './seeds.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = process.env.DATA_DIR || path.join(ROOT, 'data');
const GAMES_DIR = path.join(DATA, 'games');
const SPRITES_DIR = path.join(DATA, 'sprites');
const EMOJI_DIR = path.join(DATA, 'emoji');
const PORT = Number(process.env.PORT || 8787);
const PUBLIC_URL = process.env.PUBLIC_URL || ''; // e.g. https://couch.example.com when tunneled
const TWEMOJI = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg';

await Promise.all([GAMES_DIR, SPRITES_DIR, EMOJI_DIR].map((d) => fs.mkdir(d, { recursive: true })));

// ------------------------------------------------------------- arcade store
const games = new Map();
for (const f of await fs.readdir(GAMES_DIR)) {
  if (!f.endsWith('.json')) continue;
  try { const g = JSON.parse(await fs.readFile(path.join(GAMES_DIR, f), 'utf8')); games.set(g.id, g); } catch {}
}
if (!games.size) {
  for (const seed of SEED_GAMES) {
    const g = { id: seed.id, prompt: seed.prompt, author: seed.author, createdAt: Date.now() - 86400000, provider: 'seed', spec: normalizeSpec(seed.spec), plays: 0, remixOf: null };
    games.set(g.id, g);
    await saveGame(g);
  }
}
async function saveGame(g) {
  await fs.writeFile(path.join(GAMES_DIR, `${g.id}.json`), JSON.stringify(g, null, 2));
}
const listGames = () => [...games.values()].sort((a, b) => b.createdAt - a.createdAt)
  .map(({ id, prompt, author, createdAt, spec, plays, remixOf }) => ({ id, prompt, author, createdAt, plays, remixOf, title: spec.title, genre: spec.genre, hero: spec.hero, theme: spec.theme }));

// ---------------------------------------------------------------- helpers
function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) return a.address;
  }
  return 'localhost';
}
// Phone links follow however the TV reached us: a public tunnel/host if that's what the
// TV used, otherwise this machine's LAN address so phones on the same Wi-Fi can join.
const baseUrl = (req) => {
  if (PUBLIC_URL) return PUBLIC_URL.replace(/\/$/, '');
  const host = req.get('host') || '';
  if (host && !/^(localhost|127\.|\[::1\])/.test(host)) return `${req.protocol}://${host}`;
  return `http://${lanAddress()}:${PORT}`;
};
const newRoomCode = () => {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do { code = Array.from({ length: 4 }, () => letters[crypto.randomInt(letters.length)]).join(''); } while (rooms.has(code));
  return code;
};
const clean = (s, max) => String(s || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

// ------------------------------------------------------------------ rooms
// room: { code, tv: ws|null, phones: Map<id, {ws,name,color}>, screen, gameId }
const rooms = new Map();
function getRoom(code) {
  code = String(code || '').toUpperCase();
  if (!rooms.has(code)) rooms.set(code, { code, tv: null, phones: new Map(), screen: 'arcade', gameId: null, busy: false });
  return rooms.get(code);
}
function send(ws, msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function toPhones(room, msg) { for (const p of room.phones.values()) send(p.ws, msg); }
function roomPlayers(room) { return [...room.phones.entries()].map(([id, p]) => ({ id, name: p.name })); }

// ------------------------------------------------------------------- app
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '3mb' }));

app.get('/', (req, res) => res.redirect('/tv/'));
app.get('/favicon.ico', (req, res) => res.redirect('/emoji/1f3ae.svg'));
app.use('/tv', express.static(path.join(ROOT, 'public/tv')));
app.use('/engine', express.static(path.join(ROOT, 'public/engine')));
app.use('/assets', express.static(path.join(ROOT, 'public/assets')));
app.use('/phone', express.static(path.join(ROOT, 'public/phone')));
app.get('/p/:room', (req, res) => res.sendFile(path.join(ROOT, 'public/phone/index.html')));
app.use('/sprites', express.static(SPRITES_DIR, { maxAge: '7d' }));

// Emoji sprites: fetched once from the Twemoji CDN, then served locally (works offline after warm-up).
app.get('/emoji/:code.svg', async (req, res) => {
  const code = req.params.code;
  if (!/^[0-9a-f]{2,6}(-[0-9a-f]{2,6})*$/.test(code)) return res.status(400).end();
  const file = path.join(EMOJI_DIR, `${code}.svg`);
  res.type('image/svg+xml').set('Cache-Control', 'public, max-age=604800');
  if (fss.existsSync(file)) return res.sendFile(file);
  try {
    const r = await fetch(`${TWEMOJI}/${code}.svg`);
    if (!r.ok) return res.status(404).end();
    const svg = await r.text();
    await fs.writeFile(file, svg);
    res.send(svg);
  } catch {
    res.status(502).end();
  }
});

app.get('/api/status', (req, res) => res.json({ ok: true, llm: llmStatus(), games: games.size, rooms: rooms.size }));

app.post('/api/rooms', (req, res) => {
  const code = newRoomCode();
  getRoom(code);
  res.json({ code, phoneUrl: `${baseUrl(req)}/p/${code}` });
});

app.get('/api/rooms/:code', (req, res) => {
  const code = String(req.params.code).toUpperCase();
  if (!/^[A-Z]{4}$/.test(code)) return res.status(400).json({ error: 'bad room code' });
  getRoom(code);
  res.json({ code, phoneUrl: `${baseUrl(req)}/p/${code}` });
});

app.get('/api/rooms/:code/qr.svg', async (req, res) => {
  const url = `${baseUrl(req)}/p/${String(req.params.code).toUpperCase()}`;
  const svg = await QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: '#1b1b2f', light: '#ffffff' } });
  res.type('image/svg+xml').send(svg);
});

app.get('/api/games', (req, res) => res.json(listGames()));
app.get('/api/games/:id', (req, res) => {
  const g = games.get(req.params.id);
  if (!g) return res.status(404).json({ error: 'not found' });
  res.json(g);
});

async function storeHeroImage(dataUrl) {
  const m = /^data:image\/(png|webp|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!m) return null;
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 1_500_000) return null;
  const name = `${crypto.randomUUID()}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
  await fs.writeFile(path.join(SPRITES_DIR, name), buf);
  return `/sprites/${name}`;
}

// Create a game from a description (and optional hero photo/drawing).
app.post('/api/games', async (req, res) => {
  const prompt = clean(req.body?.prompt, 400);
  const author = clean(req.body?.author, 24) || 'Someone';
  const room = req.body?.room ? getRoom(req.body.room) : null;
  if (prompt.length < 3) return res.status(400).json({ error: 'Tell me a little more about your game!' });
  if (room?.busy) return res.status(409).json({ error: 'Already making a game, hang on!' });
  if (room) { room.busy = true; send(room.tv, { t: 'creating', prompt, author }); toPhones(room, { t: 'creating', prompt, author }); }
  try {
    const heroImage = await storeHeroImage(req.body?.heroImage);
    const { spec, provider, ms } = await createSpec(prompt, { heroImage });
    const g = { id: crypto.randomUUID().slice(0, 8), prompt, author, createdAt: Date.now(), provider, spec, plays: 0, remixOf: null };
    games.set(g.id, g);
    await saveGame(g);
    console.log(`[create] "${prompt}" -> ${spec.genre} "${spec.title}" via ${provider} in ${ms}ms`);
    if (room) { send(room.tv, { t: 'created', game: g, ms }); toPhones(room, { t: 'created', game: summary(g), ms }); }
    res.json({ game: g, ms });
  } catch (err) {
    console.error('[create] failed', err);
    if (room) { send(room.tv, { t: 'create_failed' }); toPhones(room, { t: 'create_failed' }); }
    res.status(500).json({ error: 'The game machine hiccuped. Try again!' });
  } finally {
    if (room) room.busy = false;
  }
});

// Remix: "make it faster", "add lava", "make Biscuit giant"...
app.post('/api/games/:id/remix', async (req, res) => {
  const base = games.get(req.params.id);
  if (!base) return res.status(404).json({ error: 'not found' });
  const instruction = clean(req.body?.instruction, 300);
  const author = clean(req.body?.author, 24) || 'Someone';
  const room = req.body?.room ? getRoom(req.body.room) : null;
  if (instruction.length < 2) return res.status(400).json({ error: 'What should change?' });
  if (room?.busy) return res.status(409).json({ error: 'Already remixing, hang on!' });
  if (room) { room.busy = true; send(room.tv, { t: 'creating', prompt: instruction, author, remix: true }); toPhones(room, { t: 'creating', prompt: instruction, author, remix: true }); }
  try {
    const { spec, provider, ms } = await remixSpec(base.spec, instruction);
    const g = { id: crypto.randomUUID().slice(0, 8), prompt: `${base.prompt} + ${instruction}`, author, createdAt: Date.now(), provider, spec, plays: 0, remixOf: base.id };
    games.set(g.id, g);
    await saveGame(g);
    console.log(`[remix] ${base.id} + "${instruction}" -> ${g.id} via ${provider} in ${ms}ms`);
    if (room) { send(room.tv, { t: 'created', game: g, ms, remix: true }); toPhones(room, { t: 'created', game: summary(g), ms, remix: true }); }
    res.json({ game: g, ms });
  } catch (err) {
    console.error('[remix] failed', err);
    if (room) { send(room.tv, { t: 'create_failed' }); toPhones(room, { t: 'create_failed' }); }
    res.status(500).json({ error: 'Remix failed. Try again!' });
  } finally {
    if (room) room.busy = false;
  }
});

app.post('/api/games/:id/played', async (req, res) => {
  const g = games.get(req.params.id);
  if (g) { g.plays += 1; await saveGame(g); }
  res.json({ ok: true });
});

const summary = (g) => ({ id: g.id, title: g.spec.title, genre: g.spec.genre, hero: g.spec.hero, prompt: g.prompt });

// ------------------------------------------------------------- websocket
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://x');
  const room = getRoom(url.searchParams.get('room'));
  const role = url.searchParams.get('role') === 'tv' ? 'tv' : 'phone';
  const id = role === 'tv' ? 'tv' : `p_${crypto.randomUUID().slice(0, 6)}`;
  let alive = true;
  ws.on('pong', () => { alive = true; });
  const ping = setInterval(() => { if (!alive) return ws.terminate(); alive = false; ws.ping(); }, 15000);

  if (role === 'tv') {
    if (room.tv && room.tv !== ws) room.tv.close();
    room.tv = ws;
    send(ws, { t: 'players', players: roomPlayers(room) });
  } else {
    room.phones.set(id, { ws, name: 'Player' });
    send(ws, { t: 'welcome', id, screen: room.screen, gameId: room.gameId, tvConnected: !!room.tv });
  }

  ws.on('message', (buf) => {
    let msg;
    try { msg = JSON.parse(buf); } catch { return; }
    if (role === 'phone') {
      const phone = room.phones.get(id);
      if (msg.t === 'hello') {
        phone.name = clean(msg.name, 16) || 'Player';
        send(room.tv, { t: 'join', id, name: phone.name });
      } else if (msg.t === 'input' && ['left', 'right', 'up', 'down', 'action'].includes(msg.action)) {
        send(room.tv, { t: 'input', id, action: msg.action, down: !!msg.down });
      } else if (msg.t === 'nav' && ['play', 'pause', 'back', 'again'].includes(msg.action)) {
        send(room.tv, { t: 'nav', id, action: msg.action });
      }
    } else if (msg.t === 'screen') {
      // TV tells phones what's on screen so they show the right controls.
      room.screen = clean(msg.screen, 16);
      room.gameId = msg.gameId || null;
      toPhones(room, { t: 'screen', screen: room.screen, gameId: room.gameId, title: clean(msg.title, 40), genre: clean(msg.genre, 12) });
    } else if (msg.t === 'reaction') {
      toPhones(room, { t: 'reaction', text: clean(msg.text, 40) });
    }
  });

  ws.on('close', () => {
    clearInterval(ping);
    if (role === 'tv') { if (room.tv === ws) room.tv = null; toPhones(room, { t: 'tv_left' }); }
    else { room.phones.delete(id); send(room.tv, { t: 'leave', id }); }
    if (!room.tv && !room.phones.size) setTimeout(() => { if (!room.tv && !room.phones.size) rooms.delete(room.code); }, 10 * 60_000);
  });
});

server.listen(PORT, () => {
  console.log(`Couch Game Studio on http://localhost:${PORT}/tv/  (phones: ${PUBLIC_URL || `http://${lanAddress()}:${PORT}`}/p/<ROOM>)`);
  console.log('[llm]', llmStatus());
});

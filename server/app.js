// Couch Game Studio HTTP + WebSocket app.
//   /tv/        the TV app (Fire TV WebView or any browser)
//   /p/:room    the phone companion (scan the QR code on the TV)
//   /engine/    couch-engine ES modules (shared by TV and server)
//   /api/...    rooms, games, remixes, scores
//   /ws         TV <-> phone relay

import express from 'express';
import compression from 'compression';
import QRCode from 'qrcode';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ROOT } from './config.js';
import { GameStore } from './store.js';
import { RoomHub } from './rooms.js';
import { rateLimit } from './ratelimit.js';
import { designGame, remixGame, UnsafeRequestError } from './designer.js';
import { llmStatus } from './llm.js';
import { cleanName } from './safety.js';

const TWEMOJI = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg';
const ENGINE_DIR = path.dirname(fileURLToPath(import.meta.resolve('couch-engine/engine')));
const PKG = JSON.parse(fss.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self' ws: wss:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) return a.address;
  }
  return 'localhost';
}

// Errors that should reach the kid as a friendly sentence (never a stack trace).
function sendError(res, err, fallback) {
  const status = err instanceof UnsafeRequestError ? 422 : err.status || 500;
  if (status >= 500) console.error('[error]', err);
  res.status(status).json({ error: status >= 500 ? fallback : err.message });
}

export async function createStudio(config) {
  const store = await new GameStore(config.dataDir, { playtest: config.playtest }).init();
  const hub = new RoomHub();
  const spritesDir = path.join(config.dataDir, 'sprites');
  const emojiDir = path.join(config.dataDir, 'emoji');
  await Promise.all([spritesDir, emojiDir].map((d) => fs.mkdir(d, { recursive: true })));

  // Phone links follow however the TV reached us: the public URL if configured, else
  // the host the TV used (e.g. a tunnel), else this machine's LAN address.
  const baseUrl = (req) => {
    if (config.publicUrl) return config.publicUrl;
    const host = req.get('host') || '';
    if (host && !/^(localhost|127\.|\[::1\])/.test(host)) return `${req.protocol}://${host}`;
    return `http://${lanAddress()}:${config.port}`;
  };

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use(compression());
  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy': CSP,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=()',
      'Cross-Origin-Opener-Policy': 'same-origin',
    });
    next();
  });
  app.use(express.json({ limit: '3mb' }));

  // ---------------------------------------------------------------- pages
  const statics = { maxAge: '1h', setHeaders: (res, file) => { if (file.endsWith('.html')) res.set('Cache-Control', 'no-cache'); } };
  app.get('/', (req, res) => res.redirect('/tv/'));
  app.get('/favicon.ico', (req, res) => res.redirect(301, '/assets/icon.svg'));
  app.use('/tv', express.static(path.join(ROOT, 'public/tv'), statics));
  app.use('/phone', express.static(path.join(ROOT, 'public/phone'), statics));
  app.use('/assets', express.static(path.join(ROOT, 'public/assets'), { maxAge: '7d' }));
  app.use('/engine', express.static(ENGINE_DIR, statics));
  app.get('/p/:room', (req, res) => res.set('Cache-Control', 'no-cache').sendFile(path.join(ROOT, 'public/phone/index.html')));
  app.get('/manifest.webmanifest', (req, res) => res.type('application/manifest+json').sendFile(path.join(ROOT, 'public/phone/manifest.webmanifest')));
  app.use('/sprites', express.static(spritesDir, { maxAge: '30d', immutable: true }));

  // Emoji sprites: fetched once from the Twemoji CDN, then served from disk forever.
  app.get('/emoji/:code.svg', async (req, res) => {
    const code = req.params.code;
    if (!/^[0-9a-f]{2,6}(-[0-9a-f]{2,6}){0,8}$/.test(code)) return res.status(400).end();
    const file = path.join(emojiDir, `${code}.svg`);
    res.type('image/svg+xml').set('Cache-Control', 'public, max-age=2592000, immutable');
    if (fss.existsSync(file)) return res.sendFile(file);
    try {
      const r = await fetch(`${TWEMOJI}/${code}.svg`, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) return res.status(404).end();
      const svg = await r.text();
      if (!svg.startsWith('<svg')) return res.status(502).end();
      await fs.writeFile(file, svg);
      res.send(svg);
    } catch {
      res.status(502).end();
    }
  });

  // --------------------------------------------------------------- health
  app.get('/healthz', (req, res) => res.json({ ok: true }));
  app.get('/api/status', (req, res) => res.json({
    ok: true, version: PKG.version, games: store.games.size, rooms: hub.rooms.size, playtest: config.playtest, llm: llmStatus(),
  }));

  // ---------------------------------------------------------------- rooms
  app.post('/api/rooms', (req, res) => {
    const code = hub.newCode();
    res.json({ code, phoneUrl: `${baseUrl(req)}/p/${code}` });
  });
  app.get('/api/rooms/:code', (req, res) => {
    const room = hub.get(req.params.code);
    if (!room) return res.status(400).json({ error: 'That room code looks wrong.' });
    res.json({ code: room.code, phoneUrl: `${baseUrl(req)}/p/${room.code}`, phones: room.phones.size, tv: !!room.tv });
  });
  app.get('/api/rooms/:code/qr.svg', async (req, res) => {
    if (!RoomHub.isCode(req.params.code)) return res.status(400).end();
    const url = `${baseUrl(req)}/p/${req.params.code.toUpperCase()}`;
    const svg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#1b1b2f', light: '#ffffff' } });
    res.type('image/svg+xml').set('Cache-Control', 'no-cache').send(svg);
  });

  // ---------------------------------------------------------------- games
  const limiter = rateLimit({ perMinute: config.createPerMinute });
  const roomOf = (req) => (req.body?.room ? hub.get(req.body.room) : null);

  async function storeHeroImage(dataUrl) {
    const m = /^data:image\/(png|webp|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
    if (!m) return null;
    const buf = Buffer.from(m[2], 'base64');
    // Sanity-check the bytes really are an image of the claimed type.
    const magic = { png: [0x89, 0x50, 0x4e, 0x47], jpeg: [0xff, 0xd8, 0xff], webp: [0x52, 0x49, 0x46, 0x46] }[m[1]];
    if (buf.length > 1_500_000 || !magic.every((b, i) => buf[i] === b)) return null;
    const name = `${crypto.randomUUID()}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
    await fs.writeFile(path.join(spritesDir, name), buf);
    return `/sprites/${name}`;
  }

  const announce = (room, game, extra = {}) => {
    hub.toTv(room, { t: 'created', game, ...extra });
    hub.toPhones(room, { t: 'created', game: { id: game.id, title: game.spec.title, genre: game.spec.genre, hero: game.spec.hero, prompt: game.prompt, playtest: game.playtest }, ...extra });
  };

  app.get('/api/games', (req, res) => res.json(store.list({ includeHidden: req.query.all === '1' })));
  app.get('/api/games/:id', (req, res) => {
    const g = store.get(req.params.id);
    return g ? res.json(g) : res.status(404).json({ error: 'That game wandered off.' });
  });

  app.post('/api/games', limiter, async (req, res) => {
    const room = roomOf(req);
    const author = cleanName(req.body?.author, 'Someone');
    const prompt = String(req.body?.prompt || '').trim();
    if (prompt.length < 3) return res.status(400).json({ error: 'Tell me a little more about your game!' });
    try {
      const game = await hub.exclusive(room, async () => {
        hub.broadcast(room, { t: 'creating', prompt: prompt.slice(0, 160), author });
        try {
          const heroImage = await storeHeroImage(req.body?.heroImage);
          const made = await designGame(prompt, { heroImage, playtestEnabled: config.playtest });
          const g = await store.put({
            id: store.newId(), prompt: made.prompt, author, createdAt: Date.now(), provider: made.provider,
            spec: made.spec, playtest: made.playtest, plays: 0, remixOf: null, scores: [], hidden: false,
          });
          console.log(`[create] "${made.prompt}" -> ${g.spec.genre} "${g.spec.title}" via ${made.provider} in ${made.ms}ms, playtest ${made.playtest?.verdict ?? 'off'}`);
          announce(room, g);
          return g;
        } catch (err) {
          hub.broadcast(room, { t: 'create_failed', error: err instanceof UnsafeRequestError ? err.message : null });
          throw err;
        }
      });
      res.status(201).json({ game });
    } catch (err) {
      sendError(res, err, 'The game machine hiccuped. Try again!');
    }
  });

  app.post('/api/games/:id/remix', limiter, async (req, res) => {
    const base = store.get(req.params.id);
    if (!base) return res.status(404).json({ error: 'That game wandered off.' });
    const room = roomOf(req);
    const author = cleanName(req.body?.author, 'Someone');
    const instruction = String(req.body?.instruction || '').trim();
    if (instruction.length < 2) return res.status(400).json({ error: 'What should change?' });
    try {
      const game = await hub.exclusive(room, async () => {
        hub.broadcast(room, { t: 'creating', prompt: instruction.slice(0, 160), author, remix: true });
        try {
          const made = await remixGame(base, instruction, { playtestEnabled: config.playtest });
          const g = await store.put({
            id: store.newId(), prompt: `${base.prompt} + ${made.instruction}`, author, createdAt: Date.now(), provider: made.provider,
            spec: made.spec, playtest: made.playtest, plays: 0, remixOf: base.id, scores: [], hidden: false,
          });
          console.log(`[remix] ${base.id} + "${made.instruction}" -> ${g.id} via ${made.provider}, playtest ${made.playtest?.verdict ?? 'off'}`);
          announce(room, g, { remix: true });
          return g;
        } catch (err) {
          hub.broadcast(room, { t: 'create_failed', error: err instanceof UnsafeRequestError ? err.message : null });
          throw err;
        }
      });
      res.status(201).json({ game });
    } catch (err) {
      sendError(res, err, 'Remix failed. Try again!');
    }
  });

  app.post('/api/games/:id/played', async (req, res) => {
    const g = await store.recordPlay(req.params.id);
    return g ? res.json({ plays: g.plays }) : res.status(404).json({ error: 'not found' });
  });

  app.post('/api/games/:id/scores', async (req, res) => {
    const score = Number(req.body?.score);
    const seconds = Number(req.body?.seconds);
    if (!Number.isFinite(score) || score < 0 || score > 10_000 || !Number.isFinite(seconds) || seconds < 0 || seconds > 3600) {
      return res.status(400).json({ error: 'bad score' });
    }
    const result = await store.recordScore(req.params.id, { name: cleanName(req.body?.name, 'Family'), score: Math.round(score), won: !!req.body?.won, seconds });
    return result ? res.json(result) : res.status(404).json({ error: 'not found' });
  });

  // Grown-ups can tidy the arcade (hidden games stay on disk and can be restored).
  app.post('/api/games/:id/hidden', async (req, res) => {
    const g = await store.setHidden(req.params.id, req.body?.hidden !== false);
    return g ? res.json({ id: g.id, hidden: g.hidden }) : res.status(404).json({ error: 'not found' });
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'not found' }));
  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'That photo is too big. Try a smaller one!' });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad request' });
    sendError(res, err, 'Something went wrong.');
  });

  const server = http.createServer(app);
  hub.attach(server);
  return { app, server, store, hub, close: () => new Promise((r) => { hub.close(); server.close(() => r()); }) };
}

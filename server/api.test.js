// End-to-end API tests: a real server on a random port with a temp data folder.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import { WebSocket } from 'ws';

process.env.LLM_PROVIDER = 'offline'; // deterministic designer, no network
const { createStudio } = await import('./app.js');
const { loadConfig } = await import('./config.js');

let studio, base, dataDir;

before(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cgs-test-'));
  const config = { ...loadConfig({}), dataDir, port: 0, createPerMinute: 30 };
  studio = await createStudio(config);
  await new Promise((r) => studio.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${studio.server.address().port}`;
});
after(async () => {
  await studio.close();
  await fs.rm(dataDir, { recursive: true, force: true });
});

const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('health and security headers', async () => {
  const r = await fetch(`${base}/healthz`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
});

test('the arcade starts with robot-balanced starter games', async () => {
  const games = await (await fetch(`${base}/api/games`)).json();
  assert.ok(games.length >= 4);
  const full = await (await fetch(`${base}/api/games/${games[0].id}`)).json();
  assert.ok(full.playtest?.verdict, 'seed games carry a playtest report');
});

test('making a game: safe text in, playable + playtested game out', async () => {
  const r = await post('/api/games', { prompt: 'My dog Biscuit catches tacos and dodges broccoli, call me at 98765 43210', author: 'Maya<script>' });
  assert.equal(r.status, 201);
  const { game } = await r.json();
  assert.equal(game.spec.genre, 'catcher');
  assert.equal(game.spec.hero.name, 'Biscuit');
  assert.ok(!/98765/.test(game.prompt), 'phone number removed');
  assert.equal(game.author, 'Mayascript');
  assert.ok(game.playtest.runs > 0 && game.playtest.kidWinRate >= 0);
});

test('unsafe ideas get a friendly nudge, not a game', async () => {
  const r = await post('/api/games', { prompt: 'a game about beer and drugs' });
  assert.equal(r.status, 422);
  assert.match((await r.json()).error, /different kind of game/);
});

test('remix keeps the original and honours "super hard"', async () => {
  const { game } = await (await post('/api/games', { prompt: 'a frog jumping over logs collecting flies' })).json();
  const r = await post(`/api/games/${game.id}/remix`, { instruction: 'make it super hard and at night' });
  assert.equal(r.status, 201);
  const remix = (await r.json()).game;
  assert.equal(remix.remixOf, game.id);
  assert.equal(remix.playtest.difficulty, 'hard');
  assert.ok(remix.spec.modifiers.includes('night'));
});

test('family scores are ranked and kept short', async () => {
  const games = await (await fetch(`${base}/api/games`)).json();
  const id = games[0].id;
  for (const [name, score, won] of [['Dad', 10, false], ['Maya', 25, true], ['Zoe', 22, true]]) {
    await post(`/api/games/${id}/scores`, { name, score, won, seconds: 40 });
  }
  const res = await (await post(`/api/games/${id}/scores`, { name: 'Leo', score: 30, won: true, seconds: 35 })).json();
  assert.equal(res.rank, 1);
  assert.deepEqual(res.scores.map((s) => s.name).slice(0, 3), ['Leo', 'Maya', 'Zoe']);
  assert.equal((await post(`/api/games/${id}/scores`, { score: -5, seconds: 1 })).status, 400);
});

test('grown-ups can hide a game from the arcade', async () => {
  const games = await (await fetch(`${base}/api/games`)).json();
  const id = games.at(-1).id;
  await post(`/api/games/${id}/hidden`, { hidden: true });
  const after = await (await fetch(`${base}/api/games`)).json();
  assert.ok(!after.some((g) => g.id === id));
  const all = await (await fetch(`${base}/api/games?all=1`)).json();
  assert.ok(all.some((g) => g.id === id && g.hidden));
});

test('rooms, QR codes and bad input', async () => {
  const { code, phoneUrl } = await (await post('/api/rooms', {})).json();
  assert.match(code, /^[A-Z]{4}$/);
  assert.ok(phoneUrl.endsWith(`/p/${code}`));
  const qr = await fetch(`${base}/api/rooms/${code}/qr.svg`);
  assert.match(await qr.text(), /<svg/);
  assert.equal((await fetch(`${base}/api/rooms/12/qr.svg`)).status, 400);
  assert.equal((await fetch(`${base}/emoji/not-hex.svg`)).status, 400);
  assert.equal((await fetch(`${base}/api/games/nope`)).status, 404);
});

test('phones talk to the TV over the room websocket', async () => {
  const { code } = await (await post('/api/rooms', {})).json();
  const wsUrl = `${base.replace('http', 'ws')}/ws?room=${code}`;
  const tv = new WebSocket(`${wsUrl}&role=tv`);
  const got = [];
  tv.on('message', (m) => got.push(JSON.parse(m)));
  await new Promise((r) => tv.once('open', r));
  const phone = new WebSocket(`${wsUrl}&role=phone`);
  await new Promise((r) => phone.once('open', r));
  phone.send(JSON.stringify({ t: 'hello', name: 'Maya' }));
  phone.send(JSON.stringify({ t: 'input', action: 'left', down: true }));
  phone.send(JSON.stringify({ t: 'input', action: 'rm -rf', down: true })); // ignored
  phone.send(JSON.stringify({ t: 'react', emoji: '🎉' }));
  await new Promise((r) => setTimeout(r, 150));
  assert.ok(got.some((m) => m.t === 'join' && m.name === 'Maya'));
  assert.equal(got.filter((m) => m.t === 'input').length, 1);
  assert.ok(got.some((m) => m.t === 'react' && m.emoji === '🎉'));
  tv.close(); phone.close();
});

test('rate limiting protects the expensive endpoints', async () => {
  const cfg = { ...loadConfig({}), dataDir: await fs.mkdtemp(path.join(os.tmpdir(), 'cgs-rl-')), createPerMinute: 2 };
  const s = await createStudio(cfg);
  await new Promise((r) => s.server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${s.server.address().port}/api/games`;
  const codes = [];
  for (let i = 0; i < 3; i++) codes.push((await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"prompt":"a cat catching fish"}' })).status);
  await s.close();
  await fs.rm(cfg.dataDir, { recursive: true, force: true });
  assert.deepEqual(codes, [201, 201, 429]);
});

test('behind a CDN, only requests carrying the origin secret get through', async () => {
  const cfg = { ...loadConfig({ ORIGIN_SECRET: 'shh-test-secret', TRUST_PROXY: '1' }), dataDir: await fs.mkdtemp(path.join(os.tmpdir(), 'cgs-origin-')) };
  const s = await createStudio(cfg);
  await new Promise((r) => s.server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${s.server.address().port}`;
  const ok = { 'x-origin-verify': 'shh-test-secret' };
  const statuses = [
    (await fetch(`${url}/tv/`)).status,
    (await fetch(`${url}/tv/`, { headers: { 'x-origin-verify': 'shh-test-wrong!' } })).status,
    (await fetch(`${url}/tv/`, { headers: ok })).status,
    (await fetch(`${url}/healthz`)).status,
  ];
  const { code } = await (await fetch(`${url}/api/rooms`, { method: 'POST', headers: ok })).json();
  const wsOpens = (headers) => new Promise((r) => {
    const ws = new WebSocket(`${url.replace('http', 'ws')}/ws?room=${code}&role=tv`, { headers });
    ws.once('open', () => { ws.close(); r(true); });
    ws.once('error', () => r(false));
  });
  const ws = [await wsOpens({}), await wsOpens(ok)];
  await s.close();
  await fs.rm(cfg.dataDir, { recursive: true, force: true });
  assert.deepEqual(statuses, [403, 403, 200, 200]);
  assert.deepEqual(ws, [false, true]);
});

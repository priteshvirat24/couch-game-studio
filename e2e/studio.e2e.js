// Browser end-to-end test: a real TV page and a real phone page in Chromium, against a real
// studio server (offline designer, temp data folder). Run with `npm run test:e2e`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

process.env.LLM_PROVIDER = 'offline';
const { createStudio } = await import('../server/app.js');
const { loadConfig } = await import('../server/config.js');

let studio, base, dataDir, browser;

before(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cgs-e2e-'));
  studio = await createStudio({ ...loadConfig({}), dataDir, port: 0, createPerMinute: 30 });
  await new Promise((r) => studio.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${studio.server.address().port}`;
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
  await studio.close();
  await fs.rm(dataDir, { recursive: true, force: true });
});

test('a phone makes a game, the TV shows it, and the remote plays it', async () => {
  const errors = [];
  const tvCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const tv = await tvCtx.newPage();
  tv.on('pageerror', (e) => errors.push(`tv: ${e.message}`));
  await tv.goto(`${base}/tv/`);
  await tv.waitForFunction(() => window.__cgs?.room && document.querySelectorAll('.game-card').length >= 4);
  const room = await tv.evaluate(() => window.__cgs.room);
  assert.match(room, /^[A-Z]{4}$/);

  // The remote moves focus along the shelf.
  const focused = () => tv.evaluate(() => document.querySelector('.focused')?.textContent.trim().slice(0, 30));
  const first = await focused();
  await tv.keyboard.press('ArrowRight');
  assert.notEqual(await focused(), first, 'ArrowRight moves the focus');

  // A phone joins with its own browser context, like a real second device.
  const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const phone = await phoneCtx.newPage();
  phone.on('pageerror', (e) => errors.push(`phone: ${e.message}`));
  await phone.goto(`${base}/p/${room}`);
  await phone.fill('#nameInput', 'Maya');
  await phone.click('#joinBtn');
  await tv.waitForFunction(() => document.getElementById('playerChips')?.textContent.includes('Maya'));

  // The phone says a game; the TV imagines it, then shows the new game's intro.
  await phone.fill('#promptInput', 'My cat Mochi catches falling fish but has to dodge water drops');
  await phone.click('#makeBtn');
  await tv.waitForFunction(() => window.__cgs.screen === 'creating', null, { timeout: 5000 });
  await tv.waitForFunction(() => window.__cgs.screen === 'intro', null, { timeout: 30000 });
  const title = await tv.evaluate(() => document.getElementById('introTitle').textContent);
  assert.ok(title && title.length > 2, 'the intro shows a title');

  // Enter on Play starts the game; Escape pauses it.
  await tv.keyboard.press('Enter');
  await tv.waitForFunction(() => window.__cgs.screen === 'play', null, { timeout: 5000 });
  await tv.waitForTimeout(4000); // 3-2-1-GO
  await tv.keyboard.press('Escape');
  await tv.waitForFunction(() => window.__cgs.game?.state === 'paused' && !document.getElementById('pauseMenu').classList.contains('hidden'), null, { timeout: 3000 });

  assert.deepEqual(errors, [], 'no uncaught errors on either page');
  await phoneCtx.close();
  await tvCtx.close();
});

// Family Arcade storage: one JSON file per game, written atomically.
// Small, dependency-free and easy to back up (just copy the data folder).

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { balance } from 'couch-engine/playtest';
import { normalizeSpec } from './spec.js';
import { SEED_GAMES } from './seeds.js';

const MAX_SCORES = 5;

export class GameStore {
  constructor(dir, { playtest = true } = {}) {
    this.dir = path.join(dir, 'games');
    this.games = new Map();
    this.playtest = playtest;
  }

  async init() {
    await fs.mkdir(this.dir, { recursive: true });
    for (const f of await fs.readdir(this.dir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const g = JSON.parse(await fs.readFile(path.join(this.dir, f), 'utf8'));
        if (g?.id && g?.spec) this.games.set(g.id, migrate(g));
      } catch (err) {
        console.warn(`[store] skipping unreadable ${f}: ${err.message}`);
      }
    }
    if (!this.games.size) await this.seed();
    return this;
  }

  // First run: the starter games, robot-balanced like any other game.
  async seed() {
    const now = Date.now();
    for (const [i, s] of SEED_GAMES.entries()) {
      const spec = normalizeSpec(s.spec);
      const tested = this.playtest ? balance(spec) : { spec, report: null };
      await this.put({
        id: s.id, prompt: s.prompt, author: s.author, createdAt: now - (i + 1) * 3600_000,
        provider: 'seed', spec: tested.spec, playtest: tested.report, plays: 0, remixOf: null, scores: [], hidden: false,
      });
    }
  }

  newId() {
    let id;
    do { id = crypto.randomBytes(5).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8); } while (!id || this.games.has(id));
    return id;
  }

  get(id) { return this.games.get(String(id)) || null; }

  list({ includeHidden = false } = {}) {
    return [...this.games.values()]
      .filter((g) => includeHidden || !g.hidden)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(summary);
  }

  async put(game) {
    this.games.set(game.id, game);
    const file = path.join(this.dir, `${game.id}.json`);
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(game, null, 2));
    await fs.rename(tmp, file); // atomic replace: a crash never leaves half a game
    return game;
  }

  async update(id, fn) {
    const g = this.get(id);
    if (!g) return null;
    fn(g);
    return this.put(g);
  }

  async recordPlay(id) { return this.update(id, (g) => { g.plays = (g.plays || 0) + 1; }); }

  // Keep the family's best runs (wins first, then score, then fastest).
  async recordScore(id, { name, score, won, seconds }) {
    let rank = null;
    const entry = { name, score, won: !!won, seconds: Math.round(seconds || 0), at: Date.now() };
    const g = await this.update(id, (game) => {
      const scores = [...(game.scores || []), entry]
        .sort((a, b) => (b.won - a.won) || (b.score - a.score) || (a.seconds - b.seconds))
        .slice(0, MAX_SCORES);
      game.scores = scores;
      const i = scores.indexOf(entry);
      rank = i >= 0 ? i + 1 : null;
    });
    return g ? { rank, scores: g.scores } : null;
  }

  async setHidden(id, hidden) { return this.update(id, (g) => { g.hidden = !!hidden; }); }
}

export function summary(g) {
  return {
    id: g.id, prompt: g.prompt, author: g.author, createdAt: g.createdAt, plays: g.plays || 0, remixOf: g.remixOf,
    title: g.spec.title, genre: g.spec.genre, hero: g.spec.hero, theme: g.spec.theme,
    best: g.scores?.[0] || null, verdict: g.playtest?.verdict || null, hidden: !!g.hidden,
  };
}

// Games saved by older versions get the newer fields.
function migrate(g) {
  return { scores: [], hidden: false, playtest: null, plays: 0, ...g };
}

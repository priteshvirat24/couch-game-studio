import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameSpecSchema, playtestTool, directorModel } from './agent.js';
import { SEED_GAMES } from './seeds.js';

test('every starter game satisfies the agent\'s structured-output schema', () => {
  for (const s of SEED_GAMES) {
    const spec = s.spec;
    const r = GameSpecSchema.safeParse(spec);
    assert.ok(r.success, `${s.id}: ${r.error?.message}`);
  }
});

test('the schema rejects made-up genres and modifiers', () => {
  const bad = { ...SEED_GAMES[0].spec, genre: 'chess', modifiers: ['nuke'], projectile: '✨', goal: '🏁', theme: { ...SEED_GAMES[0].spec.theme } };
  assert.equal(GameSpecSchema.safeParse(bad).success, false);
});

test('the playtest_game tool lets the agent see how robots fared', async () => {
  const t = playtestTool('normal');
  const brutal = { ...SEED_GAMES[3].spec, rules: { speed: 10, spawnRate: 10, lives: 1, goalScore: 90 } };
  const out = await t.invoke({ spec: brutal });
  assert.ok(['fair', 'tricky', 'tough'].includes(out.verdict));
  assert.ok(out.tunedRules.speed < 10, 'robots eased the impossible rules');
  assert.ok(typeof out.advice === 'string');
});

test('the Game Director can run on either Bedrock API', () => {
  assert.equal(directorModel({ api: 'mantle', region: 'eu-north-1', modelId: 'moonshotai.kimi-k2.5' }).constructor.name, 'OpenAIModel');
  assert.equal(directorModel({ api: 'runtime', region: 'eu-north-1', modelId: 'eu.amazon.nova-lite-v1:0' }).constructor.name, 'BedrockModel');
});

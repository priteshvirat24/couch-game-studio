import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSpec, offlineSpec, offlineRemix, firstEmoji, GENRES, MODIFIERS } from './spec.js';
import { SEED_GAMES } from './seeds.js';

const isValid = (s) => {
  assert.ok(GENRES.includes(s.genre));
  assert.ok(s.title.length > 0 && s.title.length <= 28);
  assert.ok(s.hero.emoji);
  assert.ok(s.goodies.length >= 1 && s.goodies.length <= 4);
  assert.ok(s.hazards.length >= 1 && s.hazards.length <= 4);
  for (const g of s.goodies) assert.ok(g.points >= 1 && g.points <= 10);
  for (const c of [s.theme.skyTop, s.theme.skyBottom, s.theme.ground]) assert.match(c, /^#[0-9a-f]{6}$/i);
  assert.ok(s.rules.speed >= 1 && s.rules.speed <= 10);
  assert.ok(s.rules.lives >= 1 && s.rules.lives <= 5);
  assert.ok(s.rules.goalScore >= 5 && s.rules.goalScore <= 100);
  assert.ok(s.modifiers.every((m) => MODIFIERS.includes(m)));
};

test('normalizeSpec turns garbage into a playable game', () => {
  for (const junk of [null, undefined, 42, 'hi', {}, { genre: 'chess', rules: { speed: 999, lives: -3 }, goodies: 'no' }]) {
    isValid(normalizeSpec(junk));
  }
});

test('normalizeSpec clamps numbers and drops unknown modifiers', () => {
  const s = normalizeSpec({ genre: 'runner', rules: { speed: 50, spawnRate: 0, lives: 9, goalScore: 1 }, modifiers: ['night', 'nuke', 'night'] });
  assert.deepEqual(s.rules, { speed: 10, spawnRate: 1, lives: 5, goalScore: 5 });
  assert.deepEqual(s.modifiers, ['night']);
});

test('giant and tiny hero cannot both apply', () => {
  const s = normalizeSpec({ modifiers: ['giant_hero', 'tiny_hero'] });
  assert.deepEqual(s.modifiers, ['giant_hero']);
});

test('firstEmoji keeps ZWJ sequences whole and skips words', () => {
  assert.equal(firstEmoji('the 🧑‍🚀 astronaut'), '🧑‍🚀');
  assert.equal(firstEmoji('no emoji here', '⭐'), '⭐');
});

test('hero photo replaces the emoji sprite', () => {
  const s = normalizeSpec({}, { heroImage: '/sprites/abc.png' });
  assert.equal(s.hero.image, '/sprites/abc.png');
});

test('offline designer reads genre, hero, goodies and hazards from a sentence', () => {
  const s = offlineSpec('My dog Biscuit catches falling tacos but has to dodge broccoli');
  assert.equal(s.genre, 'catcher');
  assert.equal(s.hero.name, 'Biscuit');
  assert.equal(s.hero.emoji, '🐶');
  assert.equal(s.goodies[0].emoji, '🌮');
  assert.equal(s.hazards[0].emoji, '🥦');
  isValid(s);
});

test('offline designer picks each genre from its verbs', () => {
  assert.equal(offlineSpec('a frog jumping over logs').genre, 'runner');
  assert.equal(offlineSpec('a robot lost in a maze').genre, 'maze');
  assert.equal(offlineSpec('a cat zapping aliens').genre, 'shooter');
  assert.equal(offlineSpec('a bear collecting honey').genre, 'catcher');
});

test('offline remix applies the change and keeps the rest', () => {
  const base = offlineSpec('My dog Biscuit catches falling tacos');
  const r = offlineRemix(base, 'make it faster and add lava at night');
  assert.ok(r.rules.speed > base.rules.speed);
  assert.ok(r.modifiers.includes('lava_floor') && r.modifiers.includes('night'));
  assert.equal(r.hero.name, base.hero.name);
  isValid(r);
});

test('every seed game is valid', () => {
  for (const seed of SEED_GAMES) isValid(normalizeSpec(seed.spec));
});

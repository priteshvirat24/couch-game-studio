// Offline game designer: turns a sentence into a GameSpec with no AI service at all.
// Verbs pick the genre, nouns become sprites (curated tables + the emojilib dictionary).

import { createRequire } from 'node:module';
import { normalizeSpec, emojiList } from 'couch-engine/spec';

export { GENRES, MODIFIERS, GENRE_HELP, SPEC_JSON_SCHEMA, normalizeSpec, firstEmoji, emojiList } from 'couch-engine/spec';

// ---------------------------------------------------------------------------
// Offline generator: used when no model is reachable, so a demo never fails.
// It reads keywords from the kid's description and builds a sensible spec.
// ---------------------------------------------------------------------------

const LEXICON = [
  // [regex, emoji, kind] kind: hero-ish creature or object
  [/\bdogs?|pupp(y|ies)|biscuit\b/i, '🐶'], [/\bcats?|kitt(en|y)\b/i, '🐱'], [/\bdino(saur)?s?|t-?rex\b/i, '🦖'],
  [/\bunicorns?\b/i, '🦄'], [/\bdragons?\b/i, '🐉'], [/\brobots?\b/i, '🤖'], [/\baliens?\b/i, '👽'],
  [/\bastronauts?\b/i, '🧑‍🚀'], [/\brockets?\b/i, '🚀'], [/\bfrogs?\b/i, '🐸'], [/\bpenguins?\b/i, '🐧'],
  [/\bmonkeys?\b/i, '🐵'], [/\bbunn(y|ies)|rabbits?\b/i, '🐰'], [/\bbears?\b/i, '🐻'], [/\bfox(es)?\b/i, '🦊'],
  [/\bsharks?\b/i, '🦈'], [/\bfish\b/i, '🐟'], [/\bbees?\b/i, '🐝'], [/\bducks?\b/i, '🦆'], [/\bcows?\b/i, '🐮'],
  [/\bpigs?\b/i, '🐷'], [/\bknights?\b/i, '🛡️'], [/\bprincess\b/i, '👸'], [/\bwizards?\b/i, '🧙'],
  [/\bghosts?\b/i, '👻'], [/\bzombies?\b/i, '🧟'], [/\bcars?\b/i, '🚗'], [/\bmonsters?\b/i, '👾'], [/\btrucks?\b/i, '🚚'],
  [/\bsnowm[ae]n\b/i, '⛄'], [/\bmice|mouse\b/i, '🐭'], [/\bhamsters?\b/i, '🐹'], [/\bturtles?\b/i, '🐢'],
  [/\bowls?\b/i, '🦉'], [/\bpandas?\b/i, '🐼'], [/\blions?\b/i, '🦁'], [/\belephants?\b/i, '🐘'], [/\bninjas?\b/i, '🥷'],
  [/\bpirates?\b/i, '🏴‍☠️'], [/\bsuperheroe?s?\b/i, '🦸'], [/\bmermaids?\b/i, '🧜'], [/\bbutterfl(y|ies)\b/i, '🦋'], [/\bgrandma|granny|nani|dadi\b/i, '👵'], [/\bgrandpa|nana|dada\b/i, '👴'],
];
const FOODS = [
  [/\btacos?\b/i, '🌮'], [/\bpizzas?\b/i, '🍕'], [/\bdonuts?|doughnuts?\b/i, '🍩'], [/\bcookies?\b/i, '🍪'],
  [/\bice ?creams?\b/i, '🍦'], [/\bcandy|candies|sweets?\b/i, '🍬'], [/\bapples?\b/i, '🍎'], [/\bbananas?\b/i, '🍌'],
  [/\bcakes?\b/i, '🍰'], [/\bburgers?\b/i, '🍔'], [/\bbones?\b/i, '🦴'], [/\bcarrots?\b/i, '🥕'], [/\bfish\b/i, '🐟'],
  [/\bcoins?|gold|money\b/i, '🪙'], [/\bstars?\b/i, '⭐'], [/\bgems?|diamonds?|jewels?\b/i, '💎'], [/\bhearts?\b/i, '💖'],
  [/\bstrawberr(y|ies)\b/i, '🍓'], [/\bwatermelons?\b/i, '🍉'], [/\bmangos?|mangoes\b/i, '🥭'], [/\bsamosas?\b/i, '🥟'],
  [/\bladoos?|laddus?\b/i, '🟡'], [/\bpresents?|gifts?\b/i, '🎁'], [/\bbananas?\b/i, '🍌'], [/\bhoney\b/i, '🍯'],
];
const BADS = [
  [/\bbroccoli\b/i, '🥦'], [/\bbombs?\b/i, '💣'], [/\brocks?|boulders?|asteroids?|meteors?\b/i, '🪨'],
  [/\blava|fire|flames?\b/i, '🔥'], [/\bspiders?\b/i, '🕷️'], [/\bsnakes?\b/i, '🐍'], [/\bbees?\b/i, '🐝'],
  [/\bghosts?\b/i, '👻'], [/\bzombies?\b/i, '🧟'], [/\baliens?|ufos?\b/i, '👾'], [/\bcactus|cacti\b/i, '🌵'],
  [/\bmud|poop\b/i, '💩'], [/\blightning|storms?\b/i, '⚡'], [/\bsharks?\b/i, '🦈'], [/\bbats?\b/i, '🦇'],
  [/\bmonsters?\b/i, '👹'], [/\bspikes?|thorns?\b/i, '📌'], [/\bslime\b/i, '🟢'], [/\bcats?\b/i, '🐱'],
  [/\bvacuums?\b/i, '🌀'], [/\bbaths?\b/i, '🛁'], [/\bhomework\b/i, '📚'], [/\bvegetables?|veggies?\b/i, '🥦'],
];
const PLACES = [
  [/\bspace|galaxy|planet|moon|stars\b/i, { skyTop: '#0b0b2e', skyBottom: '#2a1b5c', ground: '#5c5c8a', scenery: '🌙🪐✨' }],
  [/\bocean|sea|underwater|beach\b/i, { skyTop: '#0077b6', skyBottom: '#90e0ef', ground: '#e9c46a', scenery: '🐚🌊🪸' }],
  [/\bjungle|forest|woods\b/i, { skyTop: '#2d6a4f', skyBottom: '#95d5b2', ground: '#40916c', scenery: '🌴🌳🍃' }],
  [/\bdesert\b/i, { skyTop: '#f4a261', skyBottom: '#ffe8b6', ground: '#e9c46a', scenery: '🌵☀️🏜️' }],
  [/\bsnow|ice|winter|north pole\b/i, { skyTop: '#a2d2ff', skyBottom: '#ffffff', ground: '#e0f2ff', scenery: '❄️⛄🌨️' }],
  [/\bvolcano|lava\b/i, { skyTop: '#3d0c02', skyBottom: '#ff6b35', ground: '#6a040f', scenery: '🌋🔥💨' }],
  [/\bcity|street|town\b/i, { skyTop: '#4361ee', skyBottom: '#bde0fe', ground: '#6c757d', scenery: '🏙️🚦🌆' }],
  [/\bcandy|sweet|cake\b/i, { skyTop: '#ff8fab', skyBottom: '#ffe5ec', ground: '#c77dff', scenery: '🍭🧁🍬' }],
  [/\bcastle|kingdom|dungeon\b/i, { skyTop: '#5a189a', skyBottom: '#e0aaff', ground: '#6c584c', scenery: '🏰🚩🌙' }],
  [/\bkitchen|house|home\b/i, { skyTop: '#ffd6a5', skyBottom: '#fff1e6', ground: '#bc6c25', scenery: '🪴🖼️🕰️' }],
];

// ---------------------------------------------------------------------------
// Open emoji dictionary (emojilib, MIT): maps almost any noun a kid says to an
// emoji, so the offline designer understands "flies", "logs", "gears"...
// ---------------------------------------------------------------------------
let EMOJI_INDEX = null;
function emojiIndex() {
  if (EMOJI_INDEX) return EMOJI_INDEX;
  const lib = createRequire(import.meta.url)('emojilib');
  EMOJI_INDEX = { byName: new Map(), byNameWord: new Map(), byKeyword: new Map() };
  for (const [emoji, words] of Object.entries(lib)) {
    // Skip skin-tone/people/flag-heavy entries that make bad game sprites.
    if (/\p{Regional_Indicator}/u.test(emoji) || /^(flag|family|couple|kiss|man_|woman_|person_)/.test(words[0])) continue;
    const name = words[0];
    if (!EMOJI_INDEX.byName.has(name)) EMOJI_INDEX.byName.set(name, emoji);
    for (const part of name.split('_')) {
      const prev = EMOJI_INDEX.byNameWord.get(part);
      if (!prev || name.length < prev.len) EMOJI_INDEX.byNameWord.set(part, { emoji, len: name.length });
    }
    for (const k of words.slice(1)) if (!EMOJI_INDEX.byKeyword.has(k)) EMOJI_INDEX.byKeyword.set(k, emoji);
  }
  return EMOJI_INDEX;
}
const singulars = (w) => {
  const out = [w];
  if (w.endsWith('ies')) out.push(`${w.slice(0, -3)}y`);
  if (w.endsWith('ves')) out.push(`${w.slice(0, -3)}f`);
  if (w.endsWith('es')) out.push(w.slice(0, -2));
  if (w.endsWith('s')) out.push(w.slice(0, -1));
  return out;
};
const STOP = new Set(('a an the and or but with without my your his her their our its in on at to of for from by into onto over under ' +
  'is are was be it that this these those who which while when then also very super really so too has have had has ' +
  'game games make made play player catch catches catching collect collects collecting grab grabs dodge dodges dodging ' +
  'avoid avoids avoiding jump jumps jumping run runs running zap zaps zapping shoot shoots shooting find finds finding ' +
  'falling fall falls get gets got lots lot of some many all every big small little tiny giant huge fast slow ' +
  'named called world level land place through around inside outside up down left right top bottom ' +
  'maze castle city swamp night day space jungle forest woods ocean sea desert snow kingdom house home school park ' +
  'street town volcano sky planet galaxy beach river lake mountain cave dungeon room kitchen garden farm field ' +
  'rainbow trail boss confetti lava night dark bouncy wind windy double points lives').split(/\s+/));

export function lookupEmoji(word) {
  const idx = emojiIndex();
  const w = String(word).toLowerCase().replace(/[^a-z]/g, '');
  if (w.length < 3 || STOP.has(w)) return null;
  for (const f of singulars(w)) if (idx.byName.has(f)) return idx.byName.get(f);
  for (const f of singulars(w)) if (idx.byNameWord.has(f)) return idx.byNameWord.get(f).emoji;
  for (const f of singulars(w)) if (idx.byKeyword.has(f)) return idx.byKeyword.get(f);
  return null;
}

// Every noun in a stretch of text that maps to an emoji: [{at, val, word}]
function dictHits(text, offset = 0) {
  const hits = [];
  const re = /[A-Za-z]+/g;
  let m;
  while ((m = re.exec(text))) {
    const val = lookupEmoji(m[0]);
    if (val) hits.push({ at: offset + m.index, val, word: m[0] });
  }
  return hits;
}
const uniqByVal = (arr) => arr.filter((h, i) => arr.findIndex((x) => x.val === h.val) === i);

// Tables are written loosely (/\bdogs?|pupp(y|ies)\b/); wrap each one so every
// alternative must match a whole word ("catches" is not "cat").
const wholeWord = (re) => new RegExp(`\\b(?:${re.source.replace(/^\\b/, '').replace(/\\b$/, '')})\\b`, re.flags);
for (const table of [LEXICON, FOODS, BADS, PLACES]) for (const row of table) row[0] = wholeWord(row[0]);

function findAll(text, table) {
  const hits = [];
  for (const [re, val] of table) {
    const m = re.exec(text);
    if (m) hits.push({ at: m.index, val, word: m[0] });
  }
  return hits.sort((a, b) => a.at - b.at);
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const TAGLINES = {
  catcher: ['{G} good. {H} BAD.', 'It’s raining {g}!', 'Catch the {g}, dodge the {h}!'],
  runner: ['Jump! Jump! JUMP!', 'Run fast, grab the {g}!', 'Don’t touch the {h}!'],
  maze: ['Find every {g}!', 'Sneak past the {h}!', 'Get the {g}, find the exit!'],
  shooter: ['Zap the {h}!', 'Save the {g}!', 'Pew pew! Bye-bye {h}!'],
};
function pickTagline(genre, good, bad) {
  const list = TAGLINES[genre] || TAGLINES.catcher;
  return list[Math.floor(Math.random() * list.length)]
    .replace('{G}', cap(good)).replace('{g}', good.toLowerCase())
    .replace('{H}', cap(bad)).replace('{h}', bad.toLowerCase());
}

export function offlineSpec(prompt = '', extras = {}) {
  const text = String(prompt);
  const lower = text.toLowerCase();
  let genre = 'catcher';
  if (/\b(shoot\w*|zap\w*|blast\w*|lasers?|fire at|space ?ships?|invaders?|pew)\b/.test(lower)) genre = 'shooter';
  else if (/\b(maze\w*|labyrinth|find (the|a) way|escap\w*|dungeon|lost in)\b/.test(lower)) genre = 'maze';
  else if (/\b(run|runs|running|jump|jumps|jumping|race|hop|dash)\b/.test(lower)) genre = 'runner';
  else if (/\b(catch|catches|collect|grab|falling|fall|rain)\b/.test(lower)) genre = 'catcher';

  // Split around "avoid/dodge/not/but" so things after it become hazards.
  const splitAt = lower.search(/\b(avoid|avoids|avoiding|dodge|dodges|dodging|without|not the|watch out|but not|escape from|run from|away from)\b/);
  const goodText = splitAt >= 0 ? text.slice(0, splitAt) : text;
  const badText = splitAt >= 0 ? text.slice(splitAt) : '';

  const heroHit = findAll(text, LEXICON)[0] || dictHits(text)[0];
  let goodHits = findAll(goodText, FOODS).filter((h) => h.val !== heroHit?.val);
  // "jumping over logs", "running from bees": those nouns are obstacles.
  const overRe = /\b(?:over|past|from|around|under)\s+((?:\w+\s+){0,2}\w+)/gi;
  const overHits = [];
  for (let m; (m = overRe.exec(goodText));) overHits.push(...(findAll(m[1], BADS).length ? findAll(m[1], BADS) : dictHits(m[1])));
  // Things you zap/shoot/fight are enemies too.
  const zapRe = /\b(?:zap\w*|shoot\w*|blast\w*|fight\w*|battl\w*|defeat\w*|stop\w*)\s+((?:\w+\s+){0,2}\w+)/gi;
  for (let m; (m = zapRe.exec(goodText));) overHits.push(...(findAll(m[1], BADS).length ? findAll(m[1], BADS) : dictHits(m[1])));
  const isObstacle = (h) => overHits.some((o) => o.val === h.val);
  goodHits = uniqByVal([...goodHits, ...dictHits(goodText)].sort((a, b) => a.at - b.at))
    .filter((h) => h.val !== heroHit?.val && !isObstacle(h) && h.at > (heroHit?.at ?? -1));
  let badHits = findAll(badText, BADS).concat(findAll(badText, LEXICON)).filter((h) => h.val !== heroHit?.val);
  if (!badHits.length && badText) badHits = uniqByVal(dictHits(badText)).filter((h) => h.val !== heroHit?.val);
  if (!badHits.length) badHits = overHits.filter((h) => h.val !== heroHit?.val);
  if (!badHits.length) badHits = findAll(text, BADS).filter((h) => h.val !== heroHit?.val && !findAll(goodText, FOODS).some((g) => g.val === h.val));
  // "a cat zapping space mice": other creatures in the sentence are the enemies.
  if (!badHits.length) badHits = findAll(text, LEXICON).filter((h) => h.val !== heroHit?.val);
  badHits = uniqByVal(badHits);
  const named = (/\b(?:named|called)\s+([A-Z][a-z]+)/.exec(text) || /\b[Mm]y \w+\s+([A-Z][a-z]+)/.exec(text) || [])[1];
  goodHits = goodHits.filter((g) => !badHits.some((b) => b.val === g.val) && g.word !== named);
  const place = findAll(text, PLACES)[0];

  const nameMatch = /\b(?:named|called)\s+([A-Z][a-z]+)/.exec(text) || /\b[Mm]y \w+\s+([A-Z][a-z]+)/.exec(text);
  const heroName = nameMatch ? nameMatch[1] : heroHit ? cap(heroHit.word.toLowerCase()) : 'Hero';

  const modifiers = [];
  if (/\b(night|dark|spooky)\b/.test(lower)) modifiers.push('night');
  if (/\blava\b/.test(lower)) modifiers.push('lava_floor');
  if (/\b(giant|huge|big)\b/.test(lower)) modifiers.push('giant_hero');
  else if (/\b(tiny|small|little)\b/.test(lower)) modifiers.push('tiny_hero');
  if (/\brainbow\b/.test(lower)) modifiers.push('rainbow_trail');
  if (/\bwind(y)?\b/.test(lower)) modifiers.push('wind');
  if (/\bboss\b/.test(lower)) modifiers.push('boss');
  if (/\b(bounc)/.test(lower)) modifiers.push('bouncy');
  const fast = /\b(fast|super ?fast|speedy|quick|hard)\b/.test(lower);
  const easy = /\b(easy|slow|baby|little sister|little brother)\b/.test(lower);

  const heroEmoji = heroHit?.val || (genre === 'shooter' ? '🚀' : '🙂');
  const goodies = (goodHits.length ? goodHits : [{ val: genre === 'shooter' ? '⭐' : '⭐', word: 'stars' }])
    .slice(0, 3).map((h, i) => ({ name: cap(h.word.toLowerCase()), emoji: h.val, points: i === 0 ? 1 : 2 }));
  const hazards = (badHits.length ? badHits : [{ val: genre === 'shooter' ? '👾' : '🪨', word: genre === 'shooter' ? 'invaders' : 'rocks' }])
    .slice(0, 3).map((h) => ({ name: cap(h.word.toLowerCase()), emoji: h.val }));

  return normalizeSpec({
    title: `${heroName}'s ${cap(genre === 'catcher' ? 'Snack Attack' : genre === 'runner' ? 'Big Run' : genre === 'maze' ? 'Maze Quest' : 'Space Zap')}`,
    tagline: pickTagline(genre, goodies[0].name, hazards[0].name),
    genre,
    hero: { name: heroName, emoji: heroEmoji },
    goodies,
    hazards,
    projectile: '✨',
    goal: '🏆',
    theme: place?.val || (modifiers.includes('night')
      ? { skyTop: '#070720', skyBottom: '#2f2366', ground: '#26304f', scenery: '🌙✨⭐' }
      : { skyTop: '#5ec8ff', skyBottom: '#d6f3ff', ground: '#4caf50', scenery: '☁️🌳🌼' }),
    rules: { speed: fast ? 7 : easy ? 2 : 4, spawnRate: fast ? 7 : easy ? 3 : 5, lives: easy ? 5 : 3, goalScore: easy ? 10 : 20 },
    modifiers,
    narration: {
      intro: `Help ${heroName} ${genre === 'catcher' ? `catch the ${goodies[0].name.toLowerCase()}` : genre === 'runner' ? 'run as far as possible' : genre === 'maze' ? 'collect everything in the maze' : 'zap the invaders'}!`,
      win: `${heroName} did it! What a legend!`,
      lose: `Oh no! ${heroName} needs another try!`,
    },
  }, extras);
}

// Offline remix: apply simple, recognizable edits to an existing spec.
export function offlineRemix(spec, instruction = '') {
  const s = structuredClone(spec);
  const t = instruction.toLowerCase();
  const addMod = (m) => { if (!s.modifiers.includes(m)) s.modifiers = [...s.modifiers, m].slice(-4); };
  if (/\b(fast|faster|fastest|harder|speed up|speedy|quick|quicker|more)\b/.test(t)) { s.rules.speed = Math.min(10, s.rules.speed + 2); s.rules.spawnRate = Math.min(10, s.rules.spawnRate + 2); }
  if (/\b(slow|slower|easier|easy|slow down)\b/.test(t)) { s.rules.speed = Math.max(1, s.rules.speed - 2); s.rules.lives = Math.min(5, s.rules.lives + 1); }
  if (/\bnight|dark\b/.test(t)) addMod('night');
  if (/\blava\b/.test(t)) addMod('lava_floor');
  if (/\b(giant|bigger|huge)\b/.test(t)) { s.modifiers = s.modifiers.filter((m) => m !== 'tiny_hero'); addMod('giant_hero'); }
  if (/\b(tiny|smaller|little)\b/.test(t)) { s.modifiers = s.modifiers.filter((m) => m !== 'giant_hero'); addMod('tiny_hero'); }
  if (/\brainbow\b/.test(t)) addMod('rainbow_trail');
  if (/\bboss\b/.test(t)) addMod('boss');
  if (/\bwind\b/.test(t)) addMod('wind');
  if (/\bbounc/.test(t)) addMod('bouncy');
  if (/\bconfetti|party\b/.test(t)) addMod('confetti');
  if (/\bdouble\b/.test(t)) addMod('double_points');
  const place = findAll(t, PLACES)[0];
  if (place) s.theme = { ...place.val, scenery: emojiList(place.val.scenery, 3) };
  const food = findAll(t, FOODS)[0];
  if (food && /\b(add|more|also|and)\b/.test(t)) s.goodies = [...s.goodies, { name: cap(food.word), emoji: food.val, points: 2 }].slice(-4);
  const bad = findAll(t, BADS)[0];
  if (bad && /\b(add|avoid|dodge|with)\b/.test(t)) s.hazards = [...s.hazards, { name: cap(bad.word), emoji: bad.val }].slice(-4);
  const creature = findAll(t, LEXICON)[0];
  if (creature && /\b(be a|make (me|it|him|her) a|turn into|as a)\b/.test(t)) s.hero.emoji = creature.val;
  return normalizeSpec(s, { heroImage: spec.hero.image });
}

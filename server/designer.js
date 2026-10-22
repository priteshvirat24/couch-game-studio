// The game-making pipeline, shared by "make" and "remix":
//
//   kid's words ─▶ safety check ─▶ AI designer (or offline designer) ─▶ GameSpec
//              ─▶ robot playtest + auto-balance ─▶ saved game with a playtest report
//
// Every step is deterministic or validated, so whatever the AI returns, the TV
// receives a game that runs, is kind, and is actually winnable.

import { balance } from 'couch-engine/playtest';
import { createSpec, remixSpec } from './llm.js';
import { checkText } from './safety.js';

export class UnsafeRequestError extends Error {
  constructor(message) { super(message); this.name = 'UnsafeRequestError'; this.status = 422; }
}

// "make it super hard" should stay hard; "for my little brother" should be gentle.
export function difficultyFrom(text, fallback = 'normal') {
  const t = String(text || '').toLowerCase();
  if (/\b(hard|harder|hardest|difficult|challenge|challenging|expert|insane|impossible|super fast|really fast|tricky)\b/.test(t)) return 'hard';
  if (/\b(easy|easier|easiest|baby|toddler|little (sister|brother)|slow|slower|gentle|simple)\b/.test(t)) return 'easy';
  return fallback;
}

function playtest(spec, difficulty, enabled) {
  if (!enabled) return { spec, report: null };
  const started = Date.now();
  const { spec: tuned, report } = balance(spec, { difficulty });
  return { spec: tuned, report: { ...report, ms: Date.now() - started } };
}

export async function designGame(prompt, { heroImage = null, playtestEnabled = true } = {}) {
  const safe = checkText(prompt);
  if (!safe.ok) throw new UnsafeRequestError(safe.reason);
  const difficulty = difficultyFrom(safe.text);
  const { spec, provider, ms } = await createSpec(safe.text, { heroImage, difficulty });
  const tested = playtest(spec, difficulty, playtestEnabled);
  return { prompt: safe.text, spec: tested.spec, playtest: tested.report, provider, ms };
}

export async function remixGame(base, instruction, { playtestEnabled = true } = {}) {
  const safe = checkText(instruction, { max: 300 });
  if (!safe.ok) throw new UnsafeRequestError(safe.reason);
  const difficulty = difficultyFrom(safe.text, base.playtest?.difficulty || 'normal');
  const { spec, provider, ms } = await remixSpec(base.spec, safe.text, { difficulty });
  const tested = playtest(spec, difficulty, playtestEnabled);
  return { instruction: safe.text, spec: tested.spec, playtest: tested.report, provider, ms };
}

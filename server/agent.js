// The Game Director: a Strands agent on Amazon Bedrock that designs a game,
// playtests it with robot players, and revises it before handing it to the TV.
//
//   ┌─────────────┐  draft spec   ┌──────────────────┐  report   ┌──────────────┐
//   │ kid's idea  │──────────────▶│ playtest_game     │─────────▶│ revise / done│
//   └─────────────┘               │ (couch-engine     │          └──────┬───────┘
//                                 │  robot players)   │◀────────────────┘
//                                 └──────────────────┘   up to 3 rounds
//
// The model never writes code: its final answer is validated against a Zod schema
// (structured output) and then normalized + balanced again by the server.

import { Agent, BedrockModel, tool } from '@strands-agents/sdk';
import { z } from 'zod';
import { balance } from 'couch-engine/playtest';
import { normalizeSpec, GENRES, MODIFIERS, GENRE_HELP } from './spec.js';

const emoji = z.string().describe('A single emoji');
const color = z.string().describe('CSS hex color like #4cc9f0');

export const GameSpecSchema = z.object({
  title: z.string().describe('Fun title, max 28 characters'),
  tagline: z.string().describe('One short line a kid would say, max 60 characters'),
  genre: z.enum(GENRES),
  hero: z.object({ name: z.string(), emoji }),
  goodies: z.array(z.object({ name: z.string(), emoji, points: z.number().int() })).min(1).max(4),
  hazards: z.array(z.object({ name: z.string(), emoji })).min(1).max(4),
  projectile: emoji.describe('Shooter only: what the hero fires').optional(),
  goal: emoji.describe('Maze only: the exit or treasure').optional(),
  theme: z.object({ skyTop: color, skyBottom: color, ground: color, scenery: z.string().describe('Up to 3 background emojis').optional() }),
  rules: z.object({
    speed: z.number().int().describe('1-10'),
    spawnRate: z.number().int().describe('1-10'),
    lives: z.number().int().describe('1-5'),
    goalScore: z.number().int().describe('5-100'),
  }),
  modifiers: z.array(z.enum(MODIFIERS)).max(4).default([]),
  narration: z.object({ intro: z.string(), win: z.string(), lose: z.string() }),
});

const SYSTEM = `You are the Game Director of "Couch Game Studio", a Fire TV app where anyone (often a
young kid) imagines a game out loud and plays it on the TV moments later. Your job is to turn their
imagination into a game that feels exactly like what they pictured, and that they can actually win.

The engine runs a GameSpec; you never write code. Genres:
${Object.entries(GENRE_HELP).map(([g, h]) => `- ${g}: ${h}`).join('\n')}
Modifiers (max 4): ${MODIFIERS.join(', ')}.

Workflow:
1. Design a GameSpec that keeps every detail they asked for (names, characters, places, foods).
   Use clear single emojis. Pick the genre from their verbs (catch -> catcher, run/jump -> runner,
   maze/escape -> maze, zap/shoot -> shooter). Theme colors must match the setting.
2. Call playtest_game with your spec. Robot players (kid and grown-up skill) will play it.
3. Read the report. If kids rarely win, or the robots made changes, think about *creative* fixes
   that keep the idea (fewer or friendlier hazards, juicier goodies, a gentler modifier) and
   playtest again. At most 3 playtests in total.
4. Reply with your final GameSpec.

Rules: always kind and age-appropriate (cartoon zappers are fine; no gore, nothing scary for
little kids unless they asked for "spooky"). If an idea isn't suitable, design a gentle, silly
alternative. Titles <= 28 chars, narration lines short and upbeat, speaking to the player.`;

export function playtestTool(difficulty) {
  return tool({
    name: 'playtest_game',
    description: 'Have robot players (kid and grown-up skill) play the game many times. Returns win rates, typical time to win, and any balance changes the robots made.',
    inputSchema: z.object({ spec: GameSpecSchema }),
    callback: ({ spec }) => {
      const { spec: tuned, report } = balance(normalizeSpec(spec), { difficulty });
      return {
        verdict: report.verdict,
        kidWinRate: report.kidWinRate,
        grownupWinRate: report.grownupWinRate,
        typicalWinSeconds: report.avgWinSeconds,
        robotChanges: report.changes,
        tunedRules: tuned.rules,
        tunedModifiers: tuned.modifiers,
        advice: report.verdict === 'fair'
          ? 'Kids can win this. Keep the tuned rules in your final answer.'
          : 'Too hard for most kids. Consider a creative change, then playtest again.',
      };
    },
  });
}

/**
 * Design (or remix) a game with the agent. Throws if Bedrock is unavailable; the caller
 * falls back to a single Converse call, then to the offline designer.
 */
export async function directGame(request, { region, modelId, difficulty = 'normal', timeoutMs = 60_000 } = {}) {
  const agent = new Agent({
    name: 'Game Director',
    description: 'Designs and playtests family TV games from a description.',
    model: new BedrockModel({ region, modelId, maxTokens: 4000 }),
    systemPrompt: SYSTEM,
    tools: [playtestTool(difficulty)],
    structuredOutputSchema: GameSpecSchema,
    printer: false,
  });
  const cancel = new AbortController();
  const timer = setTimeout(() => cancel.abort(), timeoutMs);
  try {
    const result = await agent.invoke(request, { cancelSignal: cancel.signal, limits: { turns: 8 } });
    if (!result.structuredOutput) throw new Error('Game Director returned no spec');
    return result.structuredOutput;
  } finally {
    clearTimeout(timer);
  }
}

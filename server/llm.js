// Turns someone's imagination (a sentence, or a remix request) into a GameSpec.
//
// Designer chain, first one that works wins:
//   1. Game Director on Bedrock Mantle: a Strands agent that designs, robot-playtests and
//      revises the game, running an open-weight model through Bedrock's OpenAI-compatible
//      endpoint (server/agent.js). A second Mantle model steps in if the first one fails.
//   2. Game Director on the Bedrock Converse API (Nova, or partner models where enabled).
//   3. Bedrock Converse: one call with a make_game tool (faster, no playtest loop).
//   4. Offline designer: keyword-based, instant, never fails (server/spec.js).
// Every path ends in normalizeSpec(), and designer.js balances the result again.

import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { SPEC_JSON_SCHEMA, GENRE_HELP, MODIFIERS, normalizeSpec, offlineSpec, offlineRemix } from './spec.js';
import { directGame } from './agent.js';

const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 60000);
// auto | mantle | agent | converse | offline
const MODE = process.env.LLM_PROVIDER || 'auto';
// Spending guard: at most this many Bedrock designs per day, then the offline designer
// takes over until midnight (UTC). Keeps a demo from quietly burning through credit.
const DAILY_LIMIT = Number(process.env.BEDROCK_DAILY_LIMIT || 150);
const usage = { day: '', count: 0 };
const today = () => new Date().toISOString().slice(0, 10);
function underBudget() {
  if (usage.day !== today()) Object.assign(usage, { day: today(), count: 0 });
  return usage.count < DAILY_LIMIT;
}
const MANTLE_MODELS = (process.env.BEDROCK_MANTLE_MODELS || 'qwen.qwen3-235b-a22b-2507,moonshotai.kimi-k2.5')
  .split(',').map((m) => m.trim()).filter(Boolean);

// The Region comes from BEDROCK_REGION, else the usual AWS env vars / profile config.
const bedrock = new BedrockRuntimeClient(process.env.BEDROCK_REGION ? { region: process.env.BEDROCK_REGION } : {});
let REGION = process.env.BEDROCK_REGION || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || null;
const region = async () => (REGION ||= await bedrock.config.region().catch(() => 'us-east-1'));
region();
// Cross-Region inference profiles are named after the geography (us., eu., apac.).
const geo = (r) => (r.startsWith('eu-') ? 'eu' : r.startsWith('ap-') ? 'apac' : 'us');
const runtimeModel = (r) => process.env.BEDROCK_MODEL_ID || `${geo(r)}.anthropic.claude-opus-5-5`;

const SYSTEM = `You are the game designer inside "Couch Game Studio", a Fire TV app where anyone imagines a
game out loud and plays it on the TV seconds later. You never write code: you fill in a GameSpec by
calling the make_game tool exactly once.

Genres:
${Object.entries(GENRE_HELP).map(([g, h]) => `- ${g}: ${h}`).join('\n')}
Modifiers (max 4): ${MODIFIERS.join(', ')}.

Keep every detail they imagined (names, characters, places, foods). Single clear emojis. Genre from
the verbs (catch -> catcher, run/jump -> runner, maze/escape -> maze, zap/shoot -> shooter). Theme colors
(#rrggbb) match the setting. For young kids: speed 3-5, lives 3, goalScore 15-25 unless they ask
otherwise. Always kind and age-appropriate. Short, upbeat narration that speaks to the player.`;

const TOOL = { toolSpec: { name: 'make_game', description: 'Create or update the game spec the TV engine will run.', inputSchema: { json: SPEC_JSON_SCHEMA } } };

async function converseSpec(userText) {
  const res = await bedrock.send(new ConverseCommand({
    modelId: runtimeModel(await region()),
    system: [{ text: SYSTEM }],
    messages: [{ role: 'user', content: [{ text: userText }] }],
    // Current models reject forced tool choice; "auto" plus the instruction works.
    toolConfig: { tools: [TOOL], toolChoice: { auto: {} } },
    inferenceConfig: { maxTokens: 4000 },
  }), { abortSignal: AbortSignal.timeout(TIMEOUT_MS) });
  const content = res.output?.message?.content || [];
  const call = content.find((c) => c.toolUse);
  if (call) return call.toolUse.input;
  const json = /\{[\s\S]*\}/.exec(content.map((c) => c.text || '').join('\n'));
  if (!json) throw new Error('model returned no game');
  return JSON.parse(json[0]);
}

const status = { last: null, lastError: null };
const backoff = new Map();

const PROVIDERS = [
  ...MANTLE_MODELS.map((modelId) => ({
    name: `mantle:${modelId}`, kind: 'mantle', enabled: () => ['auto', 'mantle'].includes(MODE),
    label: () => `Game Director agent (Strands on Bedrock Mantle, ${modelId})`,
    run: async (text, opts) => directGame(text, { api: 'mantle', region: await region(), modelId, difficulty: opts.difficulty, timeoutMs: TIMEOUT_MS }),
  })),
  {
    name: 'agent', kind: 'agent', enabled: () => ['auto', 'agent'].includes(MODE),
    label: () => `Game Director agent (Strands on Bedrock Converse, ${runtimeModel(REGION || '')})`,
    run: async (text, opts) => { const r = await region(); return directGame(text, { api: 'runtime', region: r, modelId: runtimeModel(r), difficulty: opts.difficulty, timeoutMs: TIMEOUT_MS }); },
  },
  {
    name: 'converse', kind: 'converse', enabled: () => ['auto', 'converse'].includes(MODE),
    label: () => `Bedrock Converse (${runtimeModel(REGION || '')})`,
    run: (text) => converseSpec(text),
  },
];

async function design(userText, opts = {}) {
  if (MODE === 'offline' || !underBudget()) return null;
  usage.count++;
  for (const p of PROVIDERS) {
    if (!p.enabled() || Date.now() < (backoff.get(p.name) || 0)) continue;
    try {
      const raw = await p.run(userText, opts);
      status.last = p.label();
      status.lastError = null;
      return { raw, provider: p.kind };
    } catch (err) {
      status.lastError = `${p.name}: ${err.name || 'Error'}: ${err.message}`;
      // Account/permission problems don't fix themselves in seconds: skip this provider for a minute.
      backoff.set(p.name, Date.now() + 60_000);
      console.warn(`[designer] ${status.lastError}`);
    }
  }
  return null;
}

export async function createSpec(prompt, { heroImage = null, difficulty = 'normal' } = {}) {
  const started = Date.now();
  const photo = heroImage ? '\nThey also drew or photographed the hero; that picture will be used as the hero sprite.' : '';
  const out = await design(`Make a game from this idea: "${prompt}"${photo}`, { difficulty });
  const spec = out ? normalizeSpec(out.raw, { heroImage }) : offlineSpec(prompt, { heroImage });
  return { spec, provider: out?.provider || 'offline', ms: Date.now() - started };
}

export async function remixSpec(spec, instruction, { difficulty = 'normal' } = {}) {
  const started = Date.now();
  const current = { ...spec, hero: { name: spec.hero.name, emoji: spec.hero.emoji } };
  const out = await design(
    `Here is the current game:\n${JSON.stringify(current)}\n\nRemix it: "${instruction}".\n` +
    'Change only what they asked for and keep everything else the same. Return the full updated game.',
    { difficulty },
  );
  const next = out ? normalizeSpec(out.raw, { heroImage: spec.hero.image }) : offlineRemix(spec, instruction);
  return { spec: next, provider: out?.provider || 'offline', ms: Date.now() - started };
}

export function llmStatus() {
  return {
    mode: MODE,
    region: REGION,
    models: { mantle: MANTLE_MODELS, runtime: REGION ? runtimeModel(REGION) : null },
    today: { designs: usage.day === today() ? usage.count : 0, limit: DAILY_LIMIT },
    chain: PROVIDERS.filter((p) => p.enabled()).map((p) => p.name).concat('offline'),
    last: status.last,
    lastError: status.lastError,
  };
}

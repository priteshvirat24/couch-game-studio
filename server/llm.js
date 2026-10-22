// Turns a kid's words (and optional remix instruction) into a GameSpec.
//
// Provider chain (first one that works wins):
//   1. Amazon Bedrock: Claude via the Converse API with a make_game tool.
//   2. Claude API: Anthropic SDK with structured JSON output.
//   3. Offline designer: keyword-based, instant, never fails.
// Every path ends in normalizeSpec(), so the engine always receives a valid game.

import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import Anthropic from '@anthropic-ai/sdk';
import { SPEC_JSON_SCHEMA, GENRE_HELP, MODIFIERS, normalizeSpec, offlineSpec, offlineRemix } from './spec.js';

const BEDROCK_REGION = process.env.BEDROCK_REGION || process.env.AWS_REGION || 'us-east-1';
const BEDROCK_MODEL = process.env.BEDROCK_MODEL_ID || 'us.anthropic.claude-opus-5-5';
const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || process.env.CLAUDE_MODEL || 'claude-opus-5-5';
const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 30000);
const MODE = process.env.LLM_PROVIDER === 'anthropic' ? 'claude' : process.env.LLM_PROVIDER || 'auto'; // auto | bedrock | anthropic | offline
const HAS_CLAUDE_KEY = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

const bedrock = new BedrockRuntimeClient({ region: BEDROCK_REGION });
const claude = HAS_CLAUDE_KEY ? new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 1 }) : null;

const SYSTEM = `You are the game designer inside "Couch Game Studio", a Fire TV app where kids and families
describe a game out loud and play it on the TV seconds later.

You never write code. You design a GameSpec (JSON). The engine supports exactly four genres:
${Object.entries(GENRE_HELP).map(([g, h]) => `- ${g}: ${h}`).join('\n')}

Available modifiers: ${MODIFIERS.join(', ')}.

Rules:
- Keep everything the kid asked for. If they name a pet or person, use that name for the hero.
- Use single emojis for hero, goodies, hazards, projectile, goal and scenery. Pick emojis that clearly match.
- Pick the genre that best matches the verbs: catch/collect -> catcher, run/jump -> runner,
  maze/escape/find -> maze, shoot/zap/blast -> shooter. Default to catcher.
- Theme colors are #rrggbb and match the setting (space = dark purples, ocean = blues, desert = warm sand...).
- Numbers: speed, spawnRate 1-10; lives 1-5; goalScore 5-100. For young kids use speed 3-5, lives 3,
  goalScore 15-25 unless they ask for hard/fast/easy. At most 4 goodies, 4 hazards, 4 modifiers.
- Everything must be kind and age-appropriate (cartoon zappers are fine, no gore).
  If a request is inappropriate, design a gentle, silly alternative instead.
- Title max 28 characters. Tagline and narration lines are short, upbeat, and speak to the player.`;

// ------------------------------------------------------------ Bedrock (AWS)
const TOOL = {
  toolSpec: {
    name: 'make_game',
    description: 'Create or update the game spec that the TV engine will run. Always call this tool.',
    inputSchema: { json: SPEC_JSON_SCHEMA },
  },
};

function parseJsonText(text) {
  const m = /\{[\s\S]*\}/.exec(text || '');
  if (!m) throw new Error('no JSON in model reply');
  return JSON.parse(m[0]);
}

async function bedrockSpec(userText) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    // Current Claude models reject forced tool choice, so we offer the tool on "auto"
    // and tell the model to call it; a JSON text reply is accepted as a fallback.
    const res = await bedrock.send(new ConverseCommand({
      modelId: BEDROCK_MODEL,
      system: [{ text: `${SYSTEM}\n\nAlways answer by calling the make_game tool exactly once.` }],
      messages: [{ role: 'user', content: [{ text: userText }] }],
      toolConfig: { tools: [TOOL], toolChoice: { auto: {} } },
      inferenceConfig: { maxTokens: 4000 },
    }), { abortSignal: ctrl.signal });
    const content = res.output?.message?.content || [];
    const tool = content.find((c) => c.toolUse);
    if (tool) return tool.toolUse.input;
    return parseJsonText(content.map((c) => c.text || '').join('\n'));
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------- Claude API
// Structured outputs need additionalProperties:false everywhere and no numeric/length
// constraints; normalizeSpec() enforces the ranges afterwards.
function strictSchema(node) {
  if (Array.isArray(node)) return node.map(strictSchema);
  if (!node || typeof node !== 'object') return node;
  const out = {};
  for (const [k, v] of Object.entries(node)) {
    if (['minimum', 'maximum', 'minItems', 'maxItems', 'minLength', 'maxLength'].includes(k)) continue;
    out[k] = strictSchema(v);
  }
  if (out.type === 'object' && out.properties) {
    out.additionalProperties = false;
    out.required = Object.keys(out.properties);
  }
  return out;
}
const STRICT_SPEC_SCHEMA = strictSchema(SPEC_JSON_SCHEMA);

async function claudeSpec(userText) {
  const params = {
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    messages: [{ role: 'user', content: userText }],
    output_config: { effort: 'low', format: { type: 'json_schema', schema: STRICT_SPEC_SCHEMA } },
  };
  let res;
  try {
    // Server-side refusal fallback: if the model declines, the API reroutes inside the same call.
    res = await claude.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
  } catch (err) {
    if (!(err instanceof Anthropic.BadRequestError)) throw err;
    res = await claude.messages.create(params); // account without the fallback beta
  }
  if (res.stop_reason === 'refusal') throw new Error(`refused (${res.stop_details?.category ?? 'unknown'})`);
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return JSON.parse(text);
}

// ------------------------------------------------------------------- chain
const status = { last: null, lastError: null };
const backoff = { bedrock: 0, claude: 0 };

const providers = [
  { name: 'bedrock', label: () => `bedrock:${BEDROCK_MODEL}`, enabled: () => MODE === 'auto' || MODE === 'bedrock', run: bedrockSpec },
  { name: 'claude', label: () => `claude:${CLAUDE_MODEL}`, enabled: () => !!claude && (MODE === 'auto' || MODE === 'claude'), run: claudeSpec },
];

async function design(userText) {
  if (MODE === 'offline') return null;
  for (const p of providers) {
    if (!p.enabled() || Date.now() < backoff[p.name]) continue;
    try {
      const raw = await p.run(userText);
      status.last = p.label();
      status.lastError = null;
      return { raw, provider: p.label() };
    } catch (err) {
      status.lastError = `${p.name}: ${err.name || 'Error'}: ${err.message}`;
      // Account/permission problems don't fix themselves in seconds; skip this provider for a minute.
      backoff[p.name] = Date.now() + 60_000;
      console.warn(`[llm] ${status.lastError}`);
    }
  }
  return null;
}

export async function createSpec(prompt, { heroImage } = {}) {
  const started = Date.now();
  const photoNote = heroImage ? '\nThe kid also took a photo/drawing that will be used as the hero picture.' : '';
  const out = await design(`Make a game from this description: "${prompt}"${photoNote}`);
  const spec = out ? normalizeSpec(out.raw, { heroImage }) : offlineSpec(prompt, { heroImage });
  return { spec, provider: out?.provider || 'offline', ms: Date.now() - started };
}

export async function remixSpec(spec, instruction) {
  const started = Date.now();
  const current = { ...spec, hero: { name: spec.hero.name, emoji: spec.hero.emoji } };
  const out = await design(
    `Here is the current game:\n${JSON.stringify(current)}\n\nThe kid wants this change: "${instruction}".\n` +
    'Return the full updated game. Change only what they asked for; keep everything else the same.'
  );
  const next = out ? normalizeSpec(out.raw, { heroImage: spec.hero.image }) : offlineRemix(spec, instruction);
  return { spec: next, provider: out?.provider || 'offline', ms: Date.now() - started };
}

export function llmStatus() {
  return { mode: MODE, bedrock: { region: BEDROCK_REGION, model: BEDROCK_MODEL }, claude: claude ? CLAUDE_MODEL : 'no API key', last: status.last, lastError: status.lastError };
}

// All runtime configuration comes from environment variables (see .env.example).
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadConfig(env = process.env) {
  const dataDir = env.DATA_DIR || path.join(ROOT, 'data');
  return {
    port: Number(env.PORT || 8787),
    host: env.HOST || '0.0.0.0',
    publicUrl: (env.PUBLIC_URL || '').replace(/\/$/, ''),
    dataDir,
    // Requests per minute, per client, for the expensive endpoints (create / remix).
    createPerMinute: Number(env.CREATE_PER_MINUTE || 8),
    // Robot playtesting on every new game (set PLAYTEST=off to skip).
    playtest: env.PLAYTEST !== 'off',
    logLevel: env.LOG_LEVEL || 'info',
  };
}

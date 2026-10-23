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
    // Behind a CDN: only accept requests that carry this secret in X-Origin-Verify
    // (the CDN adds it), so nobody can bypass the CDN and hit the server directly.
    originSecret: env.ORIGIN_SECRET || '',
    // Proxy hops in front of the server, for the client IP used by rate limiting.
    // 1 behind CloudFront; "true" trusts every X-Forwarded-For entry (local tunnels).
    trustProxy: env.TRUST_PROXY === undefined || env.TRUST_PROXY === 'true' ? true : Number(env.TRUST_PROXY) || false,
  };
}

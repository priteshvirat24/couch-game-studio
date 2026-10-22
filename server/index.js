// Couch Game Studio server entry point.
import { loadConfig } from './config.js';
import { createStudio } from './app.js';
import { llmStatus } from './llm.js';

const config = loadConfig();
const studio = await createStudio(config);

studio.server.listen(config.port, config.host, () => {
  console.log(`Couch Game Studio listening on http://localhost:${config.port}/tv/`);
  console.log(`  phones join at ${config.publicUrl || `http://<this-computer>:${config.port}`}/p/<ROOM>`);
  console.log(`  games: ${studio.store.games.size} · robot playtesting: ${config.playtest ? 'on' : 'off'}`);
  console.log('  designer:', llmStatus());
});

// Graceful shutdown (Docker, systemd, Ctrl-C): stop accepting, let requests finish.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    console.log(`\n${sig} received, shutting down…`);
    const force = setTimeout(() => process.exit(1), 8000);
    force.unref();
    await studio.close();
    process.exit(0);
  });
}

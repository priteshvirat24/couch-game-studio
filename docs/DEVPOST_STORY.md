## Inspiration

Everyone imagines games. Almost nobody gets to make one. Kids ask to *make* games, and parents keep asking how: in r/learnprogramming a 6-year-old asks his uncle to make a game together (the top reply has 361 upvotes), and parents across r/Parenting, r/daddit and r/Mommit ask how to turn screen time from passive into creative. Every existing answer needs reading, typing and a laptop, and most are single-player. Meanwhile the biggest screen in the house, the TV, is one families only ever watch.

So we asked: what if *anyone* on the couch, a 6-year-old, a parent or a grandparent, could imagine a game out loud and play the game *they* made on Fire TV a few seconds later?

## What it does

Couch Game Studio turns Fire TV into a family game studio.

1. Anyone scans the QR code on the TV with any phone (no install) and *says* their game: *"My dog Biscuit catches falling tacos but has to dodge broccoli."*
2. Optionally, they snap a photo of a crayon drawing or the real dog. It's cut out on the phone and becomes the hero.
3. The TV turns gold and reveals their own words while a **Game Director agent** on Amazon Bedrock designs the game, and **robot players** test it so a kid can actually win.
4. Seconds later it's playable on the TV with the Fire TV remote. The intro card shows how to play, what to grab and dodge, and the robots' verdict (*"Robots played it 12×: kids won 75%"*). Siblings and parents join as players 2–4 from their phones; the controller layout changes per genre, and everyone can send emoji cheers to the TV.
5. Anyone can remix by voice: *"make it night"*, *"add lava"*, *"give me a boss"*. Every version is saved in the **Family Arcade**, with a family podium and a "New record!" moment.
6. For players who can't read yet, the TV reads titles, intros and results aloud.

**Try it live:** open https://16-171-214-22.sslip.io/tv/ on a laptop or TV browser (arrow keys + Enter are the remote), then scan the QR code with your phone and say a game.

## How we built it

- **The model never writes code.** It fills in a strict, validated *GameSpec*: genre (catch, run & jump, maze, zap), hero, goodies, hazards, world colors, rules and up to four of 12 modifiers (night lighting, lava floor, giant hero, boss fights, wind, reverse controls…). One hand-built canvas engine runs any spec, so generation is fast, kid-safe and can't crash.
- **A real agent, not one prompt.** The Game Director is a **Strands Agents** (TypeScript) agent on **Amazon Bedrock** (Qwen3 235B through Bedrock Mantle, Kimi K2.5 as backup). It drafts a spec, calls a `playtest_game` tool backed by our open-source robot playtester, reads the win rates, revises with creative fixes, and returns Zod-validated structured output. It designs, playtests and returns a game in about 7–15 seconds.
- **Every game is robot-playtested.** Kid-skill and grown-up-skill bots play each game in milliseconds, and an auto-balancer tunes speed, spawn rate, lives and goal so kids win 60–95% of the time. *"Super hard"* stays hard, and still winnable. Creative choices are never changed.
- **Kid safety is layered.** Personal details (emails, phone numbers, addresses, links) are stripped before anything is stored or sent to a model; cartoon violence is softened ("kill" → "bonk", "gun" → "water blaster"); unsuitable topics get a friendly nudge; names are sanitized; drawings never leave the studio server.
- **Never a dead end.** A designer chain falls back from Mantle to the Converse API to an offline designer that reads the sentence (verbs → genre, nouns → sprites), so there is always a game, and a daily cap stops runaway spend.
- **Built for the 10-foot screen.** A **React Native for Vega** app with `@amazon-devices/webview`, a branded native splash screen, TTFD reporting with `kepler-performance-api`, and a friendly retry screen. Inside: spatial D-pad navigation, one clear focus style, quick press feedback, a 3-2-1-GO countdown, gold glow for "grab it" and red glow for "dodge it", self-hosted Fredoka type, an authored icon family and procedural chiptune music.
- **Production-ready on AWS.** Express 5 with CSP and security headers, per-device rate limiting, atomic storage, graceful shutdown, health checks and GitHub Actions CI. It runs on AWS from a **CloudFormation** stack: a Graviton **EC2** instance with an Elastic IP, HTTPS with automatic certificates, an **IAM** role for Bedrock (no keys on the server), IMDSv2 only, and updates through **Systems Manager** (no SSH). 25 server tests (including end-to-end API and WebSocket tests), 10 engine tests and 4 Vega app tests.
- **Open source.** The engine is its own new project, [couch-engine](https://github.com/priteshvirat24/couch-engine) (Apache-2.0, zero dependencies): a spec-driven 2D TV game engine with a robot playtester that anyone building AI game makers can reuse.

## Challenges we ran into

- **Bedrock access on a new account:** Converse and InvokeModel returned "Operation not allowed" for every model and Region. We moved the Game Director to the Bedrock Mantle endpoint with Strands' `bedrockMantleConfig`, which worked, and kept Converse and an offline designer as fallbacks.
- **The Vega Virtual Device on Apple M5:** the emulator froze about 45 seconds into every boot. Booting the bundled emulator on one CPU core fixed it; the script is in the repo.
- **HTTPS everywhere:** Vega WebView blocks plain HTTP, and CloudFront needed account verification, so the studio terminates TLS itself with an automatic certificate on a permanent address.
- **Fair games from a model:** models happily design games no 6-year-old can win. Robot playtesting plus an auto-balancer that never touches creative choices solved it.

## Accomplishments that we're proud of

- A child's sentence becomes a balanced, playable TV game in seconds, with the child's own name, pet and drawing in it.
- The model can't break the TV: it only ever produces data that a validated engine runs.
- It works for everyone on the couch: voice for kids who can't type, read-aloud for kids who can't read, phones as extra controllers.

## What we learned

- Designing *data*, not code, is the safe way to put generative AI in front of kids.
- Agents earn their keep when they have a real tool to check their work: the playtest loop made designs measurably fairer.
- On a TV, speed and focus feedback matter more than decoration: every remote press needs an instant, visible answer.

## What's next for Couch Game Studio

- Alexa voice input straight from the Fire TV remote.
- Ambient ideas (*"you told Grandma about a dragon who loves pancakes: want to play it?"*).
- Sharing family-made games between households.

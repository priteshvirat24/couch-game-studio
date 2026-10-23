# Devpost submission pack: Couch Game Studio

> Copy each section into the matching Devpost field. The only remaining **TODO** is the demo video link.

## Tracks
- **Primary track:** Fire TV (Vega OS)
- **Mini challenges:** AWS Builder; Open Source

## Project name and tagline
**Couch Game Studio**: imagine a game, say it or draw it, and play it on your TV seconds later.

## Text description

**The idea.** Everyone imagines games. Almost nobody gets to make one. Couch Game Studio is built on imagination: *anyone* on the couch, a 6-year-old, a parent or a grandparent, imagines a game, says it or draws it, and plays the game *they* made on Fire TV a few seconds later.

**The problem.** Kids ask to *make* games, and parents keep asking how. In r/learnprogramming, a 6-year-old asks his uncle to make a game together, and the top reply has 361 upvotes. The same question keeps coming up in r/gamedev, and parents across r/Parenting, r/daddit and r/Mommit ask how to turn screen time from passive into creative. Every existing answer needs reading, typing and a laptop, and most are single-player. The biggest screen in the house, the TV, is one families only ever watch.

**What we built.** Couch Game Studio turns Fire TV into a family game studio.
1. Anyone scans the QR code on the TV with any phone (no install) and *says* their game: "My dog Biscuit catches falling tacos but has to dodge broccoli."
2. Optionally, they snap a photo of a crayon drawing or the real dog. It's cut out on the phone and becomes the hero.
3. The TV reveals their own words one at a time while a **Game Director agent** on Amazon Bedrock designs the game, and **robot players** test it so a kid can actually win.
4. Seconds later it's playable on the TV with the Fire TV remote. The intro card shows how to play, what to grab and dodge, and the robots' verdict ("Robots played it 12×: kids won 75%"). Siblings and parents join as players 2–4 from their phones; the controller layout changes per genre, and everyone can send emoji cheers to the TV.
5. Anyone can remix by voice: "make it night", "add lava", "give me a boss". Every version is saved in the **Family Arcade**, with a family podium and a "New record!" moment.
6. For players who can't read yet, the TV reads titles, intros and results aloud.

**How it works.**
- **The model never writes code.** It fills in a strict, validated *GameSpec*: genre (catch, run & jump, maze, zap), hero, goodies, hazards, world colors, rules and up to four of 12 modifiers (night lighting, lava floor, giant hero, boss fights, wind, reverse controls…). One hand-built canvas engine runs any spec, so generation is fast, kid-safe and can't crash.
- **A real agent, not one prompt.** The Game Director is a Strands Agents (TypeScript) agent on Amazon Bedrock. It drafts a spec, calls a `playtest_game` tool backed by our open-source robot playtester, reads the win rates, revises with creative fixes, and returns Zod-validated structured output.
- **Every game is robot-playtested.** Kid-skill and grown-up-skill bots play each game in milliseconds, and an auto-balancer tunes speed, spawn rate, lives and goal so kids win 60–95% of the time. "Super hard" stays hard, and still winnable. Creative choices are never changed.
- **Kid safety is layered.** Personal details (emails, phone numbers, addresses, links) are stripped before anything is stored or sent to a model; cartoon violence is softened ("kill" → "bonk", "gun" → "water blaster", "blood" → "ketchup"); unsuitable topics get a friendly nudge; names are sanitized; drawings never leave the studio server.
- **Never a dead end.** If no model is reachable, an offline designer reads the sentence (verbs → genre, nouns → sprites via the open emojilib dictionary), so there is always a game.
- **Built for the 10-foot screen.** A React Native for Vega app with a branded native splash screen, a 512 px icon, TTFD reporting for cold and warm starts, and a friendly retry screen. Inside: spatial D-pad navigation, one clear focus style, a 3-2-1-GO countdown, gold glow for "grab it" and red glow for "dodge it", self-hosted Fredoka type, an authored icon family and procedural chiptune music.
- **Production-ready.** Express 5 server with CSP and security headers, per-device rate limiting, atomic storage, graceful shutdown, health checks, a non-root Docker image, and GitHub Actions CI. It runs live on AWS at https://16-171-214-22.sslip.io: a CloudFormation stack with a Graviton EC2 instance, HTTPS with automatic certificates, an IAM role for Bedrock (no keys on the server), and updates through Systems Manager (no SSH). 24 server tests (including end-to-end API and WebSocket tests), 10 engine tests and 4 Vega app tests.

**What's next.**
- Alexa voice input straight from the Fire TV remote.
- Ambient ideas ("you told Grandma about a dragon who loves pancakes: want to play it?").
- Sharing family-made games between households.

## Built with
`vega-os` `react-native-for-vega` `amazon-devices-webview` `kepler-performance-api` `amazon-devices-builder-tools` `fire-tv` `amazon-bedrock` `strands-agents` `aws-sdk` `zod` `node.js` `express` `websockets` `canvas` `web-audio` `speech-synthesis` `docker` `github-actions` `emojilib` `twemoji` `amazon-ec2` `aws-cloudformation` `caddy`

## Repo, video and links
- **GitHub repo:** https://github.com/priteshvirat24/couch-game-studio (public, Apache-2.0)
- **Open-source engine:** https://github.com/priteshvirat24/couch-engine (public, Apache-2.0)
- **Demo video (under 3 min, YouTube/Vimeo, public):** **TODO.**
- **Try it live:** https://16-171-214-22.sslip.io/tv/ on a laptop or TV browser (arrow keys + Enter are the remote). Scan the QR code with any phone to make a game; the AI designer runs on Amazon Bedrock.

## Was this built during the hackathon?
Yes. Both repositories were created and built during the submission window (October 2026).

---

## AWS Builder mini challenge
**Services used:**
- **Amazon Bedrock Mantle**: Bedrock's OpenAI-compatible endpoint, running open-weight models (Qwen3 235B by default, Kimi K2.5 as backup) with short-lived tokens minted from AWS credentials (`@aws/bedrock-token-generator`).
- **Amazon Bedrock Runtime**: the Converse API with tool use and cross-region inference profiles (`@aws-sdk/client-bedrock-runtime`).
- **Strands Agents SDK for TypeScript** (`@strands-agents/sdk`) with `OpenAIModel` + `bedrockMantleConfig`, `BedrockModel`, a custom `tool()`, and structured output.
- **AWS CloudFormation, Amazon EC2 (Graviton), Elastic IP, AWS Systems Manager, IAM** (`infra/aws/studio.yaml`): the studio's permanent HTTPS home in eu-north-1. The instance role grants Bedrock Mantle (`AmazonBedrockMantleInferenceAccess`), so no keys live on the server; IMDSv2 only; updates ship through SSM Run Command; the stack reports success only after the public HTTPS health check passes.

**How it works (a multi-step agentic pipeline):**
1. **Safety layer** (`server/safety.js`) strips personal details and softens the words before any model sees them.
2. **Game Director agent** (`server/agent.js`): a Strands agent on Bedrock (Qwen3 235B via Mantle) drafts a GameSpec, then calls its `playtest_game` tool. The tool runs the robot playtester from `couch-engine` and returns kid and grown-up win rates, typical time to win, and any changes the robots made. The agent revises with *creative* fixes (friendlier hazards, juicier goodies, a gentler modifier) and playtests again, up to three times, within an 8-turn limit and a timeout. Its final answer is **Zod-validated structured output**, so the server never parses free text.
3. **Designer chain** (`server/llm.js`): if the agent fails, it retries on a second Mantle model (Kimi K2.5), then the same agent on the Converse API, then a single **Converse** call with a `make_game` tool (whose input schema *is* the GameSpec JSON Schema), then the offline designer. A failing provider is skipped for 60 s, so the TV never hangs, and a daily cap stops runaway spend.
4. **Server-side guarantee** (`server/designer.js`): whatever comes back is normalized and balanced again with the difficulty taken from the player's own words, then saved with its playtest report.
5. Remixes send the current spec plus the instruction through the same pipeline.

**Measured:** on Bedrock Mantle the Game Director designs, playtests and returns a game in about 7–15 seconds. In our model bake-off on the same prompts, Qwen3 235B kept every imagined detail and returned valid structured output every time, so it leads the chain.

## Open Source mini challenge
- **Repo URL:** https://github.com/priteshvirat24/couch-engine
- **GitHub username:** priteshvirat24
- **License:** Apache-2.0 (v1.1.1, zero dependencies)
- **What it is:** a new open-source project created during the hackathon: a spec-driven 2D game engine for TVs with a robot playtester.
  - **Engine:** a dependency-free canvas engine with 4 genres, 12 stackable modifiers, 4-player co-op, D-pad controls, a 3-2-1-GO countdown, and procedural chiptune music and sound effects. Runs in browsers, TV WebViews (Fire TV / Vega OS) and Node.
  - **GameSpec contract:** `normalizeSpec()` turns any input into a valid, runnable game, and `SPEC_JSON_SCHEMA` drops straight into a model tool or structured-output schema.
  - **Robot playtester + auto-balancer:** kid-skill and grown-up-skill bots (one "brain" per genre) play seeded, deterministic games in about 20–300 ms. `balance()` tunes speed, spawn rate, lives and goal toward a 60–95% kid win rate with wins in 25–110 s, honors `easy | normal | hard`, removes the hardest modifier only as a last resort, and never changes creative choices.
  - 10 tests, an example playground, and full API docs in the README.
- **How we use it:** Couch Game Studio installs it as `github:priteshvirat24/couch-engine#v1.1.1`. The server uses `couch-engine/playtest` for the agent's `playtest_game` tool and to balance every saved game; the TV app plays games with the same engine.
- **Why it matters:** it's a safe pattern for generative games, especially for kids. A model (or a child) designs a game as data, never code, and robots check that it's fair before anyone plays. Anyone building AI game makers, party games or TV games can reuse it.

---

## Product feedback (required)

**Vega SDK / Vega CLI**
- *Used for:* the `vega project generate -t vegaWebview` scaffold, `npm run build` (`react-native build-vega`) for armv7/aarch64/x86_64 `.vpkg` files, manifest validation, and the Vega Virtual Device.
- *Worked well:* the `vegaWebview` template is excellent. `--uri` pre-fills the WebView source, the manifest already lists the right services (webview renderer, audio, input method), and remote key codes are documented in one clear table. The CLI help is easy to explore.
- *Needs work:*
  - The Vega WebView runs on the Virtual Device only on Apple-silicon Macs. This is stated inside the WebView guide but **not** in the SDK system requirements or the installer, so we installed the whole SDK on an Intel Mac before finding out.
  - On Intel macOS 26 the documented `brew install` dependency line compiles everything from source (no bottles), which takes hours, even though the installer itself only needs `jq`.
  - The template's manifest points at an app icon, but the generated project had no icon or splash assets, and the build only warns (friction #10).
- *Onboarding:* about 30 minutes once we knew the constraints. The install docs page is rendered client-side, so `curl` and coding agents see an empty page.
- *Would build again:* yes. The WebView path makes Vega a great home for web-based games.

**`@amazon-devices/webview`**
- *Used for:* hosting the TV app, with `allowSystemKeyEvents` for Back and `onMessage` to exit the app from the web home screen, plus `onError` / `onHttpError` / `onSslError` for a friendly retry screen.
- *Worked well:* the D-pad arrives as standard `keydown` events, so web focus engines work unchanged.
- *Needs work:* HTTP is blocked by default since WebView 4.0.2, which also blocks pointing at a LAN dev server. A documented, debug-only "allow local HTTP" switch would save every web developer a tunnel.

**`@amazon-devices/kepler-performance-api`**
- *Used for:* `useReportFullyDrawn()` to report time-to-fully-drawn on cold start (when the studio page loads) and warm start (when the app returns to the foreground), alongside the native splash screen hooks.
- *Worked well:* a single hook, easy to wire into WebView `onLoad` and `AppState` changes, and easy to mock in Jest.
- *Needs work:* installing it with `--legacy-peer-deps`, as the workflow doc instructs, rewrote our lockfile and removed the `build-vega` CLI command (friction #9). A plain `npm install` worked. A WebView-specific example (when is a hosted page "fully drawn"?) would help.

**Amazon Bedrock**
- *Used for:* the model behind our Strands agent (via the Mantle OpenAI-compatible endpoint), plus the Converse API with tool use as a fallback, to turn someone's imagination into a validated game spec.
- *Worked well:* Mantle gave a new account a wide choice of open-weight models behind one endpoint, with tool calling that worked first time through Strands. Tool `inputSchema` maps one-to-one to our JSON Schema, and inference profiles make model choice a single string.
- *Needs work:* on our new account, Converse and InvokeModel returned "Operation not allowed" for every model while Mantle worked; nothing pointed us to Mantle as the way in (friction #5). Some newer models reject forced `toolChoice`, which isn't obvious from the Converse docs.
- *Would build again:* yes.

**Strands Agents SDK (TypeScript)**
- *Used for:* the Game Director agent: `Agent` + `OpenAIModel` with `bedrockMantleConfig` (or `BedrockModel`), a `tool()` with a Zod input schema (`playtest_game`), `structuredOutputSchema` for the final GameSpec, `cancelSignal` and turn limits.
- *Worked well:* defining a tool with a Zod schema and getting a validated, typed object back as structured output removed all our JSON-parsing code. The agent loop (draft → tool → revise) needed no orchestration code of our own, and `BedrockModel` uses the standard AWS credential chain.
- *Needs work:* peer dependencies conflicted with Express 4 and an older SDK version we had installed, and the error didn't say which package needed what; we had to move to Express 5 (friction #7). A short "add Strands to an existing Express app" note would help.
- *Would build again:* yes. It's the cleanest way we've found to add a tool-using agent to a Node server.

**Amazon Devices Builder Tools (MCP server)**
- *Used for:* docs search and read inside our coding agent while building the Vega app: splash screen packaging, app icon requirements and TTFD reporting.
- *Worked well:* the docs search found the splash screen, icon and TTFD guidance quickly and returned readable content, which fixed the "client-rendered docs" problem from friction #4.
- *Needs work:* every tool returns `PROJECT_CONTEXT_REQUIRED` until `set_project_context` is called. That guardrail is reasonable, but it isn't in the npm README quick start, so the first several calls just fail (friction #8).
- *Would build again:* yes, and we'd connect it on day one.

---

## Friction log (eligible for up to a 10% judging bonus)

| # | Task | Steps taken | Expected | Actual | Severity | Workaround | Suggestion |
|---|---|---|---|---|---|---|---|
| 1 | Run a Vega WebView app on the Virtual Device | Installed Vega SDK 0.24 on an Intel Mac; generated `vegaWebview`; read the WebView guide | The system requirements would say which Macs can run WebView apps on VVD | The "M-series only" note is only inside the WebView guide; installed SDK first | High | Built and recorded on an Apple-silicon Mac | Put platform limits in the install requirements, and have `get_vvm.sh` warn on Darwin x86_64 when WebView/VVD is unsupported |
| 2 | Install Vega dependencies on macOS | Ran the documented `brew install binutils coreutils gawk findutils grep jq lz4 gnu-sed watchman` | Bottled installs in minutes | Intel macOS 26 has no bottles; gmp alone compiled for 11 min; watchman would take hours | Medium | Cancelled brew and ran the installer with the system `/usr/bin/jq` (macOS 15+) | Mark which dependencies are required by the installer versus by builds; detect system `jq` |
| 3 | Load the TV app from a local dev server | Pointed WebView at `http://<LAN-IP>:8787` | Local dev over HTTP works in debug builds | HTTP is blocked by default since WebView 4.0.2 | Medium | Cloudflare quick tunnel (HTTPS) | A debug-only allow-list for LAN/loopback HTTP, or document a VVD-to-host loopback address |
| 4 | Read the Vega install docs with a coding agent | `curl` / Jina reader on developer.amazon.com docs | Static HTML with code blocks | The page body is client-rendered; scripts get no commands | Low | Headless browser to extract code blocks (later, the Builder Tools MCP docs tools) | Server-render the docs or publish an `llms.txt` / markdown mirror |
| 5 | Call a model on Bedrock from a new AWS account | `converse` and `invoke-model` in several regions; checked SCPs and IAM; filed a support case | The model answers, or an error that names the cause | "Operation not allowed" for every model and region on Converse/InvokeModel, while the Mantle endpoint worked | High | Moved the Game Director to Bedrock Mantle (Strands `bedrockMantleConfig`) with Converse and offline fallbacks | Name the reason in the error, and point to Mantle when the runtime APIs are unavailable |
| 6 | Force structured tool output via Bedrock | `toolChoice: {tool: {name}}` with a current model | Forced tool call | Newer models reject forced tool choice | Low | `toolChoice: auto` plus instruction, with JSON-text fallback | Note model-specific `toolChoice` support in the Converse docs |
| 7 | Add the Strands Agents SDK to an existing Express server | `npm install @strands-agents/sdk` in a project on Express 4 | Clean install alongside existing dependencies | Peer-dependency conflicts with Express 4 and an older SDK version; the error didn't name the fix | Medium | Upgraded to Express 5 and current package versions | List peer requirements in the README and give a migration note for Express 4 apps |
| 8 | Use the Amazon Devices Builder Tools MCP server | Connected the server per the npm README quick start; called the docs search tool | Tools work after connecting | Every tool returned `PROJECT_CONTEXT_REQUIRED` until `set_project_context` was called | Low | Called `set_project_context` first, then everything worked | Put `set_project_context` in the quick start, and include the next step in the error text |
| 9 | Add TTFD reporting with `@amazon-devices/kepler-performance-api` | Followed the Builder Tools workflow doc: `npm install --legacy-peer-deps` | Package added, everything else unchanged | The lockfile was rewritten and the `build-vega` CLI command disappeared, so `npm run build` broke | Medium | Reinstalled with a plain `npm install`, which kept the CLI working | Drop `--legacy-peer-deps` from the instructions, or explain when it's needed |
| 10 | Ship an icon and splash screen | Generated a project from the Vega template and built it | Template ships placeholder icon and splash assets, or the build fails clearly | The manifest references `assets/image/app_icon.png` and splash conventions, but no assets were generated; the build only warns | Low | Added a 512 px icon and `assets/raw/SplashScreenImages.zip` (1920×1080) | Generate placeholder assets in the template, or make missing assets a clear build error |
| 11 | Put the studio behind CloudFront for a permanent HTTPS URL | CloudFormation stack with a CloudFront distribution in front of EC2 | Distribution created | `AccessDenied`: the account must be verified by AWS Support before it can add CloudFront resources | Medium | Caddy on the instance with an automatic Let's Encrypt certificate for the Elastic IP's sslip.io name | Verify new accounts automatically, or say during sign-up which services need verification |

## Feature requests (optional)
1. **Voice input API for third-party Vega apps** (Fire TV remote mic to app speech-to-text). *Critical* for creative apps for kids: they can't type, and the remote is in their hand.
2. **WebView debug HTTP allow-list** (see friction #3). *Important.*
3. **Intel Mac support for WebView on the Vega Virtual Device, or a cloud VVD.** *Important.*
4. **Placeholder icon and splash assets in every Vega template** (see friction #10). *Nice to have.*

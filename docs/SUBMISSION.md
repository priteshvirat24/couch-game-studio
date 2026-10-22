# Devpost submission pack: Couch Game Studio

> Copy each section into the matching Devpost field. Items marked **TODO** need your input (video link, repo URL, GitHub username).

## Tracks
- **Primary track:** Fire TV (Vega OS)
- **Mini challenges:** AWS Builder; Open Source

## Project name and tagline
**Couch Game Studio**: say it, draw it, play it on the big screen.

## Text description

**The problem.** Kids ask to *make* games, and parents keep asking how. In r/learnprogramming, a 6-year-old asks his uncle to make a game together, and the top reply has 361 upvotes. The same question keeps coming up in r/gamedev, and parents across r/Parenting, r/daddit and r/Mommit ask how to turn screen time from passive into creative. Every existing answer needs reading, typing and a laptop. The biggest screen in the house, the TV, is one kids only ever watch.

**What we built.** Couch Game Studio turns Fire TV into a family game studio.
1. A kid scans the QR code on the TV with any phone (no install) and *says* their game: "My dog Biscuit catches falling tacos but has to dodge broccoli."
2. Optionally, they snap a photo of a crayon drawing or the real dog. It's cut out on the phone and becomes the hero.
3. While the TV shows the kid's own words "being imagined", Claude on Amazon Bedrock designs the game.
4. Seconds later it's playable on the TV with the Fire TV remote. Siblings and parents join as players 2–4 from their phones; the controller layout changes per genre.
5. Anyone can remix by voice: "make it night", "add lava", "give me a boss". Every version is saved in the **Family Arcade** on the TV.

**How it works.**
- **The AI never writes code.** Claude fills in a strict, validated *GameSpec*: genre (catch, run & jump, maze, zap), hero, goodies, hazards, world colors, difficulty and up to four of 12 modifiers (night lighting, lava floor, giant hero, boss fights, wind, reverse controls…).
- One hand-built canvas engine can run any spec. That makes generation fast, kid-safe and impossible to crash, and every game is fun, because the game feel is engineered rather than generated.
- **The Fire TV app is built for the 10-foot UI.** It is a React Native for Vega app (official `vegaWebview` template) hosting the TV experience, with spatial D-pad navigation, big focus states, Back and Play/Pause handling, a 3-2-1-GO countdown, and gold-glow/red-glow visual language that tells little kids "grab this, avoid that" from across the room.
- **Never a dead end.** If no model is reachable, an offline designer reads the sentence (verbs → genre, nouns → sprites via the open emojilib dictionary), so a kid always gets a game.

**What's next.**
- Alexa voice input straight from the Fire TV remote.
- Bee ambient ideas ("you told Grandma about a dragon who loves pancakes: want to play it?").
- Sharing family-made games between households.

## Built with
`vega-os` `react-native-for-vega` `amazon-devices-webview` `fire-tv` `amazon-bedrock` `anthropic-claude` `aws-sdk` `node.js` `express` `websockets` `canvas` `web-audio` `emojilib` `twemoji` `cloudflare-tunnel`

## Repo, video and links
- **GitHub repo:** **TODO.** Either public with the Apache-2.0 license (already in the repo), or private and shared with `testing@devpost.com` and the reviewers `chris-trag`, `knmeiss`, `giolaq`, `anishamalde`, `mosesroth`, `emersonsklar`.
- **Demo video (under 3 min, YouTube/Vimeo, public):** **TODO.**

## Was this built during the hackathon?
Yes. Everything in this repository was built during the submission window (October 2026).

---

## AWS Builder mini challenge
**Services used:** Amazon Bedrock Runtime (Converse API) running Anthropic Claude (`us.anthropic.claude-opus-5-5` inference profile), called from `server/llm.js` with `@aws-sdk/client-bedrock-runtime`.

**How it works:**
- The kid's sentence goes to Bedrock's Converse API with a `make_game` tool whose input schema *is* the GameSpec JSON Schema (`server/spec.js`).
- Claude's tool input is validated and clamped by `normalizeSpec()` and then runs directly on the TV engine.
- Remixes send the current spec plus the instruction, and Claude returns the full updated spec.
- The provider chain backs off for 60 s after an account or permission error and falls through to the Claude API, then the offline designer, so the TV never hangs.

## Open Source mini challenge
- **Repo URL:** **TODO**
- **GitHub username:** **TODO**
- **License:** Apache-2.0
- **What it is:** a new open-source project: a reusable "spec-driven game engine" pattern for TV.
  - A dependency-free canvas engine (`public/engine/engine.js`) with 4 genres, 12 modifiers and 4-player co-op.
  - A strict GameSpec schema with a validator and tests (`server/spec.js`, `server/spec.test.js`).
  - A Vega WebView host app (`vega/`) any web game can reuse to ship on Fire TV.
- **Why it matters:** it shows a safe pattern for generative games for kids (the model fills in data, never code) and a working path for getting web games onto Vega OS.

---

## Product feedback (required)

**Vega SDK / Vega CLI**
- *Used for:* the `vega project generate -t vegaWebview` scaffold, `vega build`, and the Vega Virtual Device.
- *Worked well:* the `vegaWebview` template is excellent. `--uri` pre-fills the WebView source, the manifest already lists the right services (webview renderer, audio, input method), and remote key codes are documented in one clear table. The CLI help is easy to explore.
- *Needs work:*
  - The Vega WebView runs on the Virtual Device only on Apple-silicon Macs. This is stated inside the WebView guide but **not** in the SDK system requirements or the installer, so we installed the whole SDK on an Intel Mac before finding out.
  - On Intel macOS 26 the documented `brew install` dependency line compiles everything from source (no bottles), which takes hours, even though the installer itself only needs `jq`.
- *Onboarding:* about 30 minutes once we knew the constraints. The install docs page is rendered client-side, so `curl` and AI coding agents see an empty page.
- *Would build again:* yes. The WebView path makes Vega a great home for web-based games.

**`@amazon-devices/webview`**
- *Used for:* hosting the TV app, with `allowSystemKeyEvents` for Back and `onMessage` / `postMessage` to exit the app from the web home screen.
- *Worked well:* the D-pad arrives as standard `keydown` events, so web focus engines work unchanged.
- *Needs work:* HTTP is blocked by default since WebView 4.0.2, which also blocks pointing at a LAN dev server. A documented, debug-only "allow local HTTP" switch would save every web developer a tunnel.

**Amazon Bedrock**
- *Used for:* Claude via the Converse API with tool use, to turn a kid's sentence into a validated game spec.
- *Worked well:* tool `inputSchema` maps one-to-one to our JSON Schema, and inference profiles make model choice a single string.
- *Needs work:* a brand-new account under verification returned *different* errors per region: "Operation not allowed" in us-east-1/us-west-2/eu-north-1, but "Your account is currently being verified" in eu-central-1. The clear message should appear everywhere. Also, newer Claude models reject forced `toolChoice`, which isn't obvious from the Converse docs.
- *Would build again:* yes.

---

## Friction log (eligible for up to a 10% judging bonus)

| # | Task | Steps taken | Expected | Actual | Severity | Workaround | Suggestion |
|---|---|---|---|---|---|---|---|
| 1 | Run a Vega WebView app on the Virtual Device | Installed Vega SDK 0.24 on an Intel Mac; generated `vegaWebview`; read the WebView guide | The system requirements would say which Macs can run WebView apps on VVD | The "M-series only" note is only inside the WebView guide; installed SDK first | High | Built and recorded on an Apple-silicon Mac | Put platform limits in the install requirements, and have `get_vvm.sh` warn on Darwin x86_64 when WebView/VVD is unsupported |
| 2 | Install Vega dependencies on macOS | Ran the documented `brew install binutils coreutils gawk findutils grep jq lz4 gnu-sed watchman` | Bottled installs in minutes | Intel macOS 26 has no bottles; gmp alone compiled for 11 min; watchman would take hours | Medium | Cancelled brew and ran the installer with the system `/usr/bin/jq` (macOS 15+) | Mark which dependencies are required by the installer versus by builds; detect system `jq` |
| 3 | Load the TV app from a local dev server | Pointed WebView at `http://<LAN-IP>:8787` | Local dev over HTTP works in debug builds | HTTP is blocked by default since WebView 4.0.2 | Medium | Cloudflare quick tunnel (HTTPS) | A debug-only allow-list for LAN/loopback HTTP, or document a VVD-to-host loopback address |
| 4 | Read the Vega install docs with an AI coding agent | `curl` / Jina reader on developer.amazon.com docs | Static HTML with code blocks | The page body is client-rendered; scripts get no commands | Low | Headless browser to extract code blocks | Server-render the docs or publish an `llms.txt` / markdown mirror |
| 5 | Call Claude on Bedrock from a new AWS account | `converse` in several regions | One clear "account verification pending" error | "Operation not allowed" in most regions, the real reason only in eu-central-1 | High | Built a provider chain (Bedrock → Claude API → offline designer) | Return the verification message consistently in every region |
| 6 | Force structured tool output on Claude via Bedrock | `toolChoice: {tool: {name}}` with a current Claude model | Forced tool call | Newer models reject forced tool choice | Low | `toolChoice: auto` plus instruction, with JSON-text fallback | Note model-specific `toolChoice` support in the Converse docs |

## Feature requests (optional)
1. **Voice input API for third-party Vega apps** (Fire TV remote mic to app speech-to-text). *Critical* for kids' creative apps: kids can't type, and the remote is in their hand.
2. **WebView debug HTTP allow-list** (see friction #3). *Important.*
3. **Intel Mac support for WebView on the Vega Virtual Device, or a cloud VVD.** *Important.*

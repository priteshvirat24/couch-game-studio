<div align="center">

# 🛋️🎮 Couch Game Studio

### Say it. Draw it. Play it on the big screen.

**Kids invent video games out loud, and Fire TV builds them in seconds.**

![Fire TV](https://img.shields.io/badge/Fire%20TV-Vega%20OS-ff9900?style=for-the-badge&logo=amazon&logoColor=white)
![Amazon Bedrock](https://img.shields.io/badge/Amazon%20Bedrock-Generative%20AI-232f3e?style=for-the-badge&logo=amazonaws&logoColor=white)
![React Native for Vega](https://img.shields.io/badge/React%20Native-for%20Vega-61dafb?style=for-the-badge&logo=react&logoColor=black)
![License](https://img.shields.io/badge/license-Apache--2.0-06d6a0?style=for-the-badge)

<img src="docs/media/banner.png" alt="Couch Game Studio: a kid describes a game on a phone and plays it on Fire TV" width="100%">

</div>

A kid picks up any phone and says *"my dog Biscuit catches falling tacos but has to dodge broccoli"*, or snaps a photo of a crayon drawing. A few seconds later, that game is playable on the living-room TV with the Fire TV remote. Everyone else on the couch can join as extra players from their own phones, and anyone can remix the game by voice: *"make it night"*, *"add lava"*, *"give me a boss"*.

Built for the **Build, Ship, Shape: Amazon Developer Hackathon**. Fire TV track, plus the AWS Builder and Open Source mini challenges.

<table>
<tr>
<td width="50%"><img src="docs/media/arcade.png" alt="Family Arcade on Fire TV"><br><sub><b>Family Arcade</b>: every game the family has made, browsable with the D-pad</sub></td>
<td width="50%"><img src="docs/media/intro.png" alt="Game intro card"><br><sub><b>Intro card</b>: who made it, what to grab, what to dodge</sub></td>
</tr>
<tr>
<td><img src="docs/media/play-runner.png" alt="Runner game"><br><sub><b>Run & Jump</b>: "a dinosaur running through a volcano…"</sub></td>
<td><img src="docs/media/play-maze.png" alt="Maze game in night mode"><br><sub><b>Maze + night mode</b>: "a bunny in a spooky castle…"</sub></td>
</tr>
<tr>
<td><img src="docs/media/play-shooter.png" alt="Co-op shooter with boss"><br><sub><b>Zap + boss + 2-player co-op</b>: "a rocket zapping aliens…"</sub></td>
<td><img src="docs/media/win.png" alt="Win screen"><br><sub><b>Win screen</b>: then remix it from your phone</sub></td>
</tr>
</table>

---

## Why

Parents keep asking the internet the same two questions:

- **"How do I help my kid make a game?"** A 6-year-old asks to make a game with their uncle, and the top reply in r/learnprogramming has 361 upvotes. The same thread keeps showing up in r/gamedev and r/learnprogramming through 2024 and 2025. Every answer points to tools that need reading, typing and a laptop.
- **"How do I make screen time creative instead of passive?"** These threads come up constantly in r/Parenting, r/daddit, r/Mommit and r/ParentingADHD (2025–2026).

The TV is the biggest screen in the house, and it's the one kids only ever *watch*. Couch Game Studio turns it into something they *make* with, and nobody has to type a word.

## What it does

| | |
|---|---|
| 🎤 **Describe** | Say or type the game on any phone. No app install: scan the QR code on the TV. |
| 📸 **Draw** | Snap a drawing or a photo of the family dog. The background is removed on the phone and it becomes the hero sprite. |
| ✨ **Generate** | Generative AI on **Amazon Bedrock** designs the game as a validated *GameSpec*: genre, hero, goodies, hazards, world colors, difficulty and modifiers. |
| 📺 **Play** | One engine runs every spec: **Catch**, **Run & Jump**, **Maze** and **Zap**, with modifiers like night mode, lava floor, giant hero, boss fights, wind, rainbow trail and reverse controls. It's fully playable with the Fire TV D-pad. |
| 👨‍👩‍👧 **Co-op** | Up to 4 players. The TV remote is player 1, and phones become controllers whose layout changes with each genre. |
| 🔁 **Remix** | *"Make it faster and put it at night."* Every remix is saved as a new version in the **Family Arcade**. |

### Designed for the 10-foot screen and small hands
- Spatial D-pad navigation, large focus states, and Back / Play-Pause support (Vega key codes included).
- A **3-2-1-GO** countdown before every game, double-jump, and maze loops with no frustrating dead ends.
- Gold glow means *grab it*; red glow means *avoid it*. Kids can tell at a glance from the couch.
- An "imagining…" screen turns waiting into anticipation: the kid's own words appear on the TV while the game is built.
- Kid-safe by design: **the AI never writes code**. It can only fill in a strict schema that the engine already knows how to run, so a generated game can't crash, and inappropriate requests become gentle, silly alternatives.

## Architecture

```
 Phone (any browser)          Studio server (Node)                 Fire TV (Vega OS)
 ───────────────────          ─────────────────────                ──────────────────
 voice / text / photo ──────► POST /api/games ──► Amazon Bedrock   React Native for Vega app
 remix requests               (LLM, tool use)     ─► GameSpec      └─ @amazon-devices/webview
 controller buttons ─ ws ───► room relay ── ws ───────────────────► TV app (D-pad UI + engine)
                              Family Arcade (JSON store)            canvas engine, 60 fps
```

- `server/llm.js` is the AI layer, with a provider chain: **Amazon Bedrock** (Converse API with a `make_game` tool), then the **Anthropic API** (official SDK with structured JSON output), then an **offline designer**. Every path ends in `normalizeSpec()`.
- `server/spec.js` is the GameSpec schema and validator, plus the offline designer. The offline designer is keyword-based and uses the open `emojilib` dictionary, so "flies", "logs" and "gears" become sprites. The demo keeps working with no network or AI credentials.
- `public/engine/engine.js` is a dependency-free canvas engine. It has 4 genres, 12 modifiers, multiplayer, particles, a night-mode lighting pass, and WebAudio sound effects.
- `public/tv/` is the 10-foot TV app. `public/phone/` is the phone companion.
- `vega/` is the Vega OS app, generated from the official `vegaWebview` template. It adds focus, Back-to-exit and remote key handling.

## Run it

**Requirements:** Node 20+.

```bash
npm install
npm start                      # http://localhost:8787/tv/
```

Open `http://localhost:8787/tv/` in a browser (arrow keys and Enter act as the remote) and scan the QR code with a phone on the same Wi-Fi.

**AI providers** (optional; without them the offline designer is used):

```bash
# Amazon Bedrock (pick any tool-use model with BEDROCK_MODEL_ID)
export AWS_REGION=us-east-1          # plus your usual AWS credentials
# or the Anthropic API
export ANTHROPIC_API_KEY=...
# force a provider: LLM_PROVIDER=bedrock | anthropic | offline
```

**A public HTTPS link** lets phones on any network join and enables voice input:

```bash
cloudflared tunnel --url http://localhost:8787
```

### On Fire TV (Vega OS)

The Vega WebView currently runs on the Vega Virtual Device only on Apple-silicon Macs (per Amazon's docs).

```bash
# 1. Install the Vega tools: https://developer.amazon.com/docs/vega/latest/install-vega-sdk.html
# 2. Point the app at your studio (HTTPS; WebView blocks plain HTTP by default)
#    edit vega/src/config.ts  ->  STUDIO_URL = 'https://<your-tunnel>.trycloudflare.com'
cd vega
npm install
npm run build                  # react-native build-vega: armv7, aarch64 and x86_64 .vpkg files
vega virtual-device start
vega run-app build/aarch64-release/couchgamestudio_aarch64.vpkg    # Apple-silicon VVD
# real Fire TV stick in developer mode: build/armv7-release/couchgamestudio_armv7.vpkg
```

### Tests

```bash
npm test     # GameSpec validation, the offline designer, remixes, seed games
```

## Built with

- **Fire TV / Vega OS:** React Native for Vega, `@amazon-devices/webview`, the Vega CLI and Vega Virtual Device.
- **AWS:** Amazon Bedrock (Converse API, tool use).
- **Anthropic API** via `@anthropic-ai/sdk`, with structured outputs as the fallback provider.
- Node.js, Express, `ws`, `qrcode`.
- [Twemoji](https://github.com/jdecked/twemoji) graphics (CC-BY 4.0). [emojilib](https://github.com/muan/emojilib) keywords (MIT).
- Cloudflare quick tunnels for HTTPS phone links.

## License

Apache-2.0. See [LICENSE](LICENSE).

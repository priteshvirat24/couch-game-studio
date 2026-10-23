# Run Couch Game Studio on the Fire TV Virtual Device

This guide is for running the Fire TV (Vega OS) app on an **Apple-silicon Mac** (M1 or newer). The Vega Virtual Device only runs WebView apps on Apple silicon, so this step can't be done on an Intel Mac.

**Goal:** the app launches on the Vega Virtual Device, plays a game with the remote (keyboard), takes a game made on a phone, and you record the screen.

Time needed: about 45–60 minutes the first time (most of it is the SDK download).

---

## 1. Install the tools (once)

```bash
# Homebrew packages the Vega SDK needs (fast on Apple silicon)
brew install node@22 binutils coreutils gawk findutils grep jq lz4 gnu-sed watchman cloudflared
```

Check Node is 22 or newer with `node -v`. If it isn't, run `brew link --overwrite node@22`.

Install the Vega SDK ([official guide](https://developer.amazon.com/docs/vega/latest/install-vega-sdk.html)):

```bash
curl -fsSL https://sdk-installer.vega.labcollab.net/get_vvm.sh | bash && source ~/vega/env
vega sdk install
vega --version          # we built with SDK 0.24.12112 and CLI 1.4.7; newer is fine
```

## 2. Get the code

Clone into your home folder. The Vega build tool fails if any folder in the path has a space in its name (for example `~/Bridge AI/…`).

```bash
cd ~
git clone https://github.com/priteshvirat24/couch-game-studio.git
cd ~/couch-game-studio
```

## 3. Choose which studio server the TV app talks to

The Fire TV app is a thin shell: it opens the studio's TV page over **HTTPS** (Vega WebView blocks plain HTTP). Pick one option.

**Option A: use the main studio (recommended).** It runs on AWS with the AI game designer (Amazon Bedrock) switched on, at a permanent address: **https://16-171-214-22.sslip.io**. The app is already set to it, so skip step 4's edit and go straight to `npm install`. Check that https://16-171-214-22.sslip.io/tv/ loads in a browser first.

**Option B: run your own studio on this Mac.** Do this if you're working on your own schedule. Games are made by the built-in offline designer (no AI, no AWS account needed). Everything else works the same.

```bash
npm install
npm start                                   # leave this running (terminal 1)
cloudflared tunnel --url http://localhost:8787   # terminal 2: prints https://….trycloudflare.com
```

Open `https://….trycloudflare.com/tv/` in a browser first to check that the arcade loads.

> Never copy anyone's AWS keys to this Mac. Option B doesn't need them.

## 4. Point the app at the studio and build it

```bash
cd vega
# Option A: nothing to edit, src/config.ts already points at https://16-171-214-22.sslip.io
# Option B only: point the app at your tunnel
STUDIO=https://PASTE-THE-ADDRESS.trycloudflare.com      # no trailing slash
sed -i '' "s#^export const STUDIO_URL = .*#export const STUDIO_URL = '$STUDIO';#" src/config.ts
cat src/config.ts | tail -1                               # check it

npm install
npm test                                                  # 4 tests should pass
npm run build                                             # about 1–2 min
ls build/aarch64-release/                                 # couchgamestudio_aarch64.vpkg
```

> Option B only: quick-tunnel addresses change every time `cloudflared` restarts. If the address changes, repeat step 4 (edit, then `npm run build`) and step 5. The Option A address never changes.

## 5. Start the Virtual Device and run the app

Run these in the macOS **Terminal** app, not in an editor's built-in terminal or an AI agent's shell. The emulator needs full access to the Mac's virtualization and windowing, and sandboxed shells can stall it.

Before starting, remove the things Amazon lists as causes of Virtual Device crashes ([known issues](https://developer.amazon.com/docs/vega/0.24/kvd-issues.html)):

- Unplug USB hubs and docking stations.
- If you use an audio interface (for example a Focusrite), don't use it for both input and output. Simplest: in System Settings > Sound, set both Output and Input to the Mac's built-in devices.
- Quit heavy apps (browsers with many tabs, Docker, screen recorders) so Activity Monitor > Memory shows at least 2 GB available.

```bash
vega virtual-device start                 # first start can take a few minutes
vega virtual-device status                # wait until it's running
vega run-app build/aarch64-release/couchgamestudio_aarch64.vpkg com.couchgamestudio.tv.main
```

> **Apple M5 Mac?** The Virtual Device freezes and crashes about 45 seconds into boot (`status` goes back to `"running":false`, and `run-app` says "device offline" or "No connected Vega devices"). Start it on one CPU core instead and leave this running in its own terminal:
>
> ```bash
> bash scripts/start-virtual-device-one-core.sh
> ```
>
> In a second terminal, wait until `vega device list` shows `VirtualDevice` (about a minute), then run the `vega run-app …` line above.

**Remote controls on the Virtual Device** ([Vega docs](https://developer.amazon.com/docs/vega/0.23/enable-keyboard.html)):

| Remote | Keyboard |
|---|---|
| Up / Down / Left / Right | Arrow keys |
| Select (OK) | Enter |
| Back | Esc |
| Home | F1 |
| Play/Pause | F4 |

### If the Virtual Device keeps crashing: use a real Fire TV Stick

Amazon tests the Virtual Device's WebView support on M1–M4 Macs. On an **M5 Mac with macOS 26**, it freezes and crashes within a minute of every boot, even after the steps above and with software graphics; starting it on one core with `scripts/start-virtual-device-one-core.sh` (above) fixed this on an M5 MacBook Air. If it still crashes, use another M1–M4 Mac or a **Fire TV Stick 4K Select** (a Vega OS device). The same build already contains the package for the stick (`armv7`).

1. Plug the stick into a TV over HDMI, and into the Mac with a **USB data cable** (not a charge-only cable). Use the remote that came with the stick.
2. On the stick: **Settings > My Fire TV > About**, press the center button on the first item seven times, then open **Developer Options**.
3. On the Mac ([Enable Developer Mode](https://developer.amazon.com/docs/vega/0.23/developer-mode)):

   ```bash
   vega devmode login
   vega devmode enable-device --code <6-digit code shown on the TV>
   ```

   The stick reboots.
4. Install and launch ([Run your app](https://developer.amazon.com/docs/vega/0.23/run-apps)):

   ```bash
   vega device list
   vega device install-app --packagePath build/armv7-release/couchgamestudio_armv7.vpkg
   vega device launch-app --appName com.couchgamestudio.tv.main
   ```

A real TV makes a better demo video anyway: film the TV and the phone together.

## 6. Test checklist

Tick each one. If something fails, note what you pressed and what you saw.

- [ ] The splash screen shows, then the **Family Arcade** appears with game cards and a QR code.
- [ ] The app icon appears in the Virtual Device's app list.
- [ ] Arrow keys move the yellow focus ring; **Enter** on a game opens its intro card.
- [ ] **Enter** on *Play* starts the game; arrows move the hero; Enter jumps or zaps.
- [ ] **Esc** during a game opens the pause menu; *Back to the arcade* works.
- [ ] Finish a game (win or lose): the end screen shows the score and podium.
- [ ] **Scan the QR code with a real phone** → enter a name → say or type an idea, e.g. *"my cat Mochi catches falling fish but dodges water drops"* → *Make my game!* The TV shows "imagining", then the new game's intro.
- [ ] Play the new game using the **phone as the controller** (Play tab).
- [ ] On the phone, tap **Remix** and say *"make it night"*. A new version appears.
- [ ] **Esc** on the arcade screen closes the app.
- [ ] Turn off the Wi-Fi briefly. The TV shows "Reconnecting…" and recovers.

## 7. Record and send back

1. Press **Cmd + Shift + 5**, then choose **Record Selected Portion** around the Virtual Device window and click **Record**. Record:
   - **Clip 1 (about 2 min):** app launch → arcade → open a starter game → play to the end screen.
   - **Clip 2 (about 2 min):** making a game from the phone, then playing it and remixing it. If you can, film the phone at the same time with a second phone.
2. Take a few screenshots (**Cmd + Shift + 4**, then **Space**, then click the window): arcade, intro card, gameplay, end screen.
3. Send back:
   - the recordings and screenshots
   - the ticked checklist
   - any error text from the terminal (copy it in full)
   - the output of `vega --version`

## Troubleshooting

| Problem | Fix |
|---|---|
| Black or blank screen after the splash | Open `STUDIO_URL/tv/` in a desktop browser. If it doesn't load, the server or tunnel is down, or the address in `src/config.ts` is old (redo step 4). With Option A, tell the project owner. |
| "The game studio is napping" screen | The app started but can't reach the studio. Same fix as above, then press Enter on *Try again*. |
| `npm run build` says `build-vega` is unknown | Run `rm -rf node_modules && npm install` in `vega/` (a plain install, without `--legacy-peer-deps`). |
| `vega` command not found | Run `source ~/vega/env` (or open a new terminal). |
| The phone can't open the QR link | The phone needs internet access; the studio address works on any network. |
| The Virtual Device won't start | Run `vega virtual-device stop`, then start it again. Check that this Mac is Apple silicon (`uname -m` prints `arm64`). |
| The build fails with path errors | A folder in the path has a space in its name. Move the clone to `~/couch-game-studio` and build again. |
| "Virtual device ready", then "device offline" on install, then a crash within a minute | Go through the checklist at the start of step 5 and start the device from the Terminal app. On an M5 Mac (the log `~/vega/sdk/vega-sdk/main/<sdk>/vvd/instances/<id>/virtual_device.err` shows `detected a hanging thread 'QEMU2 CPU0 thread'`), run `bash scripts/start-virtual-device-one-core.sh` from `vega/` instead. If it still crashes, use an M1–M4 Mac or a Fire TV Stick (see above). |

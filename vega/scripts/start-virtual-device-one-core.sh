#!/usr/bin/env bash
# Start the Vega Virtual Device on a single CPU core.
#
# On Apple M5 Macs (seen on macOS 26.6, SDK 0.24.12112) the Virtual Device's
# CPU threads freeze about 45 s into boot ("detected a hanging thread 'QEMU2
# CPU0 thread'") and it crashes. With one core it boots fine. The vega CLI has
# no core-count option and its 300 s boot wait is too short on one core, so
# this launches the bundled emulator directly with the same arguments the CLI
# uses, plus -cores 1, -gpu host (without it the guest display never comes up
# and boot stalls on a black screen) and -no-snapshot (always cold boot).
# Leave it running; use `vega run-app` from another tab.
set -euo pipefail

source ~/vega/env
SDK_VERSION=$(vega --version | awk '/Active SDK Version/ {print $NF}')
VVD=~/vega/sdk/vega-sdk/main/$SDK_VERSION/vvd
AGENT=$VVD/images/tv/vmtools/agent

# The instance is created by the first `vega virtual-device start`; reuse the newest one.
INSTANCE=$(ls -td "$VVD"/instances/*/ 2>/dev/null | head -1)
INSTANCE=${INSTANCE%/}
if [[ -z "$INSTANCE" ]]; then
  echo "No Virtual Device instance yet. Run 'vega virtual-device start' once, then 'vega virtual-device stop', and rerun this." >&2
  exit 1
fi

vega virtual-device stop >/dev/null 2>&1 || true
echo "Starting Virtual Device on one core ($INSTANCE). It is ready in about a minute: check with 'vega device list'."

exec "$AGENT/emulator" -avd-arch arm64 -skindir "$AGENT/skins" -skin tv-remote \
  -ports 5554,5555 -dns-server auto \
  -sysdir "$INSTANCE" -datadir "$INSTANCE" -data "$INSTANCE/userdata.qcow2" \
  -cores 1 -gpu host -no-snapshot \
  -keyboard-mapping KEY_ESC:KEY_BACK,KEY_F1:KEY_HOMEPAGE,KEY_F2:KEY_MENU,KEY_F3:KEY_REWIND,KEY_F4:KEY_PLAYPAUSE,KEY_F5:KEY_FASTFORWARD \
  -qemu -qmp unix:/tmp/qmp-socket-5554.sock,server,nowait

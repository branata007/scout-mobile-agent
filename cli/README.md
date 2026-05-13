# Scout CLI

`scout` records happy-path flows against a local Android emulator and uploads them to the Scout backend (Plan 1).

## Prerequisites

- Node.js 22+
- Android SDK platform-tools (`adb` in PATH)
- A running Android emulator with the app under test installed
- The Scout backend running and reachable

## Install (from this repo)

```bash
cd cli && npm install && npm run build
npm link  # exposes `scout` on PATH
```

## First-time setup

```bash
export SCOUT_API_KEY=<your-key>
scout init --name "My App" --app-package com.example.app
# writes scout.toml in the current directory
```

## Recording a flow

```bash
scout record checkout
# Connects to first available emulator.
# Pulls the APK from the emulator.
# Launches the app.
# Interactive loop:
#   - Tap on emulator → press SPACE to capture state (default action: tap)
#   - Press a letter before SPACE for action type: t/i/b/h/s/w
#   - Press q to finish.
```

The bundle is written to `.scout/recordings/<flow>/<timestamp>/`.

## Uploading

```bash
scout upload
# Sends the most recent bundle (apk + trace.json) to the backend.
# Writes the returned run id to <bundle>/run-id.txt.
```

## Status

```bash
scout status
# Shows project, last bundle, last run id.
```

## Recovery

```bash
scout done
# Checks whether the most recent recording was finalized.
```

## Project layout

- `src/adb/` — adb wrapper + UI tree / logcat parsers
- `src/capture/` — CaptureSession + Recorder + bundle writer
- `src/upload/` — BackendClient
- `src/commands/` — init / record / done / upload / status
- `src/config/` — scout.toml loader

See `docs/smoke-test.md` for the manual end-to-end test.

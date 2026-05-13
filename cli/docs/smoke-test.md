# CLI smoke test

End-to-end manual verification against a real backend + real Android emulator.

## Prerequisites

1. Backend running (`cd ../backend && npm run dev`)
2. Android emulator running with a sample app installed (any app — for the smoke test we use `com.android.settings`)
3. `adb devices` shows the emulator

## 1. Initialize

```bash
mkdir /tmp/scout-smoke && cd /tmp/scout-smoke
export SCOUT_API_KEY=<your-key>
scout init --name smoke-app --app-package com.android.settings
cat scout.toml
```

Should show the project id from the backend and the package.

## 2. Record

```bash
scout record smoke
```

Follow the prompts:
- Press SPACE once (captures initial settings screen)
- Tap a Settings row on the emulator
- Press SPACE (captures the result)
- Press "b" then SPACE to record a back-press (CLI also issues the back via adb)
- Press SPACE one more time (captures the result of going back)
- Press q

Verify:
- `ls .scout/recordings/smoke/` shows one directory
- That directory contains `trace.json`, `apk.apk`, and `screens/0.png` through `screens/3.png`
- `screens/0.png` opens as a valid PNG

## 3. Upload

```bash
scout upload --personas happy-rusher,first-timer
```

Should print `scout: uploaded ...` and `scout: run id <uuid>`.

Verify on the backend:
```bash
curl -s http://localhost:3000/runs/<run-id> -H "x-scout-api-key: $SCOUT_API_KEY" | jq .
# Should show run.status: "queued" and 2 sessions
```

## 4. Status

```bash
scout status
# Shows project, last bundle, last run id matching what was just uploaded
```

## 5. Cleanup

```bash
rm -rf /tmp/scout-smoke
```

If all 5 steps succeed, Plan 2 is COMPLETE.

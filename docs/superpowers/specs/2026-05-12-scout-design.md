# Scout — Design

**Date:** 2026-05-12
**Status:** Design — pending implementation plan
**Working name:** Scout

## Summary

Scout is an agentic mobile-dev tool that turns a developer's tap-through of a happy path into a parallel, autonomous expedition across the app. After the human demos one flow, a swarm of LLM-driven personas takes over on cloud emulators, builds a persistent state map of every screen they reach, scores quality across four axes (performance, accessibility, UX, polish), and produces a queryable, replayable artifact the team can revisit and extend forever.

The product is a **standalone CLI + hosted web dashboard.** First platform is Android; the architecture is designed for iOS as a second driver behind the same brain.

## Goals

- The developer does one happy path on a local emulator; the rest is autonomous.
- The state map is persistent, queryable, and re-explorable on demand — not per-session ephemera.
- Five personas (and any user-defined ones) explore in true parallel, each surfacing a different class of issue.
- Quality findings are first-class entities with lifecycle (open / fixed / wontfix / duplicate), not blobs.
- The whole pipeline is platform-aware but platform-pluggable — the iOS driver is a future swap, not a fork.

## Non-Goals (v1)

- No real-device support. Cloud emulators only.
- No CI integration. (`scout` runs from a dev's terminal; GitHub Action is later.)
- No multi-tenancy / teams. Single-user accounts.
- No auto-PR generation. Findings are reported, not patched. (That's the future "Defect Hunter" mission.)
- No iOS in v1. Android only; iOS is a phase-5 driver swap.

## Architecture

Two halves.

**Local (developer's machine):**
- The developer
- A local Android emulator running their real APK
- The `scout` CLI, which attaches a capture daemon to the emulator and packages traces for upload

**Cloud (Scout backend):**
- Orchestrator API — single ingress for new runs and re-exploration requests
- Agent Brain (LLM-orchestrated): four roles — Director, Personas (N parallel), Critic, Cartographer
- Cloud emulator farm — Genymotion Cloud API in v1, replaceable behind an interface
- Postgres — state map, scorecards, findings, persona reports, runs, sessions
- Web dashboard — map view, scorecards, findings list, persona reports, "re-explore from here" controls

**Bridge:** the CLI uploads `{trace, APK, intent_annotations}` to the Orchestrator. From that moment, the developer's machine is irrelevant — exploration runs autonomously in the cloud.

**Re-exploration loop:** dashboard click (or `scout re-explore <state-id>`) → Orchestrator pulls the target state from the map → Director plans → personas explore from there → Cartographer merges results.

## Components

### Local

**1. `scout` CLI** — single entrypoint for the human.
- Commands: `record <flow>`, `done`, `upload`, `explore`, `status`, `re-explore <state-id> --persona=<p>`.
- Holds project config (`scout.toml`: project ID, default personas, emulator preferences, default budget).
- Boundary: never decides exploration strategy; just packages traces and talks to the Orchestrator.

**2. Local capture daemon** — taps the running emulator at every interesting moment.
- Streams: tap/swipe events, screenshots, UI accessibility tree, logcat, network calls, performance trace (Perfetto).
- Buffers locally; flushes on `done`.
- Optional intent annotations (typed inline, or voice-to-text in power mode) attached to the active tap.
- Boundary: no LLM here. It's a recorder, not a thinker.

### Cloud

**3. Orchestrator API** — single ingress, single source of truth for runs.
- Accepts: trace bundles + APK from CLI; re-exploration requests from dashboard.
- Schedules: persona fan-out, emulator leases, retries.
- Boundary: doesn't drive emulators or call the LLM directly — dispatches work to the Brain and the Emulator Pool.

**4. Director (Agent Brain role)** — the planner.
- Reads the current map slice + persona profile + recent observations.
- Decides "what should this persona try next" (tap target, alternate flow, when to give up).
- One LLM call per decision step, cached on `(state_fingerprint, persona_id)`.
- Boundary: doesn't score quality; doesn't write to the map directly. Emits actions.

**5. Personas (N parallel Agent Brain roles)** — the actors.
- Each persona = YAML profile (goal, success_criteria, traits) + system prompt.
- Defaults: `happy-rusher`, `low-vision`, `first-timer`, `slow-3g`, `chaos-tapper`. Users add more via YAML.
- Each runs its own emulator session, asks Director for the next action, executes via Driver, reports observations.
- Boundary: persona doesn't dedup states or score quality. It acts and observes.

**6. Critic (Agent Brain role)** — the scorer.
- Runs async after a session ends. Reads the session's observations + screenshots + perf trace.
- Hybrid: deterministic heuristics + LLM-as-judge for subjective dimensions.
- Output: a `scorecard` row + zero-or-more `finding` rows.
- Boundary: doesn't block exploration; runs async per session, not per state.

**7. Cartographer (Agent Brain role)** — the librarian.
- Receives observations from personas, dedups against existing states (perceptual hash + UI tree fingerprint).
- Merges into the map: creates state nodes, adds edges, links scorecards and persona reports.
- Boundary: doesn't decide what to explore next.

**8. Emulator pool driver** — abstraction over emulator infra.
- Interface: `lease(profile)`, `installAPK(emu, apk)`, `release(emu)`.
- v1 backend: Genymotion Cloud API. v2 swap: K8s-managed Android containers — no code change above this layer.

**9. Web dashboard** — what the human sees.
- Views: map (graph), scorecards (per state, per session), findings list, persona reports, run history.
- Actions: "re-explore from this state," "rerun with these personas," "share map snapshot."
- Server-rendered + WebSocket for live updates while exploration runs.

## Data Flow (End-to-End)

```
[1] scout record checkout              (local)
        ↓ daemon attaches to emulator
[2] dev taps through, optionally narrates intent
        ↓
[3] scout done
        ↓ bundle: trace + APK + intent_annotations
[4] CLI → POST /runs                   (cloud)
        ↓ Orchestrator creates run, persists trace
[5] For each persona (parallel):
        ↓ lease emulator from pool
        ↓ install APK
        ↓ replay happy-path trace to "starting state"
        ↓ enter exploration loop:
              persona observes current state
              persona asks Director for next action
              Director returns action (LLM call, cached on state fingerprint)
              Driver executes via Maestro + adb
              persona reports observation → Cartographer
              repeat until budget exhausted, stuck, or goal hit
        ↓ release emulator
[6] Critic scores the session (async)
[7] Dashboard streams updates live via WebSocket
```

**Key choices:**
- The happy path is **replayed** on each persona's fresh emulator, not just used as a pointer. Guarantees a clean starting state.
- Director is the **only** role that calls the LLM per step. Cached on `(state_fingerprint, persona_id)`.
- Critic runs **async after** the session, not per state.

## State Map Data Model

Postgres-backed. Six tables.

### `projects`
`id · name · default_personas · created_at`

### `runs`
`id · project_id · apk_url · trace_url · intent · personas[] · mode · status · created_at`
- `mode: 'exploration' | 'verification'`. Default `'exploration'`.

### `sessions`
`id · run_id · persona_id · started_state_id · ended_state_id · budget_used · status`
- `started_state_id`: the state at which persona exploration begins. For an initial run, this is the state reached at the end of the happy-path replay. For a re-exploration, this is the user-selected target state X.

### `candidate_similar_pairs`
`id · state_a_id · state_b_id · phash_match · tree_match · created_at · resolved_at · resolution ('merged' | 'split-confirmed' | null)`
- Cartographer writes a row here when exactly one of (`perceptual_hash`, `ui_tree_fingerprint`) matches an existing state. Both states are kept as separate nodes (conservative); the pair is queued for human review in the dashboard.

### `states` (nodes)
`id · project_id · perceptual_hash · ui_tree_fingerprint · inferred_title · sample_screenshot_url · sample_ui_tree (jsonb) · first_seen_at · last_seen_at · visit_count`
- States always store one sample screenshot — the map must always be renderable.

### `edges` (traversals)
`id · from_state_id · to_state_id · action (jsonb) · session_id · duration_ms · network_calls (jsonb) · before_screenshot_url? · after_screenshot_url? · created_at`
- `before_screenshot_url` / `after_screenshot_url` are populated **only** when the parent `run.mode = 'verification'`. Null in exploration mode.
- Rationale: exploration runs may traverse hundreds of edges; storing screenshots per edge is wasteful. Verification runs care about visual diffs.

### `scorecards` (slim — summary numbers only)
`id · scope ('state' | 'session') · subject_id · perf · a11y · ux · polish · summary · session_id · created_at`

### `findings` (first-class)
`id · project_id · scope ('state' | 'session' | 'edge') · subject_id · type ('perf' | 'a11y' | 'ux' | 'polish' | 'bug') · severity ('low' | 'med' | 'high' | 'critical') · title · description · suggested_fix · persona_id · session_id · status ('open' | 'fixed' | 'wontfix' | 'duplicate') · created_at · updated_at`
- Heuristics produce findings with a `rule_id` in metadata; LLM-judge writes prose `suggested_fix`. Same table, same lifecycle.

### `persona_reports`
`id · session_id · persona_id · summary · pain_points[] · highlights[]`
- `pain_points[]` references finding ids.

### State Equivalence

```
isSameState(a, b):
  phashMatch = hammingDistance(a.perceptual_hash, b.perceptual_hash) ≤ 6
  treeMatch  = a.ui_tree_fingerprint === b.ui_tree_fingerprint
  return phashMatch AND treeMatch
```

If only one matches → both states are kept as separate nodes (conservative), and a row is written to `candidate_similar_pairs` for human review on the dashboard. Conservative on purpose — false splits are recoverable; false merges hide bugs. Threshold of 6 bits Hamming distance is tunable per project.

### Re-Exploration

1. User clicks state X in dashboard (or runs `scout re-explore <state-id>`).
2. Orchestrator creates a new `run` pointing at state X.
3. For each persona: lease emulator → install APK → compute shortest path from app launch to X through existing edges → replay it → enter persona exploration loop from X.
4. New observations merge into the existing map via Cartographer.

## Personas + Quality Scoring

### Default Persona Roster (v1)

| Persona | Goal | Surfaces |
|---|---|---|
| `happy-rusher` | Complete primary task ASAP | Dead-end CTAs, optional-field traps, slow primary flows |
| `low-vision` | Complete with TalkBack + large text + high contrast | Missing content-desc, focus traps, contrast violations |
| `first-timer` | Explore app with no prior knowledge | Confusing copy, unclear empty states, hidden affordances |
| `slow-3g` | Complete under 200kbps + 400ms latency | Missing loading states, layout shifts, timeouts |
| `chaos-tapper` | Tap fast, double-tap, background, rotate, kill-and-restore | Race conditions, lost state, lifecycle crashes |

### Custom Persona YAML Schema

```yaml
# scout/personas/marketer.yaml
name: marketer
goal: "verify onboarding hits the paywall within 60 seconds"
success_criteria:
  - reaches_state_with_label: "Subscribe"
  - elapsed_seconds_lt: 60
traits:
  patience: low
  tap_style: deliberate
  network_profile: wifi
  a11y_mode: off
  read_labels: true
system_prompt: |
  You are evaluating an onboarding flow for time-to-paywall.
  Skim, don't read. Tap obvious CTAs. Note friction in 1-line phrases.
```

Persona = data + LLM prompt. Not a code plugin. No platform changes needed to add one.

**Boundary:** personas cannot define new heuristics. Heuristics are part of the platform (the Critic owns them). Personas only define exploration behavior and success criteria.

### Quality Scoring Rubric

Four axes. Each blends deterministic heuristics with LLM-as-judge:

| Axis | Heuristics (deterministic) | LLM-judge (subjective) | Blend |
|---|---|---|---|
| **Perf** | Frame time (Perfetto), TTI, jank %, ANR count, peak memory | "Did this feel laggy?" on motion clips | 80% / 20% |
| **A11y** | Contrast (WCAG AA), tap targets ≥44dp, missing content-desc, focus order | "Would a low-vision / screenreader user complete the flow?" | 70% / 30% |
| **UX** | Dead-end detection, loop detection, dialog count, depth-to-goal | "Is the next action obvious? Is the copy clear? Is the order sensible?" | 30% / 70% |
| **Polish** | Dark mode parity, RTL parity, font fallback, image aspect-ratio | "Visual hierarchy? Spacing? Motion taste? Empty state design?" | 40% / 60% |

Both sources produce **findings** rows (heuristics with `rule_id`, LLM-judge with prose). Scorecard axis numbers = weighted blend.

LLM-judge runs **once per session** (not per state) — controls cost and gives the judge enough context.

## Resilience / Error Handling

| Failure | Handling |
|---|---|
| Emulator crashes mid-session | Session `status='failed'`; partial observations preserved; persona resumes on fresh emulator (replay is idempotent) |
| APK install fails | Run fails fast with `apk_install_error`; user sees actionable message; no emulator time charged |
| LLM call times out / errors | Director retries with exponential backoff (3 attempts); on final failure, persona logs the stuck state and aborts cleanly |
| Persona gets stuck (no new states for N actions) | Session ends with `status='stuck'`; Cartographer still ingests what was found |
| Cartographer dedup wrong (false merge) | Map nodes have a manual "split this node" action; future: confidence threshold + auto-split when "candidate-similar" fires repeatedly |
| Network capture pollutes logs | mitmproxy in scoped namespace; auto-disabled if it adds >500ms overhead |
| Cloud emulator pool exhausted | Runs queue FIFO with ETA on dashboard; per-project concurrency cap to prevent runaway costs |

**Cost circuit-breaker:** every run has a `budget` (max minutes × emulator-count). Hit the budget → terminate gracefully with `status='budget_exhausted'`.

## Testing Strategy

**Unit** — pure-function correctness.
- State equivalence (perceptual_hash + ui_tree_fingerprint), persona prompt rendering, heuristic detectors (contrast, tap-target, dead-end), map dedup, budget arithmetic.

**Integration** — agent against a deterministic mock emulator.
- A fake driver that returns scripted UI trees + screenshots when you "tap." Run Director → Persona → Cartographer end-to-end with no real Android. Assertion: given trace X + persona Y, the map ends up shape Z.

**End-to-end** — real cloud emulator against a fixture APK.
- Scout maintains a **"dogfood app"** — a deliberately weird Android app with planted issues (contrast violation on screen 2, dead-end on screen 5, ANR on rotation, low-3G timeout). Every release runs the full pipeline against it. Assertion: all planted issues found, no false positives above threshold.

**LLM-judge regression** — seed-set of `(screenshot, ui_tree) → expected_finding` pairs. CI compares LLM-judge output against expected. Drift triggers review, not auto-fail.

## Roadmap

**Phase 1 — "It works end-to-end" (6-8 weeks)**
A single dev can run Scout against their Android app and see real findings.
- `scout record/done/explore/status` CLI
- Local capture daemon (taps, screenshots, UI tree, logcat — defer network/perf to phase 2)
- Orchestrator API + Postgres schema
- Single Genymotion emulator at a time (sequential personas)
- 3 personas: `happy-rusher`, `low-vision`, `first-timer`
- Heuristics-only scoring (no LLM-judge yet)
- Dashboard: static graph render, scorecards, findings list

**Phase 2 — "Real swarm" (4 weeks)**
- Parallel personas via Genymotion concurrency
- Add `slow-3g` + `chaos-tapper`
- LLM-judge online
- WebSocket live map updates
- Network + perf trace capture

**Phase 3 — "Power mode + extensibility" (3 weeks)**
- Intent narration during capture (power mode)
- Custom personas via YAML
- Re-explore from any state on dashboard

**Phase 4 — "Verification + visual diff" (3 weeks)**
- `run.mode = 'verification'`
- Before/after edge screenshots
- Visual diff view in dashboard

**Phase 5 — "Cross-platform map" (6-8 weeks)**
- iOS driver (xcrun simctl + XCUITest)
- Map shows Android/iOS variants of "same" state
- Cross-platform parity findings

**Phase 6 — "Defect Hunter + CI"**
- Auto-PR generation for findings
- GitHub Action: "explore on PR"
- Existing-UI-test ingestion (mature-app mode)

**Phase 7+** — Real device farm, team/multi-tenancy, billing.

## Open Questions / Future Considerations

- **Hashing thresholds** — the perceptual-hash Hamming-distance threshold (6 bits) and UI-tree fingerprint normalization need tuning against real apps before phase 1 ships.
- **LLM provider** — designed assuming a frontier model for Director and LLM-judge. Model selection and cost model are decisions for the implementation plan.
- **Map versioning** — when the app under test changes (new screen added, old removed), how does the map evolve? Likely: each `state` gets an `app_version` and the dashboard can pivot between versions. Out of scope for v1.
- **Privacy** — captured traces may contain real user data (typed text, screenshots of secrets). Need a redaction step before upload, plus encryption at rest. Out of scope for v1, blocker for any team rollout.

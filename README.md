# Scout

Agentic mobile-dev tool. You demo one happy path on a local Android emulator; a swarm of LLM-driven personas takes over on cloud emulators, builds a persistent state map of every screen they reach, scores quality across four axes (performance, accessibility, UX, polish), and produces a queryable, replayable artifact the team can revisit forever.

## Status

Design phase. No code yet.

- **Design spec:** [`docs/superpowers/specs/2026-05-12-scout-design.md`](docs/superpowers/specs/2026-05-12-scout-design.md)

## What's the idea?

- Developer runs `scout record <flow>` and taps through the happy path on a local emulator.
- CLI uploads trace + APK to the cloud.
- A swarm of personas (`happy-rusher`, `low-vision`, `first-timer`, `slow-3g`, `chaos-tapper`) explores in parallel from where the developer left off.
- A four-role agent brain (Director, Personas, Critic, Cartographer) plans, explores, scores, and indexes everything into a persistent Postgres-backed state map.
- A web dashboard renders the map and lets you say "re-explore from here."

First platform: Android. iOS is a phase-5 driver swap behind the same brain.

## Roadmap

See the design spec — seven phases, Phase 1 is "it works end-to-end" against a single Android emulator.

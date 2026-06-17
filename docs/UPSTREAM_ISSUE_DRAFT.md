# Upstream feature request (draft)

Copy this to a new issue on https://github.com/betaflight/blackbox-log-viewer/issues

---

**Title:** Feature: Auto Diagnostics — blackbox log analysis assistant (observations + conservative CLI hints)

## Summary

Proposal to add an optional **Auto Diagnostics** dialog to Blackbox Explorer. It analyzes the open `.bbl` log (Web Worker) and reports:

- Frame resonance / motor health / step-response metrics
- **Observations** and **directional tuning hints** (manual investigation — no auto-PID)
- **Evidence-based CLI suggestions only** for a small whitelist (e.g. `dshot_bidir`, `dyn_notch_min_hz`, `gyro_lowpass_hz`) when log + config strongly support it

It deliberately does **not** auto-generate P/I/D/FF values.

## UI impact

Minimal — one **Diagnostics** toolbar button (same ghost style as Video/CSV), opens a standard `UModal`. No welcome page or layout changes.

## Implementation

Self-contained module under `src/diagnostics/` + ~20 lines wiring in `App.vue` / `AppToolbar.vue`. Includes keyboard guard so modal inputs do not trigger graph shortcuts.

Reference implementation: [link your fork branch `feature/auto-diagnostics-polish`]

## Test plan

- Open 2 kHz log with stick moves → Run Analysis
- Verify modal backdrop and typing in AUW field
- Confirm no CLI PID changes suggested

## Questions for maintainers

1. Accept as built-in feature vs. separate tool?
2. Preferred naming: "Diagnostics" vs "Auto Diagnostics"?
3. OK to land in 2 PRs (core + tests)?

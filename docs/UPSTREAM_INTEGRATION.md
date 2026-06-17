# Upstream integration — Auto Diagnostics

This is **not a separate product**. It is a self-contained feature intended as a **pull request to [betaflight/blackbox-log-viewer](https://github.com/betaflight/blackbox-log-viewer)**.

Blackbox Explorer has no plugin API today, so the feature ships as a **small, reviewable module** plus **minimal wiring** in existing files. It cannot be a single `.js` file (Web Worker + Vue modal + Pinia store are required), but **all new logic lives under one directory**.

## New files (copy as-is)

```
src/diagnostics/              ← all analysis logic + worker
src/stores/diagnostics.js
src/components/AutoDiagnosticsPanel.vue
src/components/DiagnosticsStatusBadge.vue
src/input_guard.js
test/unit/*.test.js           ← optional in follow-up PR
test/fixtures/cli-dumps/
```

## Existing files touched (minimal diff)

| File | Change |
|------|--------|
| `src/App.vue` | Import panel + store; `@open-diagnostics`; one handler |
| `src/components/AppToolbar.vue` | One **ghost** toolbar button (same style as Video/CSV) |
| `src/keyboard_handler.js` | Use `input_guard.js` so modal inputs work |
| `src/main.js` | Same guard for wheel handler |
| `vite.config.js` | Fix modal overlay classes (`fixed inset-0` — upstream bug when only `z-[200]` was set) |

**Do not change:** `WelcomePage.vue`, graph layout, toolbar colors, logos, or welcome copy.

## UI rule

Match **upstream master** exactly. The only visible addition is:

**Toolbar → Diagnostics** (ghost button, stethoscope icon, after GPX)

Opens the same **UModal** pattern as Video Export / User Settings.

## Suggested PR sequence to betaflight

1. **Core feature** — module + wiring + modal overlay fix  
2. **Tests** — Vitest for parser/recommendations/worker payload  
3. **Docs** — `docs/AUTO_DIAGNOSTICS.md` only (no README marketing)

Open a **feature request issue** on betaflight/blackbox-log-viewer first; link a demo branch.

## Fork workflow (for your testing only)

```bash
git remote add upstream https://github.com/betaflight/blackbox-log-viewer.git
git fetch upstream
git checkout -b feature/auto-diagnostics upstream/master
# cherry-pick or merge your commits
git push origin feature/auto-diagnostics
```

Your fork is for **testing and PR preview**, not a rebranded explorer.

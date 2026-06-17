# Auto Diagnostics (experimental)

Blackbox-based assistant for **observations**, **directional tuning hints**, and a **small set of evidence-based CLI suggestions**. It does **not** auto-change PID values.

## Quick start

1. Open a `.bbl` log in Blackbox Explorer.
2. Click **Auto Diagnostics** in the toolbar (stethoscope icon).
3. Select frame type, enter **AUW (grams)**, and cell count.
4. Optionally paste or **Import file** a Betaflight CLI `dump` or `diff all` output.
5. Click **Run Analysis**.

## What you get

| Output | Description |
|--------|-------------|
| **Log quality** | Score 0–100 before you run — rate, stick steps, gyro channels |
| **Observations** | Plain-language notes (log quality, resonance, motors, config mismatches) |
| **Investigate manually** | Directional hints (FF, D, P, I-term) with confidence — **not** auto CLI |
| **Metrics** | Resonance FFT peak, motor health, per-axis step response table |
| **CLI (evidence-based)** | Only `dshot_bidir`, `dyn_notch_min_hz`, `gyro_lowpass_hz` when log + config strongly support it |

Export **Markdown** or **JSON** from the results panel to share on Discord or GitHub issues.

## Log requirements

| Requirement | Why |
|-------------|-----|
| Gyro logged | Required — hard block without it |
| ≥2 kHz logging | Reliable high-frequency FFT (warning if lower) |
| Sharp stick moves | Step-response metrics (warning if few events) |
| AUW in grams | Required for run |
| CLI dump | Optional — improves filter/bidir CLI suggestions |

## CLI dump

In Betaflight Configurator → CLI, run `diff all` or `dump`, copy the text, or save to a `.txt` file and use **Import file**.

The parser reads `set name = value` lines. Comments and unrelated settings are ignored. Values from the dump override stale settings embedded in the log header.

## Safety model

- **Tier 1 — CLI block:** only settings with direct log + config evidence; includes confidence % per command.
- **Tier 2 — Hints:** manual investigation; never written as `set` commands.
- **Never suggested:** P/I/D/FF numeric changes.

Always verify on the bench before `save`.

## Development

```bash
npm install
npm start          # dev server
npm test           # unit tests (parser, recommendations, log quality)
npm run lint
npm run build
```

Module layout:

```
src/diagnostics/     — worker, DSP, CLI parser, hints
src/stores/diagnostics.js
src/components/AutoDiagnosticsPanel.vue
```

## Feedback

Use the **Auto Diagnostics feedback** issue template on this fork. See [PR_SPLIT.md](./PR_SPLIT.md) for upstream contribution plan.

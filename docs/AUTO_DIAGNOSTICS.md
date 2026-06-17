# Auto Diagnostics

Optional blackbox analysis for **upstream Betaflight Blackbox Explorer** — not a standalone app.

Analyzes an open `.bbl` log for observations, directional tuning hints, and a **small set of evidence-based CLI suggestions**. Does **not** auto-change PID values.

## Usage

1. Open a log in Blackbox Explorer (official UI unchanged).
2. Toolbar → **Diagnostics** (after GPX, same button style as Video/CSV).
3. Enter frame type, **AUW (g)**, cells; optionally paste or import a CLI `dump`.
4. **Run Analysis**.

## Output

| Section | What it is |
|---------|------------|
| Log quality | Score before run — rate, stick steps, gyro |
| Observations | Plain-language notes |
| Investigate manually | Directional hints (not auto CLI) |
| Metrics | Resonance, motors, step response |
| CLI (evidence-based) | Only filter/bidir settings when strongly supported |

## Integration

See [UPSTREAM_INTEGRATION.md](./UPSTREAM_INTEGRATION.md) for the exact files to add when contributing to betaflight/blackbox-log-viewer.

For production-style reliability patterns (regression tests, confidence tiers, audit exports), see [RELIABILITY.md](./RELIABILITY.md).

## Development

```bash
npm test    # unit tests
npm start
```

All logic: `src/diagnostics/`

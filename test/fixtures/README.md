# Test fixtures for Auto Diagnostics

## CLI dumps

- `cli-dumps/sample-diff.txt` — minimal Betaflight `diff`-style snippet for parser tests.

## Blackbox logs (`.bbl`)

Real flight logs are **not committed** (size + privacy). To add local fixtures for manual or future integration tests:

1. Place anonymized logs in `test/fixtures/logs/` (gitignored except this README).
2. Prefer three archetypes:
   - **clean-tune.bbl** — 2 kHz+, sharp stick moves, gyro + setpoint logged
   - **noisy-resonance.bbl** — visible mechanical peak for filter CLI tests
   - **low-rate.bbl** — &lt;1 kHz to verify quality warnings

Add `test/fixtures/logs/.gitkeep` and gitignore `*.bbl` in that folder.

## Running unit tests

```bash
npm test
```

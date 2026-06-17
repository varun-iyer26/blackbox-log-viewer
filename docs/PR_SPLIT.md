# Auto Diagnostics — upstream PR plan

This fork adds **Auto Diagnostics** in three stacked pull requests for [betaflight/blackbox-log-viewer](https://github.com/betaflight/blackbox-log-viewer). Open them **in order** (each branch is based on the previous).

| PR | Branch | Scope |
|----|--------|--------|
| **1** | `feature/auto-diagnostics` | Core module, worker, modal UI, toolbar button, keyboard guard |
| **2** | `feature/auto-diagnostics-tests` | Vitest unit tests, fixtures, CI `test.yml` |
| **3** | `feature/auto-diagnostics-polish` | Log quality score, CLI file import, report export, README + docs |

## Before opening upstream PR 1

1. Open a **feature request issue** on betaflight/blackbox-log-viewer describing scope (conservative CLI only, no auto-PID).
2. Link a **live preview** (GitHub Pages or Cloudflare on your fork).
3. Keep UI changes minimal — no unrelated welcome-page or toolbar redesign in PR 1.

## Fork workflow

```bash
# Remotes (one-time)
git remote rename origin upstream   # if you cloned betaflight
git remote add origin https://github.com/varun-iyer26/blackbox-log-viewer.git
git fetch --all

# Push stacked branches
git push -u origin feature/auto-diagnostics
git push -u origin feature/auto-diagnostics-tests
git push -u origin feature/auto-diagnostics-polish
```

Create PRs on **your fork** first for testers, then PR from `feature/auto-diagnostics` → `betaflight/master` when ready.

## Tester preview

Enable GitHub Pages from branch `feature/auto-diagnostics-polish` / `dist` after `npm run build`, or use the existing Cloudflare workflow pattern from upstream.

## Out of scope for initial upstream PRs

- Automatic PID value changes
- Full-screen graph overlay
- Welcome page layout changes (keep on a separate branch if desired)

See [AUTO_DIAGNOSTICS.md](./AUTO_DIAGNOSTICS.md) for user-facing documentation.

/**
 * Runtime feature flags for Auto Diagnostics (OEM kill-switch, canary rollout).
 *
 * Override order (highest wins): URL query → localStorage → defaults.
 * URL: ?bf_diag=0|1  ?bf_diag_fresh=0|1  ?bf_diag_bench=0|1  ?bf_diag_telemetry=0|1
 */

const STORAGE_KEY = "bf_diagnostics_flags";

const DEFAULTS = {
  diagnosticsEnabled: true,
  freshWorkerPerRun: true,
  requireBenchVerificationForCli: true,
  telemetryOptIn: false,
};

function parseBool(value) {
  if (value === "0" || value === "false" || value === "off") {
    return false;
  }
  if (value === "1" || value === "true" || value === "on") {
    return true;
  }
  return undefined;
}

function readStoredFlags() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function readUrlFlags() {
  if (typeof globalThis.location?.search !== "string") {
    return {};
  }
  const params = new URLSearchParams(globalThis.location.search);
  const out = {};
  const diag = parseBool(params.get("bf_diag"));
  if (diag !== undefined) {
    out.diagnosticsEnabled = diag;
  }
  const fresh = parseBool(params.get("bf_diag_fresh"));
  if (fresh !== undefined) {
    out.freshWorkerPerRun = fresh;
  }
  const bench = parseBool(params.get("bf_diag_bench"));
  if (bench !== undefined) {
    out.requireBenchVerificationForCli = bench;
  }
  const telemetry = parseBool(params.get("bf_diag_telemetry"));
  if (telemetry !== undefined) {
    out.telemetryOptIn = telemetry;
  }
  return out;
}

export function getDiagnosticsFlags() {
  return {
    ...DEFAULTS,
    ...readStoredFlags(),
    ...readUrlFlags(),
  };
}

export function isDiagnosticsEnabled() {
  return getDiagnosticsFlags().diagnosticsEnabled;
}

export function isFreshWorkerPerRun() {
  return getDiagnosticsFlags().freshWorkerPerRun;
}

export function isBenchVerificationRequired() {
  return getDiagnosticsFlags().requireBenchVerificationForCli;
}

export function isTelemetryOptIn() {
  return getDiagnosticsFlags().telemetryOptIn;
}

export function saveDiagnosticsFlags(partial) {
  const next = { ...readStoredFlags(), ...partial };
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // private mode — non-fatal
  }
  return { ...DEFAULTS, ...next, ...readUrlFlags() };
}

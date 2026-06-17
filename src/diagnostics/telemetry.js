/**
 * Opt-in anonymous diagnostics telemetry (OpenTelemetry-style events, no PII).
 * Events stay in localStorage until cleared or exported — never auto-uploaded.
 */

import { isTelemetryOptIn, saveDiagnosticsFlags } from "./feature_flags.js";

const EVENTS_KEY = "bf_diagnostics_telemetry_events";
const MAX_EVENTS = 200;

export function recordTelemetryEvent(event) {
  if (!isTelemetryOptIn()) {
    return;
  }
  const entry = {
    ts: new Date().toISOString(),
    ...event,
  };
  try {
    const raw = globalThis.localStorage?.getItem(EVENTS_KEY);
    const events = raw ? JSON.parse(raw) : [];
    events.push(entry);
    while (events.length > MAX_EVENTS) {
      events.shift();
    }
    globalThis.localStorage?.setItem(EVENTS_KEY, JSON.stringify(events));
  } catch {
    // quota / private mode
  }
}

export function getTelemetryEvents() {
  try {
    const raw = globalThis.localStorage?.getItem(EVENTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function clearTelemetryEvents() {
  try {
    globalThis.localStorage?.removeItem(EVENTS_KEY);
  } catch {
    // ignore
  }
}

export function setTelemetryOptIn(enabled) {
  saveDiagnosticsFlags({ telemetryOptIn: !!enabled });
  if (!enabled) {
    clearTelemetryEvents();
  }
}

export function recordAnalysisStarted(meta = {}) {
  recordTelemetryEvent({ type: "analysis_started", ...meta });
}

export function recordAnalysisCompleted(meta = {}) {
  recordTelemetryEvent({ type: "analysis_completed", ...meta });
}

export function recordAnalysisFailed(meta = {}) {
  recordTelemetryEvent({ type: "analysis_failed", ...meta });
}

export function recordAnalysisCancelled(meta = {}) {
  recordTelemetryEvent({ type: "analysis_cancelled", ...meta });
}

export function downloadTelemetryExport() {
  const payload = {
    exportedAt: new Date().toISOString(),
    events: getTelemetryEvents(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "auto-diagnostics-telemetry.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

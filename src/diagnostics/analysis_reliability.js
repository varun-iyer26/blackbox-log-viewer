import { MIN_LOG_RATE_HZ } from "./constants.js";

const PREFS_STORAGE_KEY = "bf_auto_diagnostics_prefs";

export function loadDiagnosticsPrefs() {
  try {
    const raw = globalThis.localStorage?.getItem(PREFS_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveDiagnosticsPrefs(prefs) {
  try {
    globalThis.localStorage?.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Quota or private mode — non-fatal
  }
}

/**
 * Pre-flight checks before posting to the worker (fail fast with clear errors).
 */
export function validateWorkerPayload(payload) {
  const errors = [];
  if (!payload?.gyro?.series?.length) {
    errors.push("No gyro samples extracted from log.");
  } else {
    const totalSamples = payload.gyro.series.reduce((n, s) => n + (s.data?.length ?? 0), 0);
    if (totalSamples < 256) {
      errors.push("Too few gyro samples for analysis — log may be empty or truncated.");
    }
  }
  if ((payload?.sampleRateHz ?? 0) <= 0) {
    errors.push("Could not determine log sample rate.");
  }
  if (errors.length) {
    throw new Error(errors.join(" "));
  }
}

/**
 * Overall confidence tier for the report (industry-style graded output).
 */
export function buildAnalysisMetadata(baseline, analysis) {
  const reasons = [];
  let score = 100;

  const rate = baseline?.loggingRateHz ?? analysis?.summary?.loggingRateHz ?? 0;
  if (rate > 0 && rate < MIN_LOG_RATE_HZ) {
    score -= 30;
    reasons.push(`Logging ${rate} Hz (recommend ≥${MIN_LOG_RATE_HZ} Hz).`);
  }

  const steps = baseline?.rcStepEvents ?? 0;
  if (steps < 2) {
    score -= 25;
    reasons.push("Few stick steps — PID step metrics less reliable.");
  }

  const axes = analysis?.tuning?.axes ?? [];
  const totalStepEvents = axes.reduce((n, a) => n + (a.stepEvents ?? 0), 0);
  if (totalStepEvents < 6) {
    score -= 15;
    reasons.push("Limited step-response events across axes.");
  }

  const resonanceConf = analysis?.hardware?.frameResonance?.confidence ?? 0;
  if (resonanceConf > 0 && resonanceConf < 50) {
    score -= 10;
    reasons.push("FFT resonance confidence is moderate.");
  }

  score = Math.max(0, Math.min(100, score));

  let tier = "high";
  if (score < 55) {
    tier = "low";
  } else if (score < 80) {
    tier = "medium";
  }

  return {
    confidenceScore: score,
    confidenceTier: tier,
    confidenceReasons: reasons,
    analyzedAt: new Date().toISOString(),
  };
}

export function userFacingError(err) {
  const message = err?.message ?? String(err ?? "Unknown error");
  if (/could not be cloned/i.test(message)) {
    return "Internal serialization error — retry analysis. If this persists, reload the page.";
  }
  if (/timed out/i.test(message)) {
    return `${message} Try a shorter log or close other browser tabs.`;
  }
  return message;
}

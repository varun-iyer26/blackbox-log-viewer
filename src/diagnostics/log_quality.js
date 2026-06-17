import { MIN_LOG_RATE_HZ, MIN_RC_STEP_EVENTS } from "./constants.js";

/**
 * Score log suitability for Auto Diagnostics (0–100).
 * Used for upfront guidance — does not block analysis.
 */
export function assessLogQuality(baseline) {
  if (!baseline) {
    return { score: 0, grade: "unknown", issues: ["No log loaded"], ready: false };
  }

  let score = 100;
  const issues = [];

  const rate = baseline.loggingRateHz ?? 0;
  if (rate > 0 && rate < MIN_LOG_RATE_HZ) {
    score -= 35;
    issues.push(`Logging ${rate} Hz — use ≥${MIN_LOG_RATE_HZ} Hz for reliable FFT.`);
  } else if (rate === 0) {
    score -= 15;
    issues.push("Could not determine logging rate from header.");
  }

  const steps = baseline.rcStepEvents ?? 0;
  if (steps < MIN_RC_STEP_EVENTS) {
    score -= 25;
    issues.push("Few stick steps — re-read with sharp rolls or flips.");
  } else if (steps < 5) {
    score -= 10;
    issues.push("Limited stick steps — step-response confidence is moderate.");
  }

  if (baseline.errors?.length) {
    score -= 40;
    issues.push(...baseline.errors);
  }

  const hasGyro = !baseline.channels?.gyro?.some((c) => c.fieldIndex === undefined);
  if (!hasGyro) {
    score = Math.min(score, 20);
    issues.push("Missing gyro channels in log.");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  let grade = "good";
  if (score < 50) {
    grade = "poor";
  } else if (score < 75) {
    grade = "fair";
  }

  return {
    score,
    grade,
    issues: [...new Set(issues)],
    ready: hasGyro,
  };
}

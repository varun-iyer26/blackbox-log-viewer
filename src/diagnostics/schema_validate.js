/**
 * Lightweight structural validation for diagnostics report exports.
 * Full JSON Schema lives in docs/schemas/auto-diagnostics-report.schema.json.
 */

import { REPORT_SCHEMA_VERSION } from "./build_info.js";

const REQUIRED_TOP = ["summary", "hardware", "tuning", "metadata"];

export function validateReportStructure(report) {
  const errors = [];
  if (!report || typeof report !== "object") {
    return ["Report must be an object."];
  }
  for (const key of REQUIRED_TOP) {
    if (!(key in report)) {
      errors.push(`Missing required field: ${key}`);
    }
  }
  if (report.schemaVersion != null && report.schemaVersion !== REPORT_SCHEMA_VERSION) {
    errors.push(
      `schemaVersion ${report.schemaVersion} does not match expected ${REPORT_SCHEMA_VERSION}.`,
    );
  }
  if (report.hardware?.frameResonance && typeof report.hardware.frameResonance.peakHz !== "number") {
    errors.push("hardware.frameResonance.peakHz must be a number.");
  }
  if (report.metadata?.confidenceTier) {
    const tier = report.metadata.confidenceTier;
    if (!["high", "medium", "low"].includes(tier)) {
      errors.push(`metadata.confidenceTier must be high|medium|low, got ${tier}.`);
    }
  }
  return errors;
}

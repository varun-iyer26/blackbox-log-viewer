/** Build provenance embedded in diagnostics exports (SLSA-lite audit trail). */

const fallbackVersion = "2026.6.0-dev";

export function getBuildInfo() {
  return {
    toolVersion:
      typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : fallbackVersion,
    buildHash:
      typeof __BUILD_HASH__ !== "undefined" ? __BUILD_HASH__ : "dev",
    buildTime:
      typeof __BUILD_TIME__ !== "undefined" ? __BUILD_TIME__ : null,
  };
}

export const REPORT_SCHEMA_ID =
  "https://github.com/betaflight/blackbox-log-viewer/blob/master/docs/schemas/auto-diagnostics-report.schema.json";

export const REPORT_SCHEMA_VERSION = 1;

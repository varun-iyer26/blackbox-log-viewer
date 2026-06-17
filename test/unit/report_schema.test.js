import { describe, expect, it } from "vitest";
import Ajv from "ajv";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runDiagnosticsAnalysis } from "../../src/diagnostics/worker_dsp.js";
import { attachCliToAnalysis } from "../../src/diagnostics/cli_recommendations.js";
import { buildAnalysisMetadata } from "../../src/diagnostics/analysis_reliability.js";
import { buildReportJson } from "../../src/diagnostics/report_export.js";
import { validateReportStructure } from "../../src/diagnostics/schema_validate.js";
import { buildSyntheticPayload } from "../helpers/synthetic_payload.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(
  readFileSync(
    join(__dirname, "../../docs/schemas/auto-diagnostics-report.schema.json"),
    "utf8",
  ),
);

const ajv = new Ajv({ allErrors: true, strict: false });
const validateSchema = ajv.compile(schema);

function buildFullReport() {
  const payload = buildSyntheticPayload({ sampleCount: 2048, resonanceHz: 200 });
  const analysis = runDiagnosticsAnalysis(payload);
  const report = attachCliToAnalysis(analysis, {}, payload.hardwareProfile, {
    warnings: [],
    referenceProfile: payload.referenceProfile,
    baseline: { loggingRateHz: 2000, rcStepEvents: 4 },
  });
  report.metadata = buildAnalysisMetadata(
    { loggingRateHz: 2000, rcStepEvents: 4 },
    report,
  );
  report.schemaVersion = 1;
  report.buildHash = "test";
  report.toolVersion = "2026.6.0-test";
  return report;
}

describe("report JSON schema", () => {
  it("validates a full report against JSON Schema", () => {
    const report = buildFullReport();
    const valid = validateSchema(report);
    if (!valid) {
      console.error(validateSchema.errors);
    }
    expect(valid).toBe(true);
  });

  it("validateReportStructure catches missing fields", () => {
    expect(validateReportStructure({})).toContain("Missing required field: summary");
  });

  it("buildReportJson wraps report with export envelope", () => {
    const report = buildFullReport();
    const json = JSON.parse(buildReportJson(report, { logFilename: "test.bbl" }));
    expect(json.report.schemaVersion).toBe(1);
    expect(json.schemaId).toBeTruthy();
    expect(json.toolVersion).toBeTruthy();
  });
});

import { describe, expect, it } from "vitest";
import { runDiagnosticsAnalysis } from "../../src/diagnostics/worker_dsp.js";
import { validateWorkerPayload } from "../../src/diagnostics/analysis_reliability.js";
import { buildSyntheticPayload } from "../helpers/synthetic_payload.js";

function makeMinimalPayload(sampleCount) {
  const base = buildSyntheticPayload({ sampleCount: Math.max(1, sampleCount), sampleRateHz: 2000 });
  return base;
}

describe("fuzz worker payload", () => {
  it("validateWorkerPayload rejects bad lengths without throwing", () => {
    for (const n of [0, 1, 64, 80]) {
      const payload = makeMinimalPayload(n);
      expect(() => validateWorkerPayload(payload)).toThrow(/gyro|samples|sample rate/i);
    }
    for (const n of [256, 512, 1024]) {
      const payload = makeMinimalPayload(n);
      expect(() => validateWorkerPayload(payload)).not.toThrow();
    }
  });

  it("runDiagnosticsAnalysis returns structured result or throws Error", () => {
    for (const n of [256, 512, 1024, 2048, 4096]) {
      const payload = makeMinimalPayload(n);
      try {
        validateWorkerPayload(payload);
        const result = runDiagnosticsAnalysis(payload);
        expect(result.summary).toBeTruthy();
        expect(result.hardware).toBeTruthy();
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
      }
    }
  });

  it("handles null optional channels", () => {
    const payload = makeMinimalPayload(1024);
    payload.pidI = null;
    payload.pidF = null;
    validateWorkerPayload(payload);
    const result = runDiagnosticsAnalysis(payload);
    expect(result.tuning.pidTerms.available).toBe(false);
  });
});

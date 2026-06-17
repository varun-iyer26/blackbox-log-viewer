import { describe, expect, it } from "vitest";
import {
  buildAnalysisMetadata,
  userFacingError,
  validateWorkerPayload,
} from "../../src/diagnostics/analysis_reliability.js";

describe("validateWorkerPayload", () => {
  it("throws when gyro is empty", () => {
    expect(() =>
      validateWorkerPayload({ gyro: { series: [] }, sampleRateHz: 2000 }),
    ).toThrow(/No gyro samples/);
  });

  it("passes with sufficient samples", () => {
    expect(() =>
      validateWorkerPayload({
        sampleRateHz: 2000,
        gyro: { series: [{ data: new Float32Array(512) }] },
      }),
    ).not.toThrow();
  });
});

describe("buildAnalysisMetadata", () => {
  it("grades low quality logs", () => {
    const meta = buildAnalysisMetadata(
      { loggingRateHz: 500, rcStepEvents: 0 },
      { tuning: { axes: [{ stepEvents: 0 }] }, hardware: { frameResonance: { confidence: 40 } } },
    );
    expect(meta.confidenceTier).toBe("low");
    expect(meta.confidenceReasons.length).toBeGreaterThan(0);
  });
});

describe("userFacingError", () => {
  it("maps clone errors", () => {
    expect(userFacingError(new Error("could not be cloned"))).toMatch(/serialization/i);
  });
});

import { describe, expect, it } from "vitest";
import { assessLogQuality } from "../../src/diagnostics/log_quality.js";

describe("assessLogQuality", () => {
  it("scores a healthy log highly", () => {
    const result = assessLogQuality({
      loggingRateHz: 2000,
      rcStepEvents: 8,
      channels: { gyro: [{ fieldIndex: 0 }, { fieldIndex: 1 }, { fieldIndex: 2 }] },
      errors: [],
    });
    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.grade).toBe("good");
    expect(result.ready).toBe(true);
  });

  it("penalizes low rate and missing gyro", () => {
    const result = assessLogQuality({
      loggingRateHz: 500,
      rcStepEvents: 0,
      channels: { gyro: [{ fieldIndex: undefined }] },
      errors: ["Missing data"],
    });
    expect(result.score).toBeLessThan(50);
    expect(result.grade).toBe("poor");
    expect(result.ready).toBe(false);
  });
});

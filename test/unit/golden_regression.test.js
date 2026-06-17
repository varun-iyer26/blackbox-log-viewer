import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runDiagnosticsAnalysis } from "../../src/diagnostics/worker_dsp.js";
import { buildSyntheticPayload } from "../helpers/synthetic_payload.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(
  readFileSync(join(__dirname, "../fixtures/golden/expected-ranges.json"), "utf8"),
);

function getPath(obj, path) {
  const parts = path.split(".");
  let cur = obj;
  for (const part of parts) {
    if (cur == null) {
      return undefined;
    }
    if (/^\d+$/.test(part)) {
      cur = cur[Number(part)];
    } else {
      cur = cur[part];
    }
  }
  return cur;
}

function assertExpectation(value, spec, label) {
  if (spec.oneOf) {
    expect(spec.oneOf).toContain(value);
    return;
  }
  expect(typeof value).toBe("number");
  expect(value, `${label} min`).toBeGreaterThanOrEqual(spec.min);
  expect(value, `${label} max`).toBeLessThanOrEqual(spec.max);
}

describe("golden regression (synthetic payloads)", () => {
  for (const fixture of fixtures) {
    it(`metrics stay within range: ${fixture.name}`, () => {
      const payload = buildSyntheticPayload(fixture.profile);
      const result = runDiagnosticsAnalysis(payload);
      expect(result).toBeTruthy();
      expect(result.hardware?.frameResonance).toBeTruthy();
      expect(result.tuning?.axes?.length).toBe(3);

      for (const [path, spec] of Object.entries(fixture.expect)) {
        const value = getPath(result, path);
        assertExpectation(value, spec, path);
      }
    });
  }
});

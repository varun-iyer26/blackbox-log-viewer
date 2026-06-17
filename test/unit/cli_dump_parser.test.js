import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  mergeConfigBaseline,
  parseCliDump,
  parseCliValue,
} from "../../src/diagnostics/cli_dump_parser.js";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "../fixtures/cli-dumps");

describe("parseCliValue", () => {
  it("normalizes ON/OFF booleans", () => {
    expect(parseCliValue("ON")).toBe(true);
    expect(parseCliValue("off")).toBe(false);
  });

  it("parses numbers and quoted strings", () => {
    expect(parseCliValue("450")).toBe(450);
    expect(parseCliValue('"RPM_FILTER"')).toBe("RPM_FILTER");
  });
});

describe("parseCliDump", () => {
  it("returns empty for blank input", () => {
    const result = parseCliDump("");
    expect(result.values).toEqual({});
    expect(result.parseErrors).toEqual([]);
  });

  it("parses sample diff and maps gyro_lpf1 alias", () => {
    const text = readFileSync(join(fixtureDir, "sample-diff.txt"), "utf8");
    const { values } = parseCliDump(text);
    expect(values.dshot_bidir).toBe(false);
    expect(values.rpm_filter_harmonics).toBe(3);
    expect(values.gyro_lowpass_hz).toBe(450);
    expect(values.dyn_notch_min_hz).toBe(100);
    expect(values.roll_p).toBe(45);
  });

  it("ignores comments and hash lines", () => {
    const { values, rawCount } = parseCliDump("# comment\nset yaw_p = 20\n");
    expect(values.yaw_p).toBe(20);
    expect(rawCount).toBe(1);
  });
});

describe("mergeConfigBaseline", () => {
  it("lets CLI dump override header values", () => {
    const merged = mergeConfigBaseline(
      { gyro_lowpass_hz: 500, dyn_notch_min_hz: 80 },
      { gyro_lowpass_hz: 350, dyn_notch_min_hz: 120 },
    );
    expect(merged.gyro_lowpass_hz).toBe(350);
    expect(merged.dyn_notch_min_hz).toBe(120);
  });
});

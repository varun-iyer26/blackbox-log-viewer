import { describe, expect, it } from "vitest";
import { parseCliDump } from "../../src/diagnostics/cli_dump_parser.js";

const ALPHABET =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_#= \n\t-";

function randomString(len) {
  let s = "";
  for (let i = 0; i < len; i++) {
    s += ALPHABET[(i * 17 + len * 3) % ALPHABET.length];
  }
  return s;
}

describe("fuzz cli_dump_parser", () => {
  it("never throws on random snippets", () => {
    for (let i = 0; i < 120; i++) {
      const text = randomString(20 + (i % 80));
      expect(() => parseCliDump(text)).not.toThrow();
      const result = parseCliDump(text);
      expect(result).toHaveProperty("values");
      expect(typeof result.values).toBe("object");
    }
  });

  it("handles fragmented diff lines", () => {
    const chunks = ["set dshot_", "bidir = ON\n", "gyro_lowpass_hz = ", "250\n"];
    for (let i = 0; i < 40; i++) {
      const text = chunks.slice(0, (i % chunks.length) + 1).join("");
      expect(() => parseCliDump(text)).not.toThrow();
    }
  });
});

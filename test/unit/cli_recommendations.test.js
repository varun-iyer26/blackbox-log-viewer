import { describe, expect, it } from "vitest";
import {
  buildCliRecommendations,
  buildObservations,
} from "../../src/diagnostics/cli_recommendations.js";

const resonanceAnalysis = {
  hardware: {
    frameResonance: {
      peakHz: 180,
      status: "red",
      confidence: 82,
    },
    motorHealth: { status: "green", motors: [] },
  },
  tuning: { axes: [{ name: "Roll", stepEvents: 0 }] },
};

describe("buildCliRecommendations", () => {
  it("suggests dshot_bidir when RPM filter is configured without bidir", () => {
    const { items, commandsOnly } = buildCliRecommendations(resonanceAnalysis, {
      dshot_bidir: false,
      rpm_filter_harmonics: 3,
    });
    expect(items.some((i) => i.command === "set dshot_bidir = ON")).toBe(true);
    expect(commandsOnly).toContain("set dshot_bidir = ON");
  });

  it("suggests dyn_notch_min_hz when resonance peak is strong", () => {
    const { items } = buildCliRecommendations(resonanceAnalysis, {
      dyn_notch_min_hz: 100,
      gyro_lowpass_hz: 450,
    });
    const notch = items.find((i) => i.command.startsWith("set dyn_notch_min_hz"));
    expect(notch).toBeDefined();
    expect(notch.confidence).toBeGreaterThanOrEqual(70);
  });

  it("returns empty commands when evidence is insufficient", () => {
    const { items, text } = buildCliRecommendations(
      { hardware: { frameResonance: { status: "green", peakHz: 0 } }, tuning: { axes: [] } },
      {},
    );
    expect(items).toHaveLength(0);
    expect(text).toContain("No CLI changes with sufficient evidence");
  });
});

describe("buildObservations", () => {
  it("warns about low logging rate", () => {
    const lines = buildObservations(
      { tuning: { axes: [] }, hardware: {} },
      {},
      { loggingRateHz: 500, rcStepEvents: 5 },
    );
    expect(lines.some((l) => l.includes("Logging rate 500"))).toBe(true);
  });

  it("notes RPM filter misconfiguration", () => {
    const lines = buildObservations(
      { tuning: { axes: [] }, hardware: {} },
      { dshot_bidir: false, rpm_filter_harmonics: 2 },
      { loggingRateHz: 2000, rcStepEvents: 5 },
    );
    expect(lines.some((l) => l.includes("dshot_bidir"))).toBe(true);
  });
});

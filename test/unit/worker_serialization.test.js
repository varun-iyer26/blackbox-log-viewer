import { describe, expect, it } from "vitest";
import { reactive } from "vue";
import { buildWorkerPayload, clonePlainObject } from "../../src/diagnostics/worker_serialization.js";

describe("clonePlainObject", () => {
  it("strips Vue reactive proxies", () => {
    const proxy = reactive({ a: 1, nested: { b: 2 } });
    const plain = clonePlainObject(proxy);
    expect(plain).toEqual({ a: 1, nested: { b: 2 } });
    expect(() => structuredClone({ payload: plain })).not.toThrow();
  });
});

describe("buildWorkerPayload", () => {
  it("is structured-clone safe with typed arrays", () => {
    const payload = buildWorkerPayload(
      {
        sampleRateHz: 2000,
        gyro: {
          timesUs: new Float32Array([0, 500]),
          series: [{ axis: 0, data: new Float32Array([1, 2]) }],
        },
        setpoint: { timesUs: new Float32Array(0), series: [] },
        rcCommand: { timesUs: new Float32Array(0), series: [] },
        motor: { timesUs: new Float32Array(0), series: [] },
        pidI: null,
        pidF: null,
      },
      {
        baseline: { flightDurationSec: 60, headerBaseline: { craftName: "Test" } },
        thresholdProfile: reactive({ maxSettleMs: 130 }),
        hardwareProfile: reactive({
          frameArchetype: "freestyle_5",
          frameLabel: '5" Freestyle',
          auwGrams: 650,
          cellCount: "4S",
        }),
        saturationThreshold: 1850,
      },
      { label: "Freestyle", stepResponse: { sweetOvershootPct: 5 } },
    );

    expect(() => structuredClone({ id: 1, payload })).not.toThrow();
    expect(payload.hardwareProfile.auwGrams).toBe(650);
    expect(payload.headerBaseline.craftName).toBe("Test");
  });
});

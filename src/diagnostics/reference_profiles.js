/**
 * Expert reference targets by flying style.
 * Sources: UAV Tech PID principles (critically damped ~5% OS),
 * Plasmatree PID-Analyzer (500°/s rate split), Oscar Liang / BF filter guides,
 * cinewhoop duct-resonance literature (80–120 Hz).
 */

export const REFERENCE_TUNING_PROFILES = {
  cinewhoop_23: {
    label: '2-3" Cinewhoop',
    description: "Smooth, low-authority tune. Mandatory RPM filtering. Duct resonance 80–140 Hz.",
    stepResponse: {
      sweetOvershootPct: 6,
      maxOvershootPct: 18,
      sweetSettleMs: 90,
      maxSettleMs: 180,
      sweetRiseMs: 35,
      maxRiseMs: 70,
      maxTrackingRmsDeg: 18,
      maxLatencyMs: 35,
      minStepEvents: 3,
      highRateThresholdDeg: 400,
    },
    filters: {
      gyroLpf1Hz: 200,
      gyroLpf2Hz: 400,
      dtermLpf1Hz: 120,
      dtermLpf2Hz: 180,
      resonanceBandHz: [80, 140],
      rpmHarmonics: 3,
      requireBidir: true,
      filterSliderTarget: 0.85,
    },
    pid: {
      masterMultiplierHint: 0.75,
      dMultiplierHint: 0.8,
      ffMultiplierHint: 0.65,
      itermRelaxHint: 15,
    },
  },
  freestyle_5: {
    label: '5" Freestyle',
    description: "Critically damped snap with minimal bounce-back. Clean gyro, moderate filters.",
    stepResponse: {
      sweetOvershootPct: 5,
      maxOvershootPct: 22,
      sweetSettleMs: 70,
      maxSettleMs: 130,
      sweetRiseMs: 25,
      maxRiseMs: 55,
      maxTrackingRmsDeg: 22,
      maxLatencyMs: 28,
      minStepEvents: 4,
      highRateThresholdDeg: 500,
    },
    filters: {
      gyroLpf1Hz: 250,
      gyroLpf2Hz: 500,
      dtermLpf1Hz: 150,
      dtermLpf2Hz: 200,
      resonanceBandHz: [100, 280],
      rpmHarmonics: 3,
      requireBidir: true,
      filterSliderTarget: 1.35,
    },
    pid: {
      masterMultiplierHint: 1.0,
      dMultiplierHint: 1.0,
      ffMultiplierHint: 1.0,
      itermRelaxHint: 20,
    },
  },
  racer_5: {
    label: '5" Racer',
    description: "Fast rise, low latency, ≤8% overshoot. Tighter settling than freestyle.",
    stepResponse: {
      sweetOvershootPct: 4,
      maxOvershootPct: 15,
      sweetSettleMs: 55,
      maxSettleMs: 100,
      sweetRiseMs: 18,
      maxRiseMs: 40,
      maxTrackingRmsDeg: 25,
      maxLatencyMs: 22,
      minStepEvents: 5,
      highRateThresholdDeg: 500,
    },
    filters: {
      gyroLpf1Hz: 260,
      gyroLpf2Hz: 520,
      dtermLpf1Hz: 160,
      dtermLpf2Hz: 220,
      resonanceBandHz: [100, 320],
      rpmHarmonics: 3,
      requireBidir: true,
      filterSliderTarget: 1.1,
    },
    pid: {
      masterMultiplierHint: 1.15,
      dMultiplierHint: 1.05,
      ffMultiplierHint: 1.2,
      itermRelaxHint: 30,
    },
  },
  longrange_7: {
    label: '7" Long Range',
    description: "Stable cruise, higher inertia. Softer FF, longer settle acceptable.",
    stepResponse: {
      sweetOvershootPct: 8,
      maxOvershootPct: 25,
      sweetSettleMs: 110,
      maxSettleMs: 220,
      sweetRiseMs: 40,
      maxRiseMs: 85,
      maxTrackingRmsDeg: 20,
      maxLatencyMs: 40,
      minStepEvents: 3,
      highRateThresholdDeg: 350,
    },
    filters: {
      gyroLpf1Hz: 220,
      gyroLpf2Hz: 450,
      dtermLpf1Hz: 140,
      dtermLpf2Hz: 190,
      resonanceBandHz: [70, 200],
      rpmHarmonics: 2,
      requireBidir: true,
      filterSliderTarget: 1.25,
    },
    pid: {
      masterMultiplierHint: 0.9,
      dMultiplierHint: 0.95,
      ffMultiplierHint: 0.75,
      itermRelaxHint: 10,
    },
  },
};

/** Legacy threshold map — kept for backward compat, derived from reference profiles. */
export const FRAME_THRESHOLD_PROFILES = Object.fromEntries(
  Object.entries(REFERENCE_TUNING_PROFILES).map(([key, ref]) => [
    key,
    {
      maxSettleMs: ref.stepResponse.maxSettleMs,
      maxOvershootPct: ref.stepResponse.maxOvershootPct,
      resonanceSeverityScale:
        key === "cinewhoop_23" ? 1.15 : key === "longrange_7" ? 1.2 : key === "racer_5" ? 0.9 : 1.0,
    },
  ]),
);

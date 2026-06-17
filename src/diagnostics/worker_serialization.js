/**
 * Build a structured-clone-safe worker payload.
 * Vue/Pinia reactive proxies and class instances cannot be postMessage'd.
 */

export function clonePlainObject(value) {
  if (value == null) {
    return value;
  }
  if (typeof value !== "object") {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

export function serializeChannelPack(pack) {
  if (!pack) {
    return { timesUs: new Float32Array(0), series: [] };
  }
  return {
    timesUs: pack.timesUs,
    series: pack.series.map((s) => ({
      axis: s.axis,
      motor: s.motor,
      data: s.data,
    })),
  };
}

export function collectTransferables(payload) {
  const transferables = [];
  for (const key of ["gyro", "setpoint", "rcCommand", "motor", "pidI", "pidF"]) {
    const pack = payload[key];
    if (!pack) {
      continue;
    }
    if (pack.timesUs?.buffer) {
      transferables.push(pack.timesUs.buffer);
    }
    for (const s of pack.series) {
      if (s.data?.buffer) {
        transferables.push(s.data.buffer);
      }
    }
  }
  return transferables;
}

export function buildWorkerPayload(buffers, context, referenceProfile) {
  return {
    sampleRateHz: buffers.sampleRateHz,
    flightDurationSec: context.baseline?.flightDurationSec ?? 0,
    gyro: serializeChannelPack(buffers.gyro),
    setpoint: serializeChannelPack(buffers.setpoint),
    rcCommand: serializeChannelPack(buffers.rcCommand),
    motor: serializeChannelPack(buffers.motor),
    pidI: serializeChannelPack(buffers.pidI),
    pidF: serializeChannelPack(buffers.pidF),
    thresholdProfile: clonePlainObject(context.thresholdProfile),
    referenceProfile: clonePlainObject(referenceProfile),
    hardwareProfile: clonePlainObject({
      frameArchetype: context.hardwareProfile?.frameArchetype,
      frameLabel: context.hardwareProfile?.frameLabel,
      auwGrams: context.hardwareProfile?.auwGrams,
      cellCount: context.hardwareProfile?.cellCount,
    }),
    headerBaseline: clonePlainObject(context.baseline?.headerBaseline ?? null),
    saturationThreshold: context.saturationThreshold ?? 1850,
  };
}

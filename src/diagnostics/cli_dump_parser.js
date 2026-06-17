import { CLI_DUMP_KEYS } from "./constants.js";

const SET_LINE = /^(?:set\s+)?([a-z0-9_]+)\s*=\s*(.+)$/i;

/** Normalize ON/OFF, quoted strings, and numeric CLI values. */
export function parseCliValue(raw) {
  const trimmed = raw.trim().replace(/;$/, "");
  if (/^(ON|TRUE|ENABLED)$/i.test(trimmed)) {
    return true;
  }
  if (/^(OFF|FALSE|DISABLED)$/i.test(trimmed)) {
    return false;
  }
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  const num = Number(trimmed);
  if (!Number.isNaN(num) && trimmed !== "") {
    return num;
  }
  return trimmed;
}

/**
 * Parse a Betaflight `diff all` or `dump` text block into a flat key → value map.
 * Keys are lowercased. Only whitelisted diagnostic keys are returned.
 */
export function parseCliDump(text) {
  const all = {};
  if (!text?.trim()) {
    return { values: {}, parseErrors: [] };
  }

  const parseErrors = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) {
      continue;
    }
    const match = SET_LINE.exec(trimmed);
    if (!match) {
      continue;
    }
    const key = match[1].toLowerCase();
    try {
      all[key] = parseCliValue(match[2]);
    } catch {
      parseErrors.push(`Could not parse: ${trimmed}`);
    }
  }

  const values = {};
  for (const key of CLI_DUMP_KEYS) {
    if (Object.hasOwn(all, key)) {
      values[key] = all[key];
    }
  }

  // Map common dump aliases to canonical keys used elsewhere in the viewer.
  if (all.gyro_lpf1_static_hz != null && values.gyro_lowpass_hz == null) {
    values.gyro_lowpass_hz = all.gyro_lpf1_static_hz;
  }
  if (all.gyro_lpf2_static_hz != null && values.gyro_lowpass2_hz == null) {
    values.gyro_lowpass2_hz = all.gyro_lpf2_static_hz;
  }
  if (all.dyn_idle_min_rpm != null && values.dyn_idle_min_rpm == null) {
    values.dyn_idle_min_rpm = all.dyn_idle_min_rpm;
  }

  return { values, parseErrors, rawCount: Object.keys(all).length };
}

/** Merge header sysConfig baseline with user-pasted CLI dump (dump wins on conflict). */
export function mergeConfigBaseline(headerBaseline, cliValues) {
  const merged = { ...headerBaseline };
  for (const [key, value] of Object.entries(cliValues)) {
    if (value !== undefined && value !== null && value !== "") {
      merged[key] = value;
    }
  }
  return merged;
}

/** Minimum blackbox sample rate required for high-frequency diagnostics. */
export const MIN_LOG_RATE_HZ = 1000;

/** Minimum sharp rcCommand events required before step-response analysis. */
export const MIN_RC_STEP_EVENTS = 2;

export const RC_STEP_THRESHOLD = 80;

export const FRAME_ARCHETYPES = [
  { value: "cinewhoop_23", label: '2-3" Cinewhoop' },
  { value: "freestyle_5", label: '5" Freestyle' },
  { value: "racer_5", label: '5" Racer' },
  { value: "longrange_7", label: '7" Long Range' },
];

export { REFERENCE_TUNING_PROFILES, FRAME_THRESHOLD_PROFILES } from "./reference_profiles.js";

export const CELL_COUNTS = [
  { value: "3S", label: "3S" },
  { value: "4S", label: "4S" },
  { value: "5S", label: "5S" },
  { value: "6S", label: "6S" },
  { value: "8S", label: "8S" },
];

/** Logical channel names mapped to possible blackbox field identifiers. */
export const DIAGNOSTIC_CHANNELS = {
  gyroScaled: {
    label: "GYRO_SCALED",
    candidates: (axis) => [`gyroADC[${axis}]`, `gyroUnfilt[${axis}]`],
  },
  pidSetpoint: {
    label: "PID_SETPOINT",
    candidates: (axis) => [`setpoint[${axis}]`, `axisSetpoint[${axis}]`],
  },
  motorOutput: {
    label: "MOTOR_OUTPUT",
    candidates: (motor) => [`motor[${motor}]`, `motorOutput[${motor}]`],
  },
  rcCommand: {
    label: "rcCommand",
    candidates: (axis) => [`rcCommand[${axis}]`, `rcCommands[${axis}]`],
  },
  pidI: {
    label: "PID_I",
    candidates: (axis) => [`axisI[${axis}]`],
  },
  pidF: {
    label: "PID_F",
    candidates: (axis) => [`axisF[${axis}]`],
  },
};

/** CLI keys merged from user dump to supplement binary header data. */
export const CLI_DUMP_KEYS = [
  "dshot_bidir",
  "dyn_idle_min_rpm",
  "rpm_filter_harmonics",
  "rpm_filter_q",
  "rpm_filter_min_hz",
  "gyro_lowpass_hz",
  "gyro_lowpass2_hz",
  "gyro_lpf1_static_hz",
  "gyro_lpf2_static_hz",
  "dterm_lpf1_static_hz",
  "d_min_roll",
  "d_min_pitch",
  "d_min_yaw",
  "d_max_roll",
  "d_max_pitch",
  "d_max_yaw",
  "roll_p",
  "roll_i",
  "roll_d",
  "pitch_p",
  "pitch_i",
  "pitch_d",
  "yaw_p",
  "yaw_i",
  "yaw_d",
  "motor_poles",
  "dyn_notch_count",
  "dyn_notch_q",
  "dyn_notch_min_hz",
  "dyn_lpf_min_hz",
  "dyn_lpf_max_hz",
  "feedforward_roll",
  "feedforward_pitch",
  "feedforward_yaw",
  "iterm_relax",
  "iterm_relax_cutoff",
  "simplified_pids_mode",
];

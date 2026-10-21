const MODES = Object.freeze({ CARTESIAN: 'cartesian', H_BELT_MOTORS: 'h-belt-motors' });

export const GANTRY_CALIBRATION = Object.freeze({
  mode: MODES.CARTESIAN,
  evidence: 'Current Galil/UI contract names A as Gantry X and B as Gantry Y; controller program not supplied.',
  verified: false,
  hBelt: null,
});

export function mapControllerAxes(values, calibration = GANTRY_CALIBRATION) {
  if (calibration.mode === MODES.CARTESIAN) return { ...values };
  const h = calibration.hBelt;
  if (!calibration.verified || !h || ![h.aMmPerCount, h.bMmPerCount, h.xDirection, h.yDirection].every(Number.isFinite)) {
    throw new Error('H-belt motor coordinates require verified A/B scale and direction calibration.');
  }
  const a = values.A * h.aMmPerCount;
  const b = values.B * h.bMmPerCount;
  return {
    ...values,
    A: h.xDirection * (a + b) / 2,
    B: h.yDirection * (a - b) / 2,
  };
}

export { MODES as GANTRY_MAPPING_MODES };


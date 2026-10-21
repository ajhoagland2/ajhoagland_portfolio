// Simulation timing is based on elapsed time, never on the browser's frame count.
export const DEFAULT_PARAMETERS = { speed: 1, travelSpeed: 450, rotationSpeed: 180, dwell: 120, profile: 'smooth', jog: 10, scanDistance: 90, scanSpeed: 250, scanOverhead: 1000, feederRowPitch: 11.25, feederColumns: 4, activePickColumns: 4, pickFailuresEnabled: true, pickFailureEvery: 100 };
export function segmentDuration(from, to, parameters) {
  let duration = to.step === 'grid' ? 900 : 120;
  for (const id of Object.keys(from.pose)) {
    const speed = ['D', 'F', 'H'].includes(id) ? parameters.rotationSpeed : parameters.travelSpeed;
    duration = Math.max(duration, Math.abs(to.pose[id] - from.pose[id]) / speed * 1000);
  }
  return duration + (['pick', 'place'].includes(to.step) ? parameters.dwell : 0);
}
export function sampleMotion(frames, cursor, deltaMs, parameters) {
  cursor = Math.max(0, Math.min(frames.length - 1, cursor));
  let index = Math.floor(cursor);
  let fraction = cursor - index;
  let remaining = Math.max(0, deltaMs) * parameters.speed;
  while (index < frames.length - 1) {
    const duration = segmentDuration(frames[index], frames[index + 1], parameters);
    const available = (1 - fraction) * duration;
    if (remaining < available) { fraction += remaining / duration; break; }
    remaining -= available; index += 1; fraction = 0;
  }
  const from = frames[index];
  const to = frames[Math.min(index + 1, frames.length - 1)];
  const blend = parameters.profile === 'smooth' ? fraction * fraction * fraction * (fraction * (fraction * 6 - 15) + 10) : fraction;
  return { gridProgress: from.gridLoaded ? 1 : to.gridLoaded ? blend : 0, cursor: index + fraction, frame: from, target: to, pose: Object.fromEntries(Object.keys(from.pose).map(id => [id, from.pose[id] + (to.pose[id] - from.pose[id]) * blend])), done: index === frames.length - 1 };
}
export function validateTelemetry(data, axes) {
  if (!data || typeof data !== 'object' || !data.axes || typeof data.axes !== 'object') throw new Error('Telemetry must contain an axes object.');
  return axes.map(axis => {
    if (data.axes[axis.id]?.position == null) return axis;
    const value = data.axes[axis.id].position;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < axis.min || value > axis.max) throw new Error(`Axis ${axis.id}: expected a number between ${axis.min} and ${axis.max}.`);
    return { ...axis, value };
  });
}

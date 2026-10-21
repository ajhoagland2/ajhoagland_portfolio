import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PARAMETERS, sampleMotion, validateTelemetry } from './simulation.js';
const frames = [
  { pose: { A: 0, D: 0 }, step: 'home', completed: 0 },
  { pose: { A: 300, D: 90 }, step: 'move', completed: 0 },
  { pose: { A: -100, D: -90 }, step: 'place', completed: 1 },
];
test('elapsed time produces the same pose at different frame rates', () => {
  let a = 0; let b = 0;
  for (let i = 0; i < 60; i++) a = sampleMotion(frames, a, 1000 / 60, DEFAULT_PARAMETERS).cursor;
  for (let i = 0; i < 20; i++) b = sampleMotion(frames, b, 50, DEFAULT_PARAMETERS).cursor;
  assert.ok(Math.abs(a - b) < 1e-10);
});
test('smooth interpolation remains within endpoints and finishes exactly', () => {
  for (let ms = 0; ms <= 660; ms += 10) {
    const { pose } = sampleMotion(frames, 0, ms, DEFAULT_PARAMETERS);
    assert.ok(pose.A >= 0 && pose.A <= 300);
  }
  const result = sampleMotion(frames, 0, 100000, DEFAULT_PARAMETERS);
  assert.equal(result.done, true); assert.deepEqual(result.pose, frames.at(-1).pose);
});
test('negative first frame timing cannot create a negative cursor', () => {
  assert.equal(sampleMotion(frames, 0, -5, DEFAULT_PARAMETERS).cursor, 0);
});
test('scan distance has a safe dashboard default', () => {
  assert.equal(DEFAULT_PARAMETERS.scanDistance, 90);
  assert.ok(DEFAULT_PARAMETERS.scanDistance >= 30 && DEFAULT_PARAMETERS.scanDistance <= 250);
});
test('speed multiplier changes timing and dwell holds longer', () => {
  assert.ok(sampleMotion(frames, 0, 100, {...DEFAULT_PARAMETERS, speed:2}).cursor > sampleMotion(frames, 0, 100, DEFAULT_PARAMETERS).cursor);
  assert.ok(sampleMotion(frames, 1, 200, {...DEFAULT_PARAMETERS,dwell:1000}).cursor < sampleMotion(frames, 1, 200, DEFAULT_PARAMETERS).cursor);
});
test('telemetry rejects invalid poses atomically', () => {
  const axes = [{id:'A',min:-500,max:500,value:0},{id:'B',min:-400,max:400,value:0}];
  for (const position of [NaN, Infinity, '12', 501]) assert.throws(() => validateTelemetry({axes:{A:{position}}},axes));
  assert.throws(() => validateTelemetry({axes:{A:{position:20},B:{position:900}}},axes));
  assert.equal(axes[0].value,0);
  assert.equal(validateTelemetry({axes:{A:{position:20}}},axes)[0].value,20);
});

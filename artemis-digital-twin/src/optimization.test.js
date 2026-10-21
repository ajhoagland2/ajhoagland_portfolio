import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeScanConfiguration, analyzeTimeline, buildFeederTimeline, buildScanSweep, buildSpeedSweep } from './optimization.js';
import { DEFAULT_PARAMETERS } from './simulation.js';

const timeline = {
  frames: [
    { step: 'home', pose: { A: 0, B: 0, C: 0, D: 0 } },
    { step: 'move', pose: { A: 300, B: 400, C: 0, D: 0 } },
    { step: 'pick', action: 'pick', pose: { A: 300, B: 400, C: -100, D: 0 } },
    { step: 'place', action: 'release', pose: { A: 0, B: 0, C: -100, D: 90 } },
  ],
  executionPlacements: [{ sourceIndex: 0 }],
};

function pickTimeline(count) {
  const frames = [{ step: 'home', pose: { A: 0, B: 0, C: 0, D: 0 } }];
  for (let index = 0; index < count; index += 1) frames.push(
    { step: 'move', lane: 0, head: index % 3, pose: { A: 100, B: 200, C: 0, D: 0, E: 0, F: 0, G: 0, H: 0 } },
    { step: 'pick', action: 'pick', lane: 0, head: index % 3, pose: { A: 100, B: 200, C: -10, D: 0, E: -10, F: 0, G: -10, H: 0 } },
    { step: 'pick', lane: 0, head: index % 3, pose: { A: 100, B: 200, C: 0, D: 0, E: 0, F: 0, G: 0, H: 0 } },
  );
  return { frames, executionPlacements: Array.from({ length: count }, (_, sourceIndex) => ({ sourceIndex })) };
}

test('timeline analysis uses planned poses and event counts', () => {
  const result = analyzeTimeline(timeline, DEFAULT_PARAMETERS);
  assert.equal(result.placements, 1);
  assert.equal(result.pickEvents, 1);
  assert.equal(result.placeEvents, 1);
  assert.equal(result.gantryTravelMm, 1000);
  assert.ok(result.durationMs > 0);
  assert.ok(result.secondsPerTile > 0);
});

test('higher travel speed does not increase the projected cycle time', () => {
  const sweep = buildSpeedSweep(timeline, DEFAULT_PARAMETERS, [100, 500, 1000]);
  assert.ok(sweep[0].secondsPerTile >= sweep[1].secondsPerTile);
  assert.ok(sweep[1].secondsPerTile >= sweep[2].secondsPerTile);
});

test('90 mm scan covers eight 11.25 mm rows with four pickable columns', () => {
  const result = analyzeScanConfiguration(timeline, DEFAULT_PARAMETERS, 90);
  assert.equal(result.rowsPerScan, 8);
  assert.equal(result.physicalPositions, 32);
  assert.equal(result.tilesPerScan, 32);
  assert.equal(result.pickCyclesPerScan, 11);
  assert.equal(result.scans, 1);
});

test('scan sweep retains the sawtooth capacity steps', () => {
  const below = analyzeScanConfiguration(timeline, DEFAULT_PARAMETERS, 22.49);
  const atStep = analyzeScanConfiguration(timeline, DEFAULT_PARAMETERS, 22.5);
  assert.equal(below.rowsPerScan, 1);
  assert.equal(atStep.rowsPerScan, 2);
  assert.equal(atStep.tilesPerScan, 8);
});

test('1:12 pick error adds one successful retry every twelve placements', () => {
  const repeated = pickTimeline(24);
  const result = analyzeScanConfiguration(repeated, { ...DEFAULT_PARAMETERS, pickFailureEvery: 12 }, 90);
  assert.equal(result.expectedFailures, 2);
  assert.equal(result.totalPickAttempts, 26);
  assert.ok(result.retryDurationMs > 0);
});

test('feeder candidates are consumed across columns before advancing a row', () => {
  const pickFrames = [];
  for (let index = 0; index < 5; index += 1) {
    pickFrames.push(
      { step: 'move', lane: 0, head: 0, pose: { A: 100, B: 200, C: 0 } },
      { step: 'pick', action: 'pick', lane: 0, head: 0, pose: { A: 100, B: 200, C: -10 } },
      { step: 'pick', lane: 0, head: 0, pose: { A: 100, B: 200, C: 0 } },
    );
  }
  const result = buildFeederTimeline({ frames: pickFrames, executionPlacements: [] }, { ...DEFAULT_PARAMETERS, pickFailuresEnabled: false }, 90);
  const picks = result.frames.filter(frame => frame.action === 'pick');
  assert.deepEqual(picks.slice(0, 4).map(frame => [frame.pose.A, frame.pose.B]), [[100,200],[111.25,200],[122.5,200],[133.75,200]]);
  assert.deepEqual([picks[4].pose.A, picks[4].pose.B], [100,211.25]);
});

test('disabling pick failures removes retries but preserves the configured ratio', () => {
  const repeated = pickTimeline(24);
  const result = analyzeScanConfiguration(repeated, { ...DEFAULT_PARAMETERS, pickFailuresEnabled: false, pickFailureEvery: 12 }, 90);
  assert.equal(result.failureEvery, 12);
  assert.equal(result.expectedFailures, 0);
  assert.equal(result.totalPickAttempts, 24);
  assert.equal(result.retryDurationMs, 0);
});

import { segmentDuration } from './simulation.js';

const LINEAR_AXES = new Set(['A', 'B', 'C', 'E', 'G']);

export function analyzeTimeline(timeline, parameters) {
  const frames = timeline?.frames ?? [];
  let durationMs = 0;
  let gantryTravelMm = 0;
  let pickEvents = 0;
  let placeEvents = 0;

  for (let index = 0; index < frames.length - 1; index += 1) {
    const from = frames[index];
    const to = frames[index + 1];
    durationMs += segmentDuration(from, to, { ...parameters, speed: 1 });
    gantryTravelMm += Math.hypot(
      (to.pose.A ?? 0) - (from.pose.A ?? 0),
      (to.pose.B ?? 0) - (from.pose.B ?? 0),
    );
    if (to.action === 'pick') pickEvents += 1;
    if (to.action === 'release') placeEvents += 1;
  }

  const placements = timeline?.executionPlacements?.length ?? placeEvents;
  const linearTravelMm = frames.slice(1).reduce((sum, frame, index) => {
    const previous = frames[index];
    return sum + Object.keys(frame.pose).reduce((axisSum, axis) => (
      LINEAR_AXES.has(axis) ? axisSum + Math.abs((frame.pose[axis] ?? 0) - (previous.pose[axis] ?? 0)) : axisSum
    ), 0);
  }, 0);

  return {
    durationMs,
    placements,
    pickEvents,
    placeEvents,
    gantryTravelMm,
    linearTravelMm,
    secondsPerTile: placements ? durationMs / 1000 / placements : 0,
    placementsPerHour: durationMs ? placements * 3_600_000 / durationMs : 0,
  };
}

export function buildFeederTimeline(timeline, parameters, scanDistance = parameters.scanDistance) {
  const rowsPerScan = Math.max(1, Math.floor(scanDistance / parameters.feederRowPitch));
  const capacity = rowsPerScan * parameters.feederColumns;
  const states = new Map();
  const frames = (timeline?.frames ?? []).map(frame => ({ ...frame, pose: { ...frame.pose } }));
  let scheduledPicks = 0;
  let expectedFailures = 0;
  let retryDurationMs = 0;

  const nextCandidate = lane => {
    const state = states.get(lane) ?? { consumed: 0, scans: 0 };
    if (state.consumed % capacity === 0) state.scans += 1;
    const slot = state.consumed % capacity;
    state.consumed += 1;
    states.set(lane, state);
    return {
      row: Math.floor(slot / parameters.feederColumns),
      column: slot % parameters.feederColumns,
    };
  };

  frames.forEach((frame, index) => {
    if (frame.action !== 'pick') return;
    scheduledPicks += 1;
    const lane = frame.lane ?? 0;
    let failedCandidate = null;
    if (parameters.pickFailuresEnabled && scheduledPicks % Math.max(1, Math.round(parameters.pickFailureEvery)) === 0) {
      failedCandidate = nextCandidate(lane);
      expectedFailures += 1;
    }
    const candidate = nextCandidate(lane);
    const offsetA = candidate.column * parameters.feederRowPitch;
    const offsetB = candidate.row * parameters.feederRowPitch;
    for (const frameIndex of [index - 1, index, index + 1]) {
      const related = frames[frameIndex];
      if (related?.lane === lane && related?.head === frame.head) {
        related.pose.A += offsetA;
        related.pose.B += offsetB;
      }
    }
    if (failedCandidate) {
      const deltaA = (candidate.column - failedCandidate.column) * parameters.feederRowPitch;
      const deltaB = (candidate.row - failedCandidate.row) * parameters.feederRowPitch;
      const zAxis = ['C', 'E', 'G'][frame.head] ?? 'C';
      const zTravel = Math.abs((frame.pose[zAxis] ?? 0) - (frames[index - 1]?.pose[zAxis] ?? 0)) * 2;
      retryDurationMs += Math.hypot(deltaA, deltaB) / parameters.travelSpeed * 1000
        + zTravel / parameters.travelSpeed * 1000 + parameters.dwell;
    }
  });

  return {
    ...timeline,
    frames,
    rowsPerScan,
    capacity,
    expectedFailures,
    retryDurationMs,
    scans: Array.from(states.values()).reduce((total, state) => total + state.scans, 0),
    consumedCandidates: Array.from(states.values()).reduce((total, state) => total + state.consumed, 0),
  };
}

export function buildSpeedSweep(timeline, parameters, speeds = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]) {
  return speeds.map(travelSpeed => ({
    travelSpeed,
    ...analyzeTimeline(timeline, { ...parameters, travelSpeed }),
  }));
}

export function analyzeScanConfiguration(timeline, parameters, scanDistance = parameters.scanDistance) {
  const feederTimeline = buildFeederTimeline(timeline, parameters, scanDistance);
  const motion = analyzeTimeline(feederTimeline, parameters);
  const pitch = Math.max(1, parameters.feederRowPitch);
  const rowsPerScan = Math.max(1, Math.floor(scanDistance / pitch));
  const physicalPositions = rowsPerScan * parameters.feederColumns;
  const tilesPerScan = physicalPositions;
  const scans = feederTimeline.scans;
  const scanCycleMs = scanDistance / Math.max(1, parameters.scanSpeed) * 1000 + parameters.scanOverhead;
  const failureEvery = Math.max(1, Math.round(parameters.pickFailureEvery));
  const expectedFailures = feederTimeline.expectedFailures;
  const retryDurationMs = feederTimeline.retryDurationMs;
  const durationMs = motion.durationMs + retryDurationMs + scans * scanCycleMs;
  return {
    ...motion,
    durationMs,
    scanDistance,
    rowsPerScan,
    physicalPositions,
    tilesPerScan,
    pickCyclesPerScan: Math.ceil(tilesPerScan / 3),
    scans,
    scanCycleMs,
    failureEvery,
    pickFailuresEnabled: parameters.pickFailuresEnabled,
    expectedFailures,
    totalPickAttempts: feederTimeline.consumedCandidates,
    retryDurationMs,
    firstPassSuccessRate: failureEvery / (failureEvery + 1),
    secondsPerTile: motion.placements ? durationMs / 1000 / motion.placements : 0,
    placementsPerHour: durationMs ? motion.placements * 3_600_000 / durationMs : 0,
  };
}

export function buildScanSweep(timeline, parameters, minimum = 30, maximum = 250, step = 2) {
  const points = [];
  for (let scanDistance = minimum; scanDistance <= maximum; scanDistance += step) {
    points.push(analyzeScanConfiguration(timeline, parameters, scanDistance));
  }
  return points;
}

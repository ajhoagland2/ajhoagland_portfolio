const HOME = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0, H: 0 };
const HEAD_AXES = [['C', 'D'], ['E', 'F'], ['G', 'H']];

function planBatches(placements, headCount) {
  const queues = Array.from({ length: 14 }, (_, lane) => placements.filter(placement => placement.lane === lane));
  const batches = [];
  while (queues.some(queue => queue.length)) {
    for (const queue of queues) if (queue.length) batches.push(queue.splice(0, headCount));
  }
  return batches;
}

export function createBuildTimeline(run, calibration = null) {
  const home = { ...HOME, ...calibration?.homePose };
  const frames = [{ step: 'home', pose: home, completed: 0, gridLoaded: false }];
  const executionPlacements = [];
  let completed = 0;
  frames.push({ step: 'grid', pose: home, completed, gridLoaded: true });
  for (const batch of planBatches(run.placements, calibration?.headCount ?? 3)) {
    // Each tool has its own offset. Align, lower, and retract it before moving
    // the common gantry to the next pickup or placement.
    batch.forEach((placement, head) => {
      const [zAxis] = HEAD_AXES[head];
      const contact = calibration?.lanePose(placement.lane, head) ?? { A: -400 + placement.lane / 13 * 800, B: -180, [zAxis]: -112 };
      const approach = { ...home, A: contact.A, B: contact.B };
      frames.push({ step: 'move', pose: approach, completed, gridLoaded: true, lane: placement.lane, head });
      frames.push({ step: 'pick', action: 'pick', pose: { ...approach, [zAxis]: contact[zAxis] }, completed, gridLoaded: true, lane: placement.lane, head });
      frames.push({ step: 'pick', pose: approach, completed, gridLoaded: true, lane: placement.lane, head });
    });
    batch.forEach((placement, head) => {
      const [zAxis, thetaAxis] = HEAD_AXES[head];
      const contact = calibration?.placementPose(placement, head) ?? { A: -150 + placement.x, B: -150 + placement.y, [zAxis]: -96 };
      const approach = { ...home, A: contact.A, B: contact.B, [thetaAxis]: placement.theta };
      frames.push({ step: 'move', pose: approach, completed, gridLoaded: true, placement, head });
      executionPlacements.push(placement); completed += 1;
      frames.push({ step: 'place', action: 'release', pose: { ...approach, [zAxis]: contact[zAxis] }, completed, gridLoaded: true, placement, head });
      frames.push({ step: 'place', pose: approach, completed, gridLoaded: true, placement, head });
    });
  }
  frames.push({ step: 'home', pose: home, completed, gridLoaded: true });
  return { frames, executionPlacements };
}

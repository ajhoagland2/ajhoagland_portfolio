import * as THREE from 'three';

// Stable occurrence paths in the Onshape dev_01 export. The two 244-PNP-NC-02
// kits are mounted at opposite ends of the gantry's Y (GLB Z) rail.
const ROOT = 'MPk5wBdC/IqCy+i0f';
const FRAME = 'MXvcE1jRM5w/KK4Nt';
const GANTRY = 'Mqu51KlPUKKejKIwn';
const BRIDGE = 'MvRXL5QNBFrHOls3h';
const SENSOR_IDS = ['MK5pwAOp5yvkOmdBv', 'MjQ20XZYsIgROHbWd'];
const GUIDE_BLOCK = 'M+WxG17/hrTDHG4XU';
const X_STROKE_MM = 1265;
const Y_STROKE_MM = 950;

function occurrence(root, path) {
  let found;
  root.traverse(node => {
    const id = (node.userData?.PTC_onshape_metadata ?? node.userData?.gltfExtensions?.PTC_onshape_metadata)?.id;
    if (Array.isArray(id) && id.length === path.length && id.every((part, index) => part === path[index])) found = node;
  });
  if (!found) throw new Error(`Missing gantry CAD occurrence: ${path.at(-1)}`);
  return found;
}

function center(node) {
  return new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3());
}

export function deriveCadGantryTravel(kinematics) {
  const root = kinematics.root;
  root.updateWorldMatrix(true, true);
  const gantryPath = [ROOT, FRAME, GANTRY];
  const bridge = occurrence(root, [...gantryPath, BRIDGE]);
  const guide = occurrence(root, [...gantryPath, BRIDGE, GUIDE_BLOCK]);
  const sensors = SENSOR_IDS.map(id => center(occurrence(root, [...gantryPath, id])).z).sort((a, b) => a - b);
  const bridgeCenter = center(bridge);
  const guideCenter = center(guide);
  const mm = 1 / kinematics.millimetresToGlb;
  const sensorMidpoint = (sensors[0] + sensors[1]) / 2;
  // Stroke is given by the MGS-HBG-25-950-1265-X CAD part number. Center the
  // nominal stroke between the modeled sensor kits; their contact offsets are
  // not encoded in this GLB, so this is a conservative CAD envelope.
  const yCenter = Math.round((sensorMidpoint - bridgeCenter.z) * mm * 10) / 10;
  const xCenter = Math.round((bridgeCenter.x - guideCenter.x) * mm * 10) / 10;
  return {
    A: [xCenter - X_STROKE_MM / 2, xCenter + X_STROKE_MM / 2],
    B: [yCenter - Y_STROKE_MM / 2, yCenter + Y_STROKE_MM / 2],
    sensorZMm: sensors.map(value => value * mm),
    source: 'Onshape sensor locations and gantry nominal strokes',
  };
}

export function firstTravelViolation(frames, limits) {
  for (const frame of frames) {
    for (const axis of ['A', 'B']) {
      const value = frame.pose[axis];
      if (value < limits[axis][0] - 1e-6 || value > limits[axis][1] + 1e-6) {
        return `Planned ${frame.step} pose exceeds CAD ${axis} travel (${value.toFixed(1)} mm; ${limits[axis].map(n => n.toFixed(1)).join(' to ')} mm).`;
      }
    }
  }
  return null;
}

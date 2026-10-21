import * as THREE from 'three';
import { CONTROLLER_AXIS_TARGETS, KINEMATIC_MANIFEST } from './kinematicManifest.js';
import { mapControllerAxes } from './controllerMapping.js';

const metadataPath = (node) => (
  node.userData?.PTC_onshape_metadata
  ?? node.userData?.gltfExtensions?.PTC_onshape_metadata
)?.id;
const pathKey = (path) => path.join('\u001f');

function indexInstances(root) {
  const index = new Map();
  root.traverse((node) => {
    const path = metadataPath(node);
    if (!Array.isArray(path)) return;
    const key = pathKey(path);
    if (index.has(key)) throw new Error(`Duplicate Onshape instance path: ${path.join(' / ')}`);
    index.set(key, node);
  });
  return index;
}

function findOccurrence(root, occurrenceName) {
  const expected = occurrenceName.toLowerCase();
  let match = null;
  root.traverse((node) => {
    const metadata = node.userData?.PTC_onshape_metadata ?? node.userData?.gltfExtensions?.PTC_onshape_metadata;
    const names = [node.name, metadata?.name, metadata?.partName].filter(Boolean);
    if (!match && names.some((name) => name.toLowerCase().includes(expected))) match = node;
  });
  return match;
}

function createHalfInchGrid(modelRoot, reference, millimetresToGlb) {
  const bounds = new THREE.Box3().setFromObject(reference);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const pitch = 12.7 * millimetresToGlb;
  const railWidth = Math.min(pitch * 0.12, 0.0018);
  const railHeight = Math.max(size.y * 0.12, 0.0015);
  const material = new THREE.MeshStandardMaterial({ color: 0x72909e, metalness: 0.36, roughness: 0.5 });
  const group = new THREE.Group();
  group.name = '.5VG-Artemis (procedural fallback)';
  const addRails = (span, crossSpan, alongX) => {
    const count = Math.floor(span / pitch);
    for (let index = 0; index <= count; index += 1) {
      const offset = -count * pitch / 2 + index * pitch;
      const geometry = new THREE.BoxGeometry(alongX ? railWidth : crossSpan, railHeight, alongX ? crossSpan : railWidth);
      const rail = new THREE.Mesh(geometry, material);
      rail.position.set(alongX ? offset : 0, 0, alongX ? 0 : offset);
      rail.receiveShadow = true;
      group.add(rail);
    }
  };
  addRails(size.x, size.z, true);
  addRails(size.z, size.x, false);
  group.position.copy(modelRoot.worldToLocal(new THREE.Vector3(center.x, bounds.max.y + railHeight / 2, center.z)));
  return group;
}

// Locate a contact face from CAD vertices, not the center of its assembly box.
function lowerFaceCenter(node) {
  node.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(node);
  const face = new THREE.Box3(); const point = new THREE.Vector3();
  node.traverse(mesh => {
    const position = mesh.geometry?.attributes?.position;
    if (!position) return;
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      if (point.y <= bounds.min.y + .001) face.expandByPoint(point);
    }
  });
  const center = face.isEmpty() ? bounds.getCenter(new THREE.Vector3()) : face.getCenter(new THREE.Vector3());
  center.y = bounds.min.y;
  return center;
}

function resolveGeometry(entry, instances) {
  if (Array.isArray(entry)) return [instances.get(pathKey(entry))].filter(Boolean);
  const parent = instances.get(pathKey(entry.movingChildrenOf));
  if (!parent) return [];
  const fixedIds = new Set(entry.fixedChildIds);
  const presentIds = new Set(parent.children.map((child) => metadataPath(child)?.at(-1)).filter(Boolean));
  for (const id of fixedIds) {
    if (!presentIds.has(id)) throw new Error(`Fixed rail instance ${id} is missing from ${parent.name}.`);
  }
  return parent.children.filter((child) => {
    const path = metadataPath(child);
    return Array.isArray(path) && !fixedIds.has(path.at(-1));
  });
}

function connectorAxis(record) {
  const basis = new THREE.Matrix3().set(
    record.x[0], record.y[0], record.z[0],
    record.x[1], record.y[1], record.z[1],
    record.x[2], record.y[2], record.z[2],
  );
  const determinant = basis.determinant();
  if (Math.abs(determinant - 1) > 1e-5) throw new Error('Mate connector basis is not right-handed and orthonormal.');
  // Controller travel is the connector's local +X coordinate. Multiplying by
  // the complete basis makes the controller-to-GLB transform explicit.
  return new THREE.Vector3(1, 0, 0).applyMatrix3(basis);
}

function makeNumberLabel(value) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  context.fillStyle = 'rgba(8, 28, 40, 0.92)';
  context.beginPath();
  context.arc(64, 64, 48, 0, Math.PI * 2);
  context.fill();
  context.lineWidth = 6;
  context.strokeStyle = '#2bc8ed';
  context.stroke();
  context.fillStyle = '#ffffff';
  context.font = '700 50px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(String(value), 64, 67);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  label.name = `hopper-label:${value}`;
  label.scale.set(0.09, 0.09, 1);
  label.renderOrder = 100;
  return label;
}

export function buildKinematicGraph(modelRoot, manifest = KINEMATIC_MANIFEST, gridConfiguration = 'half-vg-artemis', { labels = true } = {}) {
  const instances = indexInstances(modelRoot);
  const pivots = {};
  const claimed = new Set();

  for (const path of manifest.hidden ?? []) {
    const node = instances.get(pathKey(path));
    if (!node) throw new Error(`Hidden Onshape instance is missing: ${path.join(' / ')}`);
    node.visible = false;
  }

  for (const [name, group] of Object.entries(manifest.groups)) {
    if (group.parent && !pivots[group.parent]) throw new Error(`${name} has missing parent joint ${group.parent}.`);
    const pivot = new THREE.Group();
    pivot.name = `joint:${name}`;
    (group.parent ? pivots[group.parent] : modelRoot).add(pivot);
    pivots[name] = pivot;
  }

  for (const definition of Object.values(manifest.tools ?? {})) {
    const cup = instances.get(pathKey(definition.cup));
    if (!cup) throw new Error(`Missing CAD pickup tool ${definition.cup.join('/')}`);
    const pivot = pivots[definition.zGroup];
    pivot.position.copy(pivot.parent.worldToLocal(lowerFaceCenter(cup)));
  }

  // Attach deepest groups first: Object3D.attach preserves each imported world matrix.
  for (const [name, group] of Object.entries(manifest.groups).reverse()) {
    for (const entry of group.geometry) {
      const nodes = resolveGeometry(entry, instances);
      if (nodes.length === 0) {
        const path = Array.isArray(entry) ? entry : entry.movingChildrenOf;
        throw new Error(`${name} is missing Onshape geometry at ${path.join(' / ')}.`);
      }
      for (const node of nodes) {
        if (claimed.has(node)) throw new Error(`${node.name} is assigned to more than one motion group.`);
        pivots[name].attach(node);
        claimed.add(node);
      }
    }
  }

  const process = {};
  const gridConfig = manifest.process?.conveyorGrid;
  if (gridConfig) {
    const selectedGrid = gridConfig.configurations?.[gridConfiguration];
    const inactiveGrid = instances.get(pathKey(gridConfig.geometry));
    let grid = selectedGrid?.geometry ? instances.get(pathKey(selectedGrid.geometry)) : null;
    if (!grid && selectedGrid?.occurrenceName) grid = findOccurrence(modelRoot, selectedGrid.occurrenceName);
    let source = 'onshape';
    if (!grid && gridConfiguration === 'half-vg-artemis' && inactiveGrid) {
      grid = createHalfInchGrid(modelRoot, inactiveGrid, manifest.source.millimetresToGlb);
      modelRoot.add(grid);
      source = 'procedural';
    }
    if (!grid) throw new Error('The .5VG CAD grid is missing from the Onshape export.');
    if (grid !== inactiveGrid && inactiveGrid) inactiveGrid.visible = false;
    const clamps = gridConfig.between.map((path) => instances.get(pathKey(path)));
    if (!grid || clamps.some((node) => !node)) throw new Error('Conveyor grid or clamp target is missing from the Onshape export.');
    const pivot = new THREE.Group();
    pivot.name = 'process:conveyorGrid';
    modelRoot.add(pivot);
    pivot.attach(grid);
    modelRoot.updateWorldMatrix(true, true);
    const gridCenter = new THREE.Box3().setFromObject(grid).getCenter(new THREE.Vector3());
    const target = clamps.reduce((sum, clamp) => sum.add(
      new THREE.Box3().setFromObject(clamp).getCenter(new THREE.Vector3()),
    ), new THREE.Vector3()).multiplyScalar(0.5);
    const localGridCenter = modelRoot.worldToLocal(gridCenter.clone());
    const localTarget = modelRoot.worldToLocal(target.clone());
    const travel = localTarget.sub(localGridCenter);
    const components = ['x', 'y', 'z'];
    const conveyorAxis = components.reduce((best, key) => (
      Math.abs(travel[key]) > Math.abs(travel[best]) ? key : best
    ));
    travel.set(
      conveyorAxis === 'x' ? travel.x : 0,
      conveyorAxis === 'y' ? travel.y : 0,
      conveyorAxis === 'z' ? travel.z : 0,
    );
    const targetPosition = pivot.position.clone().add(travel);
    const entryDistance = Math.max(Math.abs(travel[conveyorAxis]), gridConfig.minimumEntryDistance);
    const entryOffset = new THREE.Vector3();
    entryOffset[conveyorAxis] = gridConfig.topViewEntryDirection * entryDistance;
    process.conveyorGrid = {
      pivot,
      geometry: grid,
      homePosition: targetPosition.clone().add(entryOffset),
      targetPosition,
      configuration: gridConfiguration,
      source,
    };
    // Capture the bare tooling surface before simulated tiles or draw batching
    // can change its bounds. Both placement and inverse kinematics use it.
    const surfaceBounds = new THREE.Box3().setFromObject(grid);
    const surface = surfaceBounds.getCenter(new THREE.Vector3()); surface.y = surfaceBounds.max.y;
    const localSurface = grid.worldToLocal(surface.clone());
    process.conveyorGrid.surface = {
      origin: localSurface,
      x: grid.worldToLocal(surface.clone().add(new THREE.Vector3(.001, 0, 0))).sub(localSurface),
      y: grid.worldToLocal(surface.clone().add(new THREE.Vector3(0, 0, .001))).sub(localSurface),
      up: grid.worldToLocal(surface.clone().add(new THREE.Vector3(0, .001, 0))).sub(localSurface),
    };
    pivot.position.copy(process.conveyorGrid.homePosition);
  }

  const annotations = {};
  const hopperConfig = manifest.annotations?.hoppers;
  if (hopperConfig) {
    const hoppers = hopperConfig.paths.map((path) => instances.get(pathKey(path)));
    if (hoppers.some((node) => !node)) throw new Error('A hopper annotation instance is missing from the Onshape export.');
    modelRoot.updateWorldMatrix(true, true);
    const axis = hopperConfig.topViewRightAxis;
    const ordered = hoppers.map((node) => ({
      node,
      center: new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3()),
    })).sort((a, b) => b.center[axis] - a.center[axis]);
    // Hoppers replenish the vibratory feeders; the pickup plane is at their
    // discharge end, not on the hopper underside (which lies beyond Y travel).
    const feeders = [];
    modelRoot.traverse(node => {
      if (node.name.startsWith('VibeFeederAssembly-2_<') && node.children.length) feeders.push(node);
    });
    if (feeders.length !== 7) throw new Error('Expected seven CAD vibratory feeder outlets for fourteen lanes.');
    annotations.hopperTargets = ordered.map(({ node, center }) => {
      const feeder = feeders.reduce((nearest, candidate) => (
        Math.abs(new THREE.Box3().setFromObject(candidate).getCenter(new THREE.Vector3()).x - center.x)
          < Math.abs(new THREE.Box3().setFromObject(nearest).getCenter(new THREE.Vector3()).x - center.x)
          ? candidate : nearest
      ));
      const bounds = new THREE.Box3().setFromObject(feeder);
      return { node, center: new THREE.Vector3(center.x, bounds.max.y, bounds.max.z - .02) };
    });
    annotations.hoppers = labels ? ordered.map(({ center }, index) => {
      const label = makeNumberLabel(index);
      center.y += 0.09;
      label.position.copy(modelRoot.worldToLocal(center));
      modelRoot.add(label);
      return label;
    }) : [];
  }

  const joints = Object.fromEntries(Object.entries(manifest.groups)
    .filter(([, group]) => group.axis)
    .map(([name, group]) => {
      const connector = manifest.connectors[group.connector];
      if (!connector) throw new Error(`${name} is missing mate connector ${group.connector}.`);
      return [group.axis, {
        name,
        pivot: pivots[name],
        type: group.type,
        axis: connectorAxis(connector),
        limits: group.limits,
        homePosition: pivots[name].position.clone(),
        homeQuaternion: pivots[name].quaternion.clone(),
      }];
    }));

  if (Object.keys(joints).length !== 8) throw new Error('Kinematic manifest must define exactly eight joints.');
  for (const [axis, target] of Object.entries(CONTROLLER_AXIS_TARGETS)) {
    if (joints[axis]?.name !== target) {
      throw new Error(`Controller axis ${axis} must target only ${target}.`);
    }
  }
  const tools = {};
  for (const [name, group] of Object.entries(manifest.groups).filter(([name]) => manifest.tools?.[name])) {
    const tcp = new THREE.Group();
    tcp.name = `tcp:${name}`;
    pivots[name].add(tcp);
    tools[name] = tcp;
  }
  return { root: modelRoot, pivots, joints, tools, process, annotations, attachments: new Map(), millimetresToGlb: manifest.source.millimetresToGlb };
}

export function driveJoint(joint, value, millimetresToGlb) {
  if (joint.type === 'translation') {
    joint.pivot.position.copy(joint.homePosition).addScaledVector(joint.axis, value * millimetresToGlb);
    return;
  }
  joint.pivot.quaternion.copy(joint.homeQuaternion).multiply(
    new THREE.Quaternion().setFromAxisAngle(joint.axis, THREE.MathUtils.degToRad(value)),
  );
}

export function driveControllerAxes(kinematics, values) {
  const mapped = mapControllerAxes(values);
  for (const axis of Object.keys(CONTROLLER_AXIS_TARGETS)) {
    const joint = kinematics.joints[axis];
    if (mapped[axis] < joint.limits[0] || mapped[axis] > joint.limits[1]) {
      throw new Error(`Axis ${axis} is outside its Onshape joint limits.`);
    }
    driveJoint(joint, mapped[axis], kinematics.millimetresToGlb);
  }
}

export function driveConveyorGrid(kinematics, progress) {
  const grid = kinematics.process.conveyorGrid;
  if (!grid) return;
  grid.pivot.position.lerpVectors(grid.homePosition, grid.targetPosition, THREE.MathUtils.clamp(progress, 0, 1));
}

export function placementWorldPoint(kinematics, run, placement, heightMm = 1.5) {
  const grid = kinematics.process.conveyorGrid;
  const extent = (run.tilesPerRow - 1) * run.tileSpacing;
  const point = grid.surface.origin.clone()
    .addScaledVector(grid.surface.x, placement.x - extent / 2)
    .addScaledVector(grid.surface.y, placement.y - extent / 2)
    .addScaledVector(grid.surface.up, heightMm);
  return grid.geometry.localToWorld(point);
}

export function createMosaicTiles(kinematics, placements, run) {
  const conveyor = kinematics.process.conveyorGrid;
  if (!conveyor) return [];
  kinematics.root.updateWorldMatrix(true, true);
  const width = Math.min(run.tileSize, run.tileSpacing * .95) * kinematics.millimetresToGlb;
  const geometry = new THREE.BoxGeometry(width, .003, width);
  return placements.map((placement, index) => {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: placement.color, roughness: .46 }));
    mesh.name = `simulated-placement:${placement.sourceIndex}`;
    kinematics.root.add(mesh);
    mesh.position.copy(kinematics.root.worldToLocal(placementWorldPoint(kinematics, run, placement)));
    conveyor.geometry.attach(mesh);
    mesh.visible = false; mesh.userData.executionIndex = index;
    return mesh;
  });
}

function jointWorldAxis(joint) {
  joint.pivot.parent.updateWorldMatrix(true, false);
  return joint.axis.clone().transformDirection(joint.pivot.parent.matrixWorld).normalize();
}

export function deriveBuildCalibration(kinematics, run) {
  const conveyor = kinematics.process.conveyorGrid;
  const toolNames = Object.keys(kinematics.tools);
  if (!conveyor || !toolNames.length || !kinematics.annotations.hopperTargets) return null;
  const root = kinematics.root;
  const savedGrid = conveyor.pivot.position.clone();
  conveyor.pivot.position.copy(conveyor.targetPosition);
  root.updateWorldMatrix(true, true);
  const laneTargets = kinematics.annotations.hopperTargets.map(({ center }) => center.clone().add(new THREE.Vector3(0, .003, 0)));
  const placementTargets = run.placements.map(p => placementWorldPoint(kinematics, run, p, 3));
  const targets = [...laneTargets, ...placementTargets];
  const scale = kinematics.millimetresToGlb;
  const axisA = jointWorldAxis(kinematics.joints.A);
  const axisB = jointWorldAxis(kinematics.joints.B);
  // Use a centered simulation datum rather than treating the exported carriage
  // pose as controller zero. It is stable for this loaded model/configuration.
  if (!kinematics.calibratedDatum) {
    const tips = toolNames.map(name => kinematics.tools[name].getWorldPosition(new THREE.Vector3()));
    for (const [id, direction] of [['A', axisA], ['B', axisB]]) {
      const distances = targets.flatMap(target => tips.map(tip => target.clone().sub(tip).dot(direction)));
      const shift = (Math.min(...distances) + Math.max(...distances)) / 2;
      const joint = kinematics.joints[id];
      joint.homePosition.addScaledVector(joint.axis, shift);
      driveJoint(joint, 0, scale);
    }
    const clearanceY = Math.max(...targets.map(target => target.y)) + .04;
    toolNames.forEach((name, head) => {
      const joint = kinematics.joints[['C', 'E', 'G'][head]];
      const tip = kinematics.tools[name].getWorldPosition(new THREE.Vector3());
      joint.homePosition.addScaledVector(joint.axis, clearanceY - tip.y);
      driveJoint(joint, 0, scale);
    });
    kinematics.calibratedDatum = true;
  }
  root.updateWorldMatrix(true, true);
  const tips = toolNames.map(name => kinematics.tools[name].getWorldPosition(new THREE.Vector3()));
  const solve = (target, head) => {
    const zId = ['C', 'E', 'G'][head];
    const zAxis = jointWorldAxis(kinematics.joints[zId]);
    const basis = new THREE.Matrix3().set(axisA.x, axisB.x, zAxis.x, axisA.y, axisB.y, zAxis.y, axisA.z, axisB.z, zAxis.z);
    if (Math.abs(basis.determinant()) < 1e-8) throw new Error('Tool motion axes do not span the work space.');
    const coordinates = target.clone().sub(tips[head]).applyMatrix3(basis.invert()).multiplyScalar(1 / scale);
    const pose = { A: coordinates.x, B: coordinates.y, [zId]: coordinates.z };
    for (const [id, value] of Object.entries(pose)) {
      const [min, max] = kinematics.joints[id].limits;
      if (value < min - 1e-6 || value > max + 1e-6) throw new Error(`Tool ${head + 1} target exceeds axis ${id} travel (${value.toFixed(1)} mm).`);
    }
    return pose;
  };
  const lanePose = (lane, head = 0) => solve(laneTargets[lane], head);
  const placementPose = (placement, head = 0) => solve(placementWorldPointAtDock(placement), head);
  // Freeze the dock transform so this function never samples an in-transit grid.
  const dockMatrix = conveyor.geometry.matrixWorld.clone();
  const placementWorldPointAtDock = placement => {
    const extent = (run.tilesPerRow - 1) * run.tileSpacing;
    return conveyor.surface.origin.clone().addScaledVector(conveyor.surface.x, placement.x - extent / 2)
      .addScaledVector(conveyor.surface.y, placement.y - extent / 2).addScaledVector(conveyor.surface.up, 3).applyMatrix4(dockMatrix);
  };
  // Fail before playback starts, rather than silently clamping a missed target.
  for (let head = 0; head < toolNames.length; head++) {
    laneTargets.forEach((_, lane) => lanePose(lane, head));
    run.placements.forEach(placement => placementPose(placement, head));
  }
  conveyor.pivot.position.copy(savedGrid); root.updateWorldMatrix(true, true);
  return { headCount: toolNames.length, lanePose, placementPose, laneTargets, placementTarget: placementWorldPointAtDock };
}

export function pickWorkpiece(kinematics, workpiece, spindleName) {
  const tcp = kinematics.tools[spindleName];
  if (!tcp) throw new Error(`Unknown spindle TCP ${spindleName}.`);
  tcp.attach(workpiece);
  kinematics.attachments.set(workpiece, workpiece.matrix.clone());
}

export function placeWorkpiece(kinematics, workpiece) {
  kinematics.root.attach(workpiece);
  kinematics.attachments.delete(workpiece);
}

export function createMechanicalValidator(kinematics) {
  kinematics.root.updateWorldMatrix(true, true);
  const staticMatrices = [];
  kinematics.root.traverse((node) => {
    if (!metadataPath(node)) return;
    let parent = node.parent;
    let belongsToMovingJoint = false;
    while (parent && parent !== kinematics.root) {
      if ((parent.name.startsWith('joint:') && parent.name !== 'joint:static') || parent.name.startsWith('process:')) belongsToMovingJoint = true;
      parent = parent.parent;
    }
    if (!belongsToMovingJoint) staticMatrices.push([node, node.matrixWorld.clone()]);
  });
  const railHomes = Object.values(kinematics.joints).filter((joint) => joint.type === 'translation')
    .map((joint) => [joint, joint.homePosition.clone()]);
  return () => {
    kinematics.root.updateWorldMatrix(true, true);
    for (const [node, matrix] of staticMatrices) {
      if (!node.matrixWorld.equals(matrix)) throw new Error(`Static node moved: ${node.name}`);
    }
    for (const [joint, home] of railHomes) {
      const displacement = joint.pivot.position.clone().sub(home);
      const offAxis = displacement.clone().sub(joint.axis.clone().multiplyScalar(displacement.dot(joint.axis)));
      if (offAxis.lengthSq() > 1e-12) throw new Error(`${joint.name} left its rail axis.`);
    }
    for (const [object, relativeMatrix] of kinematics.attachments) {
      if (!object.matrix.equals(relativeMatrix)) throw new Error(`${object.name} moved relative to its tool.`);
    }
  };
}

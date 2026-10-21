import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Repeated CAD fasteners and extrusions share draw calls, while each joint keeps
// its own transform. Original occurrence nodes remain intact for validation.
export function instanceRepeatedParts(root, kinematics) {
  root.updateWorldMatrix(true, true);
  const anchors = new Set(Object.values(kinematics.joints).map(joint => joint.pivot));
  if (kinematics.process.conveyorGrid) anchors.add(kinematics.process.conveyorGrid.pivot);
  const buckets = new Map();
  const hiddenMaterial = new THREE.MeshBasicMaterial({ visible: false });
  root.traverseVisible(node => {
    if (!node.isMesh || Array.isArray(node.material) || node.name.startsWith('simulated-placement') || node.name === 'simulated-workpiece') return;
    let anchor = node.parent;
    while (anchor && anchor !== root && !anchors.has(anchor)) anchor = anchor.parent;
    anchor ??= root;
    const key = `${anchor.uuid}:${node.geometry.uuid}:${node.material.uuid}`;
    if (!buckets.has(key)) buckets.set(key, { anchor, nodes: [] });
    buckets.get(key).nodes.push(node);
  });
  let saved = 0;
  for (const { anchor, nodes } of buckets.values()) {
    if (nodes.length < 2) continue;
    const instance = new THREE.InstancedMesh(nodes[0].geometry, nodes[0].material, nodes.length);
    instance.name = 'optimized-cad-parts';
    const inverse = anchor.matrixWorld.clone().invert();
    nodes.forEach((node, i) => { instance.setMatrixAt(i, new THREE.Matrix4().multiplyMatrices(inverse, node.matrixWorld)); node.material = hiddenMaterial; });
    instance.instanceMatrix.needsUpdate = true;
    instance.computeBoundingSphere();
    anchor.add(instance); saved += nodes.length - 1;
  }
  const uniqueBuckets = new Map();
  for (const { anchor, nodes } of buckets.values()) {
    if (nodes.length !== 1) continue;
    const node = nodes[0];
    const signature = Object.keys(node.geometry.attributes).sort().map(name => `${name}:${node.geometry.attributes[name].itemSize}`).join(',');
    const key = `${anchor.uuid}:${node.material.uuid}:${!!node.geometry.index}:${signature}`;
    if (!uniqueBuckets.has(key)) uniqueBuckets.set(key, { anchor, nodes: [] });
    uniqueBuckets.get(key).nodes.push(node);
  }
  for (const { anchor, nodes } of uniqueBuckets.values()) {
    if (nodes.length < 2) continue;
    const inverse = anchor.matrixWorld.clone().invert();
    const geometries = nodes.map(node => node.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, node.matrixWorld)));
    const geometry = mergeGeometries(geometries, false);
    geometries.forEach(g => g.dispose());
    if (!geometry) continue;
    const mesh = new THREE.Mesh(geometry, nodes[0].material);
    mesh.name = 'optimized-cad-surfaces';
    anchor.add(mesh); nodes.forEach(node => { node.material = hiddenMaterial; });
    saved += nodes.length - 1;
  }
  return saved;
}

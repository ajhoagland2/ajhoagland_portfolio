import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildKinematicGraph, deriveBuildCalibration, driveControllerAxes, driveConveyorGrid, createMosaicTiles, placementWorldPoint } from './kinematics.js';
import { instanceRepeatedParts } from './cadRendering.js';
import { createBuildTimeline } from './buildRun.js';
import { deriveCadGantryTravel, firstTravelViolation } from './cadTravel.js';
async function loadModel(file) {
  const compressed = await Promise.all(['00', '01', '02', '03', '04'].map(
    suffix => readFile(new URL(`../artemis-model.glb.gz.part-${suffix}`, import.meta.url)),
  ));
  const bytes = gunzipSync(Buffer.concat(compressed));
  return (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
}
const zero = { A:0,B:0,C:0,D:0,E:0,F:0,G:0,H:0 };
const mmError = (a,b) => a.distanceTo(b)*1000;
function occurrence(root,path){let found;root.traverse(node=>{const id=node.userData?.PTC_onshape_metadata?.id??node.userData?.gltfExtensions?.PTC_onshape_metadata?.id;if(Array.isArray(id)&&id.length===path.length&&id.every((part,index)=>part===path[index]))found=node;});return found;}
const feederLanes = Array.from({length:14},(_,lane)=>({lane,sku:`.5VG-${lane}`,color:'#e95858'}));
const HALF_VG_RUN = { id:'half-vg-test',projectName:'Half VG test',sectionName:'1',geometry:'5VG-Artemis',tilesPerRow:25,tileSpacing:12.7,tileSize:12.7,feederLanes,placements:Array.from({length:625},(_,i)=>({sourceIndex:i,lane:i%14,x:(i%25)*12.7,y:Math.floor(i/25)*12.7,theta:0,sku:feederLanes[i%14].sku,color:'#e95858'})) };
test('CAD gantry sensors bound Y motion and the sample plan remains in travel', async () => {
  const root = await loadModel('artemis-portfolio.glb');
  const graph = buildKinematicGraph(root, undefined, 'half-vg-artemis', { labels: false });
  const calibration = deriveBuildCalibration(graph, HALF_VG_RUN);
  const limits = deriveCadGantryTravel(graph);
  assert.ok(Math.abs(limits.sensorZMm[0] + 474.2) < 1);
  assert.ok(Math.abs(limits.sensorZMm[1] - 544.4) < 1);
  assert.ok(Math.abs(limits.A[1] - limits.A[0] - 1265) < 1e-6);
  assert.ok(Math.abs(limits.B[1] - limits.B[0] - 950) < 1e-6);
  const timeline = createBuildTimeline(HALF_VG_RUN, { ...calibration, homePose: { B: limits.B[0] } });
  assert.equal(timeline.frames[0].pose.B, limits.B[0]);
  assert.equal(firstTravelViolation(timeline.frames, limits), null);
  assert.ok(calibration.laneTargets.every(point => point.z > -.5));
  assert.match(firstTravelViolation([{ step: 'move', pose: { B: limits.B[0] - 1 } }], limits), /exceeds CAD B travel/);
  graph.joints.B.limits = limits.B;
  assert.throws(() => driveControllerAxes(graph, { ...zero, B: limits.B[0] - 1 }), /outside/);
});
test('.5VG CAD tool contacts align with every lane and tile', async () => {
    const root = await loadModel('artemis-portfolio.glb');
    const run = HALF_VG_RUN;
    const graph = buildKinematicGraph(root, undefined, 'half-vg-artemis', {labels:false});
    const calibration = deriveBuildCalibration(graph,run);
    assert.equal(calibration.headCount,3);
    const names=Object.keys(graph.tools);
    const timeline=createBuildTimeline(run,calibration);
    assert.ok(timeline.frames.some(frame => frame.head === 2), 'third pick head must participate in automatic batches');
    instanceRepeatedParts(root,graph);
    root.traverse(node=>{node.updateMatrix();node.matrixAutoUpdate=false;});
    Object.values(graph.joints).forEach(joint=>{joint.pivot.matrixAutoUpdate=true;});
    graph.process.conveyorGrid.pivot.matrixAutoUpdate=true;
    driveConveyorGrid(graph,1);
    let maximumError=0;
    for (const frame of timeline.frames) {
      if (!frame.action) continue;
      driveControllerAxes(graph,frame.pose); root.updateWorldMatrix(true,true);
      const actual=graph.tools[names[frame.head]].getWorldPosition(new THREE.Vector3());
      const expected=frame.action==='pick' ? calibration.laneTargets[frame.lane] : calibration.placementTarget(frame.placement);
      const error=mmError(actual,expected);maximumError=Math.max(maximumError,error);
      assert.ok(error<.001, `${frame.action} tool ${frame.head+1} lane ${frame.lane}: ${error} mm error`);
    }
    driveControllerAxes(graph,zero); root.updateWorldMatrix(true,true);
    const tiles=createMosaicTiles(graph,timeline.executionPlacements,run);
    tiles.forEach((tile,i)=>assert.ok(mmError(tile.getWorldPosition(new THREE.Vector3()),placementWorldPoint(graph,run,timeline.executionPlacements[i]))<.001));
    // Calibration must not drift after tiles are attached or after a section reset.
    const next=deriveBuildCalibration(graph,run);
    assert.ok(mmError(next.placementTarget(run.placements[0]),calibration.placementTarget(run.placements[0]))<.001);
    const inactive=[];root.traverse(n=>{if(n.name==='occurrence_of_75-1')inactive.push(n);});
    assert.equal(inactive.length,1);assert.equal(inactive[0].visible,false);
    console.log(`.5VG: ${timeline.frames.filter(f=>f.action).length} tool contacts, max error ${maximumError.toFixed(8)} mm`);
});
test('third SMAC housing stays fixed while only its pick shaft follows G', async()=>{
  const root=await loadModel('artemis-portfolio.glb');
  const graph=buildKinematicGraph(root,undefined,'half-vg-artemis',{labels:false});
  const housing=occurrence(root,['MHwayNEAaAXevbKb/']);
  const shaft=occurrence(root,['MHwayNEAaAXevbKb/','Mh1F3Jauwh7+NyNHF']);
  assert.ok(housing&&shaft);
  driveControllerAxes(graph,zero);root.updateWorldMatrix(true,true);
  const housingHome=housing.getWorldPosition(new THREE.Vector3());
  const shaftHome=shaft.getWorldPosition(new THREE.Vector3());
  driveControllerAxes(graph,{...zero,G:-50});root.updateWorldMatrix(true,true);
  assert.ok(mmError(housing.getWorldPosition(new THREE.Vector3()),housingHome)<.001);
  assert.ok(Math.abs(mmError(shaft.getWorldPosition(new THREE.Vector3()),shaftHome)-50)<.001);
  driveControllerAxes(graph,{...zero,A:20});root.updateWorldMatrix(true,true);
  assert.ok(Math.abs(mmError(housing.getWorldPosition(new THREE.Vector3()),housingHome)-20)<.001);
});
test('CAD batching never makes a hidden tooling subtree visible',()=>{
 const root=new THREE.Group(); const hidden=new THREE.Group();hidden.visible=false;root.add(hidden);
 const geometry=new THREE.BoxGeometry(1,1,1);const material=new THREE.MeshBasicMaterial();
 for(let i=0;i<3;i++){const mesh=new THREE.Mesh(geometry,material);hidden.add(mesh);}
 const visible=new THREE.Mesh(new THREE.BoxGeometry(.1,.1,.1),material);root.add(visible);
 instanceRepeatedParts(root,{joints:{},process:{}});
 let count=0;root.traverseVisible(n=>{if(n.isMesh)count++;});assert.equal(count,1);
});

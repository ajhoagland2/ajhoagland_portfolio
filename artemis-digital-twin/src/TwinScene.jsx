import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { instanceRepeatedParts } from './cadRendering.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildKinematicGraph, createMechanicalValidator, createMosaicTiles, deriveBuildCalibration, driveControllerAxes, driveConveyorGrid } from './kinematics.js';
import { createBuildTimeline } from './buildRun.js';
import { STEPS } from './model.js';
import { deriveCadGantryTravel, firstTravelViolation } from './cadTravel.js';

const MODEL_PART_URLS = ['00', '01', '02', '03', '04'].map(
  suffix => `${import.meta.env.BASE_URL}../artemis-model.glb.gz.part-${suffix}`,
);

async function loadCompressedModel(loader, onProgress) {
  const responses = await Promise.all(MODEL_PART_URLS.map(url => fetch(url)));
  const failed = responses.find(response => !response.ok);
  if (failed) throw new Error(`Unable to load Artemis CAD model (${failed.status})`);
  const parts = await Promise.all(responses.map(response => response.blob()));
  onProgress?.(24);
  const decompressed = new Blob(parts).stream().pipeThrough(new DecompressionStream('gzip'));
  const buffer = await new Response(decompressed).arrayBuffer();
  onProgress?.(82);
  return loader.parseAsync(buffer, import.meta.env.BASE_URL);
}

function disposeTree(root) {
  const geometries = new Set(); const materials = new Set(); const textures = new Set();
  root.traverse(node => {
    if (node.geometry) geometries.add(node.geometry);
    if (node.material) (Array.isArray(node.material) ? node.material : [node.material]).forEach(m => materials.add(m));
    if (node.isInstancedMesh) node.dispose();
  });
  materials.forEach(material => { Object.values(material).forEach(value => { if (value?.isTexture) textures.add(value); }); material.dispose(); });
  geometries.forEach(geometry => geometry.dispose()); textures.forEach(texture => texture.dispose());
}


const AXIS_IDS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

function toAxisMap(axes) {
  return Object.fromEntries(AXIS_IDS.map((id) => [id, axes.find((axis) => axis.id === id)?.value ?? 0]));
}

export default function TwinScene({ run, heads, axes, selectedAxis, activeStep, progress, gridLoaded, gridConfiguration, completedPlacements, scanDistance, onKinematicCalibration, onStatusChange, cameraView, colorMode }) {
  const hostRef = useRef(null);
  const runtimeRef = useRef(null);
  const runRef = useRef(run); runRef.current = run;
  const calibrationRef = useRef(onKinematicCalibration); calibrationRef.current = onKinematicCalibration;
  useEffect(() => { runtimeRef.current?.refreshRun(run); }, [run]);
  const headsRef = useRef(heads); headsRef.current = heads;
  const visualRef = useRef({ cameraView, colorMode, selectedAxis });
  visualRef.current = { cameraView, colorMode, selectedAxis };
  const axesRef = useRef(toAxisMap(axes));
  const stepRef = useRef(activeStep);
  const progressRef = useRef(progress);
  const gridLoadedRef = useRef(gridLoaded);
  const completedPlacementsRef = useRef(completedPlacements);
  const scanDistanceRef = useRef(scanDistance);
  const [loadState, setLoadState] = useState({ status: 'loading', progress: 0, meshes: 0, bindings: 0 });


  useEffect(() => {
    axesRef.current = toAxisMap(axes);
  }, [axes]);

  useEffect(() => { stepRef.current = activeStep; }, [activeStep]);
  useEffect(() => { progressRef.current = progress; }, [progress]);
  useEffect(() => { gridLoadedRef.current = gridLoaded; }, [gridLoaded]);
  useEffect(() => { completedPlacementsRef.current = completedPlacements; }, [completedPlacements]);
  useEffect(() => { scanDistanceRef.current = scanDistance; }, [scanDistance]);

  useEffect(() => {
    const host = hostRef.current;
    setLoadState({ status: 'loading', progress: 0, meshes: 0, bindings: 0 });
    onStatusChange?.('loading');
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090909);

    const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 10000);
    camera.position.set(6, 4, 7);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;

    scene.add(new THREE.HemisphereLight(0xf5f5f5, 0x1a0d05, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(4, 9, 6);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xff7b00, .55);
    fill.position.set(-6, 4, -4);
    scene.add(fill);

    const grid = new THREE.GridHelper(20, 20, 0xff7b00, 0x242424);
    grid.material.opacity = 0.18;
    grid.material.transparent = true;
    scene.add(grid);

    let modelRoot = null;
    let cameraDistance = 5;
    let appliedView = null;
    let appliedColor = null;
    let appliedSelection = null;
    let gridProgress = 0;
    let previousTime = performance.now();
    let finalValidated = false;
    const coloredMeshes = [];
    const desiredCamera = new THREE.Vector3();
    const homeTarget = new THREE.Vector3();
    let kinematics = null;
    let validateFrame = null;
    let workpieces = [];
    let scanLines = null;
    const scanStart = new THREE.Vector3();
    let mosaicTiles = [];
    let travelWarning = null;
    let sceneHomePose = Object.fromEntries(AXIS_IDS.map(id => [id, 0]));

    let cancelled = false;
    const loader = new GLTFLoader();
    const loadModels = async () => {
      try {
        const gltf = await loadCompressedModel(loader, (progress) => {
          setLoadState((current) => ({ ...current, progress }));
        });
        if (cancelled) { disposeTree(gltf.scene); return; }
        modelRoot = gltf.scene;
        scene.add(modelRoot);

        let meshCount = 0;
        modelRoot.traverse((node) => {
          if (!node.isMesh) return;
          meshCount += 1;
          node.castShadow = false;
          node.receiveShadow = true;
        });

        const bounds = new THREE.Box3().setFromObject(modelRoot);
        const size = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());
        modelRoot.position.sub(center);
        modelRoot.position.y += size.y * 0.46;

        const maxDimension = Math.max(size.x, size.y, size.z);
        try {
          kinematics = buildKinematicGraph(modelRoot, undefined, gridConfiguration);
          const toolCount = Object.keys(kinematics.tools).length;
          const scanGeometry = new THREE.BufferGeometry();
          scanGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(toolCount * 6), 3));
          scanLines = new THREE.LineSegments(scanGeometry, new THREE.LineBasicMaterial({ color: 0xff7b00, transparent: true, opacity: .8 }));
          scanLines.name = 'simulated-scan-range';
          scene.add(scanLines);
          workpieces = Object.keys(kinematics.tools).map(name => {
            const piece = new THREE.Mesh(new THREE.BoxGeometry(runRef.current.tileSize * .001, .003, runRef.current.tileSize * .001), new THREE.MeshStandardMaterial({ color: '#ff7b00', roughness: .5 }));
            piece.name = 'simulated-workpiece'; piece.visible = false; piece.position.y = -.0015;
            kinematics.tools[name].add(piece);
            return piece;
          });
          const calibration = deriveBuildCalibration(kinematics, runRef.current);
          const cadTravel = deriveCadGantryTravel(kinematics);
          const travelCalibration = { ...calibration, cadTravel, homePose: { B: cadTravel.B[0] } };
          sceneHomePose = { ...sceneHomePose, ...travelCalibration.homePose };
          axesRef.current = sceneHomePose;
          const timeline = createBuildTimeline(runRef.current, travelCalibration);
          travelWarning = firstTravelViolation(timeline.frames, cadTravel);
          for (const id of ['A', 'B']) kinematics.joints[id].limits = cadTravel[id];
          mosaicTiles = createMosaicTiles(kinematics, timeline.executionPlacements, runRef.current);
          calibrationRef.current?.({ ...travelCalibration, travelWarning, timeline });
          validateFrame = createMechanicalValidator(kinematics);
        } catch (error) {
          console.error('Invalid Artemis kinematic manifest.', error);
          onStatusChange?.('error');
          setLoadState({ status: 'error', progress: 0, meshes: meshCount, bindings: 0 });
          return;
        }
        const groupColors = { A: '#59cbb9', B: '#77aaf4', C: '#edbd69', D: '#edbd69', E: '#ba93eb', F: '#ba93eb', G: '#f08c9c', H: '#f08c9c' };
        const materialCache = new Map();
        modelRoot.traverse(node => {
          if (!node.isMesh || node.name.startsWith('simulated-placement') || workpieces.includes(node)) return;
          let parent = node; let axisId = null;
          while (parent && !axisId) {
            axisId = Object.keys(kinematics.joints).find(id => kinematics.joints[id].pivot === parent);
            parent = parent.parent;
          }
          const materials = (Array.isArray(node.material) ? node.material : [node.material]).map(material => {
            const cacheKey = `${material.uuid}:${axisId ?? 'static'}`;
            if (materialCache.has(cacheKey)) return materialCache.get(cacheKey);
            const clone = material.clone();
            materialCache.set(cacheKey, clone);
            coloredMeshes.push({ material: clone, original: clone.color?.clone(), axisId, color: groupColors[axisId] });
            return clone;
          });
          node.material = Array.isArray(node.material) ? materials : materials[0];
        });
        runtimeRef.current = { refreshRun(nextRun) {
          mosaicTiles.forEach(tile => { tile.removeFromParent(); disposeTree(tile); });
          driveControllerAxes(kinematics, Object.fromEntries(AXIS_IDS.map(id => [id, 0])));
          gridProgress = 0; driveConveyorGrid(kinematics, 0);
          for (const id of ['A', 'B']) kinematics.joints[id].limits = [-500, 500];
          const calibration = deriveBuildCalibration(kinematics, nextRun);
          const cadTravel = deriveCadGantryTravel(kinematics);
          const travelCalibration = { ...calibration, cadTravel, homePose: { B: cadTravel.B[0] } };
          sceneHomePose = { ...sceneHomePose, ...travelCalibration.homePose };
          axesRef.current = sceneHomePose;
          const timeline = createBuildTimeline(nextRun, travelCalibration);
          travelWarning = firstTravelViolation(timeline.frames, cadTravel);
          for (const id of ['A', 'B']) kinematics.joints[id].limits = cadTravel[id];
          mosaicTiles = createMosaicTiles(kinematics, timeline.executionPlacements, nextRun);
          calibrationRef.current?.({ ...travelCalibration, travelWarning, timeline });
          onStatusChange?.(travelWarning ? 'out-of-travel' : 'ready');
          setLoadState(current => ({ ...current, travelWarning }));
        } };
        const savedDrawCalls = instanceRepeatedParts(modelRoot, kinematics);
        // CAD occurrences are immutable. Avoid recomputing 90k local matrices
        // every frame; only the eight joints and conveyor need updates.
        modelRoot.traverse(node => { node.updateMatrix(); node.matrixAutoUpdate = false; });
        Object.values(kinematics.joints).forEach(joint => { joint.pivot.matrixAutoUpdate = true; });
        if (kinematics.process.conveyorGrid) kinematics.process.conveyorGrid.pivot.matrixAutoUpdate = true;
        validateFrame();
        console.info(`CAD instancing removed ${savedDrawCalls} repeated draw calls.`);
        const distance = maxDimension / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.32;
        cameraDistance = distance * 0.86;
        camera.near = Math.max(maxDimension / 10000, 0.01);
        camera.far = maxDimension * 20;
        camera.position.set(distance * 0.78, distance * 0.55, distance * 0.92);
        camera.updateProjectionMatrix();
        controls.target.set(0, size.y * 0.05, 0);
        homeTarget.copy(controls.target);
        controls.minDistance = maxDimension * 0.25;
        controls.maxDistance = maxDimension * 4;
        controls.update();

        controls.saveState();

        grid.scale.setScalar(Math.max(1, maxDimension / 20));
        const bindingCount = Object.keys(kinematics.joints).length;
        console.info(`Artemis kinematics bound to ${bindingCount} Onshape assemblies.`);
        onStatusChange?.(travelWarning ? 'out-of-travel' : 'ready');
        setLoadState({ status: 'ready', progress: 100, meshes: meshCount, bindings: bindingCount, gridSource: kinematics.process.conveyorGrid?.source, travelWarning });
      } catch (error) {
        console.error('Unable to load the Onshape assembly export.', error);
        if (!cancelled) { onStatusChange?.('error'); setLoadState({ status: 'error', progress: 0, meshes: 0 }); }
      }
    };
    loadModels();

    const resize = () => {
      const { clientWidth, clientHeight } = host;
      renderer.setSize(clientWidth, clientHeight, false);
      camera.aspect = clientWidth / Math.max(clientHeight, 1);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    let raf;
    const render = () => {
      const now = performance.now();
      const delta = Math.min((now - previousTime) / 1000, .1); previousTime = now;
      const visual = visualRef.current;
      if (kinematics && appliedView !== visual.cameraView) {
        const d = cameraDistance;
        const offset = visual.cameraView === 'top' ? new THREE.Vector3(0, d * 1.3, .001) : visual.cameraView === 'front' ? new THREE.Vector3(0, d * .15, d * 1.4) : new THREE.Vector3(d * .78, d * .55, d * .92);
        controls.enableDamping = false;
        controls.reset();
        controls.target.copy(homeTarget);
        desiredCamera.copy(homeTarget).add(offset);
        camera.position.copy(desiredCamera);
        controls.update();
        controls.enableDamping = true;
        appliedView = visual.cameraView;
      }
      if (kinematics && (appliedColor !== visual.colorMode || appliedSelection !== visual.selectedAxis)) {
        coloredMeshes.forEach(({ material, original, axisId, color }) => {
          if (!material.color) return;
          if (visual.colorMode === 'assembly') material.color.copy(original);
          else material.color.set(visual.colorMode === 'motion' && color ? color : '#8d9aab');
          if (material.emissive) { material.emissive.set(visual.colorMode === 'motion' && axisId === visual.selectedAxis ? color : '#000000'); material.emissiveIntensity = .2; }
        });
        appliedColor = visual.colorMode; appliedSelection = visual.selectedAxis;
      }
      const axis = axesRef.current;
      if (kinematics) {
        // React may still hold the previous grid's axis values for one frame.
        // Keep the new scene rendering at its calibrated home until they sync.
        const validAxis = Object.entries(kinematics.joints).every(([id, joint]) =>
          Number.isFinite(axis[id]) && axis[id] >= joint.limits[0] && axis[id] <= joint.limits[1]);
        driveControllerAxes(kinematics, validAxis ? axis : sceneHomePose);
        gridProgress = Number(gridLoadedRef.current);
        driveConveyorGrid(kinematics, gridProgress);
        mosaicTiles.forEach((tile, index) => { tile.visible = index < completedPlacementsRef.current; });
        workpieces.forEach((piece, i) => {
          const head = headsRef.current[i];
          piece.visible = head.partPresent;
          if (head.lane != null) piece.material.color.set(runRef.current.feederLanes[head.lane]?.color ?? '#55dbc5');
        });
        if (scanLines) {
          const positions = scanLines.geometry.attributes.position;
          Object.values(kinematics.tools).forEach((tool, index) => {
            tool.getWorldPosition(scanStart);
            positions.setXYZ(index * 2, scanStart.x, scanStart.y, scanStart.z);
            positions.setXYZ(index * 2 + 1, scanStart.x, scanStart.y - scanDistanceRef.current * kinematics.millimetresToGlb, scanStart.z);
          });
          positions.needsUpdate = true;
        }
        if (progressRef.current >= 100 && !finalValidated) { validateFrame(); finalValidated = true; }
        if (progressRef.current < 100) finalValidated = false;
      }
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelled = true;
      runtimeRef.current = null;
      cancelAnimationFrame(raf);
      observer.disconnect();
      controls.dispose();
      if (modelRoot) disposeTree(modelRoot);
      if (scanLines) { scanLines.geometry.dispose(); scanLines.material.dispose(); }
      grid.geometry.dispose(); grid.material.dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
  }, [gridConfiguration, onStatusChange]);

  return <div className="twin-scene-wrap">
    <div className="twin-scene" ref={hostRef} aria-label="Interactive Onshape-derived Artemis assembly" />
    {loadState.status === 'loading' ? <div className="model-load">
      <span>Loading Onshape assembly</span><strong>{loadState.progress}%</strong>
      <div><i style={{ width: `${loadState.progress}%` }} /></div>
    </div> : null}
    {loadState.status === 'ready' ? <div className="model-source">ONSHAPE · UPDATED · {loadState.meshes} MESHES · {loadState.bindings} MOTION GROUPS · {loadState.gridSource === 'procedural' ? 'GENERATED .5 GRID' : 'CAD GRID'}</div> : null}
    {loadState.travelWarning ? <div className="travel-warning">{loadState.travelWarning} Sequence disabled.</div> : null}
    {loadState.status === 'error' ? <div className="model-error">Onshape assembly could not be loaded.</div> : null}
    <div className="selection-note">Axis {selectedAxis} selected · live kinematic binding</div>
  </div>;
}

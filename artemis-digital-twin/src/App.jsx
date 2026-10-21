import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { HALF_VG_GRID_ID, STEPS } from './model';
import { createBuildTimeline } from './buildRun';
import { loadRubixRougeSample, parseArtaicProjectXml } from './xmlBuildRun';
import { DEFAULT_PARAMETERS, validateTelemetry } from './simulation';
import useSimulation from './useSimulation';
import { SystemControls, MosaicPanel, FeederPanel, HeadsPanel, EventPanel, ScanDistancePanel, ThroughputPanel } from './DashboardPanels';
const TwinScene = lazy(() => import('./TwinScene'));
const formatTime = ms => { const s = Math.floor(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const EMPTY_HALF_VG_RUN = Object.freeze({ id: 'loading', projectName: 'Loading .5VG build', sectionName: '—', geometry: '5VG-Artemis', tileSize: 12.7, tileSpacing: 12.7, tilesPerRow: 25, feederLanes: [], placements: [] });
const EMPTY_TIMELINE = createBuildTimeline(EMPTY_HALF_VG_RUN);
export default function App() {
  const [run, setRun] = useState(EMPTY_HALF_VG_RUN);
  const [sections, setSections] = useState([]);
  const [timeline, setTimeline] = useState(EMPTY_TIMELINE);
  const [loadingSample, setLoadingSample] = useState(true);
  const [parameters, setParameters] = useState(DEFAULT_PARAMETERS);
  const [boundHeads, setBoundHeads] = useState(0);
  const [selected, setSelected] = useState('A');
  const [camera, setCamera] = useState('perspective');
  const [colorMode, setColorMode] = useState('assembly');
  const [sceneReady, setSceneReady] = useState(false);
  const [travelBlocked, setTravelBlocked] = useState(false);
  const [logs, setLogs] = useState([{ message: 'Offline .5VG simulation initializing.', time: '—', level: 'INFO' }]);
  const fileRef = useRef(null);
  const mosaicFileRef = useRef(null);
  const addLog = useCallback((message, level = 'INFO') => setLogs(current => [{ id: `${Date.now()}-${Math.random()}`, message, level, time: new Date().toLocaleTimeString('en-GB') }, ...current].slice(0, 30)), []);
  const simulation = useSimulation(timeline, parameters, () => addLog('Section complete. All placements finished.'));
  const { axes, heads, setHeads, running, snapshot, reset, toggle, updateAxis, setTravelBounds } = simulation;
  const progress = snapshot.cursor / (timeline.frames.length - 1) * 100;
  const allSafe = axes.every(a => Number.isFinite(a.value) && a.value >= a.min && a.value <= a.max);
  const calibration = useCallback(value => { if (value) {
    setBoundHeads(value.headCount);
    setTravelBounds(value.cadTravel, value.homePose);
    setTimeline(value.timeline);
    if (value.travelWarning) addLog(value.travelWarning, 'WARN');
  } }, [addLog]);
  const sceneStatus = useCallback(status => {
    setSceneReady(status === 'ready');
    setTravelBlocked(status === 'out-of-travel');
  }, []);
  useEffect(() => {
    let cancelled = false;
    loadRubixRougeSample().then(next => {
      if (cancelled) return;
      reset(); setSections(next.sections ?? [next]); setRun(next); setTimeline(createBuildTimeline(next));
      addLog(`${next.projectName} .5VG loaded · ${next.placements.length} placements`);
    }).catch(error => { if (!cancelled) addLog(error.message, 'WARN'); })
      .finally(() => { if (!cancelled) setLoadingSample(false); });
    return () => { cancelled = true; };
  }, [addLog, reset]);
  const loadTelemetry = async event => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const imported = validateTelemetry(data, axes);
      reset(); simulation.setAxes(imported);
      addLog(`Loaded ${file.name} · manual pose. Run starts from the planned home position.`);
    } catch (error) { addLog(error.message, 'WARN'); }
    event.target.value = '';
  };
  const loadMosaic = async event => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      const parsed = parseArtaicProjectXml(await file.text());
      const importedSections = parsed.sections ?? [parsed];
      const firstSection = importedSections[0];
      reset(); setSceneReady(false); setSections(importedSections); setRun(firstSection); setTimeline(createBuildTimeline(firstSection));
      addLog(`Loaded ${file.name} · ${importedSections.length} section${importedSections.length === 1 ? '' : 's'} · ${importedSections.reduce((sum, section) => sum + section.placements.length, 0)} placements`);
    } catch (error) { addLog(`${file.name}: ${error.message}`, 'WARN'); }
    event.target.value = '';
  };
  return <main className="app-shell">
    <header className="topbar"><a className="brand" href="#overview" aria-label="Artemis overview"><span className="brand-mark">A</span><strong>Artemis</strong><span className="brand-divider">/</span><span>Digital Twin</span></a><div className="header-actions"><a className="portfolio-link" href="../../projects.html">Portfolio</a><span className="offline"><i/>Simulation only</span><button onClick={() => mosaicFileRef.current?.click()} disabled={running || loadingSample}>Load mosaic XML</button><input type="file" accept=".xml,text/xml,application/xml" hidden ref={mosaicFileRef} onChange={loadMosaic}/><button onClick={() => fileRef.current?.click()} disabled={running || loadingSample}>Load telemetry</button><input type="file" accept=".json,application/json" hidden ref={fileRef} onChange={loadTelemetry}/></div></header>
    <div className="dashboard" id="overview"><div className="page-heading"><div><h1>Production overview</h1><p>One workspace for .5VG motion, materials, and machine control.</p></div><div className="run-actions">{sections.length > 1 ? <label className="sample-picker"><span>Section</span><select aria-label="Build section" disabled={running || loadingSample} value={run.sectionName} onChange={e => { const next = sections.find(s => s.sectionName === e.target.value); reset(); setSceneReady(false); setRun(next); setTimeline(createBuildTimeline(next)); addLog(`Section ${next.sectionName} loaded`); }}>{sections.map(s => <option key={s.sectionName} value={s.sectionName}>Section {s.sectionName}</option>)}</select></label> : null}<button className="primary" disabled={!sceneReady || loadingSample || !allSafe} onClick={() => { toggle(); addLog(running ? 'Sequence paused' : 'Sequence started'); }}>{running ? 'Pause' : progress >= 100 ? 'Run again' : 'Run sequence'}</button><button onClick={() => { reset(); addLog('Simulation reset to home'); }}>Reset</button></div></div>
    <section className="metrics" aria-label="Production status"><div><span className={`metric-symbol ${running ? 'live' : ''}`}>●</span><div><span>Machine state</span><strong className="accent">{loadingSample ? 'Loading' : travelBlocked ? 'Travel warning' : !sceneReady ? 'Loading' : running ? 'Running' : progress >= 100 ? 'Complete' : progress > 0 ? 'Paused' : 'Ready'}</strong></div></div><div><span className="metric-symbol">▱</span><div><span>Placements</span><strong>{snapshot.completed} <small>/ {run.placements.length}</small></strong></div></div><div><span className="metric-symbol">◷</span><div><span>Runtime</span><strong>{formatTime(snapshot.elapsed)}</strong></div></div><div><span className="metric-symbol">⌁</span><div><span>Active step</span><strong>{STEPS.find(s => s.id === snapshot.step)?.label}</strong></div></div></section>
    <div className="main-grid"><section className="panel machine-panel"><div className="panel-heading"><h2>3D machine view</h2><div className="scene-tools"><div className="segmented">{['perspective','top','front'].map(view => <button key={view} aria-pressed={camera === view} onClick={() => setCamera(view)}>{view}</button>)}</div><select aria-label="Machine color mode" value={colorMode} onChange={e => setColorMode(e.target.value)}><option value="assembly">Assembly colors</option><option value="motion">Motion groups</option><option value="neutral">Neutral</option></select></div></div><div className="viewport"><Suspense fallback={<div className="scene-loading">Loading 3D engine…</div>}><TwinScene run={run} heads={heads} axes={axes} selectedAxis={selected} activeStep={STEPS.findIndex(s => s.id === snapshot.step)} progress={progress} gridLoaded={snapshot.grid} gridConfiguration={HALF_VG_GRID_ID} completedPlacements={snapshot.completed} scanDistance={parameters.scanDistance} onKinematicCalibration={calibration} onStatusChange={sceneStatus} cameraView={camera} colorMode={colorMode}/></Suspense><div className="viewport-top"><span><i className="status-dot"/> {selected} · {axes.find(a => a.id === selected)?.name}</span><span className="grid-badge">.5VG grid</span></div><div className="viewport-bottom"><span><b className="x-axis">X</b> <b className="y-axis">Y</b> <b className="z-axis">Z</b></span><span>Drag to orbit · Scroll to zoom</span></div></div></section>
    <SystemControls parameters={parameters} setParameters={setParameters} axes={axes} selected={selected} setSelected={setSelected} updateAxis={updateAxis} running={running}/></div>
    <div className="detail-grid"><MosaicPanel run={run} execution={timeline.executionPlacements} completed={snapshot.completed}/><FeederPanel run={run} execution={timeline.executionPlacements} completed={snapshot.completed}/><HeadsPanel boundHeads={boundHeads} heads={heads} setHeads={setHeads} running={running}/><EventPanel logs={logs} clear={() => setLogs([])}/></div>
    <div className="operations-grid"><ScanDistancePanel parameters={parameters} setParameters={setParameters}/><section className="panel sequence-panel"><div><h2>Sequence progress</h2><span>{progress.toFixed(1)}% complete</span></div><div className="sequence-body"><ol>{STEPS.map((step, i) => <li key={step.id} className={snapshot.step === step.id ? 'active' : ''}><span>{i + 1}</span>{step.label}</li>)}</ol><progress aria-label="Build progress" max="100" value={progress}/></div></section></div>
    <ThroughputPanel timeline={timeline} parameters={parameters} headCount={boundHeads || 3}/>
    <footer><span><i className="status-dot"/>{allSafe ? 'Within CAD travel envelope' : 'CAD travel limit violation'}</span><span>Controller offline · Virtual controls only</span><span>Onshape assembly · updated</span></footer></div>
  </main>;
}

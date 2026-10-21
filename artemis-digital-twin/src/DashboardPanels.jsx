import { memo, useMemo, useState } from 'react';
import { analyzeScanConfiguration, buildScanSweep } from './optimization';
export function Parameter({ label, value, unit, min, max, step = 1, onChange }) {
  return <label className="parameter"><span>{label}</span><input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))}/><output>{value}<small> {unit}</small></output></label>;
}
export function SystemControls({ parameters, setParameters, axes, selected, setSelected, updateAxis, running }) {
  const change = (key, value) => setParameters(current => ({ ...current, [key]: value }));
  const axis = axes.find(a => a.id === selected);
  return <section className="panel controls-panel"><div className="panel-heading"><h2>System controls</h2><span>8 axes</span></div>
    <Parameter label="Playback speed" value={parameters.speed} unit="×" min={0.25} max={4} step={0.25} onChange={v => change('speed', v)} />
    <div className="control-line"><span>Motion profile</span><div className="segmented">{['smooth', 'linear'].map(profile => <button key={profile} aria-pressed={parameters.profile === profile} onClick={() => change('profile', profile)}>{profile}</button>)}</div></div>
    <details className="motion-settings"><summary>Motion parameters</summary><Parameter label="Travel speed" value={parameters.travelSpeed} unit="mm/s" min={50} max={1000} step={50} onChange={v => change('travelSpeed', v)}/><Parameter label="Rotation speed" value={parameters.rotationSpeed} unit="°/s" min={30} max={360} step={30} onChange={v => change('rotationSpeed', v)}/><Parameter label="Pick / place dwell" value={parameters.dwell} unit="ms" min={0} max={1000} step={20} onChange={v => change('dwell', v)}/></details>
    <div className="axis-title"><h3>Manual positioning</h3><span>{running ? 'Pause to adjust' : 'Select an axis to jog'}</span></div>
    <div className="axes">{axes.map(a => <div className={`axis-row ${selected === a.id ? 'selected' : ''}`} key={a.id}><button aria-label={`Select ${a.name}`} aria-pressed={selected === a.id} onClick={() => setSelected(a.id)}><b>{a.id}</b><span>{a.name}</span></button><input type="range" aria-label={`${a.name} position`} min={a.min} max={a.max} step={0.1} value={a.value} disabled={running} onChange={e => updateAxis(a.id, Number(e.target.value))}/><output>{a.value.toFixed(1)} <small>{a.unit === 'deg' ? '°' : a.unit}</small></output></div>)}</div>
    <div className="jog-controls"><label>Jog increment<select aria-label="Jog increment" value={parameters.jog} onChange={e => change('jog', Number(e.target.value))}>{[0.1,1,10,50].map(v => <option key={v} value={v}>{v} {axis.unit}</option>)}</select></label><button disabled={running} aria-label={`Jog ${selected} negative`} onClick={() => updateAxis(selected, axis.value - parameters.jog)}>−</button><button disabled={running} aria-label={`Jog ${selected} positive`} onClick={() => updateAxis(selected, axis.value + parameters.jog)}>+</button></div>
  </section>;
}
export const MosaicPanel = memo(function MosaicPanel({ run, execution, completed }) {
  const [mode, setMode] = useState('design');
  const done = useMemo(() => new Set(execution.slice(0, completed).map(p => p.sourceIndex)), [execution, completed]);
  const extent = Math.max(run.tilesPerRow * run.tileSpacing, ...run.placements.map(p => Math.max(p.x, p.y) + run.tileSpacing));
  return <section className="panel mosaic-panel"><div className="panel-heading"><h2>Mosaic color preview</h2><select aria-label="Mosaic preview mode" value={mode} onChange={e => setMode(e.target.value)}><option value="design">Design</option><option value="built">Built</option></select></div><div className="mosaic-content"><svg viewBox={`0 0 ${extent} ${extent}`} role="img" aria-label={`${run.projectName} mosaic ${mode} preview`}>{run.placements.map(p => <rect key={p.sourceIndex} x={p.x} y={p.y} width={run.tileSpacing * .91} height={run.tileSpacing * .91} rx={run.tileSpacing * .06} fill={p.color} opacity={mode === 'design' || done.has(p.sourceIndex) ? 1 : .08}><title>{p.sku} · {done.has(p.sourceIndex) ? 'Placed' : 'Pending'}</title></rect>)}</svg><div><strong>{run.projectName}</strong><p>{run.sectionName}</p><span>{Number(run.tileSize.toFixed(2))} mm tile</span><span>{run.tilesPerRow} × {run.tilesPerRow} grid</span><span>{completed} placed</span></div></div></section>;
});
export const FeederPanel = memo(function FeederPanel({ run, execution, completed }) {
  const placed = useMemo(() => execution.slice(0, completed).reduce((counts, p) => { counts[p.lane] = (counts[p.lane] ?? 0) + 1; return counts; }, {}), [execution, completed]);
  const required = useMemo(() => run.placements.reduce((counts, p) => { counts[p.lane] = (counts[p.lane] ?? 0) + 1; return counts; }, {}), [run]);
  return <section className="panel feeder-panel"><div className="panel-heading"><h2>Feeder lanes</h2><span>{run.feederLanes.length} colors</span></div><div className="table-scroll"><table><thead><tr><th>Lane</th><th>Color / SKU</th><th>Remaining</th></tr></thead><tbody>{run.feederLanes.map((lane, i) => <tr key={i}><td>{lane.lane ?? i}</td><td><i className="swatch" style={{ background: lane.color }}/>{lane.sku}</td><td>{(required[i] ?? 0) - (placed[i] ?? 0)} <small>/ {required[i] ?? 0}</small></td></tr>)}</tbody></table></div></section>;
});
export function HeadsPanel({ heads, setHeads, running, boundHeads }) {
  return <section className="panel"><div className="panel-heading"><h2>Vacuum heads</h2><span>{running ? 'Automatic' : 'Manual'}</span></div><div className="heads">{heads.map((head, i) => <div key={i}><h3>Head {i + 1}</h3><button className="switch" role="switch" aria-label={`Head ${i + 1} vacuum`} aria-checked={head.vacuum} disabled={running || i >= boundHeads} onClick={() => setHeads(current => current.map((h, index) => index === i ? { ...h, vacuum: !h.vacuum, partPresent: false } : h))}><span/></button><span>{head.vacuum ? 'Vacuum on' : 'Vacuum off'}</span><small className={head.partPresent ? 'accent' : ''}>{i >= boundHeads ? 'Not in CAD' : head.partPresent ? 'Tile loaded' : 'Empty'}</small></div>)}</div></section>;
}
export function EventPanel({ logs, clear }) {
  return <section className="panel event-panel"><div className="panel-heading"><h2>Event log</h2><button className="text-button" onClick={clear}>Clear</button></div><div className="events" aria-live="polite">{logs.length ? logs.map((log, i) => <div key={log.id ?? i}><time>{log.time}</time><span className={log.level === 'WARN' ? 'warning' : ''}>{log.message}</span></div>) : <p>No events. New activity will appear here.</p>}</div></section>;
}

export function ScanDistancePanel({ parameters, setParameters }) {
  const change = (key, value) => setParameters(current => ({ ...current, [key]: value }));
  const rows = Math.max(1, Math.floor(parameters.scanDistance / parameters.feederRowPitch));
  const tiles = rows * parameters.activePickColumns;
  return <section className="panel scan-panel" aria-labelledby="scan-distance-title">
    <div className="panel-heading"><h2 id="scan-distance-title">Scan configuration</h2><span>Gocator model</span></div>
    <div className="scan-control">
      <div className="scan-readout"><span>Commanded scan travel</span><strong>{parameters.scanDistance} <small>mm</small></strong></div>
      <label><span className="sr-only">Scan distance</span><input type="range" aria-label="Scan distance" min="30" max="250" step="1" value={parameters.scanDistance} onChange={event => change('scanDistance', Number(event.target.value))}/></label>
      <div className="scan-scale" aria-hidden="true"><span>30 mm</span><span>250 mm</span></div>
      <div className="scan-fields"><label>Scan speed<input aria-label="Scan speed" type="number" min="50" max="1000" step="10" value={parameters.scanSpeed} onChange={event => change('scanSpeed', Number(event.target.value))}/><small>mm/s</small></label><label>Acquisition overhead<input aria-label="Acquisition overhead" type="number" min="0" max="3000" step="50" value={parameters.scanOverhead} onChange={event => change('scanOverhead', Number(event.target.value))}/><small>ms</small></label></div>
      <p><b>{rows} complete rows</b> × {parameters.feederColumns} pickable columns · {tiles} tiles per replenishment. Tiles are consumed row-first at {parameters.feederRowPitch} mm pitch, including the 0.25 mm gap.</p>
      <div className={`failure-control ${parameters.pickFailuresEnabled ? '' : 'disabled'}`}><div><span>Pick failure interval</span><div><strong>{parameters.pickFailuresEnabled ? `1:${parameters.pickFailureEvery}` : 'Off'}</strong><button className="failure-toggle" type="button" role="switch" aria-label="Pick failures" aria-checked={parameters.pickFailuresEnabled} onClick={() => change('pickFailuresEnabled', !parameters.pickFailuresEnabled)}>{parameters.pickFailuresEnabled ? 'On' : 'Off'}</button></div></div><label><span className="sr-only">Pick failure interval</span><input disabled={!parameters.pickFailuresEnabled} type="range" aria-label="Pick failure interval" min="1" max="100" step="1" value={parameters.pickFailureEvery} onChange={event => change('pickFailureEvery', Number(event.target.value))}/></label><div className="scan-scale" aria-hidden="true"><span>1:1</span><span>1:100</span></div><p>{parameters.pickFailuresEnabled ? `One failed pickup every ${parameters.pickFailureEvery} scheduled tiles. Each failure adds one successful retry using the same scan buffer.` : `Pick failures are excluded. The saved 1:${parameters.pickFailureEvery} interval will return when enabled.`}</p></div>
    </div>
  </section>;
}

function formatDuration(ms) {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function ThroughputPanel({ timeline, parameters, headCount }) {
  const analysis = useMemo(() => analyzeScanConfiguration(timeline, parameters), [timeline, parameters]);
  const sweep = useMemo(() => buildScanSweep(timeline, parameters), [timeline, parameters]);
  const width = 660;
  const height = 150;
  const inset = { top: 14, right: 15, bottom: 28, left: 42 };
  const maxY = Math.max(...sweep.map(point => point.secondsPerTile), 1);
  const minY = Math.min(...sweep.map(point => point.secondsPerTile), maxY);
  const yRange = Math.max(maxY - minY, .01);
  const x = distance => inset.left + (distance - 30) / 220 * (width - inset.left - inset.right);
  const y = value => inset.top + (maxY - value) / yRange * (height - inset.top - inset.bottom);
  const path = sweep.map((point, index) => `${index ? 'L' : 'M'}${x(point.scanDistance).toFixed(1)},${y(point.secondsPerTile).toFixed(1)}`).join(' ');
  const currentX = x(parameters.scanDistance);
  const currentY = y(analysis.secondsPerTile);
  return <section className="panel throughput-panel" aria-labelledby="throughput-title">
    <div className="panel-heading"><div><h2 id="throughput-title">Scan-distance optimization</h2><p>Projected cycle time across the commanded Gocator travel range</p></div><span>Simulation estimate</span></div>
    <div className="throughput-body">
      <div className="throughput-kpis">
        <div><span>Build duration</span><strong>{formatDuration(analysis.durationMs)}</strong></div>
        <div><span>Cycle / tile</span><strong>{analysis.secondsPerTile.toFixed(2)} <small>s</small></strong></div>
        <div><span>Throughput</span><strong>{Math.round(analysis.placementsPerHour)} <small>tiles/h</small></strong></div>
        <div><span>Rows / scan</span><strong>{analysis.rowsPerScan} <small>rows</small></strong></div>
        <div><span>Scans required</span><strong>{analysis.scans} <small>scans</small></strong></div>
        <div><span>Expected retries</span><strong>{analysis.expectedFailures} <small>/ {analysis.totalPickAttempts} attempts</small></strong></div>
      </div>
      <div className="throughput-chart">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Sawtooth curve of projected seconds per tile by scan distance">
          {[0, .5, 1].map(fraction => { const yy = inset.top + fraction * (height - inset.top - inset.bottom); return <line key={fraction} x1={inset.left} x2={width - inset.right} y1={yy} y2={yy}/>; })}
          <path d={path}/>
          <circle cx={currentX} cy={currentY} r="5"/>
          <text x={inset.left} y={height - 8}>30</text><text textAnchor="middle" x={width / 2} y={height - 8}>Scan distance (mm)</text><text textAnchor="end" x={width - inset.right} y={height - 8}>250</text>
          <text className="chart-value" x={Math.min(currentX + 9, width - 82)} y={Math.max(currentY - 9, 13)}>{analysis.secondsPerTile.toFixed(2)} s/tile</text>
        </svg>
        <p>The sawtooth occurs when another {parameters.feederRowPitch} mm feeder row fits in the window. Each row has {parameters.feederColumns} pickable positions. The simulated gantry visits those positions from row A onward and replenishes that lane after its scanned buffer is exhausted. Projection still excludes feeder recirculation delay and collision avoidance.</p>
      </div>
    </div>
  </section>;
}

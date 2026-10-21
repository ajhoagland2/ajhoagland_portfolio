import { useCallback, useEffect, useRef, useState } from 'react';
import { AXES } from './model';
import { sampleMotion } from './simulation';
const idleHeads = () => Array.from({ length: 3 }, () => ({ vacuum: false, partPresent: false }));
export default function useSimulation(timeline, parameters, onComplete) {
  const [axes, setAxes] = useState(() => AXES.map(axis => ({ ...axis, value: 0, homed: true })));
  const [heads, setHeads] = useState(idleHeads);
  const [running, setRunning] = useState(false);
  const [snapshot, setSnapshot] = useState({ cursor: 0, elapsed: 0, completed: 0, step: 'home', grid: false });
  const clock = useRef({ cursor: 0, elapsed: 0, lastFrame: 0 });
  const travelBounds = useRef(null);
  const homePose = useRef(null);
  const options = useRef(parameters);
  options.current = parameters;
  const completion = useRef(onComplete); completion.current = onComplete;
  const reset = useCallback(() => {
    setRunning(false);
    clock.current = { cursor: 0, elapsed: 0, lastFrame: 0 };
    setAxes(AXES.map(axis => {
      const [min, max] = travelBounds.current?.[axis.id] ?? [axis.min, axis.max];
      const home = homePose.current?.[axis.id] ?? 0;
      return { ...axis, min, max, value: Math.max(min, Math.min(max, home)), homed: true };
    }));
    setHeads(idleHeads());
    setSnapshot({ cursor: 0, elapsed: 0, completed: 0, step: 'home', grid: false });
  }, []);
  useEffect(() => {
    if (!running) return;
    let raf; let previous = performance.now();
    const tick = now => {
      // Background tabs pause simulation time instead of jumping through an entire run.
      const delta = document.hidden ? 0 : Math.max(0, Math.min(now - previous, 100));
      previous = now;
      const state = clock.current;
      const sampled = sampleMotion(timeline.frames, state.cursor, delta, options.current);
      const first = Math.floor(state.cursor); const last = Math.floor(sampled.cursor);
      if (last > first) setHeads(current => {
        const next = current.map(head => ({ ...head }));
        for (let i = first + 1; i <= last; i++) {
          const frame = timeline.frames[i];
          if (frame.action === 'pick' && frame.head != null) next[frame.head] = { vacuum: true, partPresent: true, lane: frame.lane };
          if (frame.completed > timeline.frames[i - 1].completed && frame.head != null) next[frame.head] = { vacuum: false, partPresent: false };
        }
        return next;
      });
      state.cursor = sampled.cursor; state.elapsed += delta;
      setAxes(current => current.map(axis => ({ ...axis, value: sampled.pose[axis.id] })));
      setSnapshot({ cursor: sampled.cursor, elapsed: state.elapsed, completed: sampled.frame.completed, step: sampled.done ? 'home' : sampled.target.step, grid: sampled.gridProgress });
      if (sampled.done) { setRunning(false); setHeads(idleHeads()); completion.current(); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, timeline]);
  const toggle = () => { if (snapshot.cursor >= timeline.frames.length - 1) reset(); setRunning(value => !value); };
  const updateAxis = (id, value) => {
    if (running || !Number.isFinite(value)) return;
    setAxes(current => current.map(axis => axis.id === id ? { ...axis, value: Math.max(axis.min, Math.min(axis.max, value)) } : axis));
  };
  const setTravelBounds = (bounds, home = null) => {
    travelBounds.current = bounds;
    homePose.current = home;
    setAxes(current => current.map(axis => {
      const [min, max] = bounds?.[axis.id] ?? [axis.min, axis.max];
      const value = home?.[axis.id] ?? axis.value;
      return { ...axis, min, max, value: Math.max(min, Math.min(max, value)) };
    }));
  };
  return { axes, setAxes, setTravelBounds, heads, setHeads, running, setRunning, snapshot, reset, toggle, updateAxis };
}

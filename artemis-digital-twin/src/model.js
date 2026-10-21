export const AXES = [
  { id: 'A', name: 'Gantry X', unit: 'mm', min: -500, max: 500, value: 90, homed: true },
  { id: 'B', name: 'Gantry Y', unit: 'mm', min: -500, max: 500, value: 40, homed: true },
  { id: 'C', name: 'Head 1 Z', unit: 'mm', min: -150, max: 10, value: -28, homed: true },
  { id: 'D', name: 'Head 1 θ', unit: 'deg', min: -180, max: 180, value: 0, homed: true },
  { id: 'E', name: 'Head 2 Z', unit: 'mm', min: -150, max: 10, value: -18, homed: true },
  { id: 'F', name: 'Head 2 θ', unit: 'deg', min: -180, max: 180, value: 0, homed: true },
  { id: 'G', name: 'Head 3 Z', unit: 'mm', min: -150, max: 10, value: -24, homed: true },
  { id: 'H', name: 'Head 3 θ', unit: 'deg', min: -180, max: 180, value: 0, homed: false },
];

export const STEPS = [
  { id: 'home', label: 'Home' },
  { id: 'move', label: 'Move' },
  { id: 'grid', label: 'Grid' },
  { id: 'pick', label: 'Pick' },
  { id: 'place', label: 'Place' },
];

export const HALF_VG_GRID_ID = 'half-vg-artemis';

export const STEP_POSES = {
  home: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0, H: 0 },
  grid: { A: 230, B: -90, C: -16, D: 0, E: -16, F: 0, G: -16, H: 0 },
  move: { A: 230, B: -90, C: -16, D: 0, E: -16, F: 0, G: -16, H: 0 },
  pick: { A: 230, B: -90, C: -118, D: 15, E: -112, F: 0, G: -106, H: -15 },
  place: { A: -180, B: 140, C: -96, D: 90, E: -90, F: 90, G: -84, H: 90 },
};

export const INITIAL_LOGS = [
  { level: 'INFO', source: 'System', message: 'Offline simulation mode active' },
  { level: 'INFO', source: 'Model', message: 'Eight-axis kinematic model loaded' },
  { level: 'WARN', source: 'Axis H', message: 'Axis not homed' },
];

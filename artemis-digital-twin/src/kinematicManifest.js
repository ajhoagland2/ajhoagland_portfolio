// Stable identities from PTC_onshape_metadata in artemis-updated.glb.
// Instance paths are ordered from the exported root occurrence to the instance.
const ROOT = 'MPk5wBdC/IqCy+i0f';
const FRAME = 'MXvcE1jRM5w/KK4Nt';
const GANTRY = 'Mqu51KlPUKKejKIwn';
const EFFECTOR = 'MRUg0xtiz9HyRI3fy';
const ASSEMBLY_1 = 'Mf2hKy26bEdMdQJtd';
const HOPPER = 'MZX5hATKDVuI+KIMf';
const HEAD_3 = 'MHwayNEAaAXevbKb/';
const HEAD_3_PICK_SHAFT = 'Mh1F3Jauwh7+NyNHF';

export const CONTROLLER_AXIS_TARGETS = Object.freeze({
  A: 'carriageX',
  B: 'bridgeY',
  C: 'head1Z',
  D: 'head1Theta',
  E: 'head2Z',
  F: 'head2Theta',
  G: 'head3Z',
  H: 'head3Theta',
});

export const KINEMATIC_MANIFEST = {
  source: { units: 'metres', up: 'Y', millimetresToGlb: 0.001 },
  // Tool contact datums are the lower faces of the two suction cups and the
  // updated third pick-head assembly. The latter is a top-level occurrence in
  // this Onshape export, rather than a child of the end-effector assembly.
  tools: {
    head1Theta: { zGroup: 'head1Z', cup: [ROOT, EFFECTOR, 'MB4qbgh3REqZKeJqP'] },
    head2Theta: { zGroup: 'head2Z', cup: [ROOT, EFFECTOR, 'MVKEa2fLFlnE9hXk0'] },
    head3Theta: { zGroup: 'head3Z', cup: [HEAD_3, HEAD_3_PICK_SHAFT] },
  },
  hidden: [[ROOT, FRAME, GANTRY, 'M0s0rqkLd6eJ12sD+']],
  process: {
    conveyorGrid: {
      geometry: [ROOT, 'MifD/BY8XZ+lRsViD', 'M8FiRk8TGmtU0VFyk'],
      configurations: {
        // Root occurrence in FeederCartGrav.zip / Default. The name remains as
        // a fallback in case a future Onshape export regenerates the instance id.
        // Children: Artemis Grid Border (MJhnuHCDbx+mOCj8m) and
        // Artemis Grid Section (Mhre59i4CCBkbya/w).
        'half-vg-artemis': {
          geometry: ['MYolvWQkPJP6ie/VU'],
          occurrenceName: '.5VG-Artemis',
          tilePitchMm: 12.7,
        },
      },
      // Onshape Top view: the infeed is on the negative/left side of the
      // conveyor axis. Keep this explicit instead of inferring it from the
      // grid occurrence's current location.
      topViewEntryDirection: -1,
      minimumEntryDistance: 0.25,
      between: [
        [ROOT, 'MifD/BY8XZ+lRsViD', 'MZzvnpcUdTtn5gBSB'],
        [ROOT, 'MifD/BY8XZ+lRsViD', 'MFgicC7bQKHPO52Oz'],
      ],
    },
  },
  annotations: {
    hoppers: {
      topViewRightAxis: 'x',
      paths: [
        [HOPPER, 'Mn83NHVJvw5K4DlQw'],
        [HOPPER, 'MLr82wXCcM2qxY1+M'],
        [HOPPER, 'MKg06eu9tcwffBYGx'],
        [HOPPER, 'MkVWNdODrY37oNQ4U'],
        [HOPPER, 'MYWrYt1YxCMplfc4j'],
        [HOPPER, 'MCu8s9wh3tKuRCFCK'],
        [HOPPER, 'MyS3odsXMQNU3cbQI'],
        [HOPPER, 'MzfTjx2fFIgLelkX9'],
        [HOPPER, 'MySqGESoTg6uDXb9v'],
        [HOPPER, 'MMu750H1WK1GK2/t6'],
        [HOPPER, 'MRtj/oL5mIuQbXVJN'],
        [HOPPER, 'M/NnvWoi8l71MDEly'],
        [HOPPER, 'ML6F67Tnwq0N9OzC3'],
        [HOPPER, 'MC78Uy/w1J30QsPv/'],
      ],
    },
  },
  // The current GLB export omits mate connectors. These records are the exported
  // connector frames (origin + orthonormal basis) and are the only coordinate
  // convention used by the runtime. Replace them from Onshape on re-export.
  connectors: {
    axis_A_gantry_x: { origin: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] },
    axis_B_gantry_y: { origin: [0, 0, 0], x: [0, 0, 1], y: [1, 0, 0], z: [0, 1, 0] },
    axis_C_head1_z: { origin: [0, 0, 0], x: [0, 1, 0], y: [0, 0, 1], z: [1, 0, 0] },
    axis_D_head1_theta: { origin: [0, 0, 0], x: [0, 1, 0], y: [0, 0, 1], z: [1, 0, 0] },
    axis_E_head2_z: { origin: [0, 0, 0], x: [0, 1, 0], y: [0, 0, 1], z: [1, 0, 0] },
    axis_F_head2_theta: { origin: [0, 0, 0], x: [0, 1, 0], y: [0, 0, 1], z: [1, 0, 0] },
    axis_G_head3_z: { origin: [0, 0, 0], x: [0, 1, 0], y: [0, 0, 1], z: [1, 0, 0] },
    axis_H_head3_theta: { origin: [0, 0, 0], x: [0, 1, 0], y: [0, 0, 1], z: [1, 0, 0] },
  },
  groups: {
    static: {
      parent: null,
      geometry: [
        [ROOT, FRAME, 'Me9KJwWVVBTJl5UC3'],
        // The MGS-HBG assembly contains the fixed Y rail and drive hardware.
        // Moving head subassemblies are detached below before this root is
        // attached, leaving the rail rigidly fixed to the machine frame.
        [ROOT, FRAME, GANTRY],
      ],
    },
    // MSA-R20-C is the X gantry arm. It receives Y only.
    bridgeY: {
      parent: 'static', axis: 'B', type: 'translation', limits: [-500, 500], connector: 'axis_B_gantry_y',
      geometry: [[ROOT, FRAME, GANTRY, 'MvRXL5QNBFrHOls3h']],
    },
    // The carriage is exactly these two CAD assemblies. Both inherit B from
    // bridgeY and receive A here; no other imported geometry is attached.
    carriageX: {
      parent: 'bridgeY', axis: 'A', type: 'translation', limits: [-500, 500], connector: 'axis_A_gantry_x',
      geometry: [
        [ROOT, EFFECTOR],
        [ASSEMBLY_1],
        [HEAD_3],
        // HBG25405-1 is the guide block carried by the X carriage.
        [ROOT, FRAME, GANTRY, 'MvRXL5QNBFrHOls3h', 'M+WxG17/hrTDHG4XU'],
      ],
    },
    head1Z: { parent: 'carriageX', axis: 'C', type: 'translation', limits: [-150, 10], connector: 'axis_C_head1_z', geometry: [] },
    head1Theta: { parent: 'head1Z', role: 'spindle', axis: 'D', type: 'rotation', limits: [-180, 180], connector: 'axis_D_head1_theta', geometry: [[ROOT, EFFECTOR, 'MB4qbgh3REqZKeJqP'], [ROOT, EFFECTOR, 'M9flZ3jTM0xI/Bsfa'], [ROOT, EFFECTOR, 'MLgkdLfNT7auo89Be', 'Mh1F3Jauwh7+NyNHF']] },
    head2Z: { parent: 'carriageX', axis: 'E', type: 'translation', limits: [-150, 10], connector: 'axis_E_head2_z', geometry: [] },
    head2Theta: { parent: 'head2Z', role: 'spindle', axis: 'F', type: 'rotation', limits: [-180, 180], connector: 'axis_F_head2_theta', geometry: [[ROOT, EFFECTOR, 'MVKEa2fLFlnE9hXk0'], [ROOT, EFFECTOR, 'Mf13utLBTtcJNehfe'], [ROOT, EFFECTOR, 'MaC/eXilmkytde2Ia', 'MAmO7xrD86wLBA+CQ']] },
    head3Z: { parent: 'carriageX', axis: 'G', type: 'translation', limits: [-150, 10], connector: 'axis_G_head3_z', geometry: [] },
    head3Theta: { parent: 'head3Z', role: 'spindle', axis: 'H', type: 'rotation', limits: [-180, 180], connector: 'axis_H_head3_theta', geometry: [[HEAD_3, HEAD_3_PICK_SHAFT]] },
  },
};

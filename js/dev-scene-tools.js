/**
 * dev-scene-tools.js
 * ─────────────────────────────────────────────────────────────────
 * Unified Three.js scene inspector for in-IDE development.
 * Loaded ONLY in dev mode (import.meta.env.DEV).
 * Vite tree-shakes this entire file out of the production bundle.
 *
 * Categories: Object Selector · Transform (Rotation/Translate/Scale)
 *             Material · Attributes · Animation · Actions
 *
 * Usage (in main.js, already wired):
 *   initDevTools({
 *     "Label": stateObject,   // stateObject must have .pivot (THREE.Object3D)
 *     ...                     // optional: .mixer, .actions[]
 *   });
 * ─────────────────────────────────────────────────────────────────
 */

import GUI from "lil-gui";
import * as THREE from "three";

// ─── Constants ───────────────────────────────────────────────────
const RAD = THREE.MathUtils.degToRad;
const DEG = THREE.MathUtils.radToDeg;

// ─── Internal state ──────────────────────────────────────────────
let _gui = null;
let _registry = {};      // { label: stateObject }
let _active = null;      // currently selected stateObject
let _activeLabel = "";
let _devToolsEnabled = true;
let _patternUniformSets = [];
let _selectionBounds = new THREE.Box3();
let _selectionCenter = new THREE.Vector3();
let _selectionSize = new THREE.Vector3();
let _selectionOutline = null;
let _selectionOrientation = null;
let _selectionHelperParent = null;

// Live-editable proxy values, rebuilt each time the selection changes
let _rot   = { x: 0, y: 0, z: 0 };
let _pos   = { x: 0, y: 0, z: 0 };
let _scale = { uniform: 1 };
let _mat   = {
  wireframe: false,
  opacity: 1.0,
  color: "#ffffff",
  emissiveColor: "#000000",
  emissiveIntensity: 0.0,
  metalness: 0.3,
  roughness: 0.5,
  transmission: 0.0,
  ior: 1.5,
  thickness: 0.0,
  clearcoat: 0.0,
  patternMode: "none",
  patternScale: 7.0,
  patternSpeed: 1.0,
  patternMix: 0.35,
  patternLine: 0.25,
};
let _attr  = { visible: true, castShadow: false, receiveShadow: false };
let _anim  = { playing: false, normalizedTime: 0.0, timeScale: 1.0, clipName: "—" };
let _kf    = {
  enabled: false,
  channel: "position",
  component: "x",
  time: 0.0,
  duration: 4.0,
  loop: true,
  playing: false,
  autoplayOnInsert: true,
  hold: false,
  easing: "linear",
  scrub: 0.0,
  overrideNativeAnimation: true,
  keyCount: 0,
};

// folder references so we can refresh without rebuilding entire GUI
let _folders = {};
let _manualClips = new WeakMap();
let _lastElapsed = 0;
let _history = [];
let _redoStack = [];
let _materialSourceState = {};
let _pendingMaterialHydration = new Set();
let _originalMaterialSnapshots = new WeakMap();

const HISTORY_LIMIT = 240;
const MATERIAL_PRESET_IDS = new Set(["matte", "metal", "glass", "emissive", "original"]);

let _flow = {
  options: [],
  selected: "",
  point: 0,
  mappedTime: 0,
  indicator: "—",
};

let _sync = {
  autoSync: true,
  autoApplyToSource: false,
  enableEnterApply: false,
  historyDepth: 0,
  redoDepth: 0,
  lastAction: "init",
  lastExportSize: 0,
  sourceDirty: false,
  sourceStatus: "not applied",
  verificationStatus: "not yet verified",
};

let _hud = {
  root: null,
  info: null,
  status: null,
  message: "idle",
  tone: "idle",
};

let _selection = {
  enabled: true,
  color: 0xffb15e,
  status: "idle",
  antsSpeed: 0,
  animateOutline: false,
};

let _config = {};

let _projection = {
  enabled: false,
  autoSelect: false,
  targetMeshName: "— none —",
  maxAspect: 4.5,
  minFillRatio: 0.26,
  minThicknessRatio: 0.002,
  maxThicknessRatio: 0.22,
  parallaxX: 18,
  parallaxY: 12,
  easing: "linear",
  text: "Flow description",
  fontSize: 17,
  padding: 10,
  textColor: "#eafaff",
  bgColor: "#061218",
  bgAlpha: 0.32,
  contentMode: "text",
  assetSrc: "",
  assetAlt: "",
  textAnimation: true,
  textAnimationSpeed: 28,
  pickActive: false,
  hoverPreview: true,
  hoverPreviewScale: 1,
  nextCorner: 0,
  status: "idle",
  flowIndicator: "—",
  hoverMeshName: "—",
  hoverPoint: "—",
  draftCorners: 0,
};

let _assetLibrary = {
  workspaceRoot: "",
  options: [""],
  selected: "",
  status: "idle",
  lastDropped: "",
};

let _projectionOverlayMap = {}; // { [label]: overlayState }
let _projectionFlowOpacity = {};
let _projectionDraft = {
  targetLabel: "",
  meshUUID: null,
  meshName: "",
  text: "",
  corners: [],
  style: {},
  element: null,
  elementInner: null,
  badgeEl: null,
  previewTextEl: null,
  tickEls: [],
  hoverMarkerEl: null,
};

let _projectionPointerTarget = null;

let _lod = {
  enabled: true,
  autoRun: true,
  profileName: "lod_profile_1",
  selectedProfile: "lod_profile_1",
  highLabel: "",
  midLabel: "",
  lowLabel: "",
  near: 28,
  mid: 62,
  far: 110,
  cullBeyond: 180,
  scrollBoost: 22,
  freezeFarAnimations: true,
  bakeStaticFar: false,
  throttleMs: 50,
  flowSpeed: 0,
  status: "idle",
};
let _lodProfiles = {};
let _lastFlowForLod = 0;
let _lastElapsedForLod = 0;
let _lastLodUpdateMs = 0;
let _lastHudUpdateMs = 0;
let _lastProjectionOverlayUpdateMs = 0;
const DEVTOOLS_HUD_UPDATE_INTERVAL_MS = 120;
const DEVTOOLS_PROJECTION_UPDATE_INTERVAL_MS = 120;

// ─── Shader Library State ────────────────────────────────────────
const SHADER_SNIPPETS = {
  "Fresnel Rim": {
    label: "Fresnel Rim",
    description: "Glowing rim based on view-angle dot product. Classic sci-fi edge glow.",
    uniforms: `uniform float uFresnelPower;\nuniform vec3 uRimColor;`,
    inject: `
  float rim = 1.0 - max(0.0, dot(normalize(vNormal), normalize(-vViewPosition)));
  float rimFactor = pow(rim, uFresnelPower);
  diffuseColor.rgb = mix(diffuseColor.rgb, uRimColor, rimFactor);`,
    defaults: `{ uFresnelPower: { value: 2.8 }, uRimColor: { value: new THREE.Color(0x00ffff) } }`
  },
  "Chromatic Dispersion": {
    label: "Chromatic Dispersion",
    description: "RGB split offset along normal — iridescent/holographic prism effect.",
    uniforms: `uniform float uDispersionStrength;`,
    inject: `
  float disp = uDispersionStrength;
  diffuseColor.r += texture2D(map, vUv + vec2(disp, 0.0)).r;
  diffuseColor.b += texture2D(map, vUv - vec2(disp, 0.0)).b;`,
    defaults: `{ uDispersionStrength: { value: 0.004 } }`
  },
  "Pulse Wave": {
    label: "Pulse Wave",
    description: "Radial sine-wave pulse emanating from mesh origin over time.",
    uniforms: `uniform float uPulseTime;\nuniform float uPulseFreq;\nuniform float uPulseAmp;`,
    inject: `
  float dist = length(vPosition);
  float pulse = sin(dist * uPulseFreq - uPulseTime * 6.28) * 0.5 + 0.5;
  diffuseColor.rgb += uPulseAmp * pulse;`,
    defaults: `{ uPulseTime: { value: 0 }, uPulseFreq: { value: 1.8 }, uPulseAmp: { value: 0.3 } }`
  },
  "World-Space Grid": {
    label: "World-Space Grid",
    description: "Infinite world-space grid projected onto any surface. Great for floor planes.",
    uniforms: `uniform float uGridScale;\nuniform float uGridWidth;\nuniform vec3 uGridColor;`,
    inject: `
  vec3 wp = vWorldPosition;
  vec2 grid = abs(fract(wp.xz * uGridScale - 0.5) - 0.5) / fwidth(wp.xz * uGridScale);
  float line = min(grid.x, grid.y);
  float g = 1.0 - min(line, 1.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, uGridColor, g * uGridWidth);`,
    defaults: `{ uGridScale: { value: 0.25 }, uGridWidth: { value: 0.8 }, uGridColor: { value: new THREE.Color(0x00ffff) } }`
  },
  "Data Scanline": {
    label: "Data Scanline",
    description: "Horizontal scanlines that scroll over UV space — retro terminal effect.",
    uniforms: `uniform float uScanTime;\nuniform float uScanDensity;\nuniform float uScanAlpha;`,
    inject: `
  float scan = step(0.5, fract(vUv.y * uScanDensity - uScanTime * 0.4));
  diffuseColor.rgb *= 1.0 - scan * uScanAlpha;`,
    defaults: `{ uScanTime: { value: 0 }, uScanDensity: { value: 80.0 }, uScanAlpha: { value: 0.25 } }`
  },
  "Normal-Space Noise": {
    label: "Normal-Space Noise",
    description: "Hash-based noise modulated by surface normal — organic surface noise.",
    uniforms: `uniform float uNoiseTime;\nuniform float uNoiseScale;\nuniform float uNoiseMix;`,
    inject: `
  vec3 n = normalize(vNormal);
  float h = fract(sin(dot(n * uNoiseScale + uNoiseTime * 0.1, vec3(127.1, 311.7, 74.4))) * 43758.5453);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(h), uNoiseMix);`,
    defaults: `{ uNoiseTime: { value: 0 }, uNoiseScale: { value: 6.0 }, uNoiseMix: { value: 0.35 } }`
  },
  "Dissolve Edge": {
    label: "Dissolve Edge",
    description: "Clips geometry at a threshold using noise — dissolve/materialize transition.",
    uniforms: `uniform float uDissolveThreshold;\nuniform vec3 uDissolveEdgeColor;`,
    inject: `
  float h2 = fract(sin(dot(vUv, vec2(127.1, 311.7))) * 43758.5453);
  if (h2 < uDissolveThreshold) discard;
  float edge = smoothstep(uDissolveThreshold, uDissolveThreshold + 0.05, h2);
  diffuseColor.rgb = mix(uDissolveEdgeColor, diffuseColor.rgb, edge);`,
    defaults: `{ uDissolveThreshold: { value: 0.0 }, uDissolveEdgeColor: { value: new THREE.Color(0xff6600) } }`
  },
};

let _shaderLib = {
  snippet: Object.keys(SHADER_SNIPPETS)[0],
  status: "idle",
  _appliedSnippets: [],
  _uniformTimers: [],
};

// ─── Camera Curve State ──────────────────────────────────────────
const _cameraCurve = {
  enabled: false,
  points: [],          // { x, y, z } per control point
  flowMap: {},         // { [flowIndex]: curveT }
  tension: 0.5,
  lookAtOrigin: true,
  lookAtX: 0,
  lookAtY: 0,
  lookAtZ: 0,
  shake: false,
  shakeAmplitude: 0.12,
  shakeFrequency: 18.0,
  shakeDecay: 0.92,
  shakeActive: 0.0,    // internal blend weight
  _curve: null,        // THREE.CatmullRomCurve3 instance
  _lastFlowIndex: -1,
  status: "no points",
  addStatus: "idle",
};

const _sceneBuilder = {
  enabled: true,
  orbitRadius: 20,
  orbitSpeed: 0.18,
  orbitTiltDeg: 10,
  curvatureStrength: 1.35,
  curvatureExpo: 1.7,
  yBias: 0,
  yCurvature: 0.48,
  yWaveAmp: 0.36,
  yWaveSpeed: 0.44,
  lookAtX: 0,
  lookAtY: 0,
  lookAtZ: 0,
};
let _projectionLayerEl = null;
let _projectionRaycaster = new THREE.Raycaster();
let _projectionPointer = new THREE.Vector2();
let _projectionMouse = { x: 0, y: 0 };
let _projectionPickHandler = null;
let _projectionHoverPoint = null;
let _projectionHoverMeshUUID = null;
let _projectionHoverMeshName = "";
let _projectionRuntimeActionHandler = null;
let _projectionAssetControllers = {
  picker: null,
  drop: null,
  refresh: null,
  status: null,
};

let _isApplyingSnapshot = false;
let _autoApplyTimer = 0;
let _applyRequestSerial = 0;
let _applyKeydownHandler = null;

function _ensureHud() {
  if (typeof document === "undefined") return;
  if (_hud.root && document.body.contains(_hud.root)) return;

  const root = document.createElement("div");
  root.className = "dev-scene-hud";
  root.style.position = "fixed";
  root.style.left = "12px";
  root.style.bottom = "12px";
  root.style.zIndex = "99998";
  root.style.pointerEvents = "none";
  root.style.minWidth = "280px";
  root.style.maxWidth = "420px";
  root.style.padding = "10px 12px";
  root.style.border = "1px solid rgba(80, 220, 255, 0.28)";
  root.style.background = "rgba(6, 12, 18, 0.82)";
  root.style.backdropFilter = "blur(8px)";
  root.style.boxShadow = "0 12px 34px rgba(0, 0, 0, 0.28)";
  root.style.color = "#d8f7ff";
  root.style.fontFamily = '"IBM Plex Sans", sans-serif';
  root.style.fontSize = "11px";
  root.style.lineHeight = "1.35";

  const info = document.createElement("div");
  info.className = "dev-scene-hud__info";
  info.style.whiteSpace = "pre-wrap";

  const status = document.createElement("div");
  status.className = "dev-scene-hud__status";
  status.style.marginTop = "8px";
  status.style.paddingTop = "8px";
  status.style.borderTop = "1px solid rgba(80, 220, 255, 0.18)";
  status.style.fontWeight = "600";
  status.style.letterSpacing = "0.02em";

  root.appendChild(info);
  root.appendChild(status);
  document.body.appendChild(root);

  _hud.root = root;
  _hud.info = info;
  _hud.status = status;
}

function _destroyHud() {
  if (_hud.root?.parentNode) {
    _hud.root.parentNode.removeChild(_hud.root);
  }
  _hud = {
    root: null,
    info: null,
    status: null,
    message: "idle",
    tone: "idle",
  };
}

function _applyDevToolsEnabledState() {
  if (_gui?.domElement) {
    _gui.domElement.style.display = _devToolsEnabled ? "block" : "none";
  }

  if (_hud.root) {
    _hud.root.style.display = _devToolsEnabled ? "block" : "none";
  }

  if (!_devToolsEnabled) {
    if (_selectionOutline) {
      _selectionOutline.visible = false;
    }
    if (_selectionOrientation) {
      _selectionOrientation.visible = false;
    }
    _destroyProjectionLayer();
    _setHudStatus("Scene Inspector disabled", "idle");
    return;
  }

  _setHudStatus(`Ready: ${_activeLabel || "Scene Inspector"}`, "idle");
  _refreshGui();
}

function _setHudTone(tone) {
  if (!_hud.status) return;
  if (tone === "pending") {
    _hud.status.style.color = "#ffd36b";
    return;
  }
  if (tone === "success") {
    _hud.status.style.color = "#7dffbe";
    return;
  }
  if (tone === "error") {
    _hud.status.style.color = "#ff8f8f";
    return;
  }
  _hud.status.style.color = "#9edff0";
}

function _setHudStatus(message, tone = "idle") {
  _ensureHud();
  _hud.message = message;
  _hud.tone = tone;
  if (_hud.status) {
    _hud.status.textContent = message;
    _setHudTone(tone);
  }
}

function _formatShortVec(values, digits) {
  return values.map((value) => Number(value).toFixed(digits)).join(", ");
}

function _updateHudInfo() {
  _ensureHud();
  if (!_hud.info) return;

  const pivot = _getPivot();
  if (!pivot) {
    _hud.info.textContent = "No active object";
    return;
  }

  const position = [pivot.position.x, pivot.position.y, pivot.position.z];
  const rotation = [DEG(pivot.rotation.x), DEG(pivot.rotation.y), DEG(pivot.rotation.z)];
  const scale = [pivot.scale.x, pivot.scale.y, pivot.scale.z];
  const lines = [
    `Object: ${_activeLabel || "—"}`,
    `Pos: ${_formatShortVec(position, 3)}`,
    `Rot°: ${_formatShortVec(rotation, 2)}`,
    `Scale: ${_formatShortVec(scale, 3)}`,
    `Visible: ${pivot.visible ? "true" : "false"} | Last: ${_sync.lastAction}`,
    `Export: ${_sync.lastExportSize} bytes | Source: ${_sync.sourceDirty ? "dirty" : "synced"}`,
    `Source Status: ${_sync.sourceStatus}`,
    `Verify: ${_sync.verificationStatus}`,
    `Projection: ${_projection.pickActive ? "picking" : "idle"} | Corners: ${_projection.draftCorners}/4`,
    `Hit Mesh: ${_projection.hoverMeshName}`,
    `Hit Point: ${_projection.hoverPoint}`,
  ];

  _hud.info.textContent = lines.join("\n");
  if (_hud.status) {
    _hud.status.textContent = _hud.message;
    _setHudTone(_hud.tone);
  }
}

function _refreshGui() {
  _gui?.controllersRecursive?.().forEach((c) => c.updateDisplay());
  _updateHudInfo();
}

function _getSelectionTargets() {
  return _getTargetStates()
    .map((state) => state?.root || state?.pivot || null)
    .filter(Boolean);
}

function _getSelectionPivot() {
  const states = _getTargetStates();
  return states[0]?.pivot || states[0]?.root || null;
}

function _getSelectionAttachmentParent(target) {
  let node = target || null;
  while (node?.parent) {
    node = node.parent;
  }
  return node;
}

function _disposeSelectionHelper() {
  if (_selectionHelperParent && _selectionOutline) {
    _selectionHelperParent.remove(_selectionOutline);
  }
  if (_selectionHelperParent && _selectionOrientation) {
    _selectionHelperParent.remove(_selectionOrientation);
  }

  if (_selectionOutline?.geometry) {
    _selectionOutline.geometry.dispose();
  }
  if (_selectionOutline?.material) {
    _selectionOutline.material.dispose();
  }

  if (_selectionOrientation) {
    _selectionOrientation.traverse((node) => {
      if (node?.geometry) {
        node.geometry.dispose();
      }
      if (node?.material) {
        if (Array.isArray(node.material)) {
          node.material.forEach((material) => material?.dispose?.());
        } else {
          node.material.dispose();
        }
      }
    });
  }

  _selectionOutline = null;
  _selectionOrientation = null;
  _selectionHelperParent = null;
  _selection.status = "idle";
}

function _createMarchingAntsOutline() {
  const geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
  const positions = geometry.getAttribute("position");
  const lineDistances = new Float32Array(positions.count);

  for (let i = 0; i < positions.count; i += 2) {
    const ax = positions.getX(i);
    const ay = positions.getY(i);
    const az = positions.getZ(i);
    const bx = positions.getX(i + 1);
    const by = positions.getY(i + 1);
    const bz = positions.getZ(i + 1);
    const segmentLength = Math.sqrt(
      (bx - ax) * (bx - ax) +
        (by - ay) * (by - ay) +
        (bz - az) * (bz - az),
    );
    lineDistances[i] = 0;
    lineDistances[i + 1] = segmentLength;
  }

  geometry.setAttribute(
    "lineDistance",
    new THREE.Float32BufferAttribute(lineDistances, 1),
  );

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(_selection.color) },
      uOpacity: { value: 0.82 },
      uDashSize: { value: 0.2 },
      uGapSize: { value: 0.16 },
      uDashOffset: { value: 0 },
    },
    vertexShader: `
      attribute float lineDistance;
      varying float vLineDistance;

      void main() {
        vLineDistance = lineDistance;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uDashSize;
      uniform float uGapSize;
      uniform float uDashOffset;
      varying float vLineDistance;

      void main() {
        float cycle = max(uDashSize + uGapSize, 0.0001);
        float dashPos = mod(vLineDistance + uDashOffset, cycle);
        if (dashPos > uDashSize) {
          discard;
        }
        gl_FragColor = vec4(uColor, uOpacity);
      }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });

  const outline = new THREE.LineSegments(geometry, material);
  outline.frustumCulled = false;
  outline.renderOrder = 9999;
  return outline;
}

function _createOrientationHelper() {
  const group = new THREE.Group();
  group.visible = false;
  group.renderOrder = 9998;

  const axes = new THREE.AxesHelper(1);
  axes.renderOrder = 9998;
  if (axes.material) {
    axes.material.depthTest = false;
    axes.material.depthWrite = false;
    axes.material.toneMapped = false;
    axes.material.transparent = true;
    axes.material.opacity = 0.95;
  }
  group.add(axes);

  const planeConfigs = [
    {
      color: 0xff5f57,
      position: [0.22, 0.22, 0],
      rotation: [0, 0, 0],
    },
    {
      color: 0x29d17d,
      position: [0.22, 0, 0.22],
      rotation: [Math.PI * 0.5, 0, 0],
    },
    {
      color: 0x4db5ff,
      position: [0, 0.22, 0.22],
      rotation: [0, Math.PI * 0.5, 0],
    },
  ];

  planeConfigs.forEach((config) => {
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.32, 0.32),
      new THREE.MeshBasicMaterial({
        color: config.color,
        transparent: true,
        opacity: 0.12,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    plane.position.set(config.position[0], config.position[1], config.position[2]);
    plane.rotation.set(config.rotation[0], config.rotation[1], config.rotation[2]);
    plane.renderOrder = 9998;
    group.add(plane);

    const planeOutline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.32, 0.32)),
      new THREE.LineBasicMaterial({
        color: config.color,
        transparent: true,
        opacity: 0.55,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    planeOutline.position.copy(plane.position);
    planeOutline.rotation.copy(plane.rotation);
    planeOutline.renderOrder = 9998;
    group.add(planeOutline);
  });

  return group;
}

function _ensureSelectionHelper(parent) {
  if (!parent) return null;
  if (_selectionOutline && _selectionOrientation && _selectionHelperParent === parent) {
    return {
      outline: _selectionOutline,
      orientation: _selectionOrientation,
    };
  }

  _disposeSelectionHelper();
  _selectionOutline = _createMarchingAntsOutline();
  _selectionOrientation = _createOrientationHelper();
  parent.add(_selectionOutline);
  parent.add(_selectionOrientation);
  _selectionHelperParent = parent;
  return {
    outline: _selectionOutline,
    orientation: _selectionOrientation,
  };
}

function _updateSelectionHelper(elapsed = 0) {
  if (!_selection.enabled) {
    if (_selectionOutline) {
      _selectionOutline.visible = false;
    }
    if (_selectionOrientation) {
      _selectionOrientation.visible = false;
    }
    _selection.status = "disabled";
    return;
  }

  const targets = _getSelectionTargets();
  if (!targets.length) {
    if (_selectionOutline) {
      _selectionOutline.visible = false;
    }
    if (_selectionOrientation) {
      _selectionOrientation.visible = false;
    }
    _selection.status = "no target";
    return;
  }

  const pivot = _getSelectionPivot();
  const parent = _getSelectionAttachmentParent(targets[0]);
  const helper = _ensureSelectionHelper(parent);
  if (!helper) {
    _selection.status = "missing parent";
    return;
  }

  let hasBounds = false;
  _selectionBounds.makeEmpty();
  targets.forEach((target) => {
    target.updateWorldMatrix(true, true);
    const nextBox = new THREE.Box3().setFromObject(target);
    if (nextBox.isEmpty()) {
      return;
    }
    if (!hasBounds) {
      _selectionBounds.copy(nextBox);
      hasBounds = true;
      return;
    }
    _selectionBounds.union(nextBox);
  });

  if (!hasBounds) {
    helper.outline.visible = false;
    helper.orientation.visible = false;
    _selection.status = "empty bounds";
    return;
  }

  _selectionBounds.getCenter(_selectionCenter);
  _selectionBounds.getSize(_selectionSize);
  const pad = Math.max(_selectionSize.length() * 0.015, 0.02);
  _selectionBounds.expandByScalar(pad);

  _selectionBounds.getCenter(_selectionCenter);
  _selectionBounds.getSize(_selectionSize);

  helper.outline.position.copy(_selectionCenter);
  helper.outline.scale.set(
    Math.max(_selectionSize.x, 0.001),
    Math.max(_selectionSize.y, 0.001),
    Math.max(_selectionSize.z, 0.001),
  );
  helper.outline.visible = true;
  if (helper.outline.material?.uniforms) {
    if (helper.outline.material.uniforms.uDashOffset) {
      helper.outline.material.uniforms.uDashOffset.value = _selection.animateOutline
        ? -elapsed * _selection.antsSpeed
        : 0;
    }
    if (helper.outline.material.uniforms.uDashSize) {
      helper.outline.material.uniforms.uDashSize.value = _selection.animateOutline
        ? 0.2
        : 10;
    }
    if (helper.outline.material.uniforms.uGapSize) {
      helper.outline.material.uniforms.uGapSize.value = _selection.animateOutline
        ? 0.16
        : 0.0001;
    }
  }
  helper.outline.updateMatrixWorld(true);

  const orientationScale = Math.max(_selectionSize.length() * 0.12, 0.35);
  if (pivot) {
    const worldPosition = new THREE.Vector3();
    const worldQuaternion = new THREE.Quaternion();
    const worldScale = new THREE.Vector3();
    pivot.updateWorldMatrix(true, true);
    pivot.matrixWorld.decompose(worldPosition, worldQuaternion, worldScale);
    helper.orientation.position.copy(worldPosition);
    helper.orientation.quaternion.copy(worldQuaternion);
  } else {
    helper.orientation.position.copy(_selectionCenter);
    helper.orientation.quaternion.identity();
  }
  helper.orientation.scale.setScalar(orientationScale);
  helper.orientation.visible = true;
  helper.orientation.updateMatrixWorld(true);

  _selection.status = `tracking ${_activeLabel || "selection"}`;
}

function _cloneProjectionOverlayMap() {
  const out = {};
  Object.entries(_projectionOverlayMap).forEach(([label, overlay]) => {
    out[label] = {
      targetLabel: overlay.targetLabel,
      meshUUID: overlay.meshUUID,
      meshName: overlay.meshName,
      text: overlay.text,
      corners: (overlay.corners || []).map((p) => [p.x, p.y, p.z]),
      autoFit: overlay.autoFit ? _deepClone(overlay.autoFit) : null,
      style: {
        fontSize: overlay.style?.fontSize ?? _projection.fontSize,
        padding: overlay.style?.padding ?? _projection.padding,
        textColor: overlay.style?.textColor ?? _projection.textColor,
        bgColor: overlay.style?.bgColor ?? _projection.bgColor,
        bgAlpha: overlay.style?.bgAlpha ?? _projection.bgAlpha,
        parallaxX: overlay.style?.parallaxX ?? _projection.parallaxX,
        parallaxY: overlay.style?.parallaxY ?? _projection.parallaxY,
        easing: overlay.style?.easing ?? _projection.easing,
        contentMode: overlay.style?.contentMode ?? _projection.contentMode,
        assetSrc: overlay.style?.assetSrc ?? _projection.assetSrc,
        assetAlt: overlay.style?.assetAlt ?? _projection.assetAlt,
        textAnimation: overlay.style?.textAnimation ?? _projection.textAnimation,
        textAnimationSpeed: overlay.style?.textAnimationSpeed ?? _projection.textAnimationSpeed,
      },
    };
  });
  return out;
}

function _restoreProjectionOverlayMap(serialized) {
  _projectionOverlayMap = {};
  Object.entries(serialized || {}).forEach(([label, overlay]) => {
    _projectionOverlayMap[label] = {
      targetLabel: overlay.targetLabel,
      meshUUID: overlay.meshUUID,
      meshName: overlay.meshName,
      text: overlay.text,
      corners: (overlay.corners || []).map((p) => new THREE.Vector3(p[0], p[1], p[2])),
      autoFit: overlay.autoFit ? _deepClone(overlay.autoFit) : null,
      style: {
        fontSize: overlay.style?.fontSize ?? _projection.fontSize,
        padding: overlay.style?.padding ?? _projection.padding,
        textColor: overlay.style?.textColor ?? _projection.textColor,
        bgColor: overlay.style?.bgColor ?? _projection.bgColor,
        bgAlpha: overlay.style?.bgAlpha ?? _projection.bgAlpha,
        parallaxX: overlay.style?.parallaxX ?? _projection.parallaxX,
        parallaxY: overlay.style?.parallaxY ?? _projection.parallaxY,
        easing: overlay.style?.easing ?? _projection.easing,
        contentMode: overlay.style?.contentMode ?? _projection.contentMode,
        assetSrc: overlay.style?.assetSrc ?? _projection.assetSrc,
        assetAlt: overlay.style?.assetAlt ?? _projection.assetAlt,
        textAnimation: overlay.style?.textAnimation ?? _projection.textAnimation,
        textAnimationSpeed: overlay.style?.textAnimationSpeed ?? _projection.textAnimationSpeed,
      },
      element: null,
      elementInner: null,
    };
  });
}

function _ensureProjectionLayer() {
  if (typeof document === "undefined") return;
  if (_projectionLayerEl && document.body.contains(_projectionLayerEl)) return;
  const el = document.createElement("div");
  el.className = "dev-projection-layer";
  el.style.position = "fixed";
  el.style.left = "0";
  el.style.top = "0";
  el.style.width = "100vw";
  el.style.height = "100vh";
  el.style.pointerEvents = "none";
  el.style.zIndex = "99990";
  document.body.appendChild(el);
  _projectionLayerEl = el;
}

function _destroyProjectionLayer() {
  if (_projectionLayerEl?.parentNode) {
    _projectionLayerEl.parentNode.removeChild(_projectionLayerEl);
  }
  _projectionLayerEl = null;
  Object.values(_projectionOverlayMap).forEach((overlay) => {
    if (!overlay) return;
    overlay.element = null;
    overlay.elementInner = null;
  });
  _projectionDraft.element = null;
  _projectionDraft.elementInner = null;
  _projectionDraft.badgeEl = null;
  _projectionDraft.previewTextEl = null;
  _projectionDraft.tickEls = [];
  _projectionDraft.guideEl = null;
  _projectionDraft.polylineEl = null;
  _projectionDraft.hoverMarkerEl = null;
}

function _resetProjectionDraft() {
  _projectionDraft.targetLabel = "";
  _projectionDraft.meshUUID = null;
  _projectionDraft.meshName = "";
  _projectionDraft.text = "";
  _projectionDraft.corners = [];
  _projectionDraft.style = {};
  if (_projectionDraft.element?.parentNode) {
    _projectionDraft.element.parentNode.removeChild(_projectionDraft.element);
  }
  _projectionDraft.element = null;
  _projectionDraft.elementInner = null;
  _projectionDraft.badgeEl = null;
  _projectionDraft.previewTextEl = null;
  _projectionDraft.tickEls = [];
  _projectionDraft.guideEl = null;
  _projectionDraft.polylineEl = null;
  _projectionDraft.hoverMarkerEl = null;
}

function _hasProjectionDraft() {
  return Array.isArray(_projectionDraft.corners) && _projectionDraft.corners.length > 0;
}

function _syncProjectionDebugState() {
  _projection.hoverMeshName = _projectionHoverMeshUUID
    ? (_projectionHoverMeshName || _projectionDraft.meshName || _projection.targetMeshName || "—")
    : "—";
  _projection.hoverPoint = _projectionHoverPoint
    ? [
        _projectionHoverPoint.x.toFixed(3),
        _projectionHoverPoint.y.toFixed(3),
        _projectionHoverPoint.z.toFixed(3),
      ].join(", ")
    : "—";
  _projection.draftCorners = Array.isArray(_projectionDraft.corners)
    ? _projectionDraft.corners.filter(Boolean).length
    : 0;
}

function _syncProjectionDraftFromOverlay(overlay, label) {
  _resetProjectionDraft();
  _projectionDraft.targetLabel = label || _activeLabel;
  _projectionDraft.meshUUID = overlay?.meshUUID || null;
  _projectionDraft.meshName = overlay?.meshName || "";
  _projectionDraft.text = overlay?.text || _projection.text;
  _projectionDraft.corners = (overlay?.corners || []).map((point) => point.clone());
  _projectionDraft.style = {
    fontSize: overlay?.style?.fontSize ?? _projection.fontSize,
    padding: overlay?.style?.padding ?? _projection.padding,
    textColor: overlay?.style?.textColor ?? _projection.textColor,
    bgColor: overlay?.style?.bgColor ?? _projection.bgColor,
    bgAlpha: overlay?.style?.bgAlpha ?? _projection.bgAlpha,
    parallaxX: overlay?.style?.parallaxX ?? _projection.parallaxX,
    parallaxY: overlay?.style?.parallaxY ?? _projection.parallaxY,
    easing: overlay?.style?.easing ?? _projection.easing,
    contentMode: overlay?.style?.contentMode ?? _projection.contentMode,
    assetSrc: overlay?.style?.assetSrc ?? _projection.assetSrc,
    assetAlt: overlay?.style?.assetAlt ?? _projection.assetAlt,
    textAnimation: overlay?.style?.textAnimation ?? _projection.textAnimation,
    textAnimationSpeed: overlay?.style?.textAnimationSpeed ?? _projection.textAnimationSpeed,
  };
}

function _ensureProjectionDraftElements() {
  _ensureProjectionLayer();
  if (!_projectionLayerEl) return;
  if (
    _projectionDraft.element
    && _projectionDraft.elementInner
    && _projectionDraft.badgeEl
    && _projectionDraft.previewTextEl
    && _projectionDraft.hoverMarkerEl
    && _projectionDraft.tickEls.length === 4
  ) {
    return;
  }

  const el = document.createElement("div");
  el.className = "dev-projection-draft";
  el.style.position = "absolute";
  el.style.pointerEvents = "none";
  el.style.display = "none";
  el.style.border = "1px solid rgba(255, 167, 38, 0.95)";
  el.style.background = "rgba(255, 167, 38, 0.08)";
  el.style.boxShadow = "0 0 0 1px rgba(255, 110, 0, 0.22) inset, 0 0 18px rgba(255, 140, 64, 0.18)";
  el.style.backdropFilter = "blur(1px)";

  const inner = document.createElement("div");
  inner.className = "dev-projection-draft__inner";
  inner.style.position = "absolute";
  inner.style.left = "0";
  inner.style.top = "0";
  inner.style.right = "0";
  inner.style.bottom = "0";
  inner.style.display = "grid";
  inner.style.placeItems = "center";
  inner.style.fontFamily = '"IBM Plex Sans", sans-serif';
  inner.style.fontSize = "11px";
  inner.style.fontWeight = "700";
  inner.style.padding = "8px";
  inner.style.textAlign = "center";
  inner.style.letterSpacing = "0.08em";
  inner.style.textTransform = "uppercase";
  inner.style.color = "rgba(255, 198, 124, 0.96)";
  inner.style.textShadow = "0 0 14px rgba(255, 132, 43, 0.48)";
  inner.style.pointerEvents = "none";
  el.appendChild(inner);

  const previewText = document.createElement("div");
  previewText.className = "dev-projection-draft__preview-text";
  previewText.style.maxWidth = "100%";
  previewText.style.padding = "10px 12px";
  previewText.style.border = "1px solid rgba(255, 214, 170, 0.55)";
  previewText.style.background = "rgba(7, 15, 20, 0.52)";
  previewText.style.boxShadow = "0 0 18px rgba(255, 140, 64, 0.18)";
  previewText.style.color = "#eafaff";
  previewText.style.fontSize = "15px";
  previewText.style.fontWeight = "600";
  previewText.style.letterSpacing = "0.02em";
  previewText.style.textTransform = "none";
  previewText.style.lineHeight = "1.2";
  previewText.style.backdropFilter = "blur(4px)";
  previewText.style.wordBreak = "break-word";
  inner.appendChild(previewText);

  const badge = document.createElement("div");
  badge.className = "dev-projection-draft__badge";
  badge.style.position = "absolute";
  badge.style.left = "8px";
  badge.style.top = "8px";
  badge.style.padding = "4px 7px";
  badge.style.border = "1px solid rgba(255, 183, 91, 0.85)";
  badge.style.background = "rgba(14, 18, 20, 0.84)";
  badge.style.boxShadow = "0 0 10px rgba(255, 145, 57, 0.2)";
  badge.style.color = "rgba(255, 201, 131, 0.98)";
  badge.style.fontSize = "10px";
  badge.style.fontWeight = "700";
  badge.style.letterSpacing = "0.08em";
  badge.style.textTransform = "uppercase";
  badge.style.pointerEvents = "none";
  el.appendChild(badge);

  const guide = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  guide.setAttribute("class", "dev-projection-draft__guide");
  guide.setAttribute("width", "100%");
  guide.setAttribute("height", "100%");
  guide.setAttribute("viewBox", "0 0 100 100");
  guide.setAttribute("preserveAspectRatio", "none");
  guide.style.position = "absolute";
  guide.style.left = "0";
  guide.style.top = "0";
  guide.style.width = "100%";
  guide.style.height = "100%";
  guide.style.pointerEvents = "none";
  const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  polyline.setAttribute("fill", "rgba(255, 167, 38, 0.08)");
  polyline.setAttribute("stroke", "rgba(255, 163, 59, 0.98)");
  polyline.setAttribute("stroke-width", "1.6");
  polyline.setAttribute("vector-effect", "non-scaling-stroke");
  guide.appendChild(polyline);
  el.appendChild(guide);

  const ticks = [];
  for (let i = 0; i < 4; i += 1) {
    const tick = document.createElement("div");
    tick.className = "dev-projection-draft__tick";
    tick.style.position = "absolute";
    tick.style.width = "14px";
    tick.style.height = "14px";
    tick.style.border = "2px solid rgba(255, 163, 59, 0.98)";
    tick.style.background = "rgba(255, 122, 32, 0.18)";
    tick.style.boxShadow = "0 0 10px rgba(255, 125, 21, 0.38)";
    tick.style.transform = "translate(-50%, -50%)";
    tick.style.display = "none";
    el.appendChild(tick);
    ticks.push(tick);
  }

  const hoverMarker = document.createElement("div");
  hoverMarker.className = "dev-projection-draft__hover-marker";
  hoverMarker.style.position = "absolute";
  hoverMarker.style.width = "18px";
  hoverMarker.style.height = "18px";
  hoverMarker.style.border = "2px solid rgba(255, 211, 132, 0.98)";
  hoverMarker.style.borderRadius = "999px";
  hoverMarker.style.background = "rgba(255, 154, 54, 0.2)";
  hoverMarker.style.boxShadow = "0 0 14px rgba(255, 145, 57, 0.46)";
  hoverMarker.style.transform = "translate(-50%, -50%)";
  hoverMarker.style.display = "none";
  el.appendChild(hoverMarker);

  _projectionLayerEl.appendChild(el);
  _projectionDraft.element = el;
  _projectionDraft.elementInner = inner;
  _projectionDraft.badgeEl = badge;
  _projectionDraft.previewTextEl = previewText;
  _projectionDraft.tickEls = ticks;
  _projectionDraft.guideEl = guide;
  _projectionDraft.polylineEl = polyline;
  _projectionDraft.hoverMarkerEl = hoverMarker;
}

function _confirmProjectionDraft(trigger = "confirm") {
  if (_projectionDraft.corners.length < 4 || !_projectionDraft.targetLabel) {
    _projection.pickActive = false;
    _projection.status = _hasProjectionDraft() ? "pick stopped" : "idle";
    _syncProjectionDebugState();
    return false;
  }

  _applyMutation(`projection.commit.${trigger}`, () => {
    _projection.enabled = true;
    _projectionOverlayMap[_projectionDraft.targetLabel] = {
      targetLabel: _projectionDraft.targetLabel,
      meshUUID: _projectionDraft.meshUUID,
      meshName: _projectionDraft.meshName,
      text: _projectionDraft.text || _projection.text,
      corners: _sortProjectionCorners(_projectionDraft.corners.map((point) => point.clone())),
      style: {
        ..._projectionDraft.style,
      },
      element: null,
      elementInner: null,
    };
    _projection.pickActive = false;
    _projection.nextCorner = 0;
    _projection.status = "quad committed — press Enter to apply source";
    _syncProjectionTargetName();
    _projectionHoverPoint = null;
    _projectionHoverMeshUUID = null;
    _projectionHoverMeshName = "";
    _resetProjectionDraft();
    _syncProjectionDebugState();
  });

  return true;
}

function _sortProjectionCorners(corners) {
  if (!Array.isArray(corners) || corners.length < 4) return corners;
  const projected = corners
    .map((corner) => ({ corner, screen: _projectToScreen(corner) }))
    .filter((entry) => entry.screen);
  if (projected.length < 4) return corners;

  const cx = projected.reduce((sum, entry) => sum + entry.screen.x, 0) / projected.length;
  const cy = projected.reduce((sum, entry) => sum + entry.screen.y, 0) / projected.length;
  projected.sort((a, b) => {
    const aa = Math.atan2(a.screen.y - cy, a.screen.x - cx);
    const bb = Math.atan2(b.screen.y - cy, b.screen.x - cx);
    return aa - bb;
  });

  let startIndex = 0;
  let startValue = Infinity;
  projected.forEach((entry, index) => {
    const value = entry.screen.x + entry.screen.y;
    if (value < startValue) {
      startValue = value;
      startIndex = index;
    }
  });

  return projected
    .slice(startIndex)
    .concat(projected.slice(0, startIndex))
    .map((entry) => entry.corner);
}

function _finalizeProjectionDraft(trigger = "confirm") {
  const committed = _confirmProjectionDraft(trigger);
  if (!committed) return false;
  if (_sync.autoApplyToSource && _sync.sourceDirty) {
    void _sendPayloadToSource(`projection-${trigger}`, "auto");
  }
  return true;
}

function _hexToRgba(hex, alpha) {
  const c = new THREE.Color(hex || "#ffffff");
  const r = Math.round(c.r * 255);
  const g = Math.round(c.g * 255);
  const b = Math.round(c.b * 255);
  return `rgba(${r}, ${g}, ${b}, ${THREE.MathUtils.clamp(alpha, 0, 1).toFixed(3)})`;
}

function _getFlowProgress() {
  if (typeof _config.getFlowProgress === "function") {
    const v = _config.getFlowProgress();
    return THREE.MathUtils.clamp(Number.isFinite(v) ? v : 0, 0, 1);
  }
  return 0;
}

function _sampleFlowOpacity(flowProgress, easingMode) {
  const options = _flow.options || [];
  if (!options.length) return 1;
  const pairs = options
    .map((o) => ({
      t: o.value,
      opacity: THREE.MathUtils.clamp(_projectionFlowOpacity[o.id] ?? 1, 0, 1),
    }))
    .sort((a, b) => a.t - b.t);

  if (flowProgress <= pairs[0].t) return pairs[0].opacity;
  const last = pairs[pairs.length - 1];
  if (flowProgress >= last.t) return last.opacity;

  for (let i = 0; i < pairs.length - 1; i += 1) {
    const a = pairs[i];
    const b = pairs[i + 1];
    if (flowProgress < a.t || flowProgress > b.t) continue;
    if (easingMode === "constant") return a.opacity;
    const alpha = (flowProgress - a.t) / Math.max(b.t - a.t, 0.000001);
    const eased = easingMode === "smooth" ? alpha * alpha * (3 - 2 * alpha) : alpha;
    return THREE.MathUtils.lerp(a.opacity, b.opacity, eased);
  }
  return last.opacity;
}

function _findMeshByUUID(uuid) {
  if (!uuid) return null;
  for (const state of Object.values(_registry)) {
    const pivot = state?.pivot;
    if (!pivot) continue;
    let found = null;
    pivot.traverse((n) => {
      if (!found && n?.isMesh && n.uuid === uuid) found = n;
    });
    if (found) return found;
  }
  return null;
}

function _collectProjectionCandidates(state) {
  const pivot = state?.pivot;
  if (!pivot) return [];
  const camera = _config.camera;
  const renderer = _config.renderer;
  if (!camera || !renderer) return [];

  const bounds = renderer.domElement.getBoundingClientRect();
  const box = new THREE.Box3();
  const center = new THREE.Vector3();
  const candidates = [];

  pivot.traverse((node) => {
    if (!node?.isMesh || !node.geometry) return;
    box.setFromObject(node);
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const dims = [Math.abs(size.x), Math.abs(size.y), Math.abs(size.z)].sort((a, b) => b - a);
    const major = Math.max(dims[0], 0.000001);
    const minor = dims[1] / major;
    const thickness = dims[2] / major;
    const aspect = dims[0] / Math.max(dims[1], 0.000001);

    if (aspect > _projection.maxAspect) return;
    if (minor < _projection.minFillRatio) return;
    if (thickness < _projection.minThicknessRatio) return;
    if (thickness > _projection.maxThicknessRatio) return;

    const c = box.getCenter(center.clone());
    const ndc = c.clone().project(camera);
    if (!Number.isFinite(ndc.x) || !Number.isFinite(ndc.y) || ndc.z > 1.2) return;
    const sx = (ndc.x * 0.5 + 0.5) * bounds.width;
    const sy = (1 - (ndc.y * 0.5 + 0.5)) * bounds.height;
    const dx = sx - bounds.width * 0.5;
    const dy = sy - bounds.height * 0.5;
    const centerDist = Math.sqrt(dx * dx + dy * dy) / Math.max(bounds.width, bounds.height);
    const score = minor - centerDist * 0.9;

    candidates.push({ node, score, aspect, thickness, minor });
  });

  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

function _syncProjectionTargetName() {
  const overlay = _projectionOverlayMap[_activeLabel];
  _projection.targetMeshName = overlay?.meshName || "— none —";
}

function _autoSelectProjectionMesh() {
  const state = _active;
  if (!state) return;
  const candidates = _collectProjectionCandidates(state);
  if (!candidates.length) {
    _projection.status = "no valid rectangular mesh";
    return;
  }
  const chosen = candidates[0].node;
  const overlay = _projectionOverlayMap[_activeLabel] || {
    targetLabel: _activeLabel,
    meshUUID: null,
    meshName: "",
    text: _projection.text,
    corners: [],
    style: {},
    element: null,
    elementInner: null,
  };
  overlay.meshUUID = chosen.uuid;
  overlay.meshName = chosen.name || chosen.uuid.slice(0, 8);
  overlay.style = {
    fontSize: _projection.fontSize,
    padding: _projection.padding,
    textColor: _projection.textColor,
    bgColor: _projection.bgColor,
    bgAlpha: _projection.bgAlpha,
    parallaxX: _projection.parallaxX,
    parallaxY: _projection.parallaxY,
    easing: _projection.easing,
    contentMode: _projection.contentMode,
    assetSrc: _projection.assetSrc,
    assetAlt: _projection.assetAlt,
    textAnimation: _projection.textAnimation,
    textAnimationSpeed: _projection.textAnimationSpeed,
  };
  _projectionOverlayMap[_activeLabel] = overlay;
  _projection.status = `selected ${overlay.meshName}`;
  _syncProjectionTargetName();
}

function _getRendererBounds() {
  const renderer = _config.renderer;
  if (!renderer?.domElement) return null;
  return renderer.domElement.getBoundingClientRect();
}

function _pickWorldPointFromEvent(event) {
  const renderer = _config.renderer;
  const camera = _config.camera;
  const state = _active;
  if (!renderer?.domElement || !camera || !state?.pivot) return null;
  const bounds = _getRendererBounds();
  if (!bounds) return null;
  const insideBounds =
    event.clientX >= bounds.left
    && event.clientX <= bounds.right
    && event.clientY >= bounds.top
    && event.clientY <= bounds.bottom;
  if (!insideBounds) return null;
  _projectionPointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  _projectionPointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;

  _projectionRaycaster.setFromCamera(_projectionPointer, camera);
  const overlay = _projectionOverlayMap[_activeLabel];
  const targetMesh = _findMeshByUUID(overlay?.meshUUID);
  if (targetMesh) {
    const hits = _projectionRaycaster.intersectObject(targetMesh, true);
    if (hits.length) {
      return {
        point: hits[0].point.clone(),
        mesh: hits[0].object,
        face: hits[0].face || null,
      };
    }
  }
  const hits = _projectionRaycaster.intersectObject(state.pivot, true);
  if (!hits.length) return null;
  return { point: hits[0].point.clone(), mesh: hits[0].object, face: hits[0].face || null };
}

function _attachProjectionPointerHandlers() {
  const renderer = _config.renderer;
  const dom = renderer?.domElement;
  if (!dom || _projectionPickHandler) return;
  _projectionPointerTarget = window;

  _projectionPickHandler = (event) => {
    if (!(event instanceof PointerEvent)) return;
    const bounds = _getRendererBounds();
    if (bounds) {
      _projectionMouse.x = ((event.clientX - bounds.left) / Math.max(bounds.width, 1) - 0.5) * 2;
      _projectionMouse.y = ((event.clientY - bounds.top) / Math.max(bounds.height, 1) - 0.5) * 2;
    }
    const target = event.target;
    if (target instanceof Element && (target.closest(".lil-gui") || target.closest(".devtools-hud"))) {
      return;
    }

    if (event.type === "pointermove") {
      const hoverHit = _pickWorldPointFromEvent(event);
      _projectionHoverPoint = hoverHit?.point || null;
      _projectionHoverMeshUUID = hoverHit?.mesh?.uuid || null;
      _projectionHoverMeshName = hoverHit?.mesh?.name || hoverHit?.mesh?.uuid?.slice(0, 8) || "";
      if (hoverHit) {
        _projection.status = _projection.pickActive
          ? `hover ${_projectionHoverMeshName} • click corner ${Math.min(_projectionDraft.corners.filter(Boolean).length + 1, 4)}/4`
          : `hover ${_projectionHoverMeshName}`;
      } else if (!_projection.pickActive) {
        _projection.status = _projection.enabled ? "hover scanning" : _projection.status;
      }
      _syncProjectionDebugState();
    }
    if (event.type !== "pointerdown") return;
    if (!_projection.pickActive) return;

    const isInsideCanvas = !!bounds
      && event.clientX >= bounds.left
      && event.clientX <= bounds.right
      && event.clientY >= bounds.top
      && event.clientY <= bounds.bottom;
    if (!isInsideCanvas) return;

    event.preventDefault();

    const hit = _pickWorldPointFromEvent(event);
    if (!hit) {
      _projection.status = "pick missed mesh";
      _projectionHoverMeshName = "";
      _syncProjectionDebugState();
      return;
    }

    _applyMutation("projection.pick-corner", () => {
      if (_projectionDraft.targetLabel !== _activeLabel || !_hasProjectionDraft()) {
        const existingOverlay = _projectionOverlayMap[_activeLabel];
        if (existingOverlay?.corners?.length >= 4) {
          _syncProjectionDraftFromOverlay(existingOverlay, _activeLabel);
        } else {
          _resetProjectionDraft();
          _projectionDraft.targetLabel = _activeLabel;
        }
      }

      _projectionDraft.targetLabel = _activeLabel;
      _projection.enabled = true;
      _projectionDraft.meshUUID = hit.mesh.uuid;
      _projectionDraft.meshName = hit.mesh.name || hit.mesh.uuid.slice(0, 8);
      _projectionDraft.text = _projection.text;
      _projectionDraft.style = {
        fontSize: _projection.fontSize,
        padding: _projection.padding,
        textColor: _projection.textColor,
        bgColor: _projection.bgColor,
        bgAlpha: _projection.bgAlpha,
        parallaxX: _projection.parallaxX,
        parallaxY: _projection.parallaxY,
        easing: _projection.easing,
        contentMode: _projection.contentMode,
        assetSrc: _projection.assetSrc,
        assetAlt: _projection.assetAlt,
        textAnimation: _projection.textAnimation,
        textAnimationSpeed: _projection.textAnimationSpeed,
      };
      _projectionDraft.corners[_projection.nextCorner] = hit.point.clone();

      const overlay = _projectionOverlayMap[_activeLabel] || {
        targetLabel: _activeLabel,
        meshUUID: hit.mesh.uuid,
        meshName: hit.mesh.name || hit.mesh.uuid.slice(0, 8),
        text: _projection.text,
        corners: [],
        style: {},
        element: null,
        elementInner: null,
      };
      overlay.meshUUID = hit.mesh.uuid;
      overlay.meshName = hit.mesh.name || hit.mesh.uuid.slice(0, 8);
      overlay.text = _projectionDraft.text;
      overlay.style = {
        ...(overlay.style || {}),
        ..._projectionDraft.style,
      };
      _projectionOverlayMap[_activeLabel] = overlay;
      _projection.nextCorner += 1;
      if (_projection.nextCorner >= 4) {
        _projection.nextCorner = 0;
        _projection.status = "quad ready — press Enter or Stop Pick to commit";
      } else {
        _projection.status = `picked corner ${_projection.nextCorner} / 4`;
      }
      _syncProjectionTargetName();
      _projectionHoverPoint = hit.point.clone();
      _projectionHoverMeshUUID = hit.mesh.uuid;
      _projectionHoverMeshName = hit.mesh.name || hit.mesh.uuid.slice(0, 8);
      _syncProjectionDebugState();
    });
  };

  window.addEventListener("pointerdown", _projectionPickHandler, true);
  window.addEventListener("pointermove", _projectionPickHandler, true);
}

function _detachProjectionPointerHandlers() {
  if (_projectionPointerTarget && _projectionPickHandler) {
    _projectionPointerTarget.removeEventListener("pointerdown", _projectionPickHandler, true);
    _projectionPointerTarget.removeEventListener("pointermove", _projectionPickHandler, true);
  }
  _projectionPointerTarget = null;
  _projectionPickHandler = null;
  _projectionHoverPoint = null;
  _projectionHoverMeshUUID = null;
  _projectionHoverMeshName = "";
  _syncProjectionDebugState();
}

function _projectToScreen(point) {
  const camera = _config.camera;
  const bounds = _getRendererBounds();
  if (!camera || !bounds) return null;
  const ndc = point.clone().project(camera);
  if (!Number.isFinite(ndc.x) || !Number.isFinite(ndc.y) || ndc.z < -1.5 || ndc.z > 1.5) return null;
  return {
    x: (ndc.x * 0.5 + 0.5) * bounds.width,
    y: (1 - (ndc.y * 0.5 + 0.5)) * bounds.height,
  };
}

function _computeQuadArea2D(corners2d) {
  if (!Array.isArray(corners2d) || corners2d.length < 4) return 0;
  const [tl, tr, br, bl] = corners2d;
  return Math.abs(
    tl.x * tr.y - tr.x * tl.y
      + tr.x * br.y - br.x * tr.y
      + br.x * bl.y - bl.x * br.y
      + bl.x * tl.y - tl.x * bl.y,
  ) * 0.5;
}

function _isProjectionQuadUsable(corners2d) {
  if (!Array.isArray(corners2d) || corners2d.length < 4) return false;
  const [tl, tr, br, bl] = corners2d;
  const edgeTop = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  const edgeLeft = Math.hypot(bl.x - tl.x, bl.y - tl.y);
  const area = _computeQuadArea2D(corners2d);
  return (
    Number.isFinite(edgeTop)
    && Number.isFinite(edgeLeft)
    && Number.isFinite(area)
    && edgeTop >= 2
    && edgeLeft >= 2
    && area >= 6
  );
}

function _applyProjectionQuadTransform(element, corners2d, offsetX = 0, offsetY = 0) {
  if (!element || !Array.isArray(corners2d) || corners2d.length < 4) return null;
  if (!_isProjectionQuadUsable(corners2d)) return null;
  const [tl, tr, br, bl] = corners2d;
  const topVec = { x: tr.x - tl.x, y: tr.y - tl.y };
  const leftVec = { x: bl.x - tl.x, y: bl.y - tl.y };
  const width = Math.max(Math.hypot(topVec.x, topVec.y), 1);
  const height = Math.max(Math.hypot(leftVec.x, leftVec.y), 1);
  const a = topVec.x / width;
  const b = topVec.y / width;
  const c = leftVec.x / height;
  const d = leftVec.y / height;
  const tx = tl.x + offsetX;
  const ty = tl.y + offsetY;
  const determinant = a * d - b * c;
  if (Math.abs(determinant) < 0.000001) return null;
  const toLocalPercent = (point) => {
    if (Math.abs(determinant) < 0.000001) return { x: 0, y: 0 };
    const dx = point.x - tl.x;
    const dy = point.y - tl.y;
    const localX = (d * dx - c * dy) / determinant;
    const localY = (-b * dx + a * dy) / determinant;
    return {
      x: (localX / width) * 100,
      y: (localY / height) * 100,
    };
  };

  element.style.left = "0px";
  element.style.top = "0px";
  element.style.width = `${width.toFixed(2)}px`;
  element.style.height = `${height.toFixed(2)}px`;
  element.style.transformOrigin = "0 0";
  element.style.transform = `matrix(${a.toFixed(6)}, ${b.toFixed(6)}, ${c.toFixed(6)}, ${d.toFixed(6)}, ${tx.toFixed(2)}, ${ty.toFixed(2)})`;
  element.style.clipPath = `polygon(${corners2d
    .map((point) => toLocalPercent(point))
    .map((point) => `${point.x.toFixed(2)}% ${point.y.toFixed(2)}%`)
    .join(",")})`;

  return { width, height };
}

function _ensureOverlayElements(overlay, label) {
  _ensureProjectionLayer();
  if (!_projectionLayerEl) return;
  if (overlay.element && overlay.elementInner) return;
  overlay.typeRuntime = overlay.typeRuntime || {
    visible: false,
    charCount: 0,
    lastTickMs: 0,
  };
  const el = document.createElement("div");
  el.className = "dev-projection-overlay";
  el.dataset.label = label;
  el.style.position = "absolute";
  el.style.pointerEvents = "none";
  el.style.overflow = "hidden";
  el.style.backdropFilter = "blur(2px)";
  const inner = document.createElement("div");
  inner.className = "dev-projection-overlay__inner";
  inner.style.width = "100%";
  inner.style.height = "100%";
  inner.style.display = "grid";
  inner.style.placeItems = "center";
  inner.style.textAlign = "center";
  inner.style.fontFamily = '"IBM Plex Sans", sans-serif';
  inner.style.letterSpacing = "0.02em";
  inner.style.lineHeight = "1.15";
  inner.style.pointerEvents = "none";
  inner.textContent = overlay.text || _projection.text;
  el.appendChild(inner);
  _projectionLayerEl.appendChild(el);
  overlay.element = el;
  overlay.elementInner = inner;
}

function _getProjectionTypedText(overlay, isVisible) {
  const fullText = overlay.text || _projection.text;
  if (!_projection.textAnimation || !fullText) {
    return fullText;
  }
  overlay.typeRuntime = overlay.typeRuntime || {
    visible: false,
    charCount: 0,
    lastTickMs: 0,
  };
  const now = performance.now();
  if (isVisible) {
    if (!overlay.typeRuntime.visible) {
      overlay.typeRuntime.visible = true;
      overlay.typeRuntime.charCount = 0;
      overlay.typeRuntime.lastTickMs = now;
    }
    const dt = Math.max(0, now - (overlay.typeRuntime.lastTickMs || now)) / 1000;
    overlay.typeRuntime.lastTickMs = now;
    overlay.typeRuntime.charCount = Math.min(
      fullText.length,
      overlay.typeRuntime.charCount + dt * Math.max(_projection.textAnimationSpeed, 1),
    );
    return fullText.slice(0, Math.floor(overlay.typeRuntime.charCount));
  }

  overlay.typeRuntime.visible = false;
  overlay.typeRuntime.lastTickMs = now;
  return fullText;
}

function _updateProjectionOverlays() {
  const overlayEntries = Object.entries(_projectionOverlayMap)
    .filter(([, overlay]) => overlay?.corners && overlay.corners.length >= 4);
  const shouldKeepDraftLayer = _projection.pickActive || _hasProjectionDraft() || (_projection.hoverPreview && !!_projectionHoverPoint);
  if (!_projection.enabled || (!overlayEntries.length && !shouldKeepDraftLayer)) {
    _destroyProjectionLayer();
    return;
  }
  _ensureProjectionLayer();
  const flow = _getFlowProgress();

  overlayEntries.forEach(([label, overlay]) => {
    _ensureOverlayElements(overlay, label);
    if (!overlay.element || !overlay.elementInner) return;

    const corners2d = overlay.corners.map((c) => _projectToScreen(c));
    if (corners2d.some((p) => !p)) {
      overlay.element.style.display = "none";
      return;
    }

    const style = overlay.style || {};
    const sampledOpacity = _sampleFlowOpacity(flow, style.easing || _projection.easing);
    const opacity = label === _activeLabel ? Math.max(sampledOpacity, 0.96) : sampledOpacity;
    const px = (_projectionMouse.x || 0) * (style.parallaxX ?? _projection.parallaxX);
    const py = (_projectionMouse.y || 0) * (style.parallaxY ?? _projection.parallaxY);

    const layout = _applyProjectionQuadTransform(overlay.element, corners2d, px, py);
    if (!layout) {
      overlay.element.style.display = "none";
      return;
    }

    overlay.element.style.display = "block";
    overlay.element.style.opacity = `${opacity.toFixed(4)}`;

    overlay.elementInner.textContent = overlay.text || _projection.text;
    overlay.elementInner.style.padding = `${Math.max(style.padding ?? _projection.padding, 0)}px`;
    overlay.elementInner.style.fontSize = `${Math.max(style.fontSize ?? _projection.fontSize, 8)}px`;
    overlay.elementInner.style.color = style.textColor || _projection.textColor;
    overlay.elementInner.style.background = _hexToRgba(
      style.bgColor || _projection.bgColor,
      style.bgAlpha ?? _projection.bgAlpha,
    );
  });

  Object.entries(_projectionOverlayMap).forEach(([label, overlay]) => {
    if (!_projection.enabled || !overlay?.corners || overlay.corners.length < 4) {
      if (overlay?.element) overlay.element.style.display = "none";
    }
  });

  _ensureProjectionDraftElements();
  if (!_projectionDraft.element || !_projectionDraft.elementInner) return;
  const showHoverPreview = _projection.enabled && _projection.hoverPreview && !!_projectionHoverPoint;
  const showDraft = _projection.pickActive || showHoverPreview;
  if (!showDraft) {
    _projectionDraft.element.style.display = "none";
    if (_projectionDraft.polylineEl) {
      _projectionDraft.polylineEl.setAttribute("points", "");
    }
    _projectionDraft.tickEls.forEach((tick) => {
      tick.style.display = "none";
    });
    if (_projectionDraft.hoverMarkerEl) {
      _projectionDraft.hoverMarkerEl.style.display = "none";
    }
    return;
  }

  const fixedCorners2d = _projectionDraft.corners.map((corner) => _projectToScreen(corner));
  const hover2d = _projectionHoverPoint ? _projectToScreen(_projectionHoverPoint) : null;
  if (fixedCorners2d.some((point) => !point)) {
    _projectionDraft.element.style.display = "none";
    if (_projectionDraft.polylineEl) {
      _projectionDraft.polylineEl.setAttribute("points", "");
    }
    _projectionDraft.tickEls.forEach((tick) => {
      tick.style.display = "none";
    });
    if (_projectionDraft.hoverMarkerEl) {
      _projectionDraft.hoverMarkerEl.style.display = "none";
    }
    return;
  }

  const corners2d = hover2d ? fixedCorners2d.concat([hover2d]) : fixedCorners2d;
  if (!corners2d.length) {
    _projectionDraft.element.style.display = "none";
    if (_projectionDraft.hoverMarkerEl) {
      _projectionDraft.hoverMarkerEl.style.display = "none";
    }
    return;
  }

  const xs = corners2d.map((point) => point.x);
  const ys = corners2d.map((point) => point.y);
  let minX = Math.min(...xs);
  let maxX = Math.max(...xs);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);
  const previewTextValue = _projectionDraft.text || _projection.text;
  const previewFontSize = Math.max(_projectionDraft.style?.fontSize ?? _projection.fontSize, 10);
  const previewPadding = Math.max(_projectionDraft.style?.padding ?? _projection.padding, 0);
  const previewOnly = fixedCorners2d.length === 0 && hover2d;
  if (previewOnly) {
    const estimatedWidth = Math.max(148, Math.min(360, previewTextValue.length * previewFontSize * 0.58 + previewPadding * 2 + 42));
    const estimatedHeight = Math.max(52, previewFontSize * 1.8 + previewPadding * 2 + 18);
    minX = hover2d.x - estimatedWidth * 0.5;
    maxX = hover2d.x + estimatedWidth * 0.5;
    minY = hover2d.y - estimatedHeight - 28;
    maxY = hover2d.y - 12;
  } else {
    const minFootprint = 30;
    if (maxX - minX < minFootprint) {
      const cx = (minX + maxX) * 0.5;
      minX = cx - minFootprint * 0.5;
      maxX = cx + minFootprint * 0.5;
    }
    if (maxY - minY < minFootprint) {
      const cy = (minY + maxY) * 0.5;
      minY = cy - minFootprint * 0.5;
      maxY = cy + minFootprint * 0.5;
    }
  }
  const width = Math.max(maxX - minX, 1);
  const height = Math.max(maxY - minY, 1);
  const localGuide = corners2d.map((point) => ({
    x: ((point.x - minX) / width) * 100,
    y: ((point.y - minY) / height) * 100,
  }));

  _projectionDraft.element.style.display = "block";
  _projectionDraft.element.style.left = `${minX.toFixed(2)}px`;
  _projectionDraft.element.style.top = `${minY.toFixed(2)}px`;
  _projectionDraft.element.style.width = `${width.toFixed(2)}px`;
  _projectionDraft.element.style.height = `${height.toFixed(2)}px`;
  _projectionDraft.element.style.clipPath = "none";
  _projectionDraft.element.style.transform = "translate3d(0, 0, 0)";
  _projectionDraft.element.style.border = previewOnly
    ? "1px solid rgba(255, 186, 104, 0.92)"
    : "1px solid rgba(255, 167, 38, 0.95)";

  const ready = _projectionDraft.corners.length >= 4;
  if (_projectionDraft.previewTextEl) {
    _projectionDraft.previewTextEl.textContent = previewTextValue;
    _projectionDraft.previewTextEl.style.fontSize = `${previewFontSize}px`;
    _projectionDraft.previewTextEl.style.padding = `${previewPadding}px`;
    _projectionDraft.previewTextEl.style.color = _projectionDraft.style?.textColor || _projection.textColor;
    _projectionDraft.previewTextEl.style.background = _hexToRgba(
      _projectionDraft.style?.bgColor || _projection.bgColor,
      _projectionDraft.style?.bgAlpha ?? _projection.bgAlpha,
    );
  }
  if (_projectionDraft.badgeEl) {
    const cornerCount = _projectionDraft.corners.filter(Boolean).length;
    _projectionDraft.badgeEl.textContent = previewOnly
      ? `Hover • ${_projection.hoverMeshName || "mesh"}`
      : ready
        ? `Ready • ${_projectionDraft.meshName || _projection.hoverMeshName || "mesh"}`
        : `Corner ${Math.min(cornerCount + 1, 4)} of 4 • ${_projection.hoverMeshName || "hover mesh"}`;
  }
  if (_projectionDraft.polylineEl) {
    _projectionDraft.polylineEl.setAttribute(
      "points",
      previewOnly ? "" : localGuide.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" "),
    );
  }

  _projectionDraft.tickEls.forEach((tick, index) => {
    const point = fixedCorners2d[index];
    if (!point) {
      tick.style.display = "none";
      return;
    }
    tick.style.display = "block";
    tick.style.left = `${(point.x - minX).toFixed(2)}px`;
    tick.style.top = `${(point.y - minY).toFixed(2)}px`;
  });

  if (_projectionDraft.hoverMarkerEl) {
    if (hover2d) {
      _projectionDraft.hoverMarkerEl.style.display = "block";
      _projectionDraft.hoverMarkerEl.style.left = `${(hover2d.x - minX).toFixed(2)}px`;
      _projectionDraft.hoverMarkerEl.style.top = `${(hover2d.y - minY).toFixed(2)}px`;
    } else {
      _projectionDraft.hoverMarkerEl.style.display = "none";
    }
  }

  _projectionDraft.elementInner.style.display = "grid";
  _syncProjectionDebugState();
}

function _deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function _defaultAssetAltFromPath(assetPath) {
  const fileName = String(assetPath || "").split("/").pop() || "";
  return fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
}

function _normalizeDroppedAssetPath(rawPath) {
  const value = String(rawPath || "").trim();
  if (!value) return "";

  if (value.startsWith("/assets/")) {
    return value;
  }

  const normalized = value.replace(/\\/g, "/");
  const assetsIndex = normalized.toLowerCase().indexOf("/assets/");
  if (assetsIndex >= 0) {
    return normalized.slice(assetsIndex);
  }

  const root = _assetLibrary.workspaceRoot.replace(/\\/g, "/");
  if (root && normalized.toLowerCase().startsWith(root.toLowerCase())) {
    const relative = normalized.slice(root.length).replace(/^\/?/, "");
    if (relative.toLowerCase().startsWith("assets/")) {
      return `/${relative}`;
    }
  }

  return value.startsWith("http://") || value.startsWith("https://") ? value : "";
}

function _applyProjectionAssetPath(assetPath, source = "picker") {
  const normalized = _normalizeDroppedAssetPath(assetPath) || String(assetPath || "").trim();
  if (!normalized) {
    _assetLibrary.status = `ignored ${source}`;
    _refreshGui();
    return;
  }

  _assetLibrary.selected = normalized;
  _projection.assetSrc = normalized;
  if (!_projection.assetAlt) {
    _projection.assetAlt = _defaultAssetAltFromPath(normalized);
  }

  _applyMutation(`projection.asset-src.${source}`, () => {
    const overlay = _projectionOverlayMap[_activeLabel];
    if (!overlay) return;
    overlay.style.assetSrc = normalized;
    if (!overlay.style.assetAlt) {
      overlay.style.assetAlt = _defaultAssetAltFromPath(normalized);
      overlay.text = overlay.text || _projection.text;
    }
  });

  _assetLibrary.status = `${source}: ${normalized}`;
  _refreshGui();
}

async function _fetchAssetLibrary() {
  _assetLibrary.status = "loading";
  _refreshGui();
  try {
    const response = await fetch("/___dev-scene-assets");
    const payload = await response.json();
    if (!payload?.ok) {
      throw new Error(payload?.error || "asset index failed");
    }
    _assetLibrary.workspaceRoot = String(payload.workspaceRoot || "");
    _assetLibrary.options = [""].concat(Array.isArray(payload.assetPaths) ? payload.assetPaths : []);
    if (_projection.assetSrc && _assetLibrary.options.includes(_projection.assetSrc)) {
      _assetLibrary.selected = _projection.assetSrc;
    }
    _assetLibrary.status = `${_assetLibrary.options.length - 1} assets indexed`;
    _rebuildProjectionAssetControls();
    _refreshGui();
  } catch (error) {
    _assetLibrary.status = `asset index failed: ${error.message}`;
    _refreshGui();
  }
}

function _extractDroppedAssetValue(event) {
  const files = Array.from(event.dataTransfer?.files || []);
  if (files.length > 0) {
    const file = files[0];
    if (typeof file.path === "string" && file.path) {
      return file.path;
    }
    if (file.name) {
      const candidate = _assetLibrary.options.find((entry) => entry.endsWith(`/${file.name}`));
      if (candidate) return candidate;
    }
  }

  const uriList = event.dataTransfer?.getData("text/uri-list");
  if (uriList) return uriList.split(/\r?\n/).find(Boolean) || "";

  return event.dataTransfer?.getData("text/plain") || "";
}

function _attachAssetDropTarget(controller) {
  const node = controller?.domElement;
  if (!node || node.dataset.assetDropBound === "true") return;
  node.dataset.assetDropBound = "true";
  node.style.borderRadius = "6px";

  node.addEventListener("dragover", (event) => {
    event.preventDefault();
    node.style.outline = "1px solid rgba(120, 220, 255, 0.6)";
  });
  node.addEventListener("dragleave", () => {
    node.style.outline = "";
  });
  node.addEventListener("drop", (event) => {
    event.preventDefault();
    node.style.outline = "";
    const dropped = _extractDroppedAssetValue(event);
    _assetLibrary.lastDropped = dropped;
    const normalized = _normalizeDroppedAssetPath(dropped);
    if (normalized) {
      _applyProjectionAssetPath(normalized, "drop");
      return;
    }
    _assetLibrary.status = "drop unsupported";
    _refreshGui();
  });
}

function _rebuildProjectionAssetControls() {
  const styleFolder = _folders.projectionStyle;
  if (!styleFolder) return;

  Object.values(_projectionAssetControllers).forEach((controller) => {
    if (controller) {
      styleFolder.remove(controller);
    }
  });

  const assetOptions = { "— indexed assets —": "" };
  _assetLibrary.options.forEach((assetPath) => {
    if (!assetPath) return;
    assetOptions[assetPath] = assetPath;
  });

  _projectionAssetControllers.picker = styleFolder
    .add(_assetLibrary, "selected", assetOptions)
    .name("Asset Pick")
    .onChange((value) => {
      if (value) {
        _applyProjectionAssetPath(value, "pick");
      }
    });

  const dropApi = {
    receive() {},
  };
  _projectionAssetControllers.drop = styleFolder.add(dropApi, "receive").name("Drop Path Here");
  _projectionAssetControllers.drop.disable();
  _attachAssetDropTarget(_projectionAssetControllers.drop);

  const refreshApi = {
    refresh() {
      void _fetchAssetLibrary();
    },
  };
  _projectionAssetControllers.refresh = styleFolder.add(refreshApi, "refresh").name("Refresh Assets");
  _projectionAssetControllers.status = styleFolder.add(_assetLibrary, "status").name("Asset Index").disable();
}

function _getStateByLabel(label) {
  if (!label) return null;
  return _registry[label] || null;
}

function _setStateVisible(state, visible) {
  if (!state?.pivot) return;
  state.pivot.visible = !!visible;
}

function _setStateAnimated(state, enabled) {
  if (!state) return;
  const actions = state.actions || state.clipActions;
  if (!actions?.length) return;
  actions.forEach((action) => {
    action.paused = !enabled;
  });
}

function _buildLodRuntimeSnippet() {
  const profiles = _deepClone(_lodProfiles);
  return [
    "// Dynamic LOD profile export",
    `const devLodProfiles = ${JSON.stringify(profiles, null, 2)};`,
    "",
    "// Runtime strategy:",
    "// 1) Select one visible tier per profile by camera distance.",
    "// 2) Bias distance by scroll speed for smoother navigation.",
    "// 3) Optionally freeze far animation and bake far transforms.",
  ].join("\n");
}

function _captureLodSnapshot() {
  return {
    config: _deepClone(_lod),
    profiles: _deepClone(_lodProfiles),
  };
}

function _applyLodSnapshot(snapshot) {
  if (!snapshot) return;
  Object.assign(_lod, snapshot.config || {});
  _lodProfiles = _deepClone(snapshot.profiles || {});

  const names = Object.keys(_lodProfiles);
  if (!names.length) {
    _lod.selectedProfile = "";
    _lod.status = "no profiles";
    return;
  }

  if (!_lodProfiles[_lod.selectedProfile]) {
    _lod.selectedProfile = names[0];
  }
  _loadSelectedLodProfile();
}

function _ensureLodProfile(name) {
  if (!_lodProfiles[name]) {
    _lodProfiles[name] = {
      highLabel: _lod.highLabel || _activeLabel || "",
      midLabel: _lod.midLabel || "",
      lowLabel: _lod.lowLabel || "",
      near: _lod.near,
      mid: _lod.mid,
      far: _lod.far,
      cullBeyond: _lod.cullBeyond,
      scrollBoost: _lod.scrollBoost,
      freezeFarAnimations: !!_lod.freezeFarAnimations,
      bakeStaticFar: !!_lod.bakeStaticFar,
    };
  }
  return _lodProfiles[name];
}

function _saveSelectedLodProfile() {
  const name = (_lod.profileName || "").trim();
  if (!name) {
    _lod.status = "profile name required";
    return;
  }
  const profile = _ensureLodProfile(name);
  profile.highLabel = _lod.highLabel || "";
  profile.midLabel = _lod.midLabel || "";
  profile.lowLabel = _lod.lowLabel || "";
  const near = Number(_lod.near);
  const mid = Math.max(near, Number(_lod.mid));
  const far = Math.max(mid, Number(_lod.far));
  const cullBeyond = Math.max(far, Number(_lod.cullBeyond));
  profile.near = near;
  profile.mid = mid;
  profile.far = far;
  profile.cullBeyond = cullBeyond;
  profile.scrollBoost = Number(_lod.scrollBoost);
  profile.freezeFarAnimations = !!_lod.freezeFarAnimations;
  profile.bakeStaticFar = !!_lod.bakeStaticFar;
  _lod.selectedProfile = name;
  _lod.status = `saved ${name}`;
}

function _loadSelectedLodProfile() {
  const profile = _lodProfiles[_lod.selectedProfile];
  if (!profile) return;
  _lod.profileName = _lod.selectedProfile;
  _lod.highLabel = profile.highLabel || "";
  _lod.midLabel = profile.midLabel || "";
  _lod.lowLabel = profile.lowLabel || "";
  _lod.near = Number(profile.near ?? _lod.near);
  _lod.mid = Number(profile.mid ?? _lod.mid);
  _lod.far = Number(profile.far ?? _lod.far);
  _lod.cullBeyond = Number(profile.cullBeyond ?? _lod.cullBeyond);
  _lod.scrollBoost = Number(profile.scrollBoost ?? _lod.scrollBoost);
  _lod.freezeFarAnimations = !!profile.freezeFarAnimations;
  _lod.bakeStaticFar = !!profile.bakeStaticFar;
}

function _computeLodTier(profile, camera, flowSpeed) {
  const highState = _getStateByLabel(profile.highLabel);
  if (!highState?.pivot || !camera) return "none";
  const worldPos = new THREE.Vector3();
  highState.pivot.getWorldPosition(worldPos);
  const cameraPos = new THREE.Vector3();
  camera.getWorldPosition(cameraPos);
  const distance = worldPos.distanceTo(cameraPos);
  const biasedDistance = distance + flowSpeed * (profile.scrollBoost || 0);

  if (biasedDistance > profile.cullBeyond) return "cull";
  if (biasedDistance <= profile.near) return "high";
  if (biasedDistance <= profile.mid) return profile.midLabel ? "mid" : "high";
  if (biasedDistance <= profile.far) {
    if (profile.lowLabel) return "low";
    if (profile.midLabel) return "mid";
    return "high";
  }
  return profile.lowLabel ? "low" : (profile.midLabel ? "mid" : "high");
}

function _applyDynamicLod(elapsed) {
  if (!_lod.enabled || !_lod.autoRun) return;
  const camera = _config.camera;
  if (!camera) return;

  const nowMs = elapsed * 1000;
  if (_lod.throttleMs > 0 && nowMs - _lastLodUpdateMs < _lod.throttleMs) return;
  _lastLodUpdateMs = nowMs;

  const flow = _getFlowProgress();
  const dt = Math.max(0.0001, elapsed - _lastElapsedForLod);
  _lod.flowSpeed = Math.abs(flow - _lastFlowForLod) / dt;
  _lastFlowForLod = flow;
  _lastElapsedForLod = elapsed;

  let affected = 0;
  Object.values(_lodProfiles).forEach((profile) => {
    const tier = _computeLodTier(profile, camera, _lod.flowSpeed);
    if (tier === "none") return;
    affected += 1;

    const highState = _getStateByLabel(profile.highLabel);
    const midState = _getStateByLabel(profile.midLabel);
    const lowState = _getStateByLabel(profile.lowLabel);

    _setStateVisible(highState, tier === "high");
    _setStateVisible(midState, tier === "mid");
    _setStateVisible(lowState, tier === "low");

    if (tier === "cull") {
      _setStateVisible(highState, false);
      _setStateVisible(midState, false);
      _setStateVisible(lowState, false);
    }

    if (profile.freezeFarAnimations) {
      _setStateAnimated(highState, tier === "high");
      _setStateAnimated(midState, tier === "mid");
      _setStateAnimated(lowState, tier === "low");
    }

    if (profile.bakeStaticFar) {
      [highState, midState, lowState].forEach((state) => {
        if (!state?.pivot) return;
        const isActive =
          (tier === "high" && state === highState) ||
          (tier === "mid" && state === midState) ||
          (tier === "low" && state === lowState);
        if (tier === "cull" || !isActive) {
          state.pivot.updateMatrixWorld(true);
          state.pivot.matrixAutoUpdate = false;
        } else {
          state.pivot.matrixAutoUpdate = true;
        }
      });
    }
  });

  _lod.status = affected
    ? `active profiles: ${affected} | flow speed: ${_lod.flowSpeed.toFixed(3)}`
    : "no active profiles";
}

function _serializeManualClip(clip) {
  if (!clip) return null;
  return {
    enabled: !!clip.enabled,
    duration: clip.duration,
    loop: !!clip.loop,
    playing: !!clip.playing,
    time: clip.time,
    easing: clip.easing || "linear",
    overrideNativeAnimation: clip.overrideNativeAnimation !== false,
    position: _deepClone(clip.position),
    rotation: _deepClone(clip.rotation),
  };
}

function _captureSnapshot() {
  const snapshot = {
    activeLabel: _activeLabel,
    transforms: {},
    clips: {},
    materials: {},
    projection: {
      overlayMap: _cloneProjectionOverlayMap(),
      flowOpacity: _deepClone(_projectionFlowOpacity),
      config: {
        enabled: _projection.enabled,
        autoSelect: _projection.autoSelect,
        targetMeshName: _projection.targetMeshName,
        maxAspect: _projection.maxAspect,
        minFillRatio: _projection.minFillRatio,
        minThicknessRatio: _projection.minThicknessRatio,
        maxThicknessRatio: _projection.maxThicknessRatio,
        parallaxX: _projection.parallaxX,
        parallaxY: _projection.parallaxY,
        easing: _projection.easing,
        text: _projection.text,
        fontSize: _projection.fontSize,
        padding: _projection.padding,
        textColor: _projection.textColor,
        bgColor: _projection.bgColor,
        bgAlpha: _projection.bgAlpha,
        contentMode: _projection.contentMode,
        assetSrc: _projection.assetSrc,
        assetAlt: _projection.assetAlt,
        textAnimation: _projection.textAnimation,
        textAnimationSpeed: _projection.textAnimationSpeed,
        pickActive: _projection.pickActive,
        nextCorner: _projection.nextCorner,
        status: _projection.status,
      },
    },
    sceneBuilder: {
      ..._sceneBuilder,
    },
    lod: _captureLodSnapshot(),
  };

  Object.entries(_registry).forEach(([label, state]) => {
    const p = state?.pivot;
    if (p) {
      snapshot.transforms[label] = {
        position: [p.position.x, p.position.y, p.position.z],
        rotation: [p.rotation.x, p.rotation.y, p.rotation.z],
        scale: [p.scale.x, p.scale.y, p.scale.z],
        visible: p.visible,
      };
    }

    const clip = _manualClips.get(state);
    if (clip) {
      snapshot.clips[label] = _serializeManualClip(clip);
    }

    const materialEntry = _serializeStateMaterialEntry(label, state);
    if (materialEntry) {
      snapshot.materials[label] = materialEntry;
    }
  });

  return snapshot;
}

function _applySnapshot(snapshot) {
  if (!snapshot) return;
  _isApplyingSnapshot = true;

  Object.entries(snapshot.transforms || {}).forEach(([label, data]) => {
    const state = _registry[label];
    const p = state?.pivot;
    if (!p || !data) return;
    p.position.set(data.position[0], data.position[1], data.position[2]);
    p.rotation.set(data.rotation[0], data.rotation[1], data.rotation[2]);
    p.scale.set(data.scale[0], data.scale[1], data.scale[2]);
    p.visible = data.visible;
  });

  Object.entries(snapshot.clips || {}).forEach(([label, data]) => {
    const state = _registry[label];
    if (!state || !data) return;
    const clip = _ensureManualClip(state);
    if (!clip) return;
    clip.enabled = !!data.enabled;
    clip.duration = data.duration;
    clip.loop = !!data.loop;
    clip.playing = !!data.playing;
    clip.time = data.time;
    clip.easing = data.easing || "linear";
    clip.overrideNativeAnimation = data.overrideNativeAnimation !== false;
    ["x", "y", "z"].forEach((axis) => {
      clip.position[axis] = _deepClone(data.position?.[axis] || []);
      clip.rotation[axis] = _deepClone(data.rotation?.[axis] || []);
    });
    _applyManualClipToState(state, clip, clip.time);
  });

  Object.entries(snapshot.materials || {}).forEach(([label, entry]) => {
    const state = _registry[label]
      || Object.values(_registry).find((candidate) => _getStateRef(candidate, label) === entry?.ref);
    if (!state || !entry) return;
    _applySerializedMaterialEntryToState(state, entry);
  });

  if (snapshot.projection) {
    _restoreProjectionOverlayMap(snapshot.projection.overlayMap || {});
    _projectionFlowOpacity = _deepClone(snapshot.projection.flowOpacity || {});
    Object.assign(_projection, snapshot.projection.config || {});
  }

  if (snapshot.sceneBuilder) {
    Object.assign(_sceneBuilder, snapshot.sceneBuilder);
  }

  if (snapshot.lod) {
    _applyLodSnapshot(snapshot.lod);
  }

  if (snapshot.activeLabel && _registry[snapshot.activeLabel]) {
    _activeLabel = snapshot.activeLabel;
    _active = _registry[_activeLabel];
  }

  _syncFromScene();
  _refreshGui();
  _isApplyingSnapshot = false;
}

function _hydrateSourceState(sourceState = {}) {
  _materialSourceState = {};
  _pendingMaterialHydration = new Set();

  const manualKeyframes = Array.isArray(sourceState.manualKeyframes)
    ? sourceState.manualKeyframes
    : [];
  manualKeyframes.forEach((entry) => {
    const state = Object.values(_registry).find(
      (candidate) =>
        candidate &&
        (candidate.codeRef === entry?.ref || candidate.label === entry?.label),
    );
    if (!state || !entry?.clip) return;

    const clip = _ensureManualClip(state);
    if (!clip) return;

    clip.enabled = !!entry.clip.enabled;
    clip.duration = Number(entry.clip.duration ?? clip.duration);
    clip.loop = !!entry.clip.loop;
    clip.playing = !!entry.clip.playing;
    clip.time = Number(entry.clip.time ?? 0);
    clip.easing = entry.clip.easing || "linear";
    clip.overrideNativeAnimation = entry.clip.overrideNativeAnimation !== false;

    ["x", "y", "z"].forEach((axis) => {
      clip.position[axis] = _deepClone(entry.clip.position?.[axis] || []);
      clip.rotation[axis] = _deepClone(entry.clip.rotation?.[axis] || []);
    });

    if (clip.enabled) {
      _applyManualClipToState(state, clip, clip.time);
    }
  });

  _projectionOverlayMap = {};
  const projectionOverlays = Array.isArray(sourceState.projectionOverlays)
    ? sourceState.projectionOverlays
    : [];
  projectionOverlays.forEach((overlay) => {
    if (!overlay?.label) return;
    const corners = Array.isArray(overlay.corners)
      ? overlay.corners.map(
          (corner) => new THREE.Vector3(corner[0], corner[1], corner[2]),
        )
      : [];
    if (!corners.length && !overlay.autoFit) return;
    _projectionOverlayMap[overlay.label] = {
      targetLabel: overlay.label,
      meshUUID: overlay.meshUUID || null,
      meshName: overlay.meshName || "",
      text: overlay.text || _projection.text,
      corners,
      autoFit: overlay.autoFit ? _deepClone(overlay.autoFit) : null,
      style: {
        ...(overlay.style || {}),
      },
      element: null,
      elementInner: null,
    };
    if (overlay.flowOpacity && typeof overlay.flowOpacity === "object") {
      _projectionFlowOpacity = {
        ..._projectionFlowOpacity,
        ..._deepClone(overlay.flowOpacity),
      };
    }
  });

  const materials = Array.isArray(sourceState.materials)
    ? sourceState.materials
    : [];
  materials.forEach((entry) => {
    const state = Object.values(_registry).find(
      (candidate) =>
        candidate &&
        (_getStateRef(candidate) === entry?.ref || candidate.label === entry?.label),
    );
    if (!state || !entry?.material) return;
    const ref = _getStateRef(state, entry.label || state.label || "");
    _materialSourceState[ref] = _deepClone(entry);
    _pendingMaterialHydration.add(ref);
  });

  _applyPendingMaterialHydration();
}

function _updateSyncStats(actionLabel) {
  if (actionLabel) _sync.lastAction = actionLabel;
  _sync.historyDepth = _history.length;
  _sync.redoDepth = _redoStack.length;
}

function _shouldAutoApply(reason = "") {
  return !!reason && reason !== "init" && reason !== "select-object";
}

function _sendPayloadToSource(reason = "apply-to-source", mode = "manual") {
  const payload = _buildLiveExportPayload(reason);
  payload.snapshot = _captureSnapshot();
  const requestId = ++_applyRequestSerial;

  _sync.sourceStatus = mode === "auto"
    ? `auto-applying: ${reason}`
    : "applying to source";
  _sync.verificationStatus = `verifying write: ${reason}`;
  _setHudStatus(
    mode === "auto" ? `Auto-updating source: ${reason}...` : "Updating source...",
    "pending",
  );
  _refreshGui();

  return fetch("/___dev-scene-apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
    .then((r) => r.json())
    .then((data) => {
      if (requestId !== _applyRequestSerial) {
        return data;
      }

      _sync.verificationStatus = data?.verification?.summary || "verification unavailable";

      if (data.ok) {
        const changed = Object.entries(data.results)
          .filter(([, v]) => v === "patched")
          .map(([k]) => k)
          .join(", ") || "nothing changed";
        _sync.sourceDirty = false;
        _sync.sourceStatus = changed === "nothing changed"
          ? "source already matched export"
          : `synced: ${changed}`;
        _setHudStatus(`Completed action: ${_sync.sourceStatus}`, "success");
        _refreshGui();
        console.log("[DevTools] Applied to source:", data.results);
        return data;
      }

      _sync.sourceDirty = true;
      _sync.sourceStatus = `apply failed: ${data.error || "error"}`;
      _setHudStatus(`Apply failed: ${data.error || "error"}`, "error");
      _refreshGui();
      console.error("[DevTools] Apply failed:", data.error, data.verification || null);
      return data;
    })
    .catch((err) => {
      if (requestId === _applyRequestSerial) {
        _sync.sourceDirty = true;
        _sync.sourceStatus = `apply failed: ${err.message}`;
        _sync.verificationStatus = "verification failed";
        _setHudStatus(`Apply failed: ${err.message}`, "error");
        _refreshGui();
      }
      console.error("[DevTools] Apply error:", err);
      throw err;
    });
}

function _scheduleAutoApply(reason = "mutation") {
  if (!_shouldAutoApply(reason)) return;
  _sync.sourceDirty = true;
  if (_sync.autoApplyToSource) {
    _sync.sourceStatus = "pending — press Enter to apply";
    _setHudStatus("Changes pending \u2014 press Enter to apply to source", "pending");
  }
}

function _attachApplyKeydownListener() {
  _detachApplyKeydownListener();
  _applyKeydownHandler = (e) => {
    if (!_devToolsEnabled) return;
    if (!_sync.enableEnterApply) return;
    if (e.key !== "Enter") return;
    // Don't fire while an input or textarea inside the GUI is focused.
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea") return;
    if (_projection.pickActive && _projectionDraft.corners.length >= 4) {
      e.preventDefault();
      if (_finalizeProjectionDraft("enter")) {
        return;
      }
    }
    if (_sync.autoApplyToSource && _sync.sourceDirty) {
      void _sendPayloadToSource("enter-key", "auto");
    }
  };
  document.addEventListener("keydown", _applyKeydownHandler);
}

function _detachApplyKeydownListener() {
  if (_applyKeydownHandler) {
    document.removeEventListener("keydown", _applyKeydownHandler);
    _applyKeydownHandler = null;
  }
}

function _attachProjectionRuntimeActionBridge() {
  if (_projectionRuntimeActionHandler) return;
  _projectionRuntimeActionHandler = (event) => {
    const detail = event?.detail;
    if (!detail?.label) return;

    if (detail.type === "select") {
      if (_registry[detail.label]) {
        _selectObject(detail.label);
      }
      return;
    }

    if (detail.type === "delete") {
      _applyMutation("projection.runtime-delete", () => {
        delete _projectionOverlayMap[detail.label];
        if (_activeLabel === detail.label) {
          _projection.status = "overlay deleted";
          _projection.targetMeshName = "— none —";
        }
      });
      _setHudStatus(`Removed projection: ${detail.label}`, "pending");
      _refreshGui();
      return;
    }

    if (detail.type === "update-text") {
      _applyMutation("projection.runtime-text", () => {
        const overlay = _projectionOverlayMap[detail.label];
        if (!overlay) return;
        overlay.text = String(detail.text || "");
        if (_activeLabel === detail.label) {
          _projection.text = overlay.text;
        }
      });
      _setHudStatus(`Projection text updated: ${detail.label}`, "pending");
      _refreshGui();
    }
  };
  window.addEventListener("dev-projection-overlay-action", _projectionRuntimeActionHandler);
}

function _detachProjectionRuntimeActionBridge() {
  if (_projectionRuntimeActionHandler) {
    window.removeEventListener("dev-projection-overlay-action", _projectionRuntimeActionHandler);
    _projectionRuntimeActionHandler = null;
  }
}

function _buildLiveExportPayload(reason = "") {
  const transforms = Object.entries(_registry).reduce((acc, [label, state]) => {
    const p = state?.pivot;
    if (!p) return acc;
    const ref = state.codeRef || state.label || label;
    acc[ref] = {
      position: [
        parseFloat(p.position.x.toFixed(4)),
        parseFloat(p.position.y.toFixed(4)),
        parseFloat(p.position.z.toFixed(4)),
      ],
      rotation: [
        parseFloat(p.rotation.x.toFixed(4)),
        parseFloat(p.rotation.y.toFixed(4)),
        parseFloat(p.rotation.z.toFixed(4)),
      ],
      scale: [
        parseFloat(p.scale.x.toFixed(4)),
        parseFloat(p.scale.y.toFixed(4)),
        parseFloat(p.scale.z.toFixed(4)),
      ],
      visible: !!p.visible,
    };
    return acc;
  }, {});

  const clips = Object.entries(_registry)
    .map(([label, state]) => {
      const clip = _manualClips.get(state);
      if (!clip) return null;
      return {
        label,
        ref: state.codeRef || state.label || label,
        clip: _serializeManualClip(clip),
      };
    })
    .filter(Boolean);

  const materials = Object.entries(_registry)
    .map(([label, state]) => _serializeStateMaterialEntry(label, state))
    .filter(Boolean);

  const projectionExport = Object.entries(_projectionOverlayMap)
    .map(([label, overlay]) => {
      const cornerExport = Array.isArray(overlay?.corners)
        ? overlay.corners.map((p) => [
            parseFloat(p.x.toFixed(5)),
            parseFloat(p.y.toFixed(5)),
            parseFloat(p.z.toFixed(5)),
          ])
        : [];
      if (!cornerExport.length && !overlay?.autoFit) return null;
      return {
        label,
        meshUUID: overlay.meshUUID,
        meshName: overlay.meshName,
        text: overlay.text,
        corners: cornerExport,
        autoFit: overlay.autoFit ? _deepClone(overlay.autoFit) : undefined,
        style: {
          ...(overlay.style || {}),
        },
        flowOpacity: _deepClone(_projectionFlowOpacity),
      };
    })
    .filter(Boolean);

  const sourceState = {
    transforms,
    manualKeyframes: clips,
    materials,
    projectionOverlays: projectionExport,
  };
  const projectionCss = projectionExport.length
    ? `.projection-overlay {\n  position: fixed;\n  left: 0;\n  top: 0;\n  display: none;\n  pointer-events: none;\n  z-index: 52;\n  transform-origin: 0 0;\n  will-change: transform, opacity;\n}\n.projection-overlay__panel {\n  width: 100%;\n  height: 100%;\n  display: flex;\n  flex-direction: column;\n  justify-content: center;\n  gap: 8px;\n  overflow: hidden;\n  border: 1px solid rgba(150, 240, 255, 0.35);\n  box-shadow: 0 0 24px rgba(20, 140, 170, 0.28) inset;\n  backdrop-filter: blur(8px);\n}\n.projection-overlay__media {\n  display: none;\n  flex: 1 1 auto;\n  min-height: 0;\n}\n.projection-overlay__image {\n  display: block;\n  width: 100%;\n  height: 100%;\n  object-fit: cover;\n}\n.projection-overlay__text {\n  white-space: pre-wrap;\n  text-wrap: balance;\n  text-align: center;\n  font-family: \"IBM Plex Sans\", sans-serif;\n  line-height: 1.15;\n  letter-spacing: 0.03em;\n}\n`
    : "";
  const projectionHtml = projectionExport
    .map((o) => `<div class=\"projection-overlay\" data-projection-label=\"${o.label}\"></div>`)
    .join("\n");
  const js = [
    `const DEV_SCENE_TRANSFORMS = ${JSON.stringify(transforms, null, 2)};`,
    `const DEV_SCENE_MANUAL_KEYFRAMES = ${JSON.stringify(clips, null, 2)};`,
    `const DEV_SCENE_MATERIALS = ${JSON.stringify(materials, null, 2)};`,
    `const DEV_SCENE_PROJECTION_OVERLAYS = ${JSON.stringify(projectionExport, null, 2)};`,
  ].join("\n\n");
  const lodJs = _buildLodRuntimeSnippet();
  const css = projectionCss;
  const html = projectionHtml;

  return {
    updatedAt: new Date().toISOString(),
    reason,
    activeLabel: _activeLabel,
    flow: _flow.options,
    sourceState,
    js,
    lodJs,
    css,
    html,
  };
}

function _syncExports(reason = "") {
  const payload = _buildLiveExportPayload(reason);
  if (typeof window !== "undefined") {
    window.__DEV_SCENE_INSPECTOR_EXPORT__ = payload;
    try {
      window.localStorage.setItem("dev-scene-inspector-export", JSON.stringify(payload));
    } catch {
      // Storage may be blocked; keep runtime payload only.
    }
  }
  if (typeof _config.onExport === "function") {
    try {
      _config.onExport(payload);
    } catch (error) {
      console.warn("[DevTools:onExport]", error);
    }
  }
  _sync.lastExportSize = payload.js.length + (payload.lodJs?.length || 0) + payload.css.length + payload.html.length;
  if (reason && reason !== "init" && reason !== "select-object") {
    _sync.sourceDirty = true;
    _sync.verificationStatus = `pending write: ${reason}`;
    _sync.sourceStatus = _sync.autoApplyToSource
      ? `queued auto-apply: ${reason}`
      : "pending apply to source";
  }
}

function _recordHistory(actionLabel) {
  if (_isApplyingSnapshot) return;
  _history.push(_captureSnapshot());
  if (_history.length > HISTORY_LIMIT) {
    _history.splice(0, _history.length - HISTORY_LIMIT);
  }
  _redoStack.length = 0;
  _updateSyncStats(actionLabel);
  if (_sync.autoSync) _syncExports(actionLabel);
}

function _applyMutation(actionLabel, mutator) {
  _setHudStatus(`Updating ${_activeLabel || "selection"}...`, "pending");
  mutator();
  _syncFromScene();
  _recordHistory(actionLabel);
  _scheduleAutoApply(actionLabel);
  _setHudStatus(`Completed action: ${actionLabel}`, "success");
  _refreshGui();
}

function _undo() {
  if (_history.length < 2) return;
  const current = _history.pop();
  _redoStack.push(current);
  const previous = _history[_history.length - 1];
  _applySnapshot(previous);
  _updateSyncStats("undo");
  if (_sync.autoSync) _syncExports("undo");
  _scheduleAutoApply("undo");
}

function _redo() {
  if (!_redoStack.length) return;
  const snapshot = _redoStack.pop();
  _history.push(snapshot);
  _applySnapshot(snapshot);
  _updateSyncStats("redo");
  if (_sync.autoSync) _syncExports("redo");
  _scheduleAutoApply("redo");
}

function _buildFlowOptions(config) {
  const points = Array.isArray(config?.flowPoints) ? config.flowPoints : [];
  const map = config?.flowMap && typeof config.flowMap === "object" ? config.flowMap : {};
  _flow.options = points.map((value, idx) => {
    const match = Object.entries(map).find(([, v]) => Math.abs(v - value) < 0.000001);
    const name = match ? match[0] : `point_${idx + 1}`;
    return {
      id: `${idx + 1}`,
      value,
      label: `${idx + 1}: ${name} (${value.toFixed(2)})`,
    };
  });
  _flow.selected = _flow.options[0]?.id || "";

  const nextOpacity = {};
  _flow.options.forEach((option) => {
    nextOpacity[option.id] = _projectionFlowOpacity[option.id] ?? 1;
  });
  _projectionFlowOpacity = nextOpacity;
}

function _syncFlowSelectionToKeyTime() {
  const selected = _flow.options.find((o) => o.id === _flow.selected) || _flow.options[0] || null;
  if (!selected) {
    _flow.point = 0;
    _flow.mappedTime = 0;
    _flow.indicator = "—";
    return;
  }
  _flow.point = selected.value;
  _flow.mappedTime = parseFloat((selected.value * _kf.duration).toFixed(4));
  _flow.indicator = `${selected.label}`;
}

// ─── Helpers ─────────────────────────────────────────────────────
function _getTargetStates() {
  if (!_active) return [];
  if (Array.isArray(_active.linkedStates) && _active.linkedStates.length) {
    return _active.linkedStates;
  }
  return [_active];
}

function _getPivots() {
  return _getTargetStates()
    .map(state => state?.pivot ?? null)
    .filter(Boolean);
}

function _getStateRef(state, fallback = "") {
  return state?.codeRef || state?.label || fallback;
}

function _forEachStateMaterial(state, callback) {
  const pivot = state?.pivot;
  if (!pivot) return;
  pivot.traverse((node) => {
    if (!node.isMesh || !node.material) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach((mat) => {
      if (mat) callback(mat, node);
    });
  });
}

function _getStateFirstMaterial(state) {
  let firstMaterial = null;
  _forEachStateMaterial(state, (mat) => {
    if (!firstMaterial) firstMaterial = mat;
  });
  return firstMaterial;
}

function _getPivot() {
  const pivots = _getPivots();
  return pivots.length ? pivots[0] : null;
}

function _forEachPivot(fn) {
  _getPivots().forEach(fn);
}

function _getFirstMesh() {
  let mesh = null;
  _getPivot()?.traverse(n => {
    if (!mesh && n.isMesh) mesh = n;
  });
  return mesh;
}

function _getFirstMaterial() {
  return _getStateFirstMaterial(_active);
}

function _forEachMaterial(callback) {
  _forEachPivot((pivot) => {
    pivot.traverse((node) => {
      if (!node.isMesh || !node.material) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach((mat) => {
        if (mat) callback(mat, node);
      });
    });
  });
}

function _cloneMaterialInstance(material) {
  if (!material) return material;
  if (typeof material.clone !== "function") return material;
  const cloned = material.clone();
  cloned.userData = _deepClone(material.userData || {});
  if (material.color?.isColor && cloned.color?.isColor) {
    cloned.color.copy(material.color);
  }
  if (material.emissive?.isColor && cloned.emissive?.isColor) {
    cloned.emissive.copy(material.emissive);
  }
  return cloned;
}

function _cloneMaterialSet(material) {
  return Array.isArray(material)
    ? material.map((entry) => _cloneMaterialInstance(entry))
    : _cloneMaterialInstance(material);
}

function _markMaterialSetNeedsUpdate(material) {
  const materials = Array.isArray(material) ? material : [material];
  materials.forEach((mat) => {
    if (mat) mat.needsUpdate = true;
  });
}

function _tagMaterialSetPreset(material, preset) {
  const materials = Array.isArray(material) ? material : [material];
  materials.forEach((mat) => {
    if (!mat) return;
    mat.userData = { ...(mat.userData || {}) };
    if (preset) {
      mat.userData.__devMaterialPreset = preset;
    } else {
      delete mat.userData.__devMaterialPreset;
    }
  });
}

function _ensureOriginalMaterialsForState(state) {
  const pivot = state?.pivot;
  if (!pivot) return;
  pivot.traverse((node) => {
    if (!node.isMesh || !node.material || _originalMaterialSnapshots.has(node)) return;
    _originalMaterialSnapshots.set(node, _cloneMaterialSet(node.material));
  });
}

function _restoreOriginalMaterialsForState(state) {
  const pivot = state?.pivot;
  if (!pivot) return;
  _ensureOriginalMaterialsForState(state);
  pivot.traverse((node) => {
    if (!node.isMesh || !node.material) return;
    const original = _originalMaterialSnapshots.get(node);
    if (!original) return;
    node.material = _cloneMaterialSet(original);
    _tagMaterialSetPreset(node.material, "original");
    _markMaterialSetNeedsUpdate(node.material);
  });
}

function _copyMaterialValue(target, source, key) {
  if (!source || !(key in source) || !(key in target)) return;
  target[key] = source[key];
}

function _copyMaterialColor(target, source, key, fallback) {
  if (!(key in target)) return;
  if (source?.[key]?.isColor) {
    target[key] = source[key].clone();
    return;
  }
  if (target[key]?.isColor && fallback) {
    target[key].set(fallback);
  }
}

function _copyMaterialMap(target, source, key) {
  if (source?.[key] && key in target) {
    target[key] = source[key];
  }
}

function _buildPresetMaterial(sourceMat, node, preset) {
  const material = preset === "glass"
    ? new THREE.MeshPhysicalMaterial()
    : new THREE.MeshStandardMaterial();

  _copyMaterialColor(material, sourceMat, "color", _mat.color);
  _copyMaterialColor(material, sourceMat, "emissive", _mat.emissiveColor);

  [
    "map",
    "alphaMap",
    "aoMap",
    "bumpMap",
    "displacementMap",
    "emissiveMap",
    "envMap",
    "lightMap",
    "metalnessMap",
    "normalMap",
    "roughnessMap",
    "transmissionMap",
    "thicknessMap",
  ].forEach((key) => _copyMaterialMap(material, sourceMat, key));

  if (sourceMat?.normalScale?.isVector2 && "normalScale" in material) {
    material.normalScale = sourceMat.normalScale.clone();
  }
  if (sourceMat?.clearcoatNormalScale?.isVector2 && "clearcoatNormalScale" in material) {
    material.clearcoatNormalScale = sourceMat.clearcoatNormalScale.clone();
  }

  [
    "opacity",
    "alphaTest",
    "depthTest",
    "depthWrite",
    "side",
    "wireframe",
    "flatShading",
    "fog",
    "toneMapped",
  ].forEach((key) => _copyMaterialValue(material, sourceMat, key));

  material.name = sourceMat?.name || material.name;
  material.transparent = !!sourceMat?.transparent;
  material.emissiveIntensity = typeof sourceMat?.emissiveIntensity === "number"
    ? sourceMat.emissiveIntensity
    : _mat.emissiveIntensity;
  material.metalness = typeof sourceMat?.metalness === "number"
    ? sourceMat.metalness
    : _mat.metalness;
  material.roughness = typeof sourceMat?.roughness === "number"
    ? sourceMat.roughness
    : _mat.roughness;

  if ("skinning" in material) material.skinning = !!node?.isSkinnedMesh;
  if ("morphTargets" in material) material.morphTargets = !!node?.morphTargetInfluences;
  if ("morphNormals" in material) material.morphNormals = !!node?.morphTargetInfluences;

  if (preset === "matte") {
    material.transparent = (sourceMat?.opacity ?? 1) < 1;
    material.metalness = 0.04;
    material.roughness = 0.92;
    material.emissiveIntensity = 0.0;
  } else if (preset === "metal") {
    material.transparent = (sourceMat?.opacity ?? 1) < 1;
    material.metalness = 1.0;
    material.roughness = 0.18;
    material.emissiveIntensity = Math.min(material.emissiveIntensity, 0.18);
  } else if (preset === "glass") {
    material.transparent = true;
    material.opacity = Math.min(typeof sourceMat?.opacity === "number" ? sourceMat.opacity : 0.3, 0.35);
    material.depthWrite = false;
    material.metalness = 0.0;
    material.roughness = 0.08;
    material.transmission = 0.92;
    material.ior = 1.45;
    material.thickness = 0.8;
    material.clearcoat = 1.0;
    material.clearcoatRoughness = 0.04;
    material.envMapIntensity = 1.2;
  } else if (preset === "emissive") {
    material.transparent = (sourceMat?.opacity ?? 1) < 1;
    material.emissive = material.color.clone();
    material.emissiveIntensity = Math.max(material.emissiveIntensity, 1.15);
    material.metalness = 0.08;
    material.roughness = 0.34;
  }

  material.userData = {
    ...(sourceMat?.userData || {}),
    __devMaterialPreset: preset,
  };
  material.needsUpdate = true;
  return material;
}

function _applyMaterialPreset(preset) {
  _getTargetStates().forEach((state) => {
    _ensureOriginalMaterialsForState(state);
  });
  _forEachPivot((pivot) => {
    pivot.traverse((node) => {
      if (!node.isMesh || !node.material) return;
      if (Array.isArray(node.material)) {
        node.material = node.material.map((mat) => {
          if (!mat) return mat;
          return _buildPresetMaterial(mat, node, preset);
        });
      } else {
        node.material = _buildPresetMaterial(node.material, node, preset);
      }
    });
  });

  if (_mat.patternMode !== "none") {
    _applyPatternMode(_mat.patternMode);
  }
}

function _serializeStateMaterialEntry(label, state) {
  const mat = _getStateFirstMaterial(state);
  if (!state?.pivot || !mat) return null;
  return {
    label,
    ref: _getStateRef(state, label),
    preset: mat.userData?.__devMaterialPreset || "custom",
    material: {
      wireframe: !!mat.wireframe,
      opacity: typeof mat.opacity === "number" ? parseFloat(mat.opacity.toFixed(4)) : 1,
      transparent: !!mat.transparent,
      depthWrite: mat.depthWrite !== false,
      color: mat.color?.isColor ? `#${mat.color.getHexString()}` : "#ffffff",
      emissiveColor: mat.emissive?.isColor ? `#${mat.emissive.getHexString()}` : "#000000",
      emissiveIntensity: typeof mat.emissiveIntensity === "number"
        ? parseFloat(mat.emissiveIntensity.toFixed(4))
        : 0,
      metalness: typeof mat.metalness === "number" ? parseFloat(mat.metalness.toFixed(4)) : 0,
      roughness: typeof mat.roughness === "number" ? parseFloat(mat.roughness.toFixed(4)) : 1,
      transmission: typeof mat.transmission === "number" ? parseFloat(mat.transmission.toFixed(4)) : 0,
      ior: typeof mat.ior === "number" ? parseFloat(mat.ior.toFixed(4)) : 1.5,
      thickness: typeof mat.thickness === "number" ? parseFloat(mat.thickness.toFixed(4)) : 0,
      clearcoat: typeof mat.clearcoat === "number" ? parseFloat(mat.clearcoat.toFixed(4)) : 0,
    },
  };
}

function _applySerializedMaterialEntryToState(state, entry) {
  if (!state?.pivot || !entry?.material) return false;

  if (entry.preset === "original") {
    _restoreOriginalMaterialsForState(state);
    return true;
  }

  _ensureOriginalMaterialsForState(state);
  const preset = MATERIAL_PRESET_IDS.has(entry.preset) ? entry.preset : "";

  state.pivot.traverse((node) => {
    if (!node.isMesh || !node.material) return;

    if (preset && preset !== "original") {
      const original = _originalMaterialSnapshots.get(node);
      const originalList = Array.isArray(original) ? original : [original || node.material];
      if (Array.isArray(node.material)) {
        node.material = node.material.map((currentMat, index) => {
          const sourceMat = _cloneMaterialInstance(originalList[index] || originalList[0] || currentMat);
          return _buildPresetMaterial(sourceMat, node, preset);
        });
      } else {
        const sourceMat = _cloneMaterialInstance(originalList[0] || node.material);
        node.material = _buildPresetMaterial(sourceMat, node, preset);
      }
    }

    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach((mat) => {
      if (!mat) return;
      const props = entry.material;
      mat.wireframe = !!props.wireframe;
      if (typeof props.opacity === "number") mat.opacity = props.opacity;
      mat.transparent = !!props.transparent;
      mat.depthWrite = !!props.depthWrite;
      if (mat.color?.isColor && props.color) mat.color.set(props.color);
      if (mat.emissive?.isColor && props.emissiveColor) mat.emissive.set(props.emissiveColor);
      if (typeof mat.emissiveIntensity === "number" && typeof props.emissiveIntensity === "number") {
        mat.emissiveIntensity = props.emissiveIntensity;
      }
      if (typeof mat.metalness === "number" && typeof props.metalness === "number") {
        mat.metalness = props.metalness;
      }
      if (typeof mat.roughness === "number" && typeof props.roughness === "number") {
        mat.roughness = props.roughness;
      }
      if (typeof mat.transmission === "number" && typeof props.transmission === "number") {
        mat.transmission = props.transmission;
      }
      if (typeof mat.ior === "number" && typeof props.ior === "number") {
        mat.ior = props.ior;
      }
      if (typeof mat.thickness === "number" && typeof props.thickness === "number") {
        mat.thickness = props.thickness;
      }
      if (typeof mat.clearcoat === "number" && typeof props.clearcoat === "number") {
        mat.clearcoat = props.clearcoat;
      }
      mat.userData = { ...(mat.userData || {}) };
      if (entry.preset && entry.preset !== "custom") {
        mat.userData.__devMaterialPreset = entry.preset;
      } else {
        delete mat.userData.__devMaterialPreset;
      }
      mat.needsUpdate = true;
    });
  });

  if (_mat.patternMode !== "none") {
    _applyPatternMode(_mat.patternMode);
  }
  return true;
}

function _applyPendingMaterialHydration() {
  if (!_pendingMaterialHydration.size) return;
  Object.entries(_registry).forEach(([label, state]) => {
    const ref = _getStateRef(state, label);
    if (!_pendingMaterialHydration.has(ref)) return;
    const entry = _materialSourceState[ref];
    if (!entry || !_getStateFirstMaterial(state)) return;
    if (_applySerializedMaterialEntryToState(state, entry)) {
      _pendingMaterialHydration.delete(ref);
    }
  });
}

function _materialNeedsPattern(mat) {
  return !!mat && typeof mat === "object" && "onBeforeCompile" in mat;
}

function _ensurePatternShaderPatch(mat) {
  if (!_materialNeedsPattern(mat)) return;
  if (!mat.userData.__devPatternPatched) {
    const baseOnBeforeCompile = mat.onBeforeCompile?.bind(mat) || null;
    mat.userData.__devPatternPatched = true;
    mat.userData.__devBaseOnBeforeCompile = baseOnBeforeCompile;

    mat.onBeforeCompile = (shader) => {
      if (mat.userData.__devBaseOnBeforeCompile) {
        mat.userData.__devBaseOnBeforeCompile(shader);
      }

      shader.uniforms.uDevPatternTime = { value: 0 };
      shader.uniforms.uDevPatternMode = { value: 0 };
      shader.uniforms.uDevPatternScale = { value: _mat.patternScale };
      shader.uniforms.uDevPatternSpeed = { value: _mat.patternSpeed };
      shader.uniforms.uDevPatternMix = { value: _mat.patternMix };
      shader.uniforms.uDevPatternLine = { value: _mat.patternLine };

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        `#include <common>
        uniform float uDevPatternTime;
        uniform float uDevPatternMode;
        uniform float uDevPatternScale;
        uniform float uDevPatternSpeed;
        uniform float uDevPatternMix;
        uniform float uDevPatternLine;

        float devHash(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 34.12);
          return fract(p.x * p.y);
        }

        float devNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          float a = devHash(i);
          float b = devHash(i + vec2(1.0, 0.0));
          float c = devHash(i + vec2(0.0, 1.0));
          float d = devHash(i + vec2(1.0, 1.0));
          return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
        }

        vec2 devHex(vec2 p) {
          p = vec2(p.x * 1.1547005, p.y + p.x * 0.5773502);
          vec2 a = floor(p);
          vec2 b = floor(p + vec2(0.5));
          vec2 gvA = p - a;
          vec2 gvB = p - b;
          return dot(gvA, gvA) < dot(gvB, gvB) ? gvA : gvB;
        }

        float devVoronoi(vec2 p) {
          vec2 g = floor(p);
          vec2 f = fract(p);
          float dist = 1.0;
          for (int y = -1; y <= 1; y++) {
            for (int x = -1; x <= 1; x++) {
              vec2 o = vec2(float(x), float(y));
              vec2 h = vec2(devHash(g + o), devHash(g + o + 13.7));
              vec2 r = o + h - f;
              dist = min(dist, dot(r, r));
            }
          }
          return sqrt(dist);
        }`,
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <dithering_fragment>",
        `
        vec2 patternUv = vUv * uDevPatternScale;
        float t = uDevPatternTime * uDevPatternSpeed;
        float overlay = 0.0;

        if (uDevPatternMode > 0.5 && uDevPatternMode < 1.5) {
          overlay = devNoise(patternUv + vec2(t * 0.25, t * 0.18));
        } else if (uDevPatternMode > 1.5 && uDevPatternMode < 2.5) {
          float v = devVoronoi(patternUv + vec2(t * 0.2, t * -0.14));
          overlay = smoothstep(0.05, 0.28 + uDevPatternLine * 0.35, v);
        } else if (uDevPatternMode > 2.5 && uDevPatternMode < 3.5) {
          vec2 hx = devHex(patternUv + vec2(t * 0.24, 0.0));
          float d = max(abs(hx.x), abs(hx.y));
          overlay = 1.0 - smoothstep(0.17, 0.17 + uDevPatternLine * 0.35, d);
        } else if (uDevPatternMode > 3.5) {
          float scan = step(0.55, fract((vUv.y + t * 0.14) * uDevPatternScale * 1.6));
          float band = sin((vUv.x + t * 0.03) * 36.0) * 0.5 + 0.5;
          overlay = scan * band;
        }

        vec3 patternColor = vec3(0.15, 0.85, 1.0) * overlay;
        gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb + patternColor, uDevPatternMix);
        #include <dithering_fragment>
        `,
      );

      _patternUniformSets.push(shader.uniforms);
    };

    mat.customProgramCacheKey = () => {
      const mode = mat.userData.__devPatternMode || "none";
      return `dev-pattern-${mode}`;
    };
  }
}

function _patternModeToNumber(mode) {
  if (mode === "noise") return 1;
  if (mode === "voronoi") return 2;
  if (mode === "hex-grid") return 3;
  if (mode === "scanlines") return 4;
  return 0;
}

function _applyPatternMode(mode) {
  _mat.patternMode = mode;
  _forEachMaterial((mat) => {
    _ensurePatternShaderPatch(mat);
    mat.userData.__devPatternMode = mode;
    mat.needsUpdate = true;
  });
}

function _updatePatternUniforms(elapsed) {
  const modeNumber = _patternModeToNumber(_mat.patternMode);
  _patternUniformSets = _patternUniformSets.filter((uniforms) => !!uniforms);
  _patternUniformSets.forEach((uniforms) => {
    if (!uniforms.uDevPatternTime) return;
    uniforms.uDevPatternTime.value = elapsed;
    uniforms.uDevPatternMode.value = modeNumber;
    uniforms.uDevPatternScale.value = _mat.patternScale;
    uniforms.uDevPatternSpeed.value = _mat.patternSpeed;
    uniforms.uDevPatternMix.value = _mat.patternMix;
    uniforms.uDevPatternLine.value = _mat.patternLine;
  });
}

function _getAnimState() {
  const states = _getTargetStates();
  for (let i = 0; i < states.length; i += 1) {
    const s = states[i];
    if (s?.mixer && s?.actions?.length) return s;
    if (s?.mixer && s?.clipActions?.length) return { ...s, actions: s.clipActions };
  }
  return null;
}

function _ensureManualClip(state) {
  if (!state || !state.pivot) return null;
  if (_manualClips.has(state)) return _manualClips.get(state);
  const clip = {
    enabled: false,
    duration: 4.0,
    loop: true,
    playing: false,
    time: 0.0,
    easing: "linear",
    overrideNativeAnimation: true,
    position: { x: [], y: [], z: [] },
    rotation: { x: [], y: [], z: [] },
  };
  _manualClips.set(state, clip);
  return clip;
}

function _getManualAxisLocks(state) {
  const clip = state ? _manualClips.get(state) : null;
  const emptyLocks = {
    position: { x: false, y: false, z: false },
    rotation: { x: false, y: false, z: false },
  };

  if (!clip || !clip.enabled) {
    return emptyLocks;
  }

  return {
    position: {
      x: Array.isArray(clip.position?.x) && clip.position.x.length > 0,
      y: Array.isArray(clip.position?.y) && clip.position.y.length > 0,
      z: Array.isArray(clip.position?.z) && clip.position.z.length > 0,
    },
    rotation: {
      x: Array.isArray(clip.rotation?.x) && clip.rotation.x.length > 0,
      y: Array.isArray(clip.rotation?.y) && clip.rotation.y.length > 0,
      z: Array.isArray(clip.rotation?.z) && clip.rotation.z.length > 0,
    },
  };
}

function _sortAndDedupKeys(keys) {
  keys.sort((a, b) => a.time - b.time);
  const out = [];
  keys.forEach((k) => {
    const prev = out[out.length - 1];
    if (prev && Math.abs(prev.time - k.time) < 0.0001) {
      out[out.length - 1] = k;
    } else {
      out.push(k);
    }
  });
  keys.length = 0;
  out.forEach(k => keys.push(k));
}

function _insertKey(keys, time, value, hold) {
  keys.push({ time, value, hold: !!hold });
  _sortAndDedupKeys(keys);
}

function _removeKeyAtTime(keys, time) {
  const idx = keys.findIndex(k => Math.abs(k.time - time) < 0.0001);
  if (idx >= 0) {
    keys.splice(idx, 1);
    return true;
  }
  return false;
}

function _easingAlpha(a, easing) {
  if (easing === "smoothstep") return a * a * (3 - 2 * a);
  if (easing === "ease-in-out") return 0.5 - 0.5 * Math.cos(Math.PI * a);
  if (easing === "step") return 0;
  return a;
}

function _sampleTrack(keys, t, easing) {
  if (!keys.length) return null;
  if (keys.length === 1) return keys[0].value;
  if (t <= keys[0].time) return keys[0].value;
  const last = keys[keys.length - 1];
  if (t >= last.time) return last.value;

  for (let i = 0; i < keys.length - 1; i += 1) {
    const a = keys[i];
    const b = keys[i + 1];
    if (t < a.time || t > b.time) continue;
    if (a.hold || b.time <= a.time + 0.000001) return a.value;
    const alpha = (t - a.time) / (b.time - a.time);
    const e = _easingAlpha(alpha, easing);
    return THREE.MathUtils.lerp(a.value, b.value, e);
  }
  return last.value;
}

function _manualTrackCount(clip) {
  if (!clip) return 0;
  return clip.position.x.length + clip.position.y.length + clip.position.z.length
    + clip.rotation.x.length + clip.rotation.y.length + clip.rotation.z.length;
}

function _syncKeyframeUiFromActive() {
  const state = _active;
  const clip = state ? _ensureManualClip(state) : null;
  if (!clip) {
    _kf.keyCount = 0;
    return;
  }
  _kf.enabled = !!clip.enabled;
  _kf.duration = clip.duration;
  _kf.loop = !!clip.loop;
  _kf.playing = !!clip.playing;
  _kf.scrub = clip.duration > 0 ? THREE.MathUtils.clamp(clip.time / clip.duration, 0, 1) : 0;
  _kf.overrideNativeAnimation = clip.overrideNativeAnimation !== false;
  _kf.easing = clip.easing || "linear";
  _kf.keyCount = _manualTrackCount(clip);
}

function _setRuntimeAnimationControl(state, patch) {
  if (!state?.devAnimationControl || !patch) return;
  Object.assign(state.devAnimationControl, patch);
}

function _syncNativeAnimationPause(state, shouldPause) {
  if (!state) return;
  if (state.devAnimationControl) {
    _setRuntimeAnimationControl(state, {
      suppressFlow: !!shouldPause,
      scrubEnabled: false,
    });
  }
  const actions = state.actions || state.clipActions;
  if (!actions?.length) return;
  actions.forEach((a) => {
    a.paused = shouldPause;
  });
}

function _applyManualClipToState(state, clip, t) {
  if (!state?.pivot || !clip?.enabled) return;

  if (clip.overrideNativeAnimation) {
    _syncNativeAnimationPause(state, true);
  }

  const p = state.pivot;
  const px = _sampleTrack(clip.position.x, t, clip.easing);
  const py = _sampleTrack(clip.position.y, t, clip.easing);
  const pz = _sampleTrack(clip.position.z, t, clip.easing);
  if (px !== null) p.position.x = px;
  if (py !== null) p.position.y = py;
  if (pz !== null) p.position.z = pz;

  const rx = _sampleTrack(clip.rotation.x, t, clip.easing);
  const ry = _sampleTrack(clip.rotation.y, t, clip.easing);
  const rz = _sampleTrack(clip.rotation.z, t, clip.easing);
  if (rx !== null) p.rotation.x = RAD(rx);
  if (ry !== null) p.rotation.y = RAD(ry);
  if (rz !== null) p.rotation.z = RAD(rz);
}

function _updateManualKeyframes(elapsed) {
  const dt = Math.max(0, elapsed - _lastElapsed);
  _lastElapsed = elapsed;

  Object.values(_registry).forEach((state) => {
    const clip = _manualClips.get(state);
    if (!clip || !clip.enabled) return;
    if (clip.playing) {
      clip.time += dt;
      if (clip.loop && clip.duration > 0) {
        clip.time = THREE.MathUtils.euclideanModulo(clip.time, clip.duration);
      } else {
        clip.time = Math.min(clip.time, clip.duration);
        if (clip.time >= clip.duration) clip.playing = false;
      }
    }
    _applyManualClipToState(state, clip, clip.time);
  });

  if (_active) {
    _syncKeyframeUiFromActive();
  }
}

function _copyKeyframeScript() {
  const targets = _getTargetStates();
  if (!targets.length) return;

  const snippets = targets.map((state, idx) => {
    const clip = _manualClips.get(state);
    if (!clip) return null;
    const ref = state.codeRef || state.label || `target${idx + 1}`;
    const payload = {
      duration: parseFloat(clip.duration.toFixed(4)),
      loop: !!clip.loop,
      easing: clip.easing,
      position: clip.position,
      rotationDeg: clip.rotation,
    };
    return `// ${ref}\nconst ${ref.replace(/[^a-zA-Z0-9_]/g, "_")}_manualKeyframes = ${JSON.stringify(payload, null, 2)};`;
  }).filter(Boolean);

  if (!snippets.length) return;
  const text = snippets.join("\n\n");
  navigator.clipboard.writeText(text).then(() => {
    console.log("[DevTools] Copied manual keyframe script:\n" + text);
  });
}

function _copyPipelineSnippets() {
  const targets = _getTargetStates();
  if (!targets.length) return;

  const blocks = targets.map((state, idx) => {
    const ref = state.codeRef || state.label || `target${idx + 1}`;
    const className = ref.replace(/[^a-zA-Z0-9_]/g, "-").toLowerCase();
    const clip = _manualClips.get(state);
    const payload = clip ? {
      duration: parseFloat(clip.duration.toFixed(4)),
      loop: !!clip.loop,
      easing: clip.easing,
      position: clip.position,
      rotationDeg: clip.rotation,
    } : { duration: 4, loop: true, easing: "linear", position: { x: [], y: [], z: [] }, rotationDeg: { x: [], y: [], z: [] } };

    return `// JS (${ref})\nconst ${className}_manualKeyframes = ${JSON.stringify(payload, null, 2)};\n\n` +
      `/* CSS (${ref}) */\n.${className}-overlay {\n  position: absolute;\n  pointer-events: none;\n  color: #d8f7ff;\n  font: 600 0.95rem/1.2 "IBM Plex Sans", sans-serif;\n  text-shadow: 0 0 12px rgba(48, 214, 255, 0.55);\n  transform: translate3d(0, 0, 0);\n}\n\n` +
      `<!-- HTML (${ref}) -->\n<div class="${className}-overlay" data-projection-target="${ref}">Flow Panel Text</div>`;
  });

  const text = blocks.join("\n\n");
  navigator.clipboard.writeText(text).then(() => {
    console.log("[DevTools] Copied JS/CSS/HTML snippets:\n" + text);
  });
}

function _syncFromScene() {
  const pivot = _getPivot();
  if (!pivot) return;

  // Rotation
  _rot.x = parseFloat(DEG(pivot.rotation.x).toFixed(2));
  _rot.y = parseFloat(DEG(pivot.rotation.y).toFixed(2));
  _rot.z = parseFloat(DEG(pivot.rotation.z).toFixed(2));

  // Position
  _pos.x = parseFloat(pivot.position.x.toFixed(4));
  _pos.y = parseFloat(pivot.position.y.toFixed(4));
  _pos.z = parseFloat(pivot.position.z.toFixed(4));

  // Scale (uniform read from x)
  _scale.uniform = parseFloat(pivot.scale.x.toFixed(4));

  // Material (first mesh)
  const mat = _getFirstMaterial();
  if (mat) {
    _mat.wireframe         = mat.wireframe ?? false;
    _mat.opacity           = mat.opacity   ?? 1.0;
    _mat.color             = mat.color ? "#" + mat.color.getHexString() : "#ffffff";
    _mat.emissiveColor     = mat.emissive ? "#" + mat.emissive.getHexString() : "#000000";
    _mat.emissiveIntensity = mat.emissiveIntensity ?? 0.0;
    _mat.metalness         = typeof mat.metalness === "number" ? mat.metalness : 0.0;
    _mat.roughness         = typeof mat.roughness === "number" ? mat.roughness : 1.0;
    _mat.transmission      = typeof mat.transmission === "number" ? mat.transmission : 0.0;
    _mat.ior               = typeof mat.ior === "number" ? mat.ior : 1.5;
    _mat.thickness         = typeof mat.thickness === "number" ? mat.thickness : 0.0;
    _mat.clearcoat         = typeof mat.clearcoat === "number" ? mat.clearcoat : 0.0;
  }

  // Attributes
  _attr.visible      = pivot.visible;
  const mesh = _getFirstMesh();
  _attr.castShadow   = !!(mesh?.castShadow ?? pivot.castShadow);
  _attr.receiveShadow = !!(mesh?.receiveShadow ?? pivot.receiveShadow);

  // Animation
  const animState = _getAnimState();
  const mixer   = animState?.mixer;
  const actions = animState?.actions || animState?.clipActions;
  if (mixer && actions?.length) {
    const a = actions[0];
    _anim.playing       = !a.paused;
    _anim.normalizedTime = parseFloat((a.time / (a.getClip().duration || 1)).toFixed(4));
    _anim.timeScale     = a.timeScale;
    _anim.clipName      = a.getClip().name;
  } else {
    _anim.playing        = false;
    _anim.normalizedTime = 0;
    _anim.timeScale      = 1;
    _anim.clipName       = "— none —";
  }

  _syncKeyframeUiFromActive();
  _syncFlowSelectionToKeyTime();
  _syncProjectionTargetName();
}

// ─── Folder: Transform ───────────────────────────────────────────
function _buildTransform(parent) {
  const f = parent.addFolder("Transform");

  const rFolder = f.addFolder("Rotation (°)");
  rFolder.add(_rot, "x", -180, 180, 0.1).name("X").onChange(v => {
    _applyMutation("transform.rotation.x", () => {
      _forEachPivot((p) => { p.rotation.x = RAD(v); });
    });
  });
  rFolder.add(_rot, "y", -180, 180, 0.1).name("Y").onChange(v => {
    _applyMutation("transform.rotation.y", () => {
      _forEachPivot((p) => { p.rotation.y = RAD(v); });
    });
  });
  rFolder.add(_rot, "z", -180, 180, 0.1).name("Z").onChange(v => {
    _applyMutation("transform.rotation.z", () => {
      _forEachPivot((p) => { p.rotation.z = RAD(v); });
    });
  });

  const tFolder = f.addFolder("Translate");
  tFolder.add(_pos, "x", -2000, 2000, 0.01).name("X").onChange(v => {
    _applyMutation("transform.position.x", () => {
      _forEachPivot((p) => { p.position.x = v; });
    });
  });
  tFolder.add(_pos, "y", -2000, 2000, 0.01).name("Y").onChange(v => {
    _applyMutation("transform.position.y", () => {
      _forEachPivot((p) => { p.position.y = v; });
    });
  });
  tFolder.add(_pos, "z", -2000, 2000, 0.01).name("Z").onChange(v => {
    _applyMutation("transform.position.z", () => {
      _forEachPivot((p) => { p.position.z = v; });
    });
  });

  const sFolder = f.addFolder("Scale");
  sFolder.add(_scale, "uniform", 0.001, 100, 0.001).name("Uniform").onChange(v => {
    _applyMutation("transform.scale.uniform", () => {
      _forEachPivot((p) => { p.scale.setScalar(v); });
    });
  });

  _folders.transform = f;
}

// ─── Folder: Material ────────────────────────────────────────────
function _buildMaterial(parent) {
  const f = parent.addFolder("Material");

  const presetFolder = f.addFolder("Material Presets");
  presetFolder.close();
  presetFolder.add({
    applyMatte() {
      _applyMutation("material.preset.matte", () => {
        _applyMaterialPreset("matte");
      });
    },
  }, "applyMatte").name("Apply Matte");
  presetFolder.add({
    applyMetal() {
      _applyMutation("material.preset.metal", () => {
        _applyMaterialPreset("metal");
      });
    },
  }, "applyMetal").name("Apply Metal");
  presetFolder.add({
    applyGlass() {
      _applyMutation("material.preset.glass", () => {
        _applyMaterialPreset("glass");
      });
    },
  }, "applyGlass").name("Apply Glass");
  presetFolder.add({
    applyEmissive() {
      _applyMutation("material.preset.emissive", () => {
        _applyMaterialPreset("emissive");
      });
    },
  }, "applyEmissive").name("Apply Emissive");
  presetFolder.add({
    restoreOriginal() {
      _applyMutation("material.restoreOriginal", () => {
        _mat.patternMode = "none";
        _patternUniformSets = [];
        _getTargetStates().forEach((state) => {
          _restoreOriginalMaterialsForState(state);
        });
      });
    },
  }, "restoreOriginal").name("Restore Original");

  f.add(_mat, "wireframe").name("Wireframe").onChange(v => {
    _applyMutation("material.wireframe", () => {
      _forEachMaterial((mat) => {
        mat.wireframe = v;
        mat.needsUpdate = true;
      });
    });
  });
  f.add(_mat, "opacity", 0, 1, 0.01).name("Opacity").onChange(v => {
    _applyMutation("material.opacity", () => {
      _forEachMaterial((mat) => {
        const nextTransparent = v < 0.999;
        const transparencyChanged = mat.transparent !== nextTransparent;
        mat.transparent = nextTransparent;
        mat.opacity = v;
        if (transparencyChanged) {
          mat.needsUpdate = true;
        }
      });
    });
  });
  f.addColor(_mat, "color").name("Color").onChange(v => {
    _applyMutation("material.color", () => {
      _forEachMaterial((mat) => {
        if (mat.color) mat.color.set(v);
      });
    });
  });
  f.addColor(_mat, "emissiveColor").name("Emissive Color").onChange(v => {
    _applyMutation("material.emissiveColor", () => {
      _forEachMaterial((mat) => {
        if (mat.emissive) mat.emissive.set(v);
      });
    });
  });
  f.add(_mat, "emissiveIntensity", 0, 5, 0.01).name("Emissive Intensity").onChange(v => {
    _applyMutation("material.emissiveIntensity", () => {
      _forEachMaterial((mat) => {
        if (typeof mat.emissiveIntensity === "number") mat.emissiveIntensity = v;
      });
    });
  });
  f.add(_mat, "metalness", 0, 1, 0.01).name("Metalness").onChange(v => {
    _applyMutation("material.metalness", () => {
      _forEachMaterial((mat) => {
        if (typeof mat.metalness === "number") mat.metalness = v;
      });
    });
  });
  f.add(_mat, "roughness", 0, 1, 0.01).name("Roughness").onChange(v => {
    _applyMutation("material.roughness", () => {
      _forEachMaterial((mat) => {
        if (typeof mat.roughness === "number") mat.roughness = v;
      });
    });
  });
  f.add(_mat, "transmission", 0, 1, 0.01).name("Transmission").onChange(v => {
    _applyMutation("material.transmission", () => {
      _forEachMaterial((mat) => {
        if (typeof mat.transmission === "number") {
          mat.transmission = v;
          mat.transparent = true;
        }
      });
    });
  });
  f.add(_mat, "ior", 1, 2.5, 0.01).name("IOR").onChange(v => {
    _applyMutation("material.ior", () => {
      _forEachMaterial((mat) => {
        if (typeof mat.ior === "number") {
          mat.ior = v;
        }
      });
    });
  });
  f.add(_mat, "thickness", 0, 5, 0.01).name("Thickness").onChange(v => {
    _applyMutation("material.thickness", () => {
      _forEachMaterial((mat) => {
        if (typeof mat.thickness === "number") {
          mat.thickness = v;
        }
      });
    });
  });
  f.add(_mat, "clearcoat", 0, 1, 0.01).name("Clearcoat").onChange(v => {
    _applyMutation("material.clearcoat", () => {
      _forEachMaterial((mat) => {
        if (typeof mat.clearcoat === "number") {
          mat.clearcoat = v;
        }
      });
    });
  });

  const patternOptions = {
    None: "none",
    Noise: "noise",
    Voronoi: "voronoi",
    "Hex Grid": "hex-grid",
    Scanlines: "scanlines",
  };

  f.add(_mat, "patternMode", patternOptions).name("Pattern Mode").onChange((v) => {
    _applyMutation("material.patternMode", () => {
      _applyPatternMode(v);
    });
  });
  f.add(_mat, "patternScale", 0.5, 40, 0.1).name("Pattern Scale");
  f.add(_mat, "patternSpeed", 0, 6, 0.01).name("Pattern Speed");
  f.add(_mat, "patternMix", 0, 1, 0.01).name("Pattern Mix");
  f.add(_mat, "patternLine", 0.01, 1, 0.01).name("Pattern Line");

  // ── Shader Math Library sub-folder ───────────────────────────
  const sf = f.addFolder("Shader Math Library");
  sf.close();

  const snippetKeys = Object.keys(SHADER_SNIPPETS);
  sf.add(_shaderLib, "snippet", snippetKeys).name("Snippet").onChange(v => {
    const s = SHADER_SNIPPETS[v];
    _shaderLib.status = s ? s.description : "unknown";
    _refreshGui();
  });

  sf.add({ copyHeader() {
    const s = SHADER_SNIPPETS[_shaderLib.snippet];
    if (!s) return;
    const header = [
      `// ─── ${s.label} ───`,
      `// ${s.description}`,
      `// UNIFORMS:`,
      s.uniforms.split("\n").map(l => `//   ${l}`).join("\n"),
      `// INJECT into fragmentShader:`,
      s.inject.split("\n").map(l => `//   ${l}`).join("\n"),
      `// DEFAULT UNIFORMS:`,
      `//   ${s.defaults}`,
    ].join("\n");
    navigator.clipboard.writeText(header).catch(() => {});
    _shaderLib.status = `Copied: ${s.label}`;
    _refreshGui();
  }}, "copyHeader").name("Copy Header → Chat");

  sf.add({ applySnippet() {
    const s = SHADER_SNIPPETS[_shaderLib.snippet];
    if (!s) return;
    const mat = _getFirstMaterial();
    if (!mat) { _shaderLib.status = "No material found"; _refreshGui(); return; }

    const existingOnBC = mat.onBeforeCompile ?? null;
    mat.onBeforeCompile = (shader) => {
      if (existingOnBC) existingOnBC(shader);
      // inject uniforms
      const uLines = s.uniforms.split("\n").map(l => l.trim()).filter(Boolean);
      uLines.forEach(ul => {
        if (!shader.fragmentShader.includes(ul.replace(";", "").split(" ").pop())) {
          shader.fragmentShader = ul + "\n" + shader.fragmentShader;
        }
      });
      // inject code just before gl_FragColor
      shader.fragmentShader = shader.fragmentShader.replace(
        /void main\(\)\s*\{/,
        `void main() {\n  // __DEV_SNIPPET_${s.label.replace(/\s/g,"_")}__`
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        `// __DEV_SNIPPET_${s.label.replace(/\s/g,"_")}__`,
        `// __DEV_SNIPPET_${s.label.replace(/\s/g,"_")}__${s.inject}`
      );
      // parse default uniforms cleanly (best-effort)
      try {
        const evalStr = `(function(){const THREE=window.THREE||{Color:class{constructor(h){this.r=((h>>16)&255)/255;this.g=((h>>8)&255)/255;this.b=(h&255)/255;}},Vector3:class{constructor(x,y,z){this.x=x||0;this.y=y||0;this.z=z||0;}};return ${s.defaults};})();`;
        const uDefs = eval(evalStr); // eslint-disable-line no-eval
        Object.entries(uDefs).forEach(([k, v]) => { shader.uniforms[k] = v; });
        mat.userData.__devSnippetUniforms = mat.userData.__devSnippetUniforms || {};
        Object.assign(mat.userData.__devSnippetUniforms, uDefs);
      } catch(e) { /* best-effort */ }
    };
    mat.needsUpdate = true;
    _shaderLib._appliedSnippets.push(s.label);
    _shaderLib.status = `Applied: ${s.label}`;
    _applyMutation(`shader.${s.label}`, () => {});
    _refreshGui();
  }}, "applySnippet").name("Apply to Selected Object");

  sf.add(_shaderLib, "status").name("Status").disable();

  _folders.material = f;
}

// ─── Folder: Attributes ──────────────────────────────────────────
function _buildAttributes(parent) {
  const f = parent.addFolder("Attributes");

  f.add(_attr, "visible").name("Visible").onChange(v => {
    _applyMutation("attributes.visible", () => {
      _forEachPivot((p) => { p.visible = v; });
    });
  });
  f.add(_attr, "castShadow").name("Cast Shadow").onChange(v => {
    _applyMutation("attributes.castShadow", () => {
      _forEachPivot((p) => {
        p.traverse(n => { n.castShadow = v; });
      });
    });
  });
  f.add(_attr, "receiveShadow").name("Receive Shadow").onChange(v => {
    _applyMutation("attributes.receiveShadow", () => {
      _forEachPivot((p) => {
        p.traverse(n => { n.receiveShadow = v; });
      });
    });
  });

  _folders.attributes = f;
}

// ─── Folder: Animation ───────────────────────────────────────────
function _buildAnimation(parent) {
  const f = parent.addFolder("Animation");

  f.add(_anim, "clipName").name("Clip").disable();
  f.add(_anim, "playing").name("Playing").onChange(v => {
    _applyMutation("animation.playing", () => {
      const state = _getAnimState();
      const actions = state?.actions || state?.clipActions;
      if (!actions?.length) return;
      if (state?.devAnimationControl) {
        _setRuntimeAnimationControl(state, {
          suppressFlow: !!v,
          scrubEnabled: false,
        });
      }
      actions.forEach(a => { a.paused = !v; });
    });
  });
  f.add(_anim, "normalizedTime", 0, 1, 0.0001).name("Scrub (0–1)").onChange(v => {
    _applyMutation("animation.scrub", () => {
      const state = _getAnimState();
      const actions = state?.actions || state?.clipActions;
      if (!actions?.length) return;
      if (state?.devAnimationControl) {
        _setRuntimeAnimationControl(state, {
          suppressFlow: true,
          scrubEnabled: true,
          scrubNormalizedTime: v,
        });
      }
      actions.forEach(a => {
        a.paused = true;
        a.time = v * a.getClip().duration;
        state?.mixer?.update(0);
      });
    });
  });
  f.add(_anim, "timeScale", 0, 4, 0.01).name("Time Scale").onChange(v => {
    _applyMutation("animation.timeScale", () => {
      const state = _getAnimState();
      const actions = state?.actions || state?.clipActions;
      if (!actions?.length) return;
      actions.forEach(a => { a.timeScale = v; });
    });
  });

  _folders.animation = f;
}

// ─── Folder: Keyframe Authoring ─────────────────────────────────
function _buildKeyframeAuthoring(parent) {
  const f = parent.addFolder("Keyframe Authoring");

  const channelOptions = {
    Position: "position",
    Rotation: "rotation",
  };

  const componentOptions = {
    X: "x",
    Y: "y",
    Z: "z",
  };

  const easingOptions = {
    Linear: "linear",
    Smoothstep: "smoothstep",
    "Ease In Out": "ease-in-out",
    Step: "step",
  };

  function insertKeyAtTime(time) {
    _applyMutation("keyframe.insert", () => {
      _getTargetStates().forEach((state) => {
        const p = state?.pivot;
        const clip = _ensureManualClip(state);
        if (!p || !clip) return;

        clip.enabled = true;
        clip.duration = _kf.duration;
        clip.loop = _kf.loop;
        clip.easing = _kf.easing;
        clip.overrideNativeAnimation = _kf.overrideNativeAnimation;

        const track = clip[_kf.channel]?.[_kf.component];
        if (!track) return;

        const value = _kf.channel === "position"
          ? p.position[_kf.component]
          : DEG(p.rotation[_kf.component]);

        _insertKey(track, time, value, _kf.hold);

        if (_kf.autoplayOnInsert) {
          clip.time = 0;
          clip.playing = true;
        }
      });
      _kf.time = time;
    });
  }

  f.add(_kf, "enabled").name("Enable Manual Keys").onChange((v) => {
    _applyMutation("keyframe.enabled", () => {
      _getTargetStates().forEach((state) => {
        const clip = _ensureManualClip(state);
        if (!clip) return;
        clip.enabled = !!v;
        if (state?.devAnimationControl) {
          _setRuntimeAnimationControl(state, {
            suppressFlow: !!v && clip.overrideNativeAnimation !== false,
            scrubEnabled: false,
          });
        }
        if (!v && clip.overrideNativeAnimation) {
          _syncNativeAnimationPause(state, false);
        }
      });
    });
  });

  f.add(_kf, "channel", channelOptions).name("Channel");
  f.add(_kf, "component", componentOptions).name("Axis");
  f.add(_kf, "time", 0, 30, 0.001).name("Key Time (s)");
  f.add(_kf, "duration", 0.1, 60, 0.01).name("Clip Duration").onChange((v) => {
    _applyMutation("keyframe.duration", () => {
      _getTargetStates().forEach((state) => {
        const clip = _ensureManualClip(state);
        if (!clip) return;
        clip.duration = v;
        clip.time = Math.min(clip.time, clip.duration);
      });
      _syncFlowSelectionToKeyTime();
    });
  });
  f.add(_kf, "loop").name("Loop").onChange((v) => {
    _applyMutation("keyframe.loop", () => {
      _getTargetStates().forEach((state) => {
        const clip = _ensureManualClip(state);
        if (clip) clip.loop = !!v;
      });
    });
  });
  f.add(_kf, "playing").name("Playing").onChange((v) => {
    _applyMutation("keyframe.playing", () => {
      _getTargetStates().forEach((state) => {
        const clip = _ensureManualClip(state);
        if (!clip) return;
        clip.playing = !!v;
        if (state?.devAnimationControl && clip.overrideNativeAnimation !== false) {
          _setRuntimeAnimationControl(state, {
            suppressFlow: !!v || clip.enabled,
            scrubEnabled: false,
          });
        }
      });
    });
  });
  f.add(_kf, "autoplayOnInsert").name("Autoplay On Insert");
  f.add(_kf, "hold").name("Hold Key");
  f.add(_kf, "easing", easingOptions).name("Easing").onChange((v) => {
    _applyMutation("keyframe.easing", () => {
      _getTargetStates().forEach((state) => {
        const clip = _ensureManualClip(state);
        if (clip) clip.easing = v;
      });
    });
  });
  f.add(_kf, "overrideNativeAnimation").name("Override Native Anim").onChange((v) => {
    _applyMutation("keyframe.overrideNative", () => {
      _getTargetStates().forEach((state) => {
        const clip = _ensureManualClip(state);
        if (!clip) return;
        clip.overrideNativeAnimation = !!v;
        if (state?.devAnimationControl) {
          _setRuntimeAnimationControl(state, {
            suppressFlow: !!v && !!clip.enabled,
            scrubEnabled: false,
          });
        }
        if (!v) _syncNativeAnimationPause(state, false);
      });
    });
  });
  f.add(_kf, "scrub", 0, 1, 0.0001).name("Scrub (0-1)").onChange((v) => {
    _applyMutation("keyframe.scrub", () => {
      _getTargetStates().forEach((state) => {
        const clip = _ensureManualClip(state);
        if (!clip) return;
        clip.playing = false;
        clip.time = clip.duration * v;
        if (state?.devAnimationControl && clip.overrideNativeAnimation !== false) {
          _setRuntimeAnimationControl(state, {
            suppressFlow: true,
            scrubEnabled: false,
          });
        }
        _applyManualClipToState(state, clip, clip.time);
      });
    });
  });
  f.add(_kf, "keyCount").name("Key Count").disable();

  const flowFolder = f.addFolder("Flow Logic");
  if (_flow.options.length) {
    const flowOptions = Object.fromEntries(_flow.options.map((o) => [o.label, o.id]));
    flowFolder.add(_flow, "selected", flowOptions).name("Flow Point").onChange(() => {
      _syncFlowSelectionToKeyTime();
      _kf.time = _flow.mappedTime;
      _refreshGui();
    });
  } else {
    flowFolder.add({ message: "No flow map provided" }, "message").name("Flow Point").disable();
  }
  flowFolder.add(_flow, "indicator").name("Indicator").disable();
  flowFolder.add(_flow, "point").name("Point (0-1)").disable();
  flowFolder.add(_flow, "mappedTime").name("Mapped Time").disable();

  const keyApi = {
    "Set Time <- Flow Point"() {
      _syncFlowSelectionToKeyTime();
      _kf.time = _flow.mappedTime;
      _refreshGui();
    },
    "Insert Key @ Flow Point"() {
      _syncFlowSelectionToKeyTime();
      insertKeyAtTime(_flow.mappedTime);
    },
    "Insert Key @ Time"() {
      insertKeyAtTime(_kf.time);
    },
    "Delete Key @ Time"() {
      _applyMutation("keyframe.delete", () => {
        _getTargetStates().forEach((state) => {
          const clip = _ensureManualClip(state);
          if (!clip) return;
          const track = clip[_kf.channel]?.[_kf.component];
          if (!track) return;
          _removeKeyAtTime(track, _kf.time);
        });
      });
    },
    "Clear Axis Keys"() {
      _applyMutation("keyframe.clearAxis", () => {
        _getTargetStates().forEach((state) => {
          const clip = _ensureManualClip(state);
          if (!clip) return;
          const track = clip[_kf.channel]?.[_kf.component];
          if (track) track.length = 0;
        });
      });
    },
    "Clear All Manual Keys"() {
      _applyMutation("keyframe.clearAll", () => {
        _getTargetStates().forEach((state) => {
          const clip = _ensureManualClip(state);
          if (!clip) return;
          ["x", "y", "z"].forEach((axis) => {
            clip.position[axis].length = 0;
            clip.rotation[axis].length = 0;
          });
          clip.time = 0;
          clip.playing = false;
        });
      });
    },
    "Copy Keyframe JS"() {
      _copyKeyframeScript();
    },
    "Copy JS/CSS/HTML Snippets"() {
      _copyPipelineSnippets();
    },
  };

  f.add(keyApi, "Set Time <- Flow Point");
  f.add(keyApi, "Insert Key @ Flow Point");
  f.add(keyApi, "Insert Key @ Time");
  f.add(keyApi, "Delete Key @ Time");
  f.add(keyApi, "Clear Axis Keys");
  f.add(keyApi, "Clear All Manual Keys");
  f.add(keyApi, "Copy Keyframe JS");
  f.add(keyApi, "Copy JS/CSS/HTML Snippets");

  _folders.keyframes = f;
}

// ─── Folder: Actions ─────────────────────────────────────────────
function _buildActions(parent) {
  const f = parent.addFolder("Actions");

  const api = {
    "Log Values to Console"() {
      const p = _getPivot();
      if (!p) return;
      console.group(`[DevTools] ${_activeLabel}`);
      console.log("Rotation (°):", {
        x: DEG(p.rotation.x).toFixed(2),
        y: DEG(p.rotation.y).toFixed(2),
        z: DEG(p.rotation.z).toFixed(2),
      });
      console.log("Position:", p.position);
      console.log("Scale:", p.scale);
      const mat = _getFirstMaterial();
      if (mat) console.log("Material:", mat);
      const actions = _active?.actions;
      if (actions?.length) {
        actions.forEach(a => console.log(`Clip: ${a.getClip().name}`, {
          time: a.time,
          duration: a.getClip().duration,
          paused: a.paused,
          timeScale: a.timeScale,
        }));
      }
      console.groupEnd();
    },
    "Copy Transform Code"() {
      const pivots = _getPivots();
      if (!pivots.length) return;
      const targets = _getTargetStates();
      const lines = pivots.map((p, idx) => {
        const ref = targets[idx]?.codeRef || targets[idx]?.label || `pivot${idx + 1}`;
        return `${ref}.rotation.set(${p.rotation.x.toFixed(4)}, ${p.rotation.y.toFixed(4)}, ${p.rotation.z.toFixed(4)});\n` +
          `${ref}.position.set(${p.position.x.toFixed(4)}, ${p.position.y.toFixed(4)}, ${p.position.z.toFixed(4)});\n` +
          `${ref}.scale.setScalar(${p.scale.x.toFixed(4)});`;
      });
      const code = lines.join("\n\n");
      navigator.clipboard.writeText(code).then(() => console.log("[DevTools] Copied:\n" + code));
    },
    "Reset Transform"() {
      _applyMutation("actions.resetTransform", () => {
        _forEachPivot((p) => {
          p.rotation.set(0, 0, 0);
          p.position.set(0, 0, 0);
          p.scale.setScalar(1);
        });
      });
    },
    Undo() {
      _undo();
    },
    Redo() {
      _redo();
    },
    "Copy Live JS/CSS/HTML"() {
      const payload = _buildLiveExportPayload("manual-copy");
      const text = `// JS\n${payload.js}\n\n// LOD JS\n${payload.lodJs || ""}\n\n/* CSS */\n${payload.css}\n\n<!-- HTML -->\n${payload.html}`;
      navigator.clipboard.writeText(text).then(() => {
        console.log("[DevTools] Copied live pipeline payload.");
      });
    },
    "Apply All to Source"() {
      _applyStatus.text = "Sending...";
      if (_folders.actions) _folders.actions.controllersRecursive().forEach(c => c.updateDisplay());
      _sendPayloadToSource("apply-to-source", "manual")
        .then((data) => {
          if (data.ok) {
            const changed = Object.entries(data.results)
              .filter(([, v]) => v === "patched")
              .map(([k]) => k)
              .join(", ") || "nothing changed";
            _applyStatus.text = `\u2713 ${changed}`;
          } else {
            _applyStatus.text = `\u2717 ${data.error || "error"}`;
          }
          if (_folders.actions) _folders.actions.controllersRecursive().forEach(c => c.updateDisplay());
        })
        .catch((err) => {
          _applyStatus.text = `\u2717 ${err.message}`;
          if (_folders.actions) _folders.actions.controllersRecursive().forEach(c => c.updateDisplay());
        });
    },
  };

  const _applyStatus = { text: "idle" };

  f.add(api, "Log Values to Console");
  f.add(api, "Copy Transform Code");
  f.add(api, "Reset Transform");
  f.add(api, "Undo");
  f.add(api, "Redo");
  f.add(api, "Copy Live JS/CSS/HTML");
  f.add(api, "Apply All to Source").name("\u25ba Apply All to Source");
  f.add(_applyStatus, "text").name("Apply Status").disable();

  _folders.actions = f;
}

function _buildHistorySync(parent) {
  const f = parent.addFolder("Flow + Sync");
  f.add(_sync, "autoSync").name("Auto Sync Exports").onChange((v) => {
    _sync.autoSync = !!v;
    if (_sync.autoSync) {
      _syncExports("toggle-auto-sync");
    }
  });
  f.add(_sync, "autoApplyToSource").name("Auto Apply to Source").onChange((v) => {
    _sync.autoApplyToSource = !!v;
    _sync.sourceStatus = _sync.autoApplyToSource
      ? (_sync.sourceDirty ? "pending \u2014 press Enter to apply" : "auto-apply enabled")
      : (_sync.sourceDirty ? "pending apply to source" : "manual apply mode");
    _setHudStatus(
      _sync.autoApplyToSource
        ? "Auto Apply to Source enabled \u2014 press Enter to write"
        : "Auto Apply to Source disabled",
      "idle",
    );
    _refreshGui();
  });
  f.add(_sync, "enableEnterApply").name("Enable Enter Apply").onChange((v) => {
    _sync.enableEnterApply = !!v;
    _sync.sourceStatus = _sync.enableEnterApply
      ? (_sync.sourceDirty ? "pending - Enter armed" : "Enter apply armed")
      : (_sync.sourceDirty ? "pending apply to source" : "manual apply only");
    _setHudStatus(
      _sync.enableEnterApply
        ? "Enter apply enabled"
        : "Enter apply disabled - manual apply only",
      "idle",
    );
    _refreshGui();
  });
  f.add(_sync, "historyDepth").name("Undo Depth").disable();
  f.add(_sync, "redoDepth").name("Redo Depth").disable();
  f.add(_sync, "lastAction").name("Last Action").disable();
  f.add(_sync, "lastExportSize").name("Export Bytes").disable();
  _folders.sync = f;
}

function _buildProjectionMapping(parent) {
  const f = parent.addFolder("Projection Mapping");

  const easingOptions = {
    Linear: "linear",
    Constant: "constant",
    Smooth: "smooth",
  };

  f.add(_projection, "enabled").name("Enabled").onChange((v) => {
    _applyMutation("projection.enabled", () => {
      _projection.enabled = !!v;
    });
  });
  f.add(_projection, "autoSelect").name("Auto Select Rect");
  f.add(_projection, "hoverPreview").name("Hover Preview");
  f.add(_projection, "targetMeshName").name("Target Mesh").disable();
  f.add(_projection, "status").name("Status").disable();
  f.add(_projection, "hoverMeshName").name("Hover Mesh").disable();
  f.add(_projection, "hoverPoint").name("Hover Point").disable();
  f.add(_projection, "draftCorners").name("Draft Corners").disable();

  const filterFolder = f.addFolder("Mesh Filters");
  filterFolder.add(_projection, "maxAspect", 1.2, 12, 0.05).name("Max Aspect");
  filterFolder.add(_projection, "minFillRatio", 0.05, 1.0, 0.01).name("Min Fill Ratio");
  filterFolder.add(_projection, "minThicknessRatio", 0.0001, 0.2, 0.0001).name("Min Thickness");
  filterFolder.add(_projection, "maxThicknessRatio", 0.01, 0.8, 0.001).name("Max Thickness");
  filterFolder.add({ "Auto Pick Best Mesh": () => {
    _applyMutation("projection.auto-select", () => {
      _autoSelectProjectionMesh();
    });
  }}, "Auto Pick Best Mesh");

  const styleFolder = f.addFolder("Text + Parallax");
  _folders.projectionStyle = styleFolder;
  const contentOptions = {
    Text: "text",
    Image: "image",
    Both: "both",
  };
  styleFolder.add(_projection, "text").name("Text").onFinishChange((v) => {
    _applyMutation("projection.text", () => {
      const overlay = _projectionOverlayMap[_activeLabel];
      if (overlay) overlay.text = v;
    });
  });
  styleFolder.add(_projection, "fontSize", 8, 96, 1).name("Font Size").onChange((v) => {
    _applyMutation("projection.font-size", () => {
      const overlay = _projectionOverlayMap[_activeLabel];
      if (overlay) overlay.style.fontSize = v;
    });
  });
  styleFolder.add(_projection, "padding", 0, 64, 1).name("Padding").onChange((v) => {
    _applyMutation("projection.padding", () => {
      const overlay = _projectionOverlayMap[_activeLabel];
      if (overlay) overlay.style.padding = v;
    });
  });
  styleFolder.add(_projection, "contentMode", contentOptions).name("Content").onChange((v) => {
    _applyMutation("projection.content-mode", () => {
      const overlay = _projectionOverlayMap[_activeLabel];
      if (overlay) overlay.style.contentMode = v;
    });
  });
  styleFolder.add(_projection, "assetSrc").name("Asset Src").onFinishChange((v) => {
    _applyMutation("projection.asset-src", () => {
      const overlay = _projectionOverlayMap[_activeLabel];
      if (overlay) overlay.style.assetSrc = v;
    });
  });
  styleFolder.add(_projection, "assetAlt").name("Asset Alt").onFinishChange((v) => {
    _applyMutation("projection.asset-alt", () => {
      const overlay = _projectionOverlayMap[_activeLabel];
      if (overlay) overlay.style.assetAlt = v;
    });
  });
  _rebuildProjectionAssetControls();
  styleFolder.add(_projection, "textAnimation").name("Type Animate").onChange((v) => {
    _applyMutation("projection.type-animate", () => {
      const overlay = _projectionOverlayMap[_activeLabel];
      if (overlay) overlay.style.textAnimation = !!v;
    });
  });
  styleFolder.add(_projection, "textAnimationSpeed", 6, 80, 1).name("Type Speed").onChange((v) => {
    _applyMutation("projection.type-speed", () => {
      const overlay = _projectionOverlayMap[_activeLabel];
      if (overlay) overlay.style.textAnimationSpeed = v;
    });
  });
  styleFolder.add(_projection, "parallaxX", 0, 120, 0.5).name("Parallax X").onChange((v) => {
    _applyMutation("projection.parallax-x", () => {
      const overlay = _projectionOverlayMap[_activeLabel];
      if (overlay) overlay.style.parallaxX = v;
    });
  });
  styleFolder.add(_projection, "parallaxY", 0, 120, 0.5).name("Parallax Y").onChange((v) => {
    _applyMutation("projection.parallax-y", () => {
      const overlay = _projectionOverlayMap[_activeLabel];
      if (overlay) overlay.style.parallaxY = v;
    });
  });
  styleFolder.addColor(_projection, "textColor").name("Text Color").onChange((v) => {
    _applyMutation("projection.text-color", () => {
      const overlay = _projectionOverlayMap[_activeLabel];
      if (overlay) overlay.style.textColor = v;
    });
  });
  styleFolder.addColor(_projection, "bgColor").name("BG Color").onChange((v) => {
    _applyMutation("projection.bg-color", () => {
      const overlay = _projectionOverlayMap[_activeLabel];
      if (overlay) overlay.style.bgColor = v;
    });
  });
  styleFolder.add(_projection, "bgAlpha", 0, 1, 0.01).name("BG Alpha").onChange((v) => {
    _applyMutation("projection.bg-alpha", () => {
      const overlay = _projectionOverlayMap[_activeLabel];
      if (overlay) overlay.style.bgAlpha = v;
    });
  });

  const quadFolder = f.addFolder("4-Point Boundary");
  quadFolder.add(_projection, "nextCorner", 0, 3, 1).name("Next Corner").disable();
  quadFolder.add({ "Start 4-Point Pick": () => {
    _applyMutation("projection.pick-start", () => {
      if (_projection.autoSelect) _autoSelectProjectionMesh();
      _projection.enabled = true;
      _projection.pickActive = true;
      _projection.nextCorner = 0;
      _projection.status = "click 4 corners: TL,TR,BR,BL";
      _projectionHoverPoint = null;
      _projectionHoverMeshUUID = null;
      _projectionHoverMeshName = "";
      _resetProjectionDraft();
      _projectionDraft.targetLabel = _activeLabel;
      _projectionDraft.text = _projection.text;
      _syncProjectionDebugState();
    });
  }}, "Start 4-Point Pick");
  quadFolder.add({ "Stop Pick": () => {
    _applyMutation("projection.pick-stop", () => {
      if (!_finalizeProjectionDraft("stop")) {
        _projection.pickActive = false;
        _projection.status = "pick stopped";
        _projectionHoverPoint = null;
        _projectionHoverMeshUUID = null;
        _projectionHoverMeshName = "";
        _resetProjectionDraft();
        _syncProjectionDebugState();
      }
    });
  }}, "Stop Pick");
  quadFolder.add({ "Clear Quad": () => {
    _applyMutation("projection.clear-quad", () => {
      const overlay = _projectionOverlayMap[_activeLabel];
      if (!overlay) return;
      overlay.corners = [];
      _projection.nextCorner = 0;
      _projection.status = "quad cleared";
      _projectionHoverPoint = null;
      _projectionHoverMeshUUID = null;
      _projectionHoverMeshName = "";
      _resetProjectionDraft();
      _syncProjectionDebugState();
    });
  }}, "Clear Quad");

  const flowFolder = f.addFolder("Flow Opacity");
  flowFolder.add(_projection, "easing", easingOptions).name("Easing").onChange((v) => {
    _applyMutation("projection.flow-easing", () => {
      _projection.easing = v;
      const overlay = _projectionOverlayMap[_activeLabel];
      if (overlay) overlay.style.easing = v;
    });
  });
  flowFolder.add(_projection, "flowIndicator").name("Indicator").disable();

  _flow.options.forEach((option) => {
    if (!Object.prototype.hasOwnProperty.call(_projectionFlowOpacity, option.id)) {
      _projectionFlowOpacity[option.id] = 1;
    }
    flowFolder.add(_projectionFlowOpacity, option.id, 0, 1, 0.01)
      .name(`P${option.id} ${option.value.toFixed(2)}`)
      .onChange((v) => {
        _applyMutation(`projection.opacity.${option.id}`, () => {
          _projectionFlowOpacity[option.id] = v;
        });
      });
  });

  f.add({ "Copy Projection JS/CSS/HTML": () => {
    const payload = _buildLiveExportPayload("projection-copy");
    const text = `// JS\n${payload.js}\n\n// LOD JS\n${payload.lodJs || ""}\n\n/* CSS */\n${payload.css}\n\n<!-- HTML -->\n${payload.html}`;
    navigator.clipboard.writeText(text).then(() => {
      console.log("[DevTools] Copied projection payload.");
    });
  }}, "Copy Projection JS/CSS/HTML");

  _folders.projection = f;
}

function _buildDynamicLod(parent) {
  const f = parent.addFolder("Dynamic LOD + Cache");
  const labels = Object.keys(_registry);
  const labelOptions = { "(none)": "", ...Object.fromEntries(labels.map((label) => [label, label])) };

  f.add(_lod, "enabled").name("Enable LOD");
  f.add(_lod, "autoRun").name("Auto Apply");
  f.add(_lod, "flowSpeed").name("Flow Speed").disable();
  f.add(_lod, "status").name("Status").disable();

  const profileFolder = f.addFolder("Profile");
  profileFolder.add(_lod, "profileName").name("Profile Name");
  profileFolder.add(_lod, "selectedProfile").name("Selected").onFinishChange(() => {
    _loadSelectedLodProfile();
    _refreshGui();
  });
  profileFolder.add(_lod, "highLabel", labelOptions).name("High Label");
  profileFolder.add(_lod, "midLabel", labelOptions).name("Mid Label");
  profileFolder.add(_lod, "lowLabel", labelOptions).name("Low Label");
  profileFolder.add(_lod, "near", 1, 500, 0.1).name("Near Dist");
  profileFolder.add(_lod, "mid", 1, 800, 0.1).name("Mid Dist");
  profileFolder.add(_lod, "far", 1, 1200, 0.1).name("Far Dist");
  profileFolder.add(_lod, "cullBeyond", 1, 2000, 0.1).name("Cull Beyond");
  profileFolder.add(_lod, "scrollBoost", 0, 120, 0.1).name("Scroll Boost");
  profileFolder.add(_lod, "freezeFarAnimations").name("Freeze Far Anim");
  profileFolder.add(_lod, "bakeStaticFar").name("Bake Static Far");
  profileFolder.add(_lod, "throttleMs", 0, 250, 1).name("Update Throttle");

  profileFolder.add({
    "Save / Update Profile"() {
      _applyMutation("lod.save-profile", () => {
        _saveSelectedLodProfile();
      });
    },
  }, "Save / Update Profile");

  profileFolder.add({
    "Delete Selected Profile"() {
      _applyMutation("lod.delete-profile", () => {
        if (!_lod.selectedProfile) return;
        delete _lodProfiles[_lod.selectedProfile];
        const names = Object.keys(_lodProfiles);
        _lod.selectedProfile = names[0] || "";
        if (_lod.selectedProfile) {
          _loadSelectedLodProfile();
        } else {
          _lod.status = "no profiles";
        }
      });
    },
  }, "Delete Selected Profile");

  profileFolder.add({
    "Apply LOD Once"() {
      _applyMutation("lod.apply-once", () => {
        _saveSelectedLodProfile();
        _applyDynamicLod(_lastElapsed || 0);
      });
    },
  }, "Apply LOD Once");

  const cacheFolder = f.addFolder("Cache + Bake Utils");
  cacheFolder.add({
    "Prewarm Materials"() {
      const renderer = _config.renderer;
      if (!renderer) {
        _lod.status = "renderer unavailable";
        _refreshGui();
        return;
      }
      let count = 0;
      Object.values(_registry).forEach((state) => {
        const pivot = state?.pivot;
        if (!pivot) return;
        pivot.traverse((node) => {
          if (!node?.isMesh || !node.material) return;
          const mats = Array.isArray(node.material) ? node.material : [node.material];
          mats.forEach((mat) => {
            if (!mat) return;
            renderer.compile(pivot, _config.camera);
            count += 1;
          });
        });
      });
      _lod.status = `prewarmed materials: ${count}`;
      _refreshGui();
    },
  }, "Prewarm Materials");

  cacheFolder.add({
    "Bake Hidden Transforms"() {
      _applyMutation("lod.bake-hidden", () => {
        let baked = 0;
        Object.values(_registry).forEach((state) => {
          const pivot = state?.pivot;
          if (!pivot || pivot.visible) return;
          pivot.updateMatrixWorld(true);
          pivot.matrixAutoUpdate = false;
          baked += 1;
        });
        _lod.status = `baked hidden: ${baked}`;
      });
    },
  }, "Bake Hidden Transforms");

  cacheFolder.add({
    "Restore Dynamic Transforms"() {
      _applyMutation("lod.restore-dynamic", () => {
        Object.values(_registry).forEach((state) => {
          const pivot = state?.pivot;
          if (!pivot) return;
          pivot.matrixAutoUpdate = true;
        });
        _lod.status = "matrixAutoUpdate restored";
      });
    },
  }, "Restore Dynamic Transforms");

  cacheFolder.add({
    "Copy LOD Runtime JS"() {
      const text = _buildLodRuntimeSnippet();
      navigator.clipboard.writeText(text).then(() => {
        _lod.status = "copied LOD JS";
        _refreshGui();
      });
    },
  }, "Copy LOD Runtime JS");

  _folders.lod = f;
}

function _buildSceneBuilder(parent) {
  if (!_config.sceneBuilder?.state) {
    return;
  }

  const f = parent.addFolder("Scene Builder");
  f.close();

  f.add(_sceneBuilder, "enabled").name("Enable Builder").onChange((v) => {
    _applyMutation("sceneBuilder.enabled", () => {
      _sceneBuilder.enabled = !!v;
      _config.sceneBuilder.state.enabled = !!v;
    });
  });
  f.add(_sceneBuilder, "orbitRadius", 2, 120, 0.1).name("Orbit Radius").onChange((v) => {
    _applyMutation("sceneBuilder.orbitRadius", () => {
      _config.sceneBuilder.state.orbitRadius = v;
    });
  });
  f.add(_sceneBuilder, "orbitSpeed", 0.01, 2, 0.01).name("Orbit Speed").onChange((v) => {
    _applyMutation("sceneBuilder.orbitSpeed", () => {
      _config.sceneBuilder.state.orbitSpeed = v;
    });
  });
  f.add(_sceneBuilder, "orbitTiltDeg", -180, 180, 0.1).name("Orbit Tilt").onChange((v) => {
    _applyMutation("sceneBuilder.orbitTiltDeg", () => {
      _config.sceneBuilder.state.orbitTiltDeg = v;
    });
  });
  f.add(_sceneBuilder, "curvatureStrength", 0, 8, 0.01).name("Curve Strength").onChange((v) => {
    _applyMutation("sceneBuilder.curvatureStrength", () => {
      _config.sceneBuilder.state.curvatureStrength = v;
    });
  });
  f.add(_sceneBuilder, "curvatureExpo", 0.2, 6, 0.01).name("Curve Exponent").onChange((v) => {
    _applyMutation("sceneBuilder.curvatureExpo", () => {
      _config.sceneBuilder.state.curvatureExpo = v;
    });
  });
  f.add(_sceneBuilder, "yBias", -50, 50, 0.01).name("Y Bias").onChange((v) => {
    _applyMutation("sceneBuilder.yBias", () => {
      _config.sceneBuilder.state.yBias = v;
    });
  });
  f.add(_sceneBuilder, "yCurvature", -20, 20, 0.01).name("Y Curvature").onChange((v) => {
    _applyMutation("sceneBuilder.yCurvature", () => {
      _config.sceneBuilder.state.yCurvature = v;
    });
  });
  f.add(_sceneBuilder, "yWaveAmp", 0, 20, 0.01).name("Y Wave Amp").onChange((v) => {
    _applyMutation("sceneBuilder.yWaveAmp", () => {
      _config.sceneBuilder.state.yWaveAmp = v;
    });
  });
  f.add(_sceneBuilder, "yWaveSpeed", 0, 6, 0.01).name("Y Wave Speed").onChange((v) => {
    _applyMutation("sceneBuilder.yWaveSpeed", () => {
      _config.sceneBuilder.state.yWaveSpeed = v;
    });
  });
  f.add(_sceneBuilder, "lookAtX", -100, 100, 0.01).name("LookAt X").onChange((v) => {
    _applyMutation("sceneBuilder.lookAtX", () => {
      _config.sceneBuilder.state.lookAtX = v;
    });
  });
  f.add(_sceneBuilder, "lookAtY", -100, 100, 0.01).name("LookAt Y").onChange((v) => {
    _applyMutation("sceneBuilder.lookAtY", () => {
      _config.sceneBuilder.state.lookAtY = v;
    });
  });
  f.add(_sceneBuilder, "lookAtZ", -100, 100, 0.01).name("LookAt Z").onChange((v) => {
    _applyMutation("sceneBuilder.lookAtZ", () => {
      _config.sceneBuilder.state.lookAtZ = v;
    });
  });

  _folders.sceneBuilder = f;
}

// ─── Object selector ─────────────────────────────────────────────
function _selectObject(label) {
  _activeLabel = label;
  _active      = _registry[label];
  _syncFromScene();
  const overlay = _projectionOverlayMap[_activeLabel];
  if (overlay) {
    _projection.text = overlay.text || _projection.text;
    _projection.fontSize = overlay.style?.fontSize ?? _projection.fontSize;
    _projection.padding = overlay.style?.padding ?? _projection.padding;
    _projection.textColor = overlay.style?.textColor ?? _projection.textColor;
    _projection.bgColor = overlay.style?.bgColor ?? _projection.bgColor;
    _projection.bgAlpha = overlay.style?.bgAlpha ?? _projection.bgAlpha;
    _projection.parallaxX = overlay.style?.parallaxX ?? _projection.parallaxX;
    _projection.parallaxY = overlay.style?.parallaxY ?? _projection.parallaxY;
    _projection.easing = overlay.style?.easing ?? _projection.easing;
    _projection.contentMode = overlay.style?.contentMode ?? _projection.contentMode;
    _projection.assetSrc = overlay.style?.assetSrc ?? _projection.assetSrc;
    _projection.assetAlt = overlay.style?.assetAlt ?? _projection.assetAlt;
    _projection.textAnimation = overlay.style?.textAnimation ?? _projection.textAnimation;
    _projection.textAnimationSpeed = overlay.style?.textAnimationSpeed ?? _projection.textAnimationSpeed;
  }
  if (_projection.autoSelect && !overlay?.meshUUID) {
    _autoSelectProjectionMesh();
  }
  _syncProjectionTargetName();
  if (_projection.assetSrc && _assetLibrary.options.includes(_projection.assetSrc)) {
    _assetLibrary.selected = _projection.assetSrc;
  }
  _syncExports("select-object");
  _setHudStatus(`Selected ${label}`, "idle");
  _updateSelectionHelper();

  // Refresh all controller displays so sliders show new values
  _refreshGui();
}

// ─── Entry point ─────────────────────────────────────────────────
export function initDevTools(registry, config = {}) {
  if (_gui) { _gui.destroy(); _gui = null; }
  _detachProjectionPointerHandlers();
  _detachApplyKeydownListener();
  _detachProjectionRuntimeActionBridge();
  _destroyHud();
  _disposeSelectionHelper();

  _registry = registry;
  _folders  = {};
  _patternUniformSets = [];
  _manualClips = new WeakMap();
  _lastElapsed = 0;
  _history = [];
  _redoStack = [];
  _materialSourceState = {};
  _pendingMaterialHydration = new Set();
  _originalMaterialSnapshots = new WeakMap();
  _config = config;
  _devToolsEnabled = config.initiallyEnabled !== false;
  _projectionOverlayMap = {};
  _projectionMouse = { x: 0, y: 0 };
  _lodProfiles = {};
  _lastFlowForLod = 0;
  _lastElapsedForLod = 0;
  _lastLodUpdateMs = 0;

  _buildFlowOptions(config);
  _syncFlowSelectionToKeyTime();

  const labels = Object.keys(registry);
  if (!labels.length) return;

  _activeLabel = labels[0];
  if (typeof config.initialSelection === "string" && registry[config.initialSelection]) {
    _activeLabel = config.initialSelection;
  }
  _active      = registry[_activeLabel];
  _lod.profileName = "lod_profile_1";
  _lod.selectedProfile = "lod_profile_1";
  _lod.highLabel = _activeLabel;
  _lod.midLabel = "";
  _lod.lowLabel = "";
  _saveSelectedLodProfile();
  _hydrateSourceState(config.initialSourceState || {});
  _syncFromScene();

  _gui = new GUI({ title: "Scene Inspector [DEV]", width: 300 });
  _gui.domElement.style.position = "fixed";
  _gui.domElement.style.top      = "12px";
  _gui.domElement.style.right    = "12px";
  _gui.domElement.style.zIndex   = "99999";

  // Style header
  // Make panel scrollable with mouse wheel
  const _panelContent = _gui.$children;
  _panelContent.style.maxHeight   = "calc(100vh - 60px)";
  _panelContent.style.overflowY   = "auto";
  _panelContent.style.overflowX   = "hidden";
  _panelContent.style.scrollbarWidth = "thin";
  _panelContent.style.scrollbarColor = "#00ffff22 transparent";
  // Prevent canvas from stealing scroll events when hovering the panel
  _gui.domElement.addEventListener("wheel", e => e.stopPropagation(), { passive: false });

  _gui.$title.style.background   = "#0a0a0f";
  _gui.$title.style.color        = "#00ffff";
  _gui.$title.style.fontSize     = "11px";
  _gui.$title.style.letterSpacing = "0.08em";

  // Object selector
  const selector = { object: _activeLabel };
  _gui.add(selector, "object", labels).name("Object").onChange(v => _selectObject(v));

  // Build all category folders
  _buildTransform(_gui);
  _buildMaterial(_gui);
  _buildAttributes(_gui);
  _buildAnimation(_gui);
  _buildKeyframeAuthoring(_gui);
  _buildProjectionMapping(_gui);
  void _fetchAssetLibrary();
  if (_config.sceneBuilder?.state) {
    Object.assign(_sceneBuilder, _config.sceneBuilder.state);
  }
  _buildSceneBuilder(_gui);
  _buildDynamicLod(_gui);
  _buildCameraCurve(_gui);
  _buildActions(_gui);
  _buildHistorySync(_gui);

  _attachProjectionPointerHandlers();
  _attachProjectionRuntimeActionBridge();
  _updateSelectionHelper();

  _recordHistory("init");
  _syncExports("init");
  _sync.sourceDirty = false;
  _sync.sourceStatus = _sync.autoApplyToSource
    ? "loaded from source state - auto apply enabled"
    : "loaded from source state - manual apply";
  _sync.verificationStatus = "initial export captured";
  _setHudStatus(`Ready: ${_activeLabel}`, "idle");
  _attachApplyKeydownListener();
  _applyDevToolsEnabledState();
  _refreshGui();

  console.log("[DevTools] Scene Inspector active. Objects:", labels);
}

// ─── Folder: Camera Curve Builder ───────────────────────────────
function _buildCameraCurve(parent) {
  const f = parent.addFolder("Camera → Curve");
  f.close();

  f.add(_cameraCurve, "enabled").name("Enable Curve Camera").onChange(v => {
    _applyMutation("cameraCurve.enabled", () => {});
    if (!v) {
      _cameraCurve.shakeActive = 0;
      _cameraCurve.status = "disabled — manual orbit active";
    } else {
      _rebuildCurve();
    }
    _refreshGui();
  });

  f.add(_cameraCurve, "tension", 0, 1, 0.01).name("Curve Tension").onChange(() => _rebuildCurve());

  f.add(_cameraCurve, "lookAtOrigin").name("LookAt Origin");
  f.add(_cameraCurve, "lookAtX", -200, 200, 0.1).name("LookAt X");
  f.add(_cameraCurve, "lookAtY", -200, 200, 0.1).name("LookAt Y");
  f.add(_cameraCurve, "lookAtZ", -200, 200, 0.1).name("LookAt Z");

  // ── Point management ───────────────────────────────────────────
  const ptF = f.addFolder("Control Points");

  ptF.add({ addFromCamera() {
    const cam = _config.camera;
    if (!cam) { _cameraCurve.addStatus = "no camera ref"; _refreshGui(); return; }
    _cameraCurve.points.push({ x: +cam.position.x.toFixed(3), y: +cam.position.y.toFixed(3), z: +cam.position.z.toFixed(3) });
    _rebuildCurve();
    _cameraCurve.addStatus = `Added pt ${_cameraCurve.points.length - 1} @ ${cam.position.x.toFixed(1)},${cam.position.y.toFixed(1)},${cam.position.z.toFixed(1)}`;
    _applyMutation("cameraCurve.addPoint", () => {});
    _refreshGui();
  }}, "addFromCamera").name("Add Point ← Current Camera");

  ptF.add({ addManual() {
    _cameraCurve.points.push({ x: 0, y: 5, z: 20 });
    _rebuildCurve();
    _cameraCurve.addStatus = `Added pt ${_cameraCurve.points.length - 1} (manual)`;
    _applyMutation("cameraCurve.addManual", () => {});
    _refreshGui();
  }}, "addManual").name("Add Point (manual 0,5,20)");

  ptF.add({ removeLast() {
    if (_cameraCurve.points.length === 0) return;
    _cameraCurve.points.pop();
    _rebuildCurve();
    _applyMutation("cameraCurve.removeLast", () => {});
    _refreshGui();
  }}, "removeLast").name("Remove Last Point");

  ptF.add({ clearAll() {
    _cameraCurve.points = [];
    _cameraCurve._curve = null;
    _cameraCurve.status = "no points";
    _applyMutation("cameraCurve.clear", () => {});
    _refreshGui();
  }}, "clearAll").name("Clear All Points");

  ptF.add({ logPoints() {
    console.log("[DevTools] Camera Curve Points:", JSON.stringify(_cameraCurve.points, null, 2));
    const pts = _cameraCurve.points.map((p,i) => `  new THREE.Vector3(${p.x}, ${p.y}, ${p.z}),`).join("\n");
    const code = `const _curvePts = [\n${pts}\n];\nconst _camCurve = new THREE.CatmullRomCurve3(_curvePts, false, "catmullrom", ${_cameraCurve.tension});`;
    navigator.clipboard.writeText(code).catch(()=>{});
    console.log("[DevTools] Curve code copied to clipboard.\n" + code);
  }}, "logPoints").name("Copy Curve Code → Clipboard");

  ptF.add(_cameraCurve, "addStatus").name("Last Add").disable();

  // ── Flow → Curve T mapping ─────────────────────────────────────
  const fmF = f.addFolder("Flow → Curve T Map");
  fmF.close();
  for (let i = 0; i < 8; i++) {
    if (_cameraCurve.flowMap[i] === undefined) _cameraCurve.flowMap[i] = i / 7;
    fmF.add(_cameraCurve.flowMap, i.toString(), 0, 1, 0.001)
      .name(`Flow pt ${i} (t)`)
      .onChange(() => _rebuildCurve());
  }

  // ── Orbital shake enhancement ──────────────────────────────────
  const shakeF = f.addFolder("Transition Shake");
  shakeF.close();
  shakeF.add(_cameraCurve, "shake").name("Enable Shake");
  shakeF.add(_cameraCurve, "shakeAmplitude", 0, 2, 0.01).name("Amplitude");
  shakeF.add(_cameraCurve, "shakeFrequency", 1, 60, 0.5).name("Frequency");
  shakeF.add(_cameraCurve, "shakeDecay", 0.5, 0.999, 0.001).name("Decay");
  shakeF.add({ triggerShake() {
    _cameraCurve.shakeActive = 1.0;
  }}, "triggerShake").name("Trigger Shake Now");

  f.add(_cameraCurve, "status").name("Status").disable();
  _folders.cameraCurve = f;
}

function _rebuildCurve() {
  if (_cameraCurve.points.length < 2) {
    _cameraCurve._curve = null;
    _cameraCurve.status = `need ≥2 pts (have ${_cameraCurve.points.length})`;
    return;
  }
  const verts = _cameraCurve.points.map(p => new THREE.Vector3(p.x, p.y, p.z));
  _cameraCurve._curve = new THREE.CatmullRomCurve3(verts, false, "catmullrom", _cameraCurve.tension);
  _cameraCurve.status = `curve OK — ${_cameraCurve.points.length} pts`;
}

export function applyCameraCurve(camera, flowProgress, elapsed) {
  if (!_cameraCurve.enabled || !_cameraCurve._curve || !camera) return;

  // Map flowProgress through the 8-point flow→T table via linear interp
  const fallbackFlow = [0.03, 0.30, 0.45, 0.55, 0.65, 0.75, 0.80, 0.90];
  const sourceFlow = Array.isArray(_config.flowPoints) ? _config.flowPoints : fallbackFlow;
  const fp = sourceFlow.length >= 8 ? sourceFlow : fallbackFlow;
  let t = 0;
  if (flowProgress <= fp[0]) {
    t = Number(_cameraCurve.flowMap[0] ?? 0);
  } else if (flowProgress >= fp[7]) {
    t = Number(_cameraCurve.flowMap[7] ?? 1);
  } else {
    for (let i = 0; i < 7; i++) {
      if (flowProgress >= fp[i] && flowProgress <= fp[i+1]) {
        const denom = Math.max(fp[i + 1] - fp[i], 0.000001);
        const seg = (flowProgress - fp[i]) / denom;
        const t0 = +(_cameraCurve.flowMap[i] ?? i/7);
        const t1 = +(_cameraCurve.flowMap[i+1] ?? (i+1)/7);
        t = t0 + (t1 - t0) * seg;

        // trigger shake at crossover
        if (_cameraCurve.shake && _cameraCurve._lastFlowIndex !== i) {
          _cameraCurve.shakeActive = 1.0;
          _cameraCurve._lastFlowIndex = i;
        }
        break;
      }
    }
  }

  const safeT = THREE.MathUtils.clamp(Number.isFinite(t) ? t : 0, 0, 1);
  const pos = _cameraCurve._curve.getPoint(safeT);
  camera.position.copy(pos);

  // Apply shake
  if (_cameraCurve.shake && _cameraCurve.shakeActive > 0.001) {
    const amp = _cameraCurve.shakeActive * _cameraCurve.shakeAmplitude;
    const f = _cameraCurve.shakeFrequency;
    camera.position.x += Math.sin(elapsed * f * 1.3) * amp;
    camera.position.y += Math.sin(elapsed * f * 0.9 + 1.2) * amp;
    camera.position.z += Math.sin(elapsed * f * 1.7 + 2.4) * amp * 0.5;
    _cameraCurve.shakeActive *= _cameraCurve.shakeDecay;
  }

  const target = _cameraCurve.lookAtOrigin
    ? new THREE.Vector3(0, 0, 0)
    : new THREE.Vector3(_cameraCurve.lookAtX, _cameraCurve.lookAtY, _cameraCurve.lookAtZ);
  camera.lookAt(target);
}

export function updateDevTools(elapsed) {
  if (!_gui) return;
  if (!_devToolsEnabled) return;
  const nowMs = elapsed * 1000;
  _projection.flowIndicator = `flow ${_getFlowProgress().toFixed(3)} • ${_projection.easing}`;
  _applyPendingMaterialHydration();
  _updateSelectionHelper(elapsed);
  _updatePatternUniforms(elapsed);
  _updateManualKeyframes(elapsed);
  _applyDynamicLod(elapsed);
  const projectionActive =
    _projection.enabled
    || _projection.pickActive
    || _hasProjectionDraft()
    || (_projection.hoverPreview && !!_projectionHoverPoint);
  if (projectionActive && nowMs - _lastProjectionOverlayUpdateMs >= DEVTOOLS_PROJECTION_UPDATE_INTERVAL_MS) {
    _updateProjectionOverlays();
    _lastProjectionOverlayUpdateMs = nowMs;
  }
  if (!projectionActive && _projectionLayerEl) {
    _updateProjectionOverlays();
    _lastProjectionOverlayUpdateMs = nowMs;
  }
  if (nowMs - _lastHudUpdateMs >= DEVTOOLS_HUD_UPDATE_INTERVAL_MS) {
    _updateHudInfo();
    _lastHudUpdateMs = nowMs;
  }

  // Animate snippet uniforms that need time
  if (_shaderLib._appliedSnippets.length > 0) {
    const state = _active;
    if (state?.pivot) {
      state.pivot.traverse(node => {
        if (!node.isMesh || !node.material) return;
        const u = node.material.userData?.__devSnippetUniforms;
        if (!u) return;
        if (u.uPulseTime)  u.uPulseTime.value  = elapsed;
        if (u.uScanTime)   u.uScanTime.value   = elapsed;
        if (u.uNoiseTime)  u.uNoiseTime.value  = elapsed;
        if (u.uDissolveThreshold) { /* static, user drives */ }
      });
    }
  }
}

export function getManualAxisLocks(state) {
  return _getManualAxisLocks(state);
}

export function setDevToolsEnabled(enabled) {
  _devToolsEnabled = !!enabled;
  _applyDevToolsEnabledState();
  return _devToolsEnabled;
}

export function toggleDevToolsEnabled() {
  return setDevToolsEnabled(!_devToolsEnabled);
}

export function isDevToolsEnabled() {
  return _devToolsEnabled;
}

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ZoomBlurShader } from "./js/ZoomBlurShader.js";
import {
  ensureProjectTimelineUi,
  setTimelinePanelOpen,
} from "./js/project-timeline.js";
import { createSceneBuilder } from "./js/scene-builder.js";

THREE.Cache.enabled = true;

const gltfAsset = (fileName) =>
  new URL(`./assets/GLTF/${fileName}`, import.meta.url).href;

const ENABLE_FILMIC_NOISE_PASS = true;
const ENABLE_NEBULA_BACKGROUND = true;
const ENABLE_FLOW_PANELS = false;
const PSEUDO_HUMAN_MODEL_SRC = gltfAsset("Harness_PK_GLTF.glb");
const PARTICLE_CORE_WIREFRAME_SRC = gltfAsset("particle_core_wireframe.glb");
const DYSON_RING_MODEL_SRC = gltfAsset("Dyson_Ring_.glb");
const CORPORATE_AGENT_MODEL_SRC = gltfAsset(
  "Because_Corporate_Agents_Cant_Code_And_Exploit_Telemetry_.glb",
);
const ROTOR_MODEL_SRC = gltfAsset("outer_spinner.glb");
// decal_ring_outer.glb never existed in assets/GLTF; Vite emitted it as /assets/undefined (404).
const OUTER_RING_MODEL_SRC = gltfAsset("decal_ring_outer_.glb");
const OUTER_RING_FALLBACK_MODEL_SRC = gltfAsset("decal_ring_outer_.glb");
const AUXILIARY_GLB_FILES = [
  "decal_cube.glb",
  "decal_rotor.glb",
  "decal_rotor_spinner_webP.glb",
  "decal_rotor_updated.glb",
  "ABOUT_TEXT_.glb",
  "BCI_TEXT_.glb",
  "PROJECT_TEXT_.glb",
  "AGENT_TEXT_.glb",
  "DECAL_.glb",
  "PANEL_.glb",
  "Dyson_Ring_.glb",
];
const AUXILIARY_GLB_SRCS = AUXILIARY_GLB_FILES.map((fileName) =>
  gltfAsset(fileName),
);
const BCI_TEXT_GLB_SRC = gltfAsset("BCI_TEXT_.glb");
const PROJECT_TEXT_GLB_SRC = gltfAsset("PROJECT_TEXT_.glb");
const ABOUT_TEXT_GLB_SRC = gltfAsset("ABOUT_TEXT_.glb");
const AGENT_TEXT_GLB_SRC = gltfAsset("AGENT_TEXT_.glb");
const DECAL_GLB_SRC = gltfAsset("DECAL_.glb");
const DECAL_ROTOR_SPINNER_WEBP_GLB_SRC = gltfAsset(
  "decal_rotor_spinner_webP.glb",
);
const AUXILIARY_GLB_SKIP_NORMALIZATION_SRCS = new Set([
  BCI_TEXT_GLB_SRC,
  PROJECT_TEXT_GLB_SRC,
  DECAL_GLB_SRC,
  DECAL_ROTOR_SPINNER_WEBP_GLB_SRC,
]);
const AUXILIARY_GLB_PRESERVE_AUTHORED_MATERIAL_SRCS = new Set([
  DECAL_ROTOR_SPINNER_WEBP_GLB_SRC,
]);
const AUXILIARY_GLB_APPLY_SOURCE_MATERIAL_SRCS = new Set([
  ABOUT_TEXT_GLB_SRC,
  BCI_TEXT_GLB_SRC,
  PROJECT_TEXT_GLB_SRC,
  AGENT_TEXT_GLB_SRC,
  DECAL_GLB_SRC,
]);
const AUXILIARY_GLB_POSITIONS = [
  new THREE.Vector3(4.2, -4.8, -8.8),
  new THREE.Vector3(7.4, -4.8, -9.2),
  new THREE.Vector3(10.6, -4.8, -9.6),
  new THREE.Vector3(1.6, -4.65, -7.6),
  new THREE.Vector3(-0.8, -4.5, -7.2),
  new THREE.Vector3(0, -4.5, -6.8),
  new THREE.Vector3(-1.6, -4.65, -7.6),
  new THREE.Vector3(0.8, -4.5, -7.2),
  new THREE.Vector3(1.6, -4.65, -7.6),
  new THREE.Vector3(0, -4.5, -6.8),
];

function getAuxiliaryLabel(src, idx) {
  const fileName = (AUXILIARY_GLB_FILES[idx] || `aux-${idx + 1}.glb`).replace(
    /\.glb$/i,
    "",
  );
  return fileName
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const AUXILIARY_GLB_STATES = AUXILIARY_GLB_SRCS.map((src, idx) => ({
  label: `Aux ${idx + 1}: ${getAuxiliaryLabel(src, idx)}`,
  codeRef: `AUXILIARY_GLB_STATES[${idx}].pivot`,
  src,
  pivot: null,
  root: null,
  mixer: null,
  clipActions: [],
  clipDuration: 0,
  devAnimationControl: {
    suppressFlow: false,
    scrubEnabled: false,
    scrubNormalizedTime: 0,
    lastElapsed: 0,
  },
  enabled: false,
}));

const preloadOverlay = document.getElementById("preload-overlay");
const preloadProgress = document.getElementById("preload-progress");
const preloadPercent = document.getElementById("preload-percent");
const sciMenu = document.getElementById("sci-fi-menu");
const menuRailTicks = document.querySelector(".menu-rail-ticks");
const orbitKeywordCloud = document.getElementById("orbit-keyword-cloud");
const portfolioFlow = document.getElementById("portfolio-flow");
const contactSection = document.getElementById("site-footer");
const projectsSection = document.getElementById("projects-section");

ensureProjectTimelineUi({ menuRoot: sciMenu, flowRoot: portfolioFlow });

function setPreloadProgress(value) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  if (preloadProgress) {
    preloadProgress.style.width = `${clamped}%`;
  }
  if (preloadPercent) {
    preloadPercent.textContent = `${clamped}%`;
  }
}

function hidePreloadOverlay() {
  if (preloadOverlay) {
    preloadOverlay.classList.add("is-hidden");
  }
}

const gltfLoaderModulePromise = import(
  "three/examples/jsm/loaders/GLTFLoader.js"
);
const startupIssues = [];
window.__portfolioStartupIssues = startupIssues;
// Read-only probe for capture/QA tooling (site-capture/manifest_capture.py).
window.__portfolioDebug = {
  getScrollProgress: () => getEffectiveScrollProgress(),
};

function getStartupIssueMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function recordStartupIssue(label, error) {
  const message = getStartupIssueMessage(error);
  startupIssues.push({
    label,
    message,
    at: new Date().toISOString(),
  });
  document.body.dataset.startupState = "degraded";
  document.body.dataset.startupIssues = String(startupIssues.length);
  console.error(`[startup] ${label}: ${message}`, error);
}

const meshoptDecoderModulePromise = import(
  "three/examples/jsm/libs/meshopt_decoder.module.js"
);


// Meshes whose NORMAL attribute was stripped during compression (wireframe /
// position-driven shaders) get normals recomputed after load.
// (Text meshes ship with creased normals baked offline by
// scripts/glb-bake-creased-normals.mjs; rebuilding creased normals at runtime
// cost 3-18 s of main-thread time per mesh.)
function restoreMissingNormals(root) {
  root.traverse((node) => {
    const geometry = node.isMesh ? node.geometry : null;
    if (geometry && geometry.attributes.position && !geometry.attributes.normal) {
      geometry.computeVertexNormals();
    }
  });
}

async function createGltfLoader() {
  const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
    gltfLoaderModulePromise,
    meshoptDecoderModulePromise,
  ]);
  const loader = new GLTFLoader();
  // GLBs are compressed with EXT_meshopt_compression + KHR_mesh_quantization
  // (+ EXT_texture_webp, decoded natively). See docs/CHANGES_AND_SWAPS.md.
  loader.setMeshoptDecoder(MeshoptDecoder);
  const loadAsync = loader.loadAsync.bind(loader);
  loader.loadAsync = async (...args) => {
    const gltf = await loadAsync(...args);
    if (gltf && gltf.scene) restoreMissingNormals(gltf.scene);
    return gltf;
  };
  return loader;
}

async function loadGltfWithFallback(loader, modelSrc, fallbackModelSrc) {
  try {
    return await loader.loadAsync(modelSrc);
  } catch (primaryError) {
    if (!fallbackModelSrc) {
      throw primaryError;
    }
    return loader.loadAsync(fallbackModelSrc);
  }
}

function updateStartupPreloadProgress(completed, total) {
  const safeTotal = Math.max(total, 1);
  const progress = THREE.MathUtils.lerp(72, 98, completed / safeTotal);
  setPreloadProgress(progress);
}

setPreloadProgress(8);

const scene = new THREE.Scene();
// Atmospheric depth cue for distant geometry.
const SCENE_FOG_COLOR = 0x0a0f1f;
const SCENE_FOG_DENSITY = 0.012;
const SCENE_FOG_FAR = 120;
scene.fog = new THREE.FogExp2(SCENE_FOG_COLOR, SCENE_FOG_DENSITY);
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);

const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById("background-canvas"),
  antialias: true,
  alpha: true,
  powerPreference: "high-performance",
});

renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ReinhardToneMapping;
renderer.toneMappingExposure = 1.25;
const baseCameraPosition = new THREE.Vector3(0, 0, 20);
camera.position.copy(baseCameraPosition);
setPreloadProgress(20);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const zoomBlurPass = new ShaderPass(ZoomBlurShader);
zoomBlurPass.uniforms.center.value.set(0.5, 0.5);
zoomBlurPass.uniforms.zBias.value = 0.42;
zoomBlurPass.uniforms.edgeWarp.value = 0.72;
zoomBlurPass.uniforms.noiseScale.value = 0.16;
composer.addPass(zoomBlurPass);

const FilmicNoiseShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    strength: { value: 0.06 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float strength;
    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float grain = hash(vUv * 1200.0 + vec2(time * 0.13, time * 0.27)) - 0.5;
      float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
      float weighted = mix(0.55, 1.0, luma);
      color.rgb += grain * strength * weighted;
      gl_FragColor = color;
    }
  `,
};

const filmNoisePass = ENABLE_FILMIC_NOISE_PASS
  ? new ShaderPass(FilmicNoiseShader)
  : null;
if (filmNoisePass) {
  composer.addPass(filmNoisePass);
}

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.15,
  0.35,
  0.18,
);
const bloomBaseStrength = 0.6;
composer.addPass(bloomPass);
setPreloadProgress(32);

const particleCount = 1000;
const geometry = new THREE.BufferGeometry();
const positions = new Float32Array(particleCount * 3);
const spherePositions = new Float32Array(particleCount * 3);
const randomSeeds = new Float32Array(particleCount);
const edgeSeeds = new Float32Array(particleCount);
const influenceMap = new Float32Array(particleCount);
const atomShells = new Uint8Array(particleCount);
const atomAngles = new Float32Array(particleCount);
const atomRadii = new Float32Array(particleCount);
const atomSpeedFactors = new Float32Array(particleCount);
const atomCosX = new Float32Array(particleCount);
const atomSinX = new Float32Array(particleCount);
const atomCosZ = new Float32Array(particleCount);
const atomSinZ = new Float32Array(particleCount);

for (let i = 0; i < particleCount; i += 1) {
  randomSeeds[i] = Math.random();
  edgeSeeds[i] = Math.random();
}

function buildSphere(target) {
  const radius = 10;

  for (let i = 0; i < particleCount; i += 1) {
    const i3 = i * 3;
    const t = i / particleCount;
    const phi = Math.acos(1 - 2 * t);
    const theta = Math.PI * (3 - Math.sqrt(5)) * i;

    target[i3] = radius * Math.sin(phi) * Math.cos(theta);
    target[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    target[i3 + 2] = radius * Math.cos(phi);
  }
}

function buildInfluenceMap() {
  for (let i = 0; i < particleCount; i += 1) {
    const i3 = i * 3;
    const x = spherePositions[i3] * 0.18;
    const y = spherePositions[i3 + 1] * 0.14;
    const z = spherePositions[i3 + 2] * 0.11;
    const n1 = Math.sin(x * 2.1 + z * 1.3) * 0.5 + 0.5;
    const n2 = Math.sin(y * 3.7 + x * 2.8) * 0.5 + 0.5;
    const n3 = Math.cos(z * 4.1 + y * 1.9) * 0.5 + 0.5;
    influenceMap[i] = Math.pow(n1 * 0.5 + n2 * 0.3 + n3 * 0.2, 1.4);
  }
}

function updateAtomPositions(elapsed) {
  for (let i = 0; i < particleCount; i += 1) {
    if (atomShells[i] === 0) {
      continue;
    }
    const i3 = i * 3;
    const angle = atomAngles[i] + elapsed * atomSpeedFactors[i];
    const r = atomRadii[i];
    let x = r * Math.cos(angle);
    let y = r * Math.sin(angle);
    let z = 0;
    // Plane rotation controls: X-axis and Z-axis orbital plane transforms.
    const y1 = y * atomCosX[i] - z * atomSinX[i];
    const z1 = y * atomSinX[i] + z * atomCosX[i];
    y = y1;
    z = z1;
    const x2 = x * atomCosZ[i] - y * atomSinZ[i];
    const y2 = x * atomSinZ[i] + y * atomCosZ[i];
    spherePositions[i3] = x2;
    spherePositions[i3 + 1] = y2;
    spherePositions[i3 + 2] = z;
  }
}

function buildAtom() {
  const TAU = Math.PI * 2;
  const PI = Math.PI;

  // Plane rotation controls: set per-plane orientation angles (tX, tZ).
  function makePlane(tX, tZ) {
    return {
      cx: Math.cos(tX),
      sx: Math.sin(tX),
      cz: Math.cos(tZ),
      sz: Math.sin(tZ),
    };
  }

  function fillShell(start, end, rMin, rMax, spdMin, spdMax, shellId, planes) {
    const n = end - start;
    const perPlane = Math.ceil(n / planes.length);
    for (let i = start; i < end; i += 1) {
      const idx = i - start;
      const pl =
        planes[Math.min(Math.floor(idx / perPlane), planes.length - 1)];
      atomShells[i] = shellId;
      atomRadii[i] = rMin + randomSeeds[i] * (rMax - rMin);
      atomAngles[i] = ((idx % perPlane) / perPlane) * TAU;
      atomSpeedFactors[i] = spdMin + randomSeeds[i] * (spdMax - spdMin);
      atomCosX[i] = pl.cx;
      atomSinX[i] = pl.sx;
      atomCosZ[i] = pl.cz;
      atomSinZ[i] = pl.sz;
    }
  }

  for (let i = 0; i < 60; i += 1) {
    const t = i / 60;
    const phi = Math.acos(1 - 2 * t);
    const theta = TAU * i * 0.618033988749895;
    const r = 1.0 + randomSeeds[i] * 0.5;
    const i3 = i * 3;
    spherePositions[i3] = r * Math.sin(phi) * Math.cos(theta);
    spherePositions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    spherePositions[i3 + 2] = r * Math.cos(phi);
    atomShells[i] = 0;
    atomRadii[i] = r;
    atomAngles[i] = theta;
    atomSpeedFactors[i] = 0;
    atomCosX[i] = 1;
    atomSinX[i] = 0;
    atomCosZ[i] = 1;
    atomSinZ[i] = 0;
  }

  fillShell(60, 200, 3.5, 4.5, 2.4, 3.2, 1, [
    makePlane(0.28 * PI, 0),
    makePlane(-0.45 * PI, 0.55 * PI),
  ]);

  fillShell(200, 400, 5.5, 7.5, 1.2, 1.8, 2, [
    makePlane(0.38 * PI, 0),
    makePlane(-0.25 * PI, 0.6 * PI),
    makePlane(0.12 * PI, -0.45 * PI),
  ]);

  fillShell(400, 700, 8.5, 11.5, 0.55, 0.9, 3, [
    makePlane(0.5 * PI, 0),
    makePlane(-0.35 * PI, 0.7 * PI),
    makePlane(0.2 * PI, -0.4 * PI),
    makePlane(-0.15 * PI, 0.25 * PI),
  ]);

  for (let i = 700; i < 1000; i += 1) {
    const t = (i - 700) / 300;
    const phi = Math.acos(1 - 2 * t);
    const theta = TAU * (i - 700) * 0.618033988749895;
    const r = 4.5 + randomSeeds[i] * 7.5;
    atomShells[i] = 4;
    atomRadii[i] = r;
    atomAngles[i] = theta;
    atomSpeedFactors[i] = 0.1 + randomSeeds[i] * 0.3;
    const tx = randomSeeds[i] * PI;
    const tz = randomSeeds[(i + 200) % particleCount] * PI;
    atomCosX[i] = Math.cos(tx);
    atomSinX[i] = Math.sin(tx);
    atomCosZ[i] = Math.cos(tz);
    atomSinZ[i] = Math.sin(tz);
  }

  updateAtomPositions(0);
}

buildSphere(spherePositions);
buildInfluenceMap();
buildAtom();
positions.set(spherePositions);
setPreloadProgress(48);

geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
geometry.setAttribute("aInfluence", new THREE.BufferAttribute(influenceMap, 1));

const material = new THREE.ShaderMaterial({
  uniforms: {
    uOpacity: { value: 0.88 },
    uFocalDist: { value: 20.0 },
    uAperture: { value: 0.15 },
  },
  vertexShader: `
    attribute float aInfluence;
    uniform float uFocalDist;
    uniform float uAperture;
    varying float vInfluence;
    varying float vCoc;
    varying float vFocusFade;

    void main() {
      vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
      float dist = length(mvPos.xyz);
      float coc = abs(dist - uFocalDist) / uFocalDist;
      float cocMag = clamp(coc * uAperture * 8.0, 0.0, 1.0);
      float perspScale = clamp(uFocalDist / max(dist, 2.0), 0.5, 2.5);
      float baseSize = 1.4 + aInfluence * 0.8;
      float bokehSize = baseSize + cocMag * cocMag * 14.0 * perspScale;
      gl_PointSize = clamp(bokehSize, 1.0, 64.0);
      gl_Position = projectionMatrix * mvPos;
      vInfluence = aInfluence;
      vCoc = cocMag;
      vFocusFade = 1.0 - cocMag * 0.50;
    }
  `,
  fragmentShader: `
    uniform float uOpacity;
    varying float vInfluence;
    varying float vCoc;
    varying float vFocusFade;

    void main() {
      vec2 uv = gl_PointCoord - vec2(0.5);
      float d = length(uv);
      if (d > 0.5) discard;
      float edge = 1.0 - smoothstep(0.38, 0.50, d);
      float ringBoost = 1.0 + vCoc * 1.1 * smoothstep(0.28, 0.44, d);
      float alpha = edge * uOpacity * vFocusFade;
      vec3 col = mix(vec3(0.82, 0.88, 1.00), vec3(1.00, 0.97, 0.94), vInfluence);
      gl_FragColor = vec4(col * ringBoost, alpha);
    }
  `,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

const particles = new THREE.Points(geometry, material);
particles.frustumCulled = false;
scene.add(particles);

const secondaryCount = 600;
const secondaryGeo = new THREE.BufferGeometry();
const secondaryPos = new Float32Array(secondaryCount * 3);
const secondaryBase = new Float32Array(secondaryCount * 3);
const secondarySeed = new Float32Array(secondaryCount);
const secondaryOrbitRadius = new Float32Array(secondaryCount);
const secondaryOrbitHeight = new Float32Array(secondaryCount);
const secondaryOrbitPhase = new Float32Array(secondaryCount);
const secondaryOrbitSpeed = new Float32Array(secondaryCount);
const secondaryOrbitDepth = new Float32Array(secondaryCount);

(function buildSecondaryParticles() {
  const TAU = Math.PI * 2;
  for (let i = 0; i < secondaryCount; i += 1) {
    const i3 = i * 3;
    const rng = ((i * 1664525 + 1013904223) >>> 0) / 4294967296;
    const normalized = i / secondaryCount;
    const band = normalized * normalized;
    const angle = normalized * TAU * 8.0;
    secondaryOrbitRadius[i] = 7.0 + band * 18.0;
    secondaryOrbitHeight[i] = (rng - 0.5) * (4.0 + band * 18.0);
    secondaryOrbitPhase[i] = angle;
    secondaryOrbitSpeed[i] = 0.12 + rng * 0.28;
    secondaryOrbitDepth[i] = -18.0 - band * 14.0;
    secondaryBase[i3] = Math.cos(angle) * secondaryOrbitRadius[i];
    secondaryBase[i3 + 1] = secondaryOrbitHeight[i];
    secondaryBase[i3 + 2] =
      Math.sin(angle) * secondaryOrbitRadius[i] + secondaryOrbitDepth[i];
    secondaryPos[i3] = secondaryBase[i3];
    secondaryPos[i3 + 1] = secondaryBase[i3 + 1];
    secondaryPos[i3 + 2] = secondaryBase[i3 + 2];
    secondarySeed[i] = rng;
  }
})();

secondaryGeo.setAttribute(
  "position",
  new THREE.BufferAttribute(secondaryPos, 3),
);

const secondaryMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uOpacity: { value: 0 },
  },
  vertexShader: `
    void main() {
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = 1.8;
    }
  `,
  fragmentShader: `
    uniform float uOpacity;
    void main() {
      float d = length(gl_PointCoord - vec2(0.5));
      if (d > 0.5) discard;
      gl_FragColor = vec4(1.0, 1.0, 1.0, uOpacity * max(0.0, 1.0 - d * 2.0));
    }
  `,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

const secondaryParticles = new THREE.Points(secondaryGeo, secondaryMaterial);
secondaryParticles.frustumCulled = false;
scene.add(secondaryParticles);

const nebulaState = {
  points: null,
  positions: null,
  basePositions: null,
  speeds: null,
  material: null,
  count: 460,
  zNear: -8,
  zFar: -92,
};

if (ENABLE_NEBULA_BACKGROUND) {
  const nebulaGeo = new THREE.BufferGeometry();
  const nebulaPos = new Float32Array(nebulaState.count * 3);
  const nebulaBase = new Float32Array(nebulaState.count * 3);
  const nebulaSpeed = new Float32Array(nebulaState.count);

  for (let i = 0; i < nebulaState.count; i += 1) {
    const i3 = i * 3;
    const seed = ((i * 747796405 + 2891336453) >>> 0) / 4294967296;
    const ring = Math.sqrt(seed) * 56;
    const theta = seed * Math.PI * 24.0 + (i % 11) * 0.13;
    const x = Math.cos(theta) * ring;
    const y = Math.sin(theta * 0.8) * (5 + seed * 16);
    const z = THREE.MathUtils.lerp(nebulaState.zFar, nebulaState.zNear, seed);
    nebulaPos[i3] = x;
    nebulaPos[i3 + 1] = y;
    nebulaPos[i3 + 2] = z;
    nebulaBase[i3] = x;
    nebulaBase[i3 + 1] = y;
    nebulaBase[i3 + 2] = z;
    nebulaSpeed[i] = 0.09 + seed * 0.2;
  }

  nebulaGeo.setAttribute("position", new THREE.BufferAttribute(nebulaPos, 3));

  const nebulaMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0.11 },
    },
    vertexShader: `
      uniform float uTime;
      varying float vFade;
      void main() {
        vec3 p = position;
        float floatJitter = sin(uTime * 0.18 + p.x * 0.03 + p.z * 0.015) * 0.6;
        p.y += floatJitter;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = 1.6 + smoothstep(-95.0, -8.0, p.z) * 2.4;
        vFade = smoothstep(-95.0, -8.0, p.z);
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      varying float vFade;
      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float d = length(uv);
        if (d > 0.5) discard;
        float soft = 1.0 - smoothstep(0.2, 0.5, d);
        vec3 col = mix(vec3(0.16, 0.22, 0.34), vec3(0.52, 0.67, 0.86), vFade);
        gl_FragColor = vec4(col, soft * uOpacity);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const nebulaPoints = new THREE.Points(nebulaGeo, nebulaMaterial);
  nebulaPoints.frustumCulled = false;
  nebulaPoints.position.set(0, 0, -14);
  scene.add(nebulaPoints);

  nebulaState.points = nebulaPoints;
  nebulaState.positions = nebulaPos;
  nebulaState.basePositions = nebulaBase;
  nebulaState.speeds = nebulaSpeed;
  nebulaState.material = nebulaMaterial;
}

const morphStrength = 0.032;
let zoomBlurStrength = 2.2;
let zoomBlurTarget = 0.09;
let virtualScrollProgress = 0;
let lastScrollY = 0;
let lastScrollTime = performance.now();
let scrollDirection = 1;
let pageIsVisible = !document.hidden;
const FORCE_VISUAL_SAFETY_MODE = true;
const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
let visualSafetyActive = FORCE_VISUAL_SAFETY_MODE || reduceMotionQuery.matches;
if (typeof reduceMotionQuery.addEventListener === "function") {
  reduceMotionQuery.addEventListener("change", (event) => {
    visualSafetyActive = FORCE_VISUAL_SAFETY_MODE || event.matches;
  });
}
let secondaryOpacity = 0;
let secondaryTarget = 0;
let scrollActiveTimer = null;
let scrollDownClassTimer = null;
let lastWheelIntentDelta = 0;
let lastWheelIntentAt = 0;
let virtualScrollAnimRaf = 0;
const FORCE_SIMULATED_SCROLL_FLOW = true;
const VIRTUAL_SCROLL_VIEWPORTS = 8;
const VIRTUAL_SCROLL_MIN_SPAN = 4800;
const sectionOrbitNodes = [];
const flowSections = [];
const orbitKeywordNodes = [];
const _mvpMatrix = new THREE.Matrix4();
const _flowWorldPos = new THREE.Vector3();

const FLOW_TOPOLOGY = {
  "experience-section": { x: 0, y: 0, zFar: -136, zNear: -7, zOut: 54 },
  "archive-section": { x: 0, y: 0, zFar: -140, zNear: -8, zOut: 56 },
  "resources-section": { x: 0, y: 0, zFar: -144, zNear: -8, zOut: 58 },
  "timeline-section": { x: 0, y: 0, zFar: -148, zNear: -9, zOut: 60 },
  "projects-section": { x: 0, y: 0, zFar: -152, zNear: -10, zOut: 64 },
  "system-section": { x: 0, y: 0, zFar: -156, zNear: -11, zOut: 68 },
  "resume-section": { x: 0, y: 0, zFar: -162, zNear: -12, zOut: 74 },
};
const FLOW_REVEAL = {
  softPadding: 0.018,
  focusWindow: 0.58,
  edgeFade: 0.16,
  activeThreshold: 0.68,
  blurMax: 12,
};
const parallaxState = {
  currentX: 0,
  currentY: 0,
  targetX: 0,
  targetY: 0,
  maxOffsetX: 1.1,
  maxOffsetY: 0.7,
  damping: 0.085,
};
const edgeBreakRange = {
  x: 2.2,
  y: 1.15,
  z: 0.75,
};
const bendBox = {
  width: 16,
  height: 13,
  zCurve: 1.8,
  yCurve: 0.55,
  zDance: 0.42,
  zDanceSpeed: 0.0,
};
// Crossfade band around gravityFieldConfig.startProgress (0.75): the particle
// field fades out while the particle-core wireframe fades in, instead of the
// particles being switched off in a single frame.
const CORE_CROSSFADE_START = 0.69;
const CORE_CROSSFADE_END = 0.79;

function getCoreCrossfadeT(flowProgress) {
  return THREE.MathUtils.smoothstep(
    flowProgress,
    CORE_CROSSFADE_START,
    CORE_CROSSFADE_END,
  );
}

const gravityFieldConfig = {
  startProgress: 0.75,
  fullProgress: 0.9,
  orbitSpeed: 0.72,
  radiusJitter: 1.6,
  radialFallback: 22,
  planetRadius: 3.1,
  planetShellJitter: 0.55,
  planetZOffset: -9.0,
};

const sceneBuilder = createSceneBuilder({
  enabled: false,
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
});

function getBlurImpulse(velocity) {
  const normalized = Math.min(Math.max(velocity / 3, 0), 1);
  const linearThreshold = 0.24;
  const linearMax = 0.012;
  const exponentialMax = 0.055;

  if (normalized <= linearThreshold) {
    return (normalized / linearThreshold) * linearMax;
  }

  const tailT = (normalized - linearThreshold) / (1 - linearThreshold);
  const exponentialCurve = (Math.exp(tailT * 2.75) - 1) / (Math.exp(2.75) - 1);
  return linearMax + exponentialCurve * (exponentialMax - linearMax);
}

function getScrollSpan() {
  if (shouldUseVirtualScroll()) {
    return Math.max(
      window.innerHeight * VIRTUAL_SCROLL_VIEWPORTS,
      VIRTUAL_SCROLL_MIN_SPAN,
    );
  }

  return Math.max(
    document.documentElement.scrollHeight - window.innerHeight,
    1,
  );
}

function hasNativeScrollableRange() {
  return document.documentElement.scrollHeight - window.innerHeight > 1;
}

function shouldUseVirtualScroll() {
  return FORCE_SIMULATED_SCROLL_FLOW || !hasNativeScrollableRange();
}

function getEffectiveScrollY() {
  if (!shouldUseVirtualScroll() && hasNativeScrollableRange()) {
    return window.scrollY;
  }
  return virtualScrollProgress * getScrollSpan();
}

function getEffectiveScrollProgress() {
  return clamp01(getEffectiveScrollY() / getScrollSpan());
}

function setEffectiveScrollProgress(progress, behavior = "smooth") {
  const clamped = clamp01(progress);
  if (!shouldUseVirtualScroll() && hasNativeScrollableRange()) {
    const targetY = clamped * getScrollSpan();
    window.scrollTo({ top: targetY, behavior });
    return;
  }

  if (virtualScrollAnimRaf !== 0) {
    cancelAnimationFrame(virtualScrollAnimRaf);
    virtualScrollAnimRaf = 0;
  }

  if (behavior === "smooth") {
    const startProgress = virtualScrollProgress;
    const startAt = performance.now();
    const duration = 520 + Math.abs(clamped - startProgress) * 900;

    const step = (now) => {
      const t = Math.min((now - startAt) / duration, 1);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const prevY = getEffectiveScrollY();
      virtualScrollProgress = startProgress + (clamped - startProgress) * eased;
      const deltaY = getEffectiveScrollY() - prevY;
      applyScrollState(deltaY, now);

      if (t < 1) {
        virtualScrollAnimRaf = requestAnimationFrame(step);
      } else {
        virtualScrollAnimRaf = 0;
      }
    };

    virtualScrollAnimRaf = requestAnimationFrame(step);
    return;
  }

  const prevY = getEffectiveScrollY();
  virtualScrollProgress = clamped;
  applyScrollState(getEffectiveScrollY() - prevY, performance.now());
}

function applyVirtualScrollDelta(deltaY) {
  if (!shouldUseVirtualScroll() && hasNativeScrollableRange()) {
    return 0;
  }

  const span = getScrollSpan();
  const prevY = getEffectiveScrollY();
  const nextProgress = clamp01(virtualScrollProgress + deltaY / span);
  virtualScrollProgress = nextProgress;
  const nextY = getEffectiveScrollY();
  return nextY - prevY;
}

function getTargetPositions() {
  return spherePositions;
}

function clampUnit(value) {
  return Math.min(Math.max(value, -1), 1);
}

function hideEmptyContainers() {
  document
    .querySelectorAll(".flowchart-container, .container-1, .container-2")
    .forEach((node) => {
      const element = node;
      if (
        element.children.length === 0 ||
        element.textContent.trim().length === 0
      ) {
        element.classList.add("is-empty");
      }
    });
}

function updateMenuState(scrollProgress) {
  if (!sciMenu) {
    return;
  }

  const items = Array.from(document.querySelectorAll(".menu-item"));
  let closestItem = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  items.forEach((item) => {
    const marker = Number.parseFloat(
      item.getAttribute("data-scroll-to") || "0",
    );
    if (!Number.isFinite(marker)) {
      item.classList.remove("is-active");
      return;
    }

    const distance = Math.abs(scrollProgress - marker);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestItem = item;
    }
    item.classList.remove("is-active");
  });

  if (closestItem) {
    closestItem.classList.add("is-active");
  }
}

function updateRailMotion(deltaY, velocity) {
  if (!menuRailTicks) {
    return;
  }

  const primaryDuration = Math.max(2.8, 10.5 - velocity * 2.4);
  const secondaryDuration = Math.max(3.4, 12.0 - velocity * 2.1);
  const scrollingDown = deltaY > 0;

  menuRailTicks.style.setProperty(
    "--rail-speed-primary",
    `${primaryDuration.toFixed(2)}s`,
  );
  menuRailTicks.style.setProperty(
    "--rail-speed-secondary",
    `${secondaryDuration.toFixed(2)}s`,
  );
  menuRailTicks.style.setProperty(
    "--rail-dir-primary",
    scrollingDown ? "reverse" : "normal",
  );
  menuRailTicks.style.setProperty(
    "--rail-dir-secondary",
    scrollingDown ? "normal" : "reverse",
  );
}

function getRailControlDelta(nativeDeltaY, now) {
  // Alternate method: prefer recent wheel intent and invert it so wheel-up drives rail-down motion.
  if (now - lastWheelIntentAt <= 140) {
    return lastWheelIntentDelta;
  }
  return nativeDeltaY;
}

function initSectionOrbitNodes() {
  const nodes = [
    document.getElementById("experience-section"),
    document.getElementById("archive-section"),
    document.getElementById("resources-section"),
    document.getElementById("timeline-section"),
    document.getElementById("projects-section"),
    document.getElementById("system-section"),
    document.getElementById("resume-section"),
    contactSection,
  ].filter(Boolean);

  nodes.forEach((node, idx) => {
    sectionOrbitNodes.push({
      node,
      phase: idx * 0.95,
      radiusX: 5 + idx * 2.4,
      radiusY: 2 + idx * 1.2,
      rotAmp: 0.35 + idx * 0.15,
    });
  });
}

function updateSectionOrbitNodes(elapsed, flowProgress) {
  const flowDamp = 1 - clamp01(flowProgress * 0.55);
  sectionOrbitNodes.forEach((entry, idx) => {
    const t = elapsed * (0.5 + idx * 0.07) + entry.phase;
    const x = Math.cos(t) * entry.radiusX * flowDamp;
    const y = Math.sin(t * 1.15) * entry.radiusY * flowDamp;
    const rot = Math.sin(t * 0.85) * entry.rotAmp * flowDamp;
    entry.node.style.setProperty("--orbit-x", `${x.toFixed(2)}px`);
    entry.node.style.setProperty("--orbit-y", `${y.toFixed(2)}px`);
    entry.node.style.setProperty("--orbit-rot", `${rot.toFixed(3)}deg`);
  });
}

function initSectionViewZoom() {
  const targets = document.querySelectorAll(".content-section");
  if (targets.length === 0) {
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        entry.target.classList.toggle("is-in-view", entry.isIntersecting);
      });
    },
    { threshold: 0.4, rootMargin: "0px 0px -8% 0px" },
  );

  targets.forEach((node) => {
    observer.observe(node);
  });
}

function initFlowSections() {
  const nodes = Array.from(document.querySelectorAll(".flow-section"));
  if (nodes.length === 0) {
    return;
  }

  flowSections.length = 0;
  const totalNodes = Math.max(nodes.length, 1);
  nodes.forEach((node, idx) => {
    const start = Number.parseFloat(
      node.getAttribute("data-flow-start") || "0",
    );
    const end = Number.parseFloat(node.getAttribute("data-flow-end") || "1");
    const direction = node.getAttribute("data-flow-direction") || "right";
    const validStart = Number.isFinite(start) ? clamp01(start) : 0;
    const validEnd = Number.isFinite(end) ? clamp01(end) : 1;

    const t = (idx + 0.5) / totalNodes;
    const sphereY = 1 - 2 * t;
    const sphereR = Math.sqrt(Math.max(0, 1 - sphereY * sphereY));
    const sphereTheta = idx * 2.399963229728653;
    const sphereX = Math.cos(sphereTheta) * sphereR;
    const sphereZ = Math.sin(sphereTheta) * sphereR;

    flowSections.push({
      node,
      start: Math.min(validStart, validEnd),
      end: Math.max(validStart, validEnd),
      direction,
      order: idx,
      sphereX,
      sphereY,
      sphereZ,
      topology: FLOW_TOPOLOGY[node.id] || {
        x: 0,
        y: 0,
        zFar: -90 - idx * 4,
        zNear: -8,
        zOut: 26 + idx * 0.8,
      },
    });
  });
}

function updateFlowSections(flowProgress, elapsed) {
  if (flowSections.length === 0) {
    setTimelinePanelOpen(sciMenu, false);
    return;
  }

  let closestIndex = -1;
  let closestDistance = Number.POSITIVE_INFINITY;
  let timelinePanelShouldOpen = false;

  flowSections.forEach((entry, idx) => {
    const span = Math.max(entry.end - entry.start, 0.0001);
    const center = entry.start + span * 0.5;
    const local = (flowProgress - center) / (span * 0.5);
    const absLocal = Math.abs(local);
    if (absLocal < closestDistance) {
      closestDistance = absLocal;
      closestIndex = idx;
    }
  });

  flowSections.forEach((entry, idx) => {
    const span = Math.max(entry.end - entry.start, 0.0001);
    const center = entry.start + span * 0.5;
    const local = (flowProgress - center) / (span * 0.5);
    const absLocal = Math.abs(local);
    const isNearest = idx === closestIndex;
    const softStart = Math.max(0, entry.start - FLOW_REVEAL.softPadding);
    const softEnd = Math.min(1, entry.end + FLOW_REVEAL.softPadding);
    const exactRange = flowProgress >= entry.start && flowProgress <= entry.end;
    const softRange = flowProgress >= softStart && flowProgress <= softEnd;
    const inWindow = absLocal <= FLOW_REVEAL.focusWindow;
    const directionSign = entry.direction === "left" ? -1 : 1;
    const approachT = clamp01((local + 1.0) * 0.5);
    const departT = clamp01(local);

    let depth = THREE.MathUtils.lerp(
      entry.topology.zFar,
      entry.topology.zNear,
      easeValue(approachT, "expoOut"),
    );
    if (local > 0) {
      depth = THREE.MathUtils.lerp(
        entry.topology.zNear,
        entry.topology.zOut,
        easeValue(departT, "expoIn"),
      );
    }

    const tunnelShake = Math.max(0, 1 - Math.min(absLocal, 1.35) / 1.35);
    const noJitter = entry.topology.noJitter === true;
    const portalSpiral = 0;
    const jitterX = 0;
    const jitterY = 0;
    const laneBias = noJitter ? 0 : directionSign * (1 - tunnelShake) * 2.8;

    _flowWorldPos.set(
      entry.topology.x + jitterX + laneBias,
      entry.topology.y + jitterY,
      depth,
    );
    _flowWorldPos.project(camera);

    const screenX = (_flowWorldPos.x * 0.5 + 0.5) * window.innerWidth;
    const screenY = (-_flowWorldPos.y * 0.5 + 0.5) * window.innerHeight;
    const inClip =
      _flowWorldPos.z > -1.12 &&
      _flowWorldPos.z < 1.12 &&
      Number.isFinite(screenX) &&
      Number.isFinite(screenY);

    const centerVisibility = clamp01(1 - absLocal / FLOW_REVEAL.focusWindow);
    const edgeVisibility = exactRange
      ? 1
      : softRange
        ? clamp01(
            1 -
              Math.min(
                Math.abs(flowProgress - entry.start),
                Math.abs(flowProgress - entry.end),
              ) /
                FLOW_REVEAL.edgeFade,
          )
        : 0;

    let visibility = inClip
      ? centerVisibility * Math.max(edgeVisibility, exactRange ? 1 : 0)
      : 0;

    if (!exactRange && !isNearest) {
      visibility = 0;
    }
    if (!inWindow && !exactRange) {
      visibility = 0;
    }
    if (visibility < 0.04) {
      visibility = 0;
    }

    const timelinePanelLead = Math.max(FLOW_REVEAL.softPadding * 2.5, 0.045);
    const timelinePanelStart = Math.max(0, entry.start - timelinePanelLead);
    const timelinePanelEnd = Math.min(1, entry.end + timelinePanelLead);
    const timelineOpenRange =
      flowProgress >= timelinePanelStart && flowProgress <= timelinePanelEnd;

    const shiftX = 0;
    const shiftY = 0;
    const scale = 0.82 + visibility * 0.18;
    const focusT = easeValue(visibility, "smooth");
    const rotX = THREE.MathUtils.lerp(
      entry.sphereY * 34,
      entry.sphereY * 14,
      focusT,
    );
    const rotY = THREE.MathUtils.lerp(
      entry.sphereX * 54 + directionSign * 12,
      entry.sphereX * 24 + directionSign * 6,
      focusT,
    );
    const rotZ = THREE.MathUtils.lerp(
      entry.sphereZ * 20,
      entry.sphereZ * 6,
      focusT,
    );
    const depthLift = THREE.MathUtils.lerp(-240, -36, focusT);
    const isActive = exactRange && visibility >= FLOW_REVEAL.activeThreshold;
    const isTransitioning = visibility > 0.06 && !isActive;

    if (
      entry.node.id === "timeline-section" &&
      timelineOpenRange &&
      (isNearest || exactRange || softRange || visibility > 0.08)
    ) {
      timelinePanelShouldOpen = true;
    }

    entry.node.classList.toggle("is-flow-active", isActive);
    entry.node.classList.toggle("is-flow-transitioning", isTransitioning);
    entry.node.style.setProperty("--flow-opacity", visibility.toFixed(3));
    entry.node.style.setProperty("--flow-screen-x", `${screenX.toFixed(2)}px`);
    entry.node.style.setProperty("--flow-screen-y", `${screenY.toFixed(2)}px`);
    entry.node.style.setProperty("--flow-shift", `${shiftX.toFixed(2)}px`);
    entry.node.style.setProperty("--flow-shift-y", `${shiftY.toFixed(2)}px`);
    entry.node.style.setProperty("--flow-scale", `${scale.toFixed(3)}`);
    entry.node.style.setProperty("--flow-rot-x", `${rotX.toFixed(2)}deg`);
    entry.node.style.setProperty("--flow-rot-y", `${rotY.toFixed(2)}deg`);
    entry.node.style.setProperty("--flow-rot-z", `${rotZ.toFixed(2)}deg`);
    entry.node.style.setProperty("--flow-depth", `${depthLift.toFixed(2)}px`);
    entry.node.style.setProperty(
      "--flow-blur",
      `${((1 - visibility) * FLOW_REVEAL.blurMax).toFixed(2)}px`,
    );
  });

  setTimelinePanelOpen(sciMenu, timelinePanelShouldOpen);
}

function updateProjectsSectionPhase(flowProgress) {
  if (!projectsSection) {
    return;
  }

  const isActive = flowProgress >= 0.76 && flowProgress <= 0.92;
  projectsSection.classList.toggle("is-phase-active", isActive);
}

function initOrbitKeywordCloud() {
  if (!orbitKeywordCloud) {
    return;
  }

  const words = Array.from(orbitKeywordCloud.querySelectorAll(".orbit-word"));
  words.forEach((node, idx) => {
    const seed = ((idx * 9301 + 49297) % 233280) / 233280;
    orbitKeywordNodes.push({
      node,
      radiusX: 65 + seed * 300,
      radiusY: 14 + seed * 56,
      speed: 0.09 + seed * 0.19,
      phase: seed * Math.PI * 2,
      tilt: (seed - 0.5) * 0.7,
    });
  });
}

function updateOrbitKeywordCloud(elapsed, flowProgress) {
  if (orbitKeywordNodes.length === 0) {
    return;
  }

  const opacityBase = 0.42 + (1 - clamp01(flowProgress * 1.35)) * 0.38;
  orbitKeywordNodes.forEach((entry) => {
    const theta = elapsed * entry.speed + entry.phase;
    const x = Math.cos(theta) * entry.radiusX;
    const y = Math.sin(theta + entry.tilt) * entry.radiusY;
    const scale = 0.92 + (Math.sin(theta * 1.7) * 0.5 + 0.5) * 0.22;
    const alpha =
      opacityBase * (0.66 + (Math.cos(theta * 1.3) * 0.5 + 0.5) * 0.34);
    entry.node.style.transform = `translate(-50%, -50%) translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${scale.toFixed(3)})`;
    entry.node.style.opacity = alpha.toFixed(3);
  });
}

const modelState = {
  label: "Main Model",
  codeRef: "modelState.pivot",
  mixer: null,
  primaryAction: null,
  clipDuration: 0,
  clip: null,
  pivot: null,
  root: null,
  scrollProgress: 0,
  enabled: false,
  requested: false,
};

const rotorModelState = {
  label: "Rotor",
  codeRef: "rotorModelState.pivot",
  mixer: null,
  primaryAction: null,
  clipActions: [],
  clipDuration: 0,
  clip: null,
  pivot: null,
  root: null,
  ringMeshes: [],
  coreMesh: null,
  pulseMesh: null,
  pulseScaleBoost: 0,
  pulseBaseScale: new THREE.Vector3(1, 1, 1),
  lastElapsed: 0,
  scrollProgress: 0,
  enabled: false,
  requested: false,
};

const outerRingState = {
  label: "Outer Ring",
  codeRef: "outerRingState.pivot",
  mixer: null,
  primaryAction: null,
  clipActions: [],
  clipDuration: 0,
  clip: null,
  pivot: null,
  root: null,
  lastElapsed: 0,
  scrollProgress: 0,
  enabled: false,
  requested: false,
};

const coreWireframeState = {
  label: "Particle Core Wireframe",
  codeRef: "coreWireframeState.pivot",
  pivot: null,
  root: null,
  attachedRing: null,
  enabled: false,
  requested: false,
  followParticleCore: false,
  uniformSets: [],
  wrapRadius: 32,
  target: new THREE.Vector3(),
  smoothed: new THREE.Vector3(),
};

const corporateAgentState = {
  label: "Corporate Agent",
  codeRef: "corporateAgentState.pivot",
  pivot: null,
  root: null,
  mixer: null,
  clipActions: [],
  selectionHelper: null,
  lastElapsed: 0,
  enabled: false,
  requested: false,
};

const linkedRotorOuterState = {
  label: "Rotor + Outer (Linked)",
  pivot: null,
  root: null,
  linkedStates: [rotorModelState, outerRingState],
  enabled: true,
};

const flowPanelState = {
  group: null,
  panels: [],
};

function destroyFlowPanels() {
  if (!flowPanelState.group) {
    flowPanelState.panels = [];
    return;
  }

  flowPanelState.panels.forEach((entry) => {
    if (entry?.mesh?.geometry) {
      entry.mesh.geometry.dispose();
    }
    const texture = entry?.material?.map;
    if (texture) {
      texture.dispose();
    }
    if (entry?.material) {
      entry.material.dispose();
    }
  });

  scene.remove(flowPanelState.group);
  flowPanelState.group.clear();
  flowPanelState.group = null;
  flowPanelState.panels = [];
}

const auxiliaryGlbState = {
  enabled: false,
  requested: false,
  entries: [],
};
const hologramUniformSets = [];
let devToolsUpdate = null;
let devCurveCam = null;
let devManualAxisLocks = null;

function getManualAxisLocks(state) {
  if (!devManualAxisLocks || !state) {
    return {
      position: { x: false, y: false, z: false },
      rotation: { x: false, y: false, z: false },
    };
  }

  return devManualAxisLocks(state);
}

// DEV-SCENE:transforms:start
const DEV_SCENE_TRANSFORMS = {
  "rotorModelState.pivot": {
    "position": [
      3.4694,
      -9,
      -70.3285
    ],
    "rotation": [
      0,
      -0.5419,
      0
    ],
    "scale": [
      0.6,
      0.6,
      0.6
    ],
    "visible": true
  },
  "outerRingState.pivot": {
    "position": [
      3.4694,
      -9,
      -70.3285
    ],
    "rotation": [
      0,
      -0.5419,
      0
    ],
    "scale": [
      0.6,
      0.6,
      0.6
    ],
    "visible": true
  },
  "modelState.pivot": {
    "position": [
      86.511,
      630.1105,
      -10870.8283
    ],
    "rotation": [
      0,
      253.5743,
      0
    ],
    "scale": [
      1,
      1,
      1
    ],
    "visible": true
  },
  "corporateAgentState.pivot": {
    "position": [
      -6,
      -3,
      -3
    ],
    "rotation": [
      0,
      -1.5708,
      0
    ],
    "scale": [
      0.65,
      0.65,
      0.65
    ],
    "visible": true
  },
  "coreWireframeState.pivot": {
    "position": [
      92.1614,
      -0.4868,
      -28.3899
    ],
    "rotation": [
      0,
      0,
      0
    ],
    "scale": [
      1,
      1,
      1
    ],
    "visible": true
  },
  "AUXILIARY_GLB_STATES[0].pivot": {
    "position": [
      3,
      -4.8,
      -8.8
    ],
    "rotation": [
      0,
      0.1047,
      0
    ],
    "scale": [
      24.869,
      24.869,
      24.869
    ],
    "visible": false
  },
  "AUXILIARY_GLB_STATES[1].pivot": {
    "position": [
      7.4,
      -4.8,
      -9.2
    ],
    "rotation": [
      0.7854,
      0,
      0.5236
    ],
    "scale": [
      47.606,
      47.606,
      47.606
    ],
    "visible": true
  },
  "AUXILIARY_GLB_STATES[2].pivot": {
    "position": [
      3,
      -4.8,
      -9.6
    ],
    "rotation": [
      0,
      0.1047,
      0
    ],
    "scale": [
      24.869,
      24.869,
      24.869
    ],
    "visible": true
  },
  "AUXILIARY_GLB_STATES[3].pivot": {
    "position": [
      1.6,
      -4.65,
      -7.6
    ],
    "rotation": [
      0,
      0,
      0
    ],
    "scale": [
      3.3,
      3.3,
      3.3
    ],
    "visible": true
  },
  "AUXILIARY_GLB_STATES[4].pivot": {
    "position": [
      -13,
      8,
      13
    ],
    "rotation": [
      0,
      -1.5708,
      0
    ],
    "scale": [
      1.2,
      1.2,
      1.2
    ],
    "visible": true
  },
  "AUXILIARY_GLB_STATES[5].pivot": {
    "position": [
      -16.68,
      -4.5,
      -135.31
    ],
    "rotation": [
      -0.3997,
      0.0367,
      0.0977
    ],
    "scale": [
      19.927,
      19.927,
      19.927
    ],
    "visible": true
  },
  "AUXILIARY_GLB_STATES[6].pivot": {
    "position": [
      -6,
      -3,
      -3
    ],
    "rotation": [
      0,
      -1.5708,
      0
    ],
    "scale": [
      32.778,
      32.778,
      32.778
    ],
    "visible": true
  },
  "AUXILIARY_GLB_STATES[7].pivot": {
    "position": [
      0.8,
      -4.5,
      -7.2
    ],
    "rotation": [
      0,
      0,
      0
    ],
    "scale": [
      1,
      1,
      1
    ],
    "visible": true
  },
  "AUXILIARY_GLB_STATES[8].pivot": {
    "position": [
      -6,
      -3,
      -3
    ],
    "rotation": [
      0,
      -1.5708,
      0
    ],
    "scale": [
      1,
      1,
      1
    ],
    "visible": true
  },
  "AUXILIARY_GLB_STATES[9].pivot": {
    "position": [
      60,
      -5,
      -90
    ],
    "rotation": [
      0,
      1.693,
      0.0367
    ],
    "scale": [
      12.018,
      12.018,
      12.018
    ],
    "visible": true
  }
};
// DEV-SCENE:transforms:end

// DEV-SCENE:keyframes:start
const DEV_SCENE_MANUAL_KEYFRAMES = [
  {
    "label": "Rotor",
    "ref": "rotorModelState.pivot",
    "clip": {
      "enabled": false,
      "duration": 4,
      "loop": true,
      "playing": false,
      "time": 0,
      "easing": "linear",
      "overrideNativeAnimation": true,
      "position": {
        "x": [],
        "y": [],
        "z": []
      },
      "rotation": {
        "x": [],
        "y": [],
        "z": []
      }
    }
  },
  {
    "label": "Outer Ring",
    "ref": "outerRingState.pivot",
    "clip": {
      "enabled": false,
      "duration": 4,
      "loop": true,
      "playing": false,
      "time": 0,
      "easing": "linear",
      "overrideNativeAnimation": true,
      "position": {
        "x": [],
        "y": [],
        "z": []
      },
      "rotation": {
        "x": [],
        "y": [],
        "z": []
      }
    }
  },
  {
    "label": "Corporate Agent",
    "ref": "corporateAgentState.pivot",
    "clip": {
      "enabled": false,
      "duration": 4,
      "loop": true,
      "playing": false,
      "time": 0,
      "easing": "linear",
      "overrideNativeAnimation": true,
      "position": {
        "x": [],
        "y": [],
        "z": []
      },
      "rotation": {
        "x": [],
        "y": [],
        "z": []
      }
    }
  },
  {
    "label": "Particle Core Wireframe",
    "ref": "coreWireframeState.pivot",
    "clip": {
      "enabled": false,
      "duration": 4,
      "loop": true,
      "playing": false,
      "time": 0,
      "easing": "linear",
      "overrideNativeAnimation": true,
      "position": {
        "x": [],
        "y": [],
        "z": []
      },
      "rotation": {
        "x": [],
        "y": [],
        "z": []
      }
    }
  },
  {
    "label": "Aux 2: Decal Rotor",
    "ref": "AUXILIARY_GLB_STATES[1].pivot",
    "clip": {
      "enabled": false,
      "duration": 4,
      "loop": true,
      "playing": false,
      "time": 0,
      "easing": "linear",
      "overrideNativeAnimation": true,
      "position": {
        "x": [],
        "y": [],
        "z": []
      },
      "rotation": {
        "x": [],
        "y": [],
        "z": []
      }
    }
  },
  {
    "label": "Aux 3: Decal Rotor Spinner WebP",
    "ref": "AUXILIARY_GLB_STATES[2].pivot",
    "clip": {
      "enabled": false,
      "duration": 4,
      "loop": true,
      "playing": false,
      "time": 0,
      "easing": "linear",
      "overrideNativeAnimation": true,
      "position": {
        "x": [],
        "y": [],
        "z": []
      },
      "rotation": {
        "x": [],
        "y": [],
        "z": []
      }
    }
  },
  {
    "label": "Aux 4: Decal Rotor Updated",
    "ref": "AUXILIARY_GLB_STATES[3].pivot",
    "clip": {
      "enabled": false,
      "duration": 4,
      "loop": true,
      "playing": false,
      "time": 0,
      "easing": "linear",
      "overrideNativeAnimation": true,
      "position": {
        "x": [],
        "y": [],
        "z": []
      },
      "rotation": {
        "x": [],
        "y": [],
        "z": []
      }
    }
  },
  {
    "label": "Aux 5: ABOUT TEXT",
    "ref": "AUXILIARY_GLB_STATES[4].pivot",
    "clip": {
      "enabled": false,
      "duration": 4,
      "loop": true,
      "playing": false,
      "time": 0,
      "easing": "linear",
      "overrideNativeAnimation": true,
      "position": {
        "x": [],
        "y": [],
        "z": []
      },
      "rotation": {
        "x": [],
        "y": [],
        "z": []
      }
    }
  },
  {
    "label": "Aux 7: PROJECT TEXT",
    "ref": "AUXILIARY_GLB_STATES[6].pivot",
    "clip": {
      "enabled": false,
      "duration": 4,
      "loop": true,
      "playing": true,
      "time": 0,
      "easing": "linear",
      "overrideNativeAnimation": false,
      "position": {
        "x": [],
        "y": [],
        "z": []
      },
      "rotation": {
        "x": [],
        "y": [],
        "z": []
      }
    }
  },
  {
    "label": "Aux 10: PANEL",
    "ref": "AUXILIARY_GLB_STATES[9].pivot",
    "clip": {
      "enabled": false,
      "duration": 4,
      "loop": true,
      "playing": false,
      "time": 0,
      "easing": "linear",
      "overrideNativeAnimation": true,
      "position": {
        "x": [],
        "y": [],
        "z": []
      },
      "rotation": {
        "x": [],
        "y": [],
        "z": []
      }
    }
  }
];
// DEV-SCENE:keyframes:end

// DEV-SCENE:materials:start
const DEV_SCENE_MATERIALS = [
  {
    "label": "Rotor",
    "ref": "rotorModelState.pivot",
    "preset": "custom",
    "material": {
      "wireframe": false,
      "opacity": 0.4,
      "transparent": true,
      "depthWrite": false,
      "color": "#ffffff",
      "emissiveColor": "#66b9ff",
      "emissiveIntensity": 0.2,
      "metalness": 0.9,
      "roughness": 0.14,
      "transmission": 0,
      "ior": 1.5,
      "thickness": 0,
      "clearcoat": 0
    }
  },
  {
    "label": "Outer Ring",
    "ref": "outerRingState.pivot",
    "preset": "custom",
    "material": {
      "wireframe": false,
      "opacity": 0.32,
      "transparent": true,
      "depthWrite": false,
      "color": "#ffffff",
      "emissiveColor": "#66b9ff",
      "emissiveIntensity": 0.16,
      "metalness": 0.9,
      "roughness": 0.14,
      "transmission": 0,
      "ior": 1.5,
      "thickness": 0,
      "clearcoat": 0
    }
  },
  {
    "label": "Corporate Agent",
    "ref": "corporateAgentState.pivot",
    "preset": "glass",
    "material": {
      "wireframe": true,
      "opacity": 1,
      "transparent": false,
      "depthWrite": false,
      "color": "#a3a3a3",
      "emissiveColor": "#000000",
      "emissiveIntensity": 0,
      "metalness": 0,
      "roughness": 0.25,
      "transmission": 1,
      "ior": 1.45,
      "thickness": 0.71,
      "clearcoat": 1
    }
  },
  {
    "label": "Particle Core Wireframe",
    "ref": "coreWireframeState.pivot",
    "preset": "custom",
    "material": {
      "wireframe": true,
      "opacity": 0.01,
      "transparent": true,
      "depthWrite": false,
      "color": "#ffffff",
      "emissiveColor": "#ffffff",
      "emissiveIntensity": 0.19,
      "metalness": 1,
      "roughness": 1,
      "transmission": 0,
      "ior": 1.5,
      "thickness": 0,
      "clearcoat": 0
    }
  },
  {
    "label": "Aux 1: Decal Cube",
    "ref": "AUXILIARY_GLB_STATES[0].pivot",
    "preset": "metal",
    "material": {
      "wireframe": false,
      "opacity": 0.35,
      "transparent": true,
      "depthWrite": false,
      "color": "#4f4f4f",
      "emissiveColor": "#121212",
      "emissiveIntensity": 0,
      "metalness": 1,
      "roughness": 0.18,
      "transmission": 0,
      "ior": 1.5,
      "thickness": 0,
      "clearcoat": 0
    }
  },
  {
    "label": "Aux 2: Decal Rotor",
    "ref": "AUXILIARY_GLB_STATES[1].pivot",
    "preset": "glass",
    "material": {
      "wireframe": false,
      "opacity": 0.06,
      "transparent": true,
      "depthWrite": false,
      "color": "#000000",
      "emissiveColor": "#ffffff",
      "emissiveIntensity": 0.38,
      "metalness": 0,
      "roughness": 0.08,
      "transmission": 0.92,
      "ior": 1.45,
      "thickness": 0.8,
      "clearcoat": 1
    }
  },
  {
    "label": "Aux 3: Decal Rotor Spinner WebP",
    "ref": "AUXILIARY_GLB_STATES[2].pivot",
    "preset": "glass",
    "material": {
      "wireframe": false,
      "opacity": 0.03,
      "transparent": true,
      "depthWrite": false,
      "color": "#424242",
      "emissiveColor": "#000000",
      "emissiveIntensity": 0.76,
      "metalness": 0,
      "roughness": 0.08,
      "transmission": 0.92,
      "ior": 1.45,
      "thickness": 0.8,
      "clearcoat": 1
    }
  },
  {
    "label": "Aux 4: Decal Rotor Updated",
    "ref": "AUXILIARY_GLB_STATES[3].pivot",
    "preset": "custom",
    "material": {
      "wireframe": true,
      "opacity": 0.28,
      "transparent": true,
      "depthWrite": false,
      "color": "#d7f0ff",
      "emissiveColor": "#66b9ff",
      "emissiveIntensity": 0.16,
      "metalness": 0.9,
      "roughness": 0.14,
      "transmission": 0,
      "ior": 1.5,
      "thickness": 0,
      "clearcoat": 0
    }
  },
  {
    "label": "Aux 5: ABOUT TEXT",
    "ref": "AUXILIARY_GLB_STATES[4].pivot",
    "preset": "custom",
    "material": {
      "wireframe": false,
      "opacity": 0.84,
      "transparent": true,
      "depthWrite": false,
      "color": "#d7f0ff",
      "emissiveColor": "#000000",
      "emissiveIntensity": 0.08,
      "metalness": 0.04,
      "roughness": 0.58,
      "transmission": 0,
      "ior": 1.5,
      "thickness": 0,
      "clearcoat": 0
    }
  },
  {
    "label": "Aux 6: BCI TEXT",
    "ref": "AUXILIARY_GLB_STATES[5].pivot",
    "preset": "custom",
    "material": {
      "wireframe": false,
      "opacity": 1,
      "transparent": false,
      "depthWrite": false,
      "color": "#d7f0ff",
      "emissiveColor": "#66b9ff",
      "emissiveIntensity": 0.16,
      "metalness": 0.9,
      "roughness": 0.14,
      "transmission": 0,
      "ior": 1.5,
      "thickness": 0,
      "clearcoat": 0
    }
  },
  {
    "label": "Aux 7: PROJECT TEXT",
    "ref": "AUXILIARY_GLB_STATES[6].pivot",
    "preset": "custom",
    "material": {
      "wireframe": false,
      "opacity": 0.82,
      "transparent": true,
      "depthWrite": false,
      "color": "#d7f0ff",
      "emissiveColor": "#000000",
      "emissiveIntensity": 0.08,
      "metalness": 0.04,
      "roughness": 0.56,
      "transmission": 0,
      "ior": 1.5,
      "thickness": 0,
      "clearcoat": 0
    }
  },
  {
    "label": "Aux 8: AGENT TEXT",
    "ref": "AUXILIARY_GLB_STATES[7].pivot",
    "preset": "custom",
    "material": {
      "wireframe": false,
      "opacity": 0.9,
      "transparent": false,
      "depthWrite": true,
      "color": "#e7e7e7",
      "emissiveColor": "#000000",
      "emissiveIntensity": 0.12,
      "metalness": 0.02,
      "roughness": 0.62,
      "transmission": 0,
      "ior": 1.5,
      "thickness": 0,
      "clearcoat": 0
    }
  },
  {
    "label": "Aux 9: DECAL",
    "ref": "AUXILIARY_GLB_STATES[8].pivot",
    "preset": "custom",
    "material": {
      "wireframe": false,
      "opacity": 0.88,
      "transparent": false,
      "depthWrite": false,
      "color": "#d7f0ff",
      "emissiveColor": "#000000",
      "emissiveIntensity": 0.1,
      "metalness": 0.04,
      "roughness": 0.58,
      "transmission": 0,
      "ior": 1.5,
      "thickness": 0,
      "clearcoat": 0
    }
  },
  {
    "label": "Aux 10: PANEL",
    "ref": "AUXILIARY_GLB_STATES[9].pivot",
    "preset": "original",
    "material": {
      "wireframe": false,
      "opacity": 0.28,
      "transparent": true,
      "depthWrite": false,
      "color": "#d7f0ff",
      "emissiveColor": "#66b9ff",
      "emissiveIntensity": 0.16,
      "metalness": 0.9,
      "roughness": 0.14,
      "transmission": 0,
      "ior": 1.5,
      "thickness": 0,
      "clearcoat": 0
    }
  }
];
// DEV-SCENE:materials:end

// DEV-SCENE:projection-data:start
const DEV_SCENE_PROJECTION_OVERLAYS = [
  {
    "label": "Aux 11: PANEL",
    "meshUUID": null,
    "meshName": "",
    "text": "Systems hologram feed",
    "corners": [],
    "autoFit": {
      "mode": "mesh-face",
      "axis": "auto",
      "align": "camera",
      "insetX": 0.1,
      "insetY": 0.1,
      "depthBias": 0.01
    },
    "style": {
      "layout": "feed",
      "fontSize": 13,
      "padding": 0,
      "textColor": "#eafaff",
      "bgColor": "#041018",
      "bgAlpha": 0.14,
      "parallaxX": 4,
      "parallaxY": 2.4,
      "easing": "smooth",
      "textAnimation": false,
      "scrollSeconds": 28
    },
    "flowOpacity": {
      "1": 1,
      "2": 1,
      "3": 0.94,
      "4": 0.88,
      "5": 0.54,
      "6": 0.18,
      "7": 0.08,
      "8": 0
    }
  }
];
// DEV-SCENE:projection-data:end

const FLOW_CONTACT_POINTS = Object.freeze([
  0.03, 0.3, 0.45, 0.55, 0.65, 0.75, 0.8, 0.9,
]);

const SECTION_FLOW = {
  uiux: FLOW_CONTACT_POINTS[0],
  research: FLOW_CONTACT_POINTS[1],
  archive: FLOW_CONTACT_POINTS[2],
  resources: FLOW_CONTACT_POINTS[3],
  timeline: FLOW_CONTACT_POINTS[4],
  projects: FLOW_CONTACT_POINTS[5],
  system: FLOW_CONTACT_POINTS[6],
  contact: FLOW_CONTACT_POINTS[7],
  end: 0.98,
  atomHoldClipNorm: 0.34,
  projectsClipNorm: 0.84,
  tailLoopSpeed: 0.62,
  morphStart: 0.3,
  morphEnd: 0.45,
};

const PANEL_HOLOGRAM_FEED_LIBRARY = Object.freeze({
  "Aux 11: PANEL": Object.freeze([
    Object.freeze({
      eyebrow: "Systems Overview",
      title: "Simulation-first interface",
      body: "Augmented engineering, archive surfacing, and rapid problem solving are now projected directly onto panel geometry instead of trapped in a flat scroll box.",
      links: Object.freeze([
        Object.freeze({
          label: "Resume PDF Editor",
          href: "/resume-tools.html",
        }),
        Object.freeze({
          label: "Resume Source",
          href: "/resume.html",
        }),
      ]),
    }),
    Object.freeze({
      eyebrow: "Mutation Matrix",
      title: "100,000 mutation campaign",
      body: "66.59 sec total wall time · 1501.72 mut/s throughput · explicit failure distribution for rapid triage.",
      stats: Object.freeze([
        Object.freeze({ label: "Pass", value: "0.52%" }),
        Object.freeze({ label: "Warning", value: "53.85%" }),
        Object.freeze({ label: "Parse Fail", value: "43.52%" }),
        Object.freeze({ label: "Sim Fail", value: "2.11%" }),
      ]),
      links: Object.freeze([
        Object.freeze({
          label: "100K Campaign Summary",
          href: "https://github.com/wowitseddy/Portfolio_2025/blob/master/projects/sentinel-construct/output/campaign/mutation-campaign-summary.md",
          external: true,
        }),
        Object.freeze({
          label: "Test Phase Summary",
          href: "https://github.com/wowitseddy/Portfolio_2025/blob/master/projects/sentinel-construct/output/campaign/mutation-campaign-summary-test.md",
          external: true,
        }),
      ]),
    }),
    Object.freeze({
      eyebrow: "Archive Media",
      title: "Readable media, not buried assets",
      body: "Archive stills roll upward through the panel so the live scene keeps the same motion language as the rest of the interface.",
      imageSrc: "/assets/Archive/_HME6399.JPG",
      imageAlt: "Archive still HME6399",
      caption: "Industrial capture and systems context.",
    }),
    Object.freeze({
      eyebrow: "Archive Media",
      title: "Motion study reference",
      body: "Havok composition study retained as a visual systems frame inside the projected panel.",
      imageSrc: "/assets/Archive/havok-arts-asset.jpg",
      imageAlt: "Havok archive asset",
      caption: "Motion study and visual composition reference.",
    }),
    Object.freeze({
      eyebrow: "Outputs",
      title: "Tools and research surfaces",
      body: "Direct links remain reachable from the panel without forcing a separate internal scroll region.",
      links: Object.freeze([
        Object.freeze({
          label: "Biomed Indexing Tool",
          href: "https://github.com/wowitseddy/Portfolio_2025/tree/master/projects/biomed-indexing-tool",
          external: true,
        }),
        Object.freeze({
          label: "Sentinel Construct",
          href: "https://github.com/wowitseddy/Portfolio_2025/tree/master/projects/sentinel-construct",
          external: true,
        }),
      ]),
    }),
  ]),
});

function getAuxiliaryDefaultNormalizedFlow(entry, flowProgress) {
  if (entry?.src === PROJECT_TEXT_GLB_SRC) {
    return clamp01(
      (flowProgress - SECTION_FLOW.projects) /
        Math.max(SECTION_FLOW.contact - SECTION_FLOW.projects, 0.000001),
    );
  }

  return clamp01(flowProgress / Math.max(SECTION_FLOW.contact, 0.000001));
}

function clamp01(value) {
  return Math.min(Math.max(value, 0), 1);
}

function getDevSceneTransformPreset(codeRef, fallback = {}) {
  const preset =
    (codeRef && DEV_SCENE_TRANSFORMS[codeRef]
      ? DEV_SCENE_TRANSFORMS[codeRef]
      : null);

  return {
    position: Array.isArray(preset?.position)
      ? preset.position
      : Array.isArray(fallback.position)
        ? fallback.position
        : [0, 0, 0],
    rotation: Array.isArray(preset?.rotation)
      ? preset.rotation
      : Array.isArray(fallback.rotation)
        ? fallback.rotation
        : [0, 0, 0],
    scale: Array.isArray(preset?.scale)
      ? preset.scale
      : Array.isArray(fallback.scale)
        ? fallback.scale
        : [1, 1, 1],
    visible:
      typeof preset?.visible === "boolean"
        ? preset.visible
        : typeof fallback.visible === "boolean"
          ? fallback.visible
          : true,
  };
}

function applyDevScenePivotPreset(state, fallback = {}) {
  const pivot = state?.pivot;
  if (!pivot) {
    return;
  }

  const preset = getDevSceneTransformPreset(state.codeRef, fallback);
  pivot.position.set(
    preset.position[0],
    preset.position[1],
    preset.position[2],
  );
  pivot.rotation.set(
    preset.rotation[0],
    preset.rotation[1],
    preset.rotation[2],
  );
  pivot.scale.set(preset.scale[0], preset.scale[1], preset.scale[2]);
  pivot.visible = preset.visible;
}

function projectWorldToViewport(worldPos) {
  const projected = worldPos.clone().project(camera);
  return new THREE.Vector2(projected.x * 0.5 + 0.5, -projected.y * 0.5 + 0.5);
}

const runtimeProjectionState = {
  entries: new Map(),
};

function getProjectionFeedItems(label) {
  return PANEL_HOLOGRAM_FEED_LIBRARY[label] || [];
}

function getProjectionTargetState(overlay, registry) {
  if (!overlay || !registry) {
    return null;
  }

  return (
    registry[overlay.targetLabel || overlay.meshLabel || overlay.label] || null
  );
}

function getPivotLocalBounds(pivot) {
  if (!pivot) {
    return null;
  }

  pivot.updateWorldMatrix(true, true);
  const inversePivotWorld = pivot.matrixWorld.clone().invert();
  const bounds = new THREE.Box3();
  let hasBounds = false;

  const corners = [
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
  ];

  pivot.traverse((node) => {
    if (!node.isMesh || !node.geometry) {
      return;
    }

    if (!node.geometry.boundingBox) {
      node.geometry.computeBoundingBox();
    }

    const geometryBounds = node.geometry.boundingBox;
    if (!geometryBounds || geometryBounds.isEmpty()) {
      return;
    }

    const toPivotSpace = new THREE.Matrix4().multiplyMatrices(
      inversePivotWorld,
      node.matrixWorld,
    );
    const min = geometryBounds.min;
    const max = geometryBounds.max;
    const pointValues = [
      [min.x, min.y, min.z],
      [max.x, min.y, min.z],
      [max.x, max.y, min.z],
      [min.x, max.y, min.z],
      [min.x, min.y, max.z],
      [max.x, min.y, max.z],
      [max.x, max.y, max.z],
      [min.x, max.y, max.z],
    ];

    pointValues.forEach((value, index) => {
      const point = corners[index].set(value[0], value[1], value[2]);
      point.applyMatrix4(toPivotSpace);
      if (!hasBounds) {
        bounds.min.copy(point);
        bounds.max.copy(point);
        hasBounds = true;
      } else {
        bounds.expandByPoint(point);
      }
    });
  });

  return hasBounds ? bounds : null;
}

function orderProjectionCornersForScreen(corners) {
  if (!Array.isArray(corners) || corners.length < 4) {
    return corners;
  }

  const projected = corners
    .map((corner, index) => ({
      index,
      point: projectProjectionCornerToScreen([corner.x, corner.y, corner.z]),
    }))
    .filter((entry) => !!entry.point);

  if (projected.length < 4) {
    return corners;
  }

  const sortedByY = [...projected].sort((a, b) => a.point.y - b.point.y);
  const top = sortedByY.slice(0, 2).sort((a, b) => a.point.x - b.point.x);
  const bottom = sortedByY.slice(2, 4).sort((a, b) => a.point.x - b.point.x);

  return [
    corners[top[0].index],
    corners[top[1].index],
    corners[bottom[1].index],
    corners[bottom[0].index],
  ];
}

function getAutoFitProjectionCorners(overlay, state) {
  const pivot = state?.pivot;
  if (!pivot) {
    return [];
  }

  const bounds = getPivotLocalBounds(pivot);
  if (!bounds) {
    return [];
  }

  const autoFit = overlay?.autoFit || {};
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const extents = [size.x, size.y, size.z];
  let axisIndex = ["x", "y", "z"].indexOf(autoFit.axis);
  if (axisIndex < 0) {
    axisIndex = extents.indexOf(Math.min(...extents));
  }

  const faceAxes = [0, 1, 2].filter((index) => index !== axisIndex);
  const [uAxis, vAxis] = faceAxes;
  const mins = [bounds.min.x, bounds.min.y, bounds.min.z];
  const maxs = [bounds.max.x, bounds.max.y, bounds.max.z];
  const insetX = THREE.MathUtils.clamp(Number(autoFit.insetX ?? 0.08), 0, 0.45);
  const insetY = THREE.MathUtils.clamp(Number(autoFit.insetY ?? 0.08), 0, 0.45);
  const depthBias = Number(autoFit.depthBias ?? 0.01);

  const uMin = THREE.MathUtils.lerp(mins[uAxis], maxs[uAxis], insetX);
  const uMax = THREE.MathUtils.lerp(maxs[uAxis], mins[uAxis], insetX);
  const vMin = THREE.MathUtils.lerp(mins[vAxis], maxs[vAxis], insetY);
  const vMax = THREE.MathUtils.lerp(maxs[vAxis], mins[vAxis], insetY);

  const worldCenter = pivot.localToWorld(center.clone());
  const toCamera = camera.position.clone().sub(worldCenter).normalize();
  const positiveNormal = new THREE.Vector3(
    axisIndex === 0 ? 1 : 0,
    axisIndex === 1 ? 1 : 0,
    axisIndex === 2 ? 1 : 0,
  )
    .applyQuaternion(pivot.getWorldQuaternion(new THREE.Quaternion()))
    .normalize();
  const usePositiveFace =
    String(autoFit.align || "camera") !== "camera" ||
    positiveNormal.dot(toCamera) >= 0;
  const faceValue = usePositiveFace
    ? maxs[axisIndex] - depthBias
    : mins[axisIndex] + depthBias;

  const baseCorners = [
    [uMin, vMax],
    [uMax, vMax],
    [uMax, vMin],
    [uMin, vMin],
  ].map(([uValue, vValue]) => {
    const values = [center.x, center.y, center.z];
    values[axisIndex] = faceValue;
    values[uAxis] = uValue;
    values[vAxis] = vValue;
    return pivot.localToWorld(
      new THREE.Vector3(values[0], values[1], values[2]),
    );
  });

  return orderProjectionCornersForScreen(baseCorners);
}

function createProjectionFeedCard(item) {
  const card = document.createElement("article");
  card.className = "projection-overlay__feed-card";

  if (item.eyebrow) {
    const eyebrow = document.createElement("span");
    eyebrow.className = "projection-overlay__feed-eyebrow";
    eyebrow.textContent = item.eyebrow;
    card.appendChild(eyebrow);
  }

  if (item.title) {
    const title = document.createElement("h3");
    title.className = "projection-overlay__feed-title";
    title.textContent = item.title;
    card.appendChild(title);
  }

  if (item.imageSrc) {
    const media = document.createElement("figure");
    media.className = "projection-overlay__feed-media";
    const image = document.createElement("img");
    image.className = "projection-overlay__feed-image";
    image.src = item.imageSrc;
    image.alt =
      item.imageAlt || item.title || item.eyebrow || "Projected media";
    image.loading = "lazy";
    media.appendChild(image);
    if (item.caption) {
      const caption = document.createElement("figcaption");
      caption.className = "projection-overlay__feed-caption";
      caption.textContent = item.caption;
      media.appendChild(caption);
    }
    card.appendChild(media);
  }

  if (item.body) {
    const body = document.createElement("p");
    body.className = "projection-overlay__feed-copy";
    body.textContent = item.body;
    card.appendChild(body);
  }

  if (Array.isArray(item.stats) && item.stats.length > 0) {
    const stats = document.createElement("div");
    stats.className = "projection-overlay__feed-stats";
    item.stats.forEach((stat) => {
      const statNode = document.createElement("div");
      statNode.className = "projection-overlay__feed-stat";
      const value = document.createElement("strong");
      value.textContent = stat.value;
      const label = document.createElement("span");
      label.textContent = stat.label;
      statNode.appendChild(value);
      statNode.appendChild(label);
      stats.appendChild(statNode);
    });
    card.appendChild(stats);
  }

  if (Array.isArray(item.links) && item.links.length > 0) {
    const linkRow = document.createElement("div");
    linkRow.className = "projection-overlay__feed-links";
    item.links.forEach((link) => {
      const anchor = document.createElement("a");
      anchor.className = "projection-overlay__feed-link";
      anchor.href = link.href;
      anchor.textContent = link.label;
      if (link.external || /^https?:\/\//i.test(link.href)) {
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
      }
      linkRow.appendChild(anchor);
    });
    card.appendChild(linkRow);
  }

  return card;
}

function syncRuntimeProjectionFeed(entry, overlay) {
  const items = getProjectionFeedItems(overlay.label);
  if (!entry.feed || !entry.feedTrack) {
    return;
  }

  const signature = JSON.stringify(items);
  if (entry.feedSignature === signature) {
    return;
  }

  entry.feedTrack.textContent = "";
  for (let copyIndex = 0; copyIndex < 2; copyIndex += 1) {
    const column = document.createElement("div");
    column.className = "projection-overlay__feed-column";
    if (copyIndex > 0) {
      column.setAttribute("aria-hidden", "true");
    }
    items.forEach((item) => {
      column.appendChild(createProjectionFeedCard(item));
    });
    entry.feedTrack.appendChild(column);
  }

  entry.feedSignature = signature;
}

function getRuntimeProjectionRegistry() {
  const registry = {
    "Rotor + Outer (Linked)": linkedRotorOuterState,
    Rotor: rotorModelState,
    "Outer Ring": outerRingState,
    "Main Model": modelState,
    "Corporate Agent": corporateAgentState,
  };

  AUXILIARY_GLB_STATES.forEach((entry) => {
    registry[entry.label] = entry;
  });

  return registry;
}

function getProjectionOverlayDom(label) {
  return (
    Array.from(document.querySelectorAll(".projection-overlay")).find(
      (node) => node.dataset.projectionLabel === label,
    ) || null
  );
}

function getProjectionRendererBounds() {
  return renderer?.domElement?.getBoundingClientRect() || null;
}

function projectProjectionCornerToScreen(corner) {
  const bounds = getProjectionRendererBounds();
  if (!bounds || !Array.isArray(corner) || corner.length < 3) {
    return null;
  }

  const point = new THREE.Vector3(corner[0], corner[1], corner[2]);
  const ndc = point.project(camera);
  if (
    !Number.isFinite(ndc.x) ||
    !Number.isFinite(ndc.y) ||
    ndc.z < -1.25 ||
    ndc.z > 1.25
  ) {
    return null;
  }

  return new THREE.Vector2(
    bounds.left + (ndc.x * 0.5 + 0.5) * bounds.width,
    bounds.top + (1 - (ndc.y * 0.5 + 0.5)) * bounds.height,
  );
}

function sampleProjectionFlowOpacity(
  flowOpacity,
  flowProgress,
  easing = "linear",
) {
  const pairs = FLOW_CONTACT_POINTS.map((point, index) => ({
    t: point,
    opacity: clamp01(
      Number(flowOpacity?.[index + 1] ?? flowOpacity?.[String(index + 1)] ?? 1),
    ),
  }));

  if (flowProgress <= pairs[0].t) {
    return pairs[0].opacity;
  }

  const last = pairs[pairs.length - 1];
  if (flowProgress >= last.t) {
    return last.opacity;
  }

  for (let index = 0; index < pairs.length - 1; index += 1) {
    const a = pairs[index];
    const b = pairs[index + 1];
    if (flowProgress < a.t || flowProgress > b.t) {
      continue;
    }
    if (easing === "constant") {
      return a.opacity;
    }
    const alpha = (flowProgress - a.t) / Math.max(b.t - a.t, 0.000001);
    const eased = easing === "smooth" ? alpha * alpha * (3 - 2 * alpha) : alpha;
    return THREE.MathUtils.lerp(a.opacity, b.opacity, eased);
  }

  return last.opacity;
}

function ensureRuntimeProjectionEntry(overlay) {
  let entry = runtimeProjectionState.entries.get(overlay.label);
  if (entry) {
    entry.overlay = overlay;
    entry.root.dataset.devContainerId = `projection-${overlay.label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")}`;
    entry.root.dataset.devContainerKind = "projection";
    return entry;
  }

  let root = getProjectionOverlayDom(overlay.label);
  if (!root) {
    root = document.createElement("div");
    root.className = "projection-overlay";
    root.dataset.projectionLabel = overlay.label;
    document.body.appendChild(root);
  }
  root.dataset.devContainerId = `projection-${overlay.label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
  root.dataset.devContainerKind = "projection";

  root.textContent = "";

  const panel = document.createElement("div");
  panel.className = "projection-overlay__panel";
  const media = document.createElement("div");
  media.className = "projection-overlay__media";
  const image = document.createElement("img");
  image.className = "projection-overlay__image";
  image.alt = overlay.text || overlay.label;
  media.appendChild(image);
  const feed = document.createElement("div");
  feed.className = "projection-overlay__feed";
  const feedTrack = document.createElement("div");
  feedTrack.className = "projection-overlay__feed-track";
  feed.appendChild(feedTrack);
  const text = document.createElement("div");
  text.className = "projection-overlay__text";
  panel.appendChild(media);
  panel.appendChild(feed);
  panel.appendChild(text);

  entry = {
    overlay,
    root,
    panel,
    media,
    image,
    feed,
    feedTrack,
    feedSignature: "",
    text,
    devBar: null,
    closeBtn: null,
    editTimer: 0,
    typing: {
      active: false,
      count: 0,
      lastMs: 0,
    },
  };

  let devBar = null;
  let closeBtn = null;
  if (import.meta.env.DEV) {
    panel.style.pointerEvents = "auto";
    devBar = document.createElement("div");
    devBar.className = "projection-overlay__devbar";
    devBar.style.position = "absolute";
    devBar.style.top = "-14px";
    devBar.style.right = "-14px";
    devBar.style.display = "flex";
    devBar.style.gap = "6px";
    devBar.style.zIndex = "4";

    closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "projection-overlay__close";
    closeBtn.textContent = "×";
    closeBtn.title = `Remove ${overlay.label}`;
    closeBtn.style.width = "28px";
    closeBtn.style.height = "28px";
    closeBtn.style.border = "1px solid rgba(255, 176, 94, 0.86)";
    closeBtn.style.borderRadius = "999px";
    closeBtn.style.background = "rgba(14, 18, 20, 0.92)";
    closeBtn.style.color = "rgba(255, 214, 170, 0.98)";
    closeBtn.style.font = '700 18px/1 "Teko", sans-serif';
    closeBtn.style.cursor = "pointer";
    closeBtn.style.boxShadow = "0 0 16px rgba(255, 145, 57, 0.28)";
    closeBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      window.dispatchEvent(
        new CustomEvent("dev-projection-overlay-action", {
          detail: { type: "delete", label: overlay.label },
        }),
      );
    });
    devBar.appendChild(closeBtn);
    panel.appendChild(devBar);

    text.contentEditable = "true";
    text.spellcheck = false;
    text.style.pointerEvents = "auto";
    text.style.cursor = "text";
    text.addEventListener("focus", () => {
      window.dispatchEvent(
        new CustomEvent("dev-projection-overlay-action", {
          detail: { type: "select", label: overlay.label },
        }),
      );
    });
    text.addEventListener("input", () => {
      window.clearTimeout(entry.editTimer);
      entry.editTimer = window.setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("dev-projection-overlay-action", {
            detail: {
              type: "update-text",
              label: overlay.label,
              text: text.textContent || "",
            },
          }),
        );
      }, 140);
    });
    text.addEventListener("blur", () => {
      window.dispatchEvent(
        new CustomEvent("dev-projection-overlay-action", {
          detail: {
            type: "update-text",
            label: overlay.label,
            text: text.textContent || "",
          },
        }),
      );
    });
  }
  root.appendChild(panel);

  entry.devBar = devBar;
  entry.closeBtn = closeBtn;

  runtimeProjectionState.entries.set(overlay.label, entry);
  return entry;
}

function getRuntimeProjectionText(entry, visibleEnough) {
  const overlay = entry.overlay;
  const style = overlay.style || {};
  const fullText = overlay.text || "";
  if (import.meta.env.DEV && document.activeElement === entry.text) {
    return entry.text.textContent || fullText;
  }
  const enableTyping = style.textAnimation !== false;
  const speed = Math.max(Number(style.textAnimationSpeed ?? 28), 1);

  if (!enableTyping || !fullText) {
    entry.typing.active = false;
    return fullText;
  }

  const now = performance.now();
  if (visibleEnough) {
    if (!entry.typing.active) {
      entry.typing.active = true;
      entry.typing.count = 0;
      entry.typing.lastMs = now;
    }
    const dt = Math.max(0, now - (entry.typing.lastMs || now)) / 1000;
    entry.typing.lastMs = now;
    entry.typing.count = Math.min(
      fullText.length,
      entry.typing.count + dt * speed,
    );
    return fullText.slice(0, Math.floor(entry.typing.count));
  }

  entry.typing.active = false;
  entry.typing.lastMs = now;
  return fullText;
}

function applyProjectionQuadTransform(root, corners2d, parallaxX, parallaxY) {
  const [tl, tr, br, bl] = corners2d;
  const topVec = new THREE.Vector2().subVectors(tr, tl);
  const leftVec = new THREE.Vector2().subVectors(bl, tl);
  const width = Math.max(topVec.length(), 1);
  const height = Math.max(leftVec.length(), 1);

  const polygonArea =
    Math.abs(
      tl.x * tr.y -
        tr.x * tl.y +
        tr.x * br.y -
        br.x * tr.y +
        br.x * bl.y -
        bl.x * br.y +
        bl.x * tl.y -
        tl.x * bl.y,
    ) * 0.5;
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 2 ||
    height < 2 ||
    !Number.isFinite(polygonArea) ||
    polygonArea < 6
  ) {
    return null;
  }

  const a = topVec.x / width;
  const b = topVec.y / width;
  const c = leftVec.x / height;
  const d = leftVec.y / height;
  const tx = tl.x + parallaxX;
  const ty = tl.y + parallaxY;

  const determinant = a * d - b * c;
  const toLocalPercent = (point) => {
    if (Math.abs(determinant) < 0.000001) {
      return { x: 0, y: 0 };
    }
    const dx = point.x - tl.x;
    const dy = point.y - tl.y;
    const localX = (d * dx - c * dy) / determinant;
    const localY = (-b * dx + a * dy) / determinant;
    return {
      x: (localX / width) * 100,
      y: (localY / height) * 100,
    };
  };

  if (Math.abs(determinant) < 0.000001) {
    return null;
  }

  root.style.display = "block";
  root.style.width = `${width.toFixed(2)}px`;
  root.style.height = `${height.toFixed(2)}px`;
  root.style.transformOrigin = "0 0";
  root.style.transform = `matrix(${a.toFixed(6)}, ${b.toFixed(6)}, ${c.toFixed(6)}, ${d.toFixed(6)}, ${tx.toFixed(2)}, ${ty.toFixed(2)})`;
  root.style.clipPath = `polygon(${corners2d
    .map((point) => toLocalPercent(point))
    .map((point) => `${point.x.toFixed(2)}% ${point.y.toFixed(2)}%`)
    .join(",")})`;

  return { width, height };
}

function updateRuntimeProjectionOverlays() {
  const runtimeOverlays = Array.isArray(DEV_SCENE_PROJECTION_OVERLAYS)
    ? DEV_SCENE_PROJECTION_OVERLAYS
    : [];

  if (runtimeOverlays.length === 0) {
    runtimeProjectionState.entries.forEach((entry) => {
      entry.root.style.display = "none";
    });
    return;
  }

  const flowProgress = getEffectiveScrollProgress();
  const registry = getRuntimeProjectionRegistry();
  const activeLabels = new Set(runtimeOverlays.map((overlay) => overlay.label));

  runtimeProjectionState.entries.forEach((entry, label) => {
    if (activeLabels.has(label)) {
      return;
    }

    entry.root.style.display = "none";
    if (entry.root.parentNode) {
      entry.root.parentNode.removeChild(entry.root);
    }
    runtimeProjectionState.entries.delete(label);
  });

  runtimeOverlays.forEach((overlay) => {
    const entry = ensureRuntimeProjectionEntry(overlay);
    const style = overlay.style || {};
    const state = getProjectionTargetState(overlay, registry);
    const rawCorners =
      overlay.autoFit && state
        ? getAutoFitProjectionCorners(overlay, state)
        : (overlay.corners || []).map((corner) =>
            corner?.isVector3
              ? corner.clone()
              : new THREE.Vector3(corner[0], corner[1], corner[2]),
          );
    const corners2d = rawCorners.map(projectProjectionCornerToScreen);
    const hasInvalidCorner =
      corners2d.length < 4 || corners2d.some((point) => !point);

    if (hasInvalidCorner || (state?.pivot && !state.pivot.visible)) {
      entry.root.style.display = "none";
      return;
    }

    const opacity = sampleProjectionFlowOpacity(
      overlay.flowOpacity,
      flowProgress,
      style.easing || "linear",
    );

    if (opacity <= 0.01) {
      entry.root.style.display = "none";
      return;
    }

    const parallaxX = parallaxState.currentX * Number(style.parallaxX ?? 0);
    const parallaxY = parallaxState.currentY * Number(style.parallaxY ?? 0);
    const quadLayout = applyProjectionQuadTransform(
      entry.root,
      corners2d,
      parallaxX,
      parallaxY,
    );
    if (!quadLayout) {
      entry.root.style.display = "none";
      return;
    }

    const { width, height } = quadLayout;
    const xs = corners2d.map((point) => point.x);
    const ys = corners2d.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const visibleEnough =
      opacity > 0.2 &&
      maxX >= 0 &&
      maxY >= 0 &&
      minX <= window.innerWidth &&
      minY <= window.innerHeight;
    const contentMode = String(
      style.contentMode || overlay.contentMode || "text",
    ).toLowerCase();
    const layoutMode = String(
      style.layout || overlay.layout || "text",
    ).toLowerCase();
    const assetSrc = style.assetSrc || overlay.assetSrc || "";
    const showImage =
      !!assetSrc && (contentMode === "image" || contentMode === "both");
    const showFeed = layoutMode === "feed";
    const showText = !showFeed && contentMode !== "image";
    const bgColor = new THREE.Color(style.bgColor || "#061218");

    entry.root.style.opacity = opacity.toFixed(4);
    entry.root.style.setProperty(
      "--projection-scroll-duration",
      `${Math.max(Number(style.scrollSeconds ?? 28), 8).toFixed(2)}s`,
    );
    entry.panel.style.width = `${width.toFixed(2)}px`;
    entry.panel.style.height = `${height.toFixed(2)}px`;
    entry.panel.style.color = style.textColor || "#eafaff";
    entry.panel.style.background = `rgba(${Math.round(bgColor.r * 255)}, ${Math.round(bgColor.g * 255)}, ${Math.round(bgColor.b * 255)}, ${Number(style.bgAlpha ?? 0.32).toFixed(3)})`;
    entry.panel.style.borderColor = visibleEnough
      ? "rgba(156, 242, 255, 0.55)"
      : "rgba(156, 242, 255, 0.28)";
    entry.root.classList.toggle("is-feed-layout", showFeed);
    entry.feed.style.display = showFeed ? "block" : "none";
    if (showFeed) {
      syncRuntimeProjectionFeed(entry, overlay);
      entry.feedTrack.style.animationPlayState = visibleEnough
        ? "running"
        : "paused";
    }
    entry.text.style.display = showText ? "block" : "none";
    entry.text.style.fontSize = `${Math.max(Number(style.fontSize ?? 17), 8)}px`;
    entry.text.style.padding = `${Math.max(Number(style.padding ?? 10), 0)}px`;
    entry.text.textContent = getRuntimeProjectionText(entry, visibleEnough);
    entry.media.style.display = showImage ? "block" : "none";
    if (showImage) {
      if (entry.image.getAttribute("src") !== assetSrc) {
        entry.image.setAttribute("src", assetSrc);
      }
      entry.image.setAttribute(
        "alt",
        style.assetAlt || overlay.text || overlay.label,
      );
    }
  });
}

function getActiveGltfFocusPoint() {
  const focus = new THREE.Vector3();
  const pivots = [
    modelState.pivot,
    rotorModelState.pivot,
    outerRingState.pivot,
    corporateAgentState.pivot,
    coreWireframeState.pivot,
    ...AUXILIARY_GLB_STATES.map((entry) => entry.pivot),
  ].filter(Boolean);

  if (pivots.length === 0) {
    return null;
  }

  pivots.forEach((pivot) =>
    focus.add(pivot.getWorldPosition(new THREE.Vector3())),
  );
  focus.multiplyScalar(1 / pivots.length);
  return focus;
}

function makeFlowTextCanvasTexture(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(6, 18, 35, 0.72)";
  ctx.fillRect(16, 26, canvas.width - 32, canvas.height - 52);
  ctx.strokeStyle = "rgba(76, 212, 255, 0.85)";
  ctx.lineWidth = 5;
  ctx.strokeRect(16, 26, canvas.width - 32, canvas.height - 52);
  ctx.font = "700 88px Teko, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#d5f5ff";
  ctx.fillText(text, canvas.width * 0.5, canvas.height * 0.5);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function initFlowPanels() {
  if (!ENABLE_FLOW_PANELS) {
    destroyFlowPanels();
    return;
  }

  if (flowPanelState.group) {
    return;
  }

  const labels = [
    "ABOUT",
    "RESEARCH",
    "ARCHIVE",
    "RESOURCES",
    "TIMELINE",
    "PROJECTS",
    "SYSTEM",
    "CONTACT",
  ];

  const group = new THREE.Group();
  group.position.set(0, -3.9, -6.6);
  scene.add(group);
  flowPanelState.group = group;

  labels.forEach((label, idx) => {
    const texture = makeFlowTextCanvasTexture(label);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0,
      color: 0xffffff,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.82), material);
    const offsetX = THREE.MathUtils.lerp(-5.2, 5.2, idx / (labels.length - 1));
    mesh.position.set(offsetX, Math.sin(idx * 0.6) * 0.32, 0);
    group.add(mesh);
    flowPanelState.panels.push({
      mesh,
      material,
      anchor: FLOW_CONTACT_POINTS[idx],
      seed: idx * 0.47,
    });
  });
}

function updateFlowPanels(flowProgress, elapsed) {
  if (!ENABLE_FLOW_PANELS) {
    return;
  }

  if (!flowPanelState.group || flowPanelState.panels.length === 0) {
    return;
  }

  flowPanelState.group.lookAt(camera.position);
  flowPanelState.panels.forEach((entry) => {
    const dist = Math.abs(flowProgress - entry.anchor);
    const reveal = clamp01(1 - dist / 0.11);
    const pulse =
      0.78 + (Math.sin(elapsed * 3.2 + entry.seed) * 0.5 + 0.5) * 0.22;
    entry.material.opacity += (reveal * pulse - entry.material.opacity) * 0.18;
    entry.mesh.position.z = reveal * 0.45;
    entry.mesh.scale.setScalar(1 + reveal * 0.08);
  });
}

function easeValue(t, mode) {
  const x = clamp01(t);
  if (mode === "smooth") {
    return x * x * (3 - 2 * x);
  }
  if (mode === "linear") {
    return x;
  }
  if (mode === "expoIn") {
    return x <= 0 ? 0 : Math.pow(2, 10 * (x - 1));
  }
  if (mode === "expoOut") {
    return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x);
  }
  if (mode === "expoInOut") {
    if (x === 0 || x === 1) {
      return x;
    }
    return x < 0.5
      ? Math.pow(2, 20 * x - 10) / 2
      : (2 - Math.pow(2, -20 * x + 10)) / 2;
  }
  return x * x * (3 - 2 * x);
}

function stylizeModelAsNanomaterial(root, options = {}) {
  const glowStrength =
    typeof options.glowStrength === "number" ? options.glowStrength : 1;
  const baseOpacity =
    typeof options.baseOpacity === "number" ? options.baseOpacity : 0.5;
  const emissiveIntensity =
    typeof options.emissiveIntensity === "number"
      ? options.emissiveIntensity
      : 0.72;
  const wireOpacity =
    typeof options.wireOpacity === "number" ? options.wireOpacity : 0.22;

  root.traverse((node) => {
    if (!node.isMesh) {
      return;
    }

    const materials = Array.isArray(node.material)
      ? node.material
      : [node.material];

    materials.forEach((material) => {
      if (!material) {
        return;
      }

      material.transparent = true;
      material.opacity = baseOpacity;
      material.depthWrite = false;
      material.metalness = 0.9;
      material.roughness = 0.14;
      material.emissive = new THREE.Color(0x66b9ff);
      material.emissiveIntensity = emissiveIntensity;
      material.color = new THREE.Color(0xd7f0ff);
      material.onBeforeCompile = (shader) => {
        shader.uniforms.uHoloTime = { value: 0 };
        shader.uniforms.uHoloOpacity = { value: 0 };
        shader.uniforms.uHoloGlow = { value: glowStrength };
        shader.uniforms.uHoloRenderScale = { value: 480 / 720 };
        shader.uniforms.uVoxelSize = { value: 0.13 };
        shader.uniforms.uReduceMotion = { value: visualSafetyActive ? 1 : 0 };

        shader.vertexShader = shader.vertexShader.replace(
          "#include <common>",
          `#include <common>
          varying vec3 vHoloWorldPos;`,
        );

        shader.vertexShader = shader.vertexShader.replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          vHoloWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
        );

        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <common>",
          `#include <common>
          uniform float uHoloTime;
          uniform float uHoloOpacity;
          uniform float uHoloGlow;
          uniform float uHoloRenderScale;
          uniform float uVoxelSize;
          uniform float uReduceMotion;
          varying vec3 vHoloWorldPos;

          float holoHash(vec2 p) {
            p = fract(p * vec2(0.1031, 0.1030));
            p += dot(p, p.yx + 33.33);
            return fract((p.x + p.y) * p.x);
          }

          float holoNoise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            float a = holoHash(i);
            float b = holoHash(i + vec2(1.0, 0.0));
            float c = holoHash(i + vec2(0.0, 1.0));
            float d = holoHash(i + vec2(1.0, 1.0));
            return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
          }`,
        );

        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <dithering_fragment>",
          `
          float renderScale = max(uHoloRenderScale, 0.1);
          vec2 lowResCoord = floor(gl_FragCoord.xy * renderScale) / renderScale;

          vec3 voxelPos = floor(vHoloWorldPos / uVoxelSize + 0.5) * uVoxelSize;
          vec3 voxelCell = abs(fract(vHoloWorldPos / uVoxelSize) - 0.5);
          float voxelCore = 1.0 - smoothstep(0.26, 0.5, max(voxelCell.x, max(voxelCell.y, voxelCell.z)));

          float driftNoiseXY = holoNoise(vec2(voxelPos.x * 8.5, voxelPos.y * 8.5 + uHoloTime * 3.1));
          float driftNoiseYZ = holoNoise(vec2(voxelPos.y * 8.5, voxelPos.z * 8.5 + uHoloTime * 2.6));
          float driftNoiseXZ = holoNoise(vec2(voxelPos.x * 8.5, voxelPos.z * 8.5 + uHoloTime * 2.9));
          float driftNoise = (driftNoiseXY + driftNoiseYZ + driftNoiseXZ) / 3.0;

          float scanLines = mix(step(0.64, fract(lowResCoord.y * 0.18 + uHoloTime * 5.4)), 1.0, uReduceMotion);
          float zeroGaps = mix(step(0.5, fract(lowResCoord.y * 0.068 + uHoloTime * 1.7)), 1.0, uReduceMotion);
          float noiseMask = smoothstep(0.2, 0.86, driftNoise);
          float holoAlpha = scanLines * zeroGaps * noiseMask * (0.35 + voxelCore * 0.65) * uHoloOpacity;
          if (holoAlpha < 0.05) discard;

          gl_FragColor.rgb += vec3(0.08, 0.25, 0.55) * (0.22 + driftNoise * 0.42 + voxelCore * 0.28) * uHoloGlow;
          gl_FragColor.a *= holoAlpha;
          #include <dithering_fragment>
          `,
        );

        hologramUniformSets.push(shader.uniforms);
      };
      material.customProgramCacheKey = () => "holo-v4-opacity";
      material.needsUpdate = true;
    });

    const wireGeo = new THREE.EdgesGeometry(node.geometry, 33);
    const wireMat = new THREE.LineBasicMaterial({
      color: 0xa6dfff,
      transparent: true,
      opacity: wireOpacity,
      depthTest: false,
    });
    const wire = new THREE.LineSegments(wireGeo, wireMat);
    node.add(wire);
  });
}

function copyRuntimeMaterialValue(target, source, key) {
  if (!source || !(key in source) || !(key in target)) {
    return;
  }
  target[key] = source[key];
}

function copyRuntimeMaterialColor(target, source, key, fallback) {
  if (!(key in target)) {
    return;
  }
  if (source?.[key]?.isColor) {
    target[key] = source[key].clone();
    return;
  }
  if (target[key]?.isColor && fallback) {
    target[key].set(fallback);
  }
}

function copyRuntimeMaterialMap(target, source, key) {
  if (source?.[key] && key in target) {
    target[key] = source[key];
  }
}

function buildRuntimePresetMaterial(sourceMat, node, preset) {
  const material =
    preset === "glass"
      ? new THREE.MeshPhysicalMaterial()
      : new THREE.MeshStandardMaterial();

  copyRuntimeMaterialColor(material, sourceMat, "color", "#ffffff");
  copyRuntimeMaterialColor(material, sourceMat, "emissive", "#000000");

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
  ].forEach((key) => copyRuntimeMaterialMap(material, sourceMat, key));

  if (sourceMat?.normalScale?.isVector2 && "normalScale" in material) {
    material.normalScale = sourceMat.normalScale.clone();
  }
  if (
    sourceMat?.clearcoatNormalScale?.isVector2 &&
    "clearcoatNormalScale" in material
  ) {
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
  ].forEach((key) => copyRuntimeMaterialValue(material, sourceMat, key));

  material.name = sourceMat?.name || material.name;
  material.transparent = !!sourceMat?.transparent;
  material.emissiveIntensity =
    typeof sourceMat?.emissiveIntensity === "number"
      ? sourceMat.emissiveIntensity
      : 0;
  material.metalness =
    typeof sourceMat?.metalness === "number" ? sourceMat.metalness : 0;
  material.roughness =
    typeof sourceMat?.roughness === "number" ? sourceMat.roughness : 1;

  if ("skinning" in material) {
    material.skinning = !!node?.isSkinnedMesh;
  }
  if ("morphTargets" in material) {
    material.morphTargets = !!node?.morphTargetInfluences;
  }
  if ("morphNormals" in material) {
    material.morphNormals = !!node?.morphTargetInfluences;
  }

  if (preset === "glass") {
    material.transparent = true;
    material.opacity = Math.min(
      typeof sourceMat?.opacity === "number" ? sourceMat.opacity : 0.3,
      0.35,
    );
    material.depthWrite = false;
    material.metalness = 0;
    material.roughness = 0.08;
    material.transmission = 0.92;
    material.ior = 1.45;
    material.thickness = 0.8;
    material.clearcoat = 1;
    material.clearcoatRoughness = 0.04;
    material.envMapIntensity = 1.2;
  }

  material.userData = {
    ...(sourceMat?.userData || {}),
    __devMaterialPreset: preset,
  };
  material.needsUpdate = true;
  return material;
}

function applySerializedMaterialEntryToRoot(root, entry) {
  if (!root || !entry?.material) {
    return;
  }

  root.traverse((node) => {
    if (!node.isMesh || !node.material) {
      return;
    }

    const applyOverrides = (material) => {
      if (!material) {
        return material;
      }

      const sourceMaterial =
        entry.preset && entry.preset !== "custom" && entry.preset !== "original"
          ? buildRuntimePresetMaterial(material, node, entry.preset)
          : typeof material.clone === "function"
            ? material.clone()
            : material;

      const props = entry.material;
      sourceMaterial.wireframe = !!props.wireframe;
      if (typeof props.opacity === "number") {
        sourceMaterial.opacity = props.opacity;
      }
      sourceMaterial.transparent = !!props.transparent;
      sourceMaterial.depthWrite = !!props.depthWrite;
      if (sourceMaterial.color?.isColor && props.color) {
        sourceMaterial.color.set(props.color);
      }
      if (sourceMaterial.emissive?.isColor && props.emissiveColor) {
        sourceMaterial.emissive.set(props.emissiveColor);
      }
      if (
        typeof sourceMaterial.emissiveIntensity === "number" &&
        typeof props.emissiveIntensity === "number"
      ) {
        sourceMaterial.emissiveIntensity = props.emissiveIntensity;
      }
      if (
        typeof sourceMaterial.metalness === "number" &&
        typeof props.metalness === "number"
      ) {
        sourceMaterial.metalness = props.metalness;
      }
      if (
        typeof sourceMaterial.roughness === "number" &&
        typeof props.roughness === "number"
      ) {
        sourceMaterial.roughness = props.roughness;
      }
      if (
        typeof sourceMaterial.transmission === "number" &&
        typeof props.transmission === "number"
      ) {
        sourceMaterial.transmission = props.transmission;
      }
      if (typeof sourceMaterial.ior === "number" && typeof props.ior === "number") {
        sourceMaterial.ior = props.ior;
      }
      if (
        typeof sourceMaterial.thickness === "number" &&
        typeof props.thickness === "number"
      ) {
        sourceMaterial.thickness = props.thickness;
      }
      if (
        typeof sourceMaterial.clearcoat === "number" &&
        typeof props.clearcoat === "number"
      ) {
        sourceMaterial.clearcoat = props.clearcoat;
      }
      sourceMaterial.userData = {
        ...(sourceMaterial.userData || {}),
      };
      if (entry.preset && entry.preset !== "custom") {
        sourceMaterial.userData.__devMaterialPreset = entry.preset;
      }
      sourceMaterial.needsUpdate = true;
      return sourceMaterial;
    };

    node.material = Array.isArray(node.material)
      ? node.material.map((material) => applyOverrides(material))
      : applyOverrides(node.material);
  });
}

function updateHologramShaderTime(elapsed) {
  hologramUniformSets.forEach((uniforms) => {
    if (uniforms.uHoloTime) {
      uniforms.uHoloTime.value = elapsed;
    }
    if (uniforms.uReduceMotion) {
      uniforms.uReduceMotion.value = visualSafetyActive ? 1 : 0;
    }
  });
}

function cleanLooseModelArtifacts(root, animations = []) {
  const animatedNodes = new Set();
  animations.forEach((clip) => {
    clip.tracks.forEach((track) => {
      const path = track.name || "";
      const nodeName = path.split(".")[0];
      if (nodeName) {
        animatedNodes.add(nodeName);
      }
    });
  });

  root.traverse((node) => {
    if (!node.isMesh) {
      return;
    }

    if (node.isSkinnedMesh) {
      const bones =
        node.skeleton && Array.isArray(node.skeleton.bones)
          ? node.skeleton.bones
          : [];
      const hasAnimatedBone = bones.some(
        (bone) => bone && bone.name && animatedNodes.has(bone.name),
      );

      if (!hasAnimatedBone) {
        node.visible = false;
      }

      return;
    }

    const s = node.scale;
    const hasLocalTransform =
      node.position.lengthSq() > 0.0000001 ||
      node.rotation.toVector3(new THREE.Vector3()).lengthSq() > 0.0000001 ||
      Math.abs(s.x - 1) > 0.000001 ||
      Math.abs(s.y - 1) > 0.000001 ||
      Math.abs(s.z - 1) > 0.000001;
    const hasAnimatedTransform = node.name && animatedNodes.has(node.name);

    const geometry = node.geometry;
    if (!geometry) {
      return;
    }
    geometry.computeBoundingSphere();
    const radius = geometry.boundingSphere ? geometry.boundingSphere.radius : 0;
    const invalidOrTinyGeo = !Number.isFinite(radius) || radius < 0.0006;

    if (!hasLocalTransform && !hasAnimatedTransform) {
      const mats = Array.isArray(node.material)
        ? node.material
        : [node.material];
      mats.forEach((material) => {
        if (!material) {
          return;
        }
        material.transparent = true;
        material.opacity = 0;
        material.depthWrite = false;
        material.needsUpdate = true;
      });
    }

    if (invalidOrTinyGeo) {
      node.visible = false;
    }
  });
}

function filterToAnimatedModelBranch(root, animations = []) {
  if (!root || !animations || animations.length === 0) {
    return;
  }

  const animatedNodes = new Set();
  animations.forEach((clip) => {
    clip.tracks.forEach((track) => {
      const path = track.name || "";
      const nodeName = path.split(".")[0];
      if (nodeName) {
        animatedNodes.add(nodeName);
      }
    });
  });

  if (animatedNodes.size === 0) {
    return;
  }

  const keepNodes = new Set();
  root.traverse((node) => {
    const hasAnimatedName = Boolean(node.name && animatedNodes.has(node.name));
    const hasAnimatedAncestor = (() => {
      let p = node.parent;
      while (p) {
        if (p.name && animatedNodes.has(p.name)) {
          return true;
        }
        p = p.parent;
      }
      return false;
    })();

    let hasAnimatedBone = false;
    if (
      node.isSkinnedMesh &&
      node.skeleton &&
      Array.isArray(node.skeleton.bones)
    ) {
      hasAnimatedBone = node.skeleton.bones.some(
        (bone) => bone && bone.name && animatedNodes.has(bone.name),
      );
    }

    if (hasAnimatedName || hasAnimatedAncestor || hasAnimatedBone) {
      keepNodes.add(node);
    }
  });

  Array.from(keepNodes).forEach((node) => {
    let p = node.parent;
    while (p) {
      keepNodes.add(p);
      p = p.parent;
    }
  });

  root.traverse((node) => {
    if (!node.isMesh) {
      return;
    }

    if (!keepNodes.has(node)) {
      node.visible = false;
    }
  });
}

function applyModelFlowBehavior(elapsed) {
  if (!modelState.enabled || !modelState.pivot) {
    return;
  }

  const progress = clamp01(modelState.scrollProgress);
  const preset = getDevSceneTransformPreset(modelState.codeRef, {
    position: [-0.04, -9, -8],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    visible: true,
  });

  if (modelState.mixer && modelState.clipDuration > 0) {
    if (modelState.primaryAction) {
      modelState.primaryAction.enabled = true;
      modelState.primaryAction.paused = false;
    }

    const duration = modelState.clipDuration;
    const loopStart = duration * SECTION_FLOW.projectsClipNorm;
    const outroLength = Math.max(duration - loopStart, 0.001);
    let desiredTime = 0;

    if (progress < SECTION_FLOW.morphStart) {
      desiredTime = duration * 0.05;
    } else if (progress < SECTION_FLOW.morphEnd) {
      const morphT = clamp01(
        (progress - SECTION_FLOW.morphStart) /
          Math.max(SECTION_FLOW.morphEnd - SECTION_FLOW.morphStart, 0.000001),
      );
      desiredTime =
        duration *
        THREE.MathUtils.lerp(
          0.05,
          SECTION_FLOW.atomHoldClipNorm,
          easeValue(morphT, "smooth"),
        );
    } else if (progress < SECTION_FLOW.projects) {
      desiredTime = duration * SECTION_FLOW.atomHoldClipNorm;
    } else if (progress < SECTION_FLOW.contact) {
      const projectsT = clamp01(
        (progress - SECTION_FLOW.projects) /
          Math.max(SECTION_FLOW.contact - SECTION_FLOW.projects, 0.000001),
      );
      const projectsEase = easeValue(projectsT, "expoInOut");
      const clipNorm = THREE.MathUtils.lerp(
        SECTION_FLOW.atomHoldClipNorm,
        SECTION_FLOW.projectsClipNorm,
        projectsEase,
      );
      desiredTime = duration * clipNorm;
    } else {
      desiredTime =
        loopStart + ((elapsed * SECTION_FLOW.tailLoopSpeed) % outroLength);
    }

    modelState.mixer.setTime(desiredTime);
  }

  const projectsT = clamp01(
    (progress - SECTION_FLOW.projects) /
      Math.max(SECTION_FLOW.contact - SECTION_FLOW.projects, 0.000001),
  );
  const levitateY = Math.sin(elapsed * 1.25) * (0.008 + projectsT * 0.02);
  const levitateYaw = Math.sin(elapsed * 0.85) * (0.005 + projectsT * 0.015);
  const globalT = clamp01(
    (progress - SECTION_FLOW.uiux) /
      Math.max(SECTION_FLOW.end - SECTION_FLOW.uiux, 0.000001),
  );
  const offsetX = preset.position[0] + globalT * 0.12;
  const researchT = clamp01(
    (progress - SECTION_FLOW.research) /
      Math.max(SECTION_FLOW.projects - SECTION_FLOW.research, 0.000001),
  );
  const offsetY = preset.position[1] + projectsT * 1.4 + levitateY;
  const offsetZ = THREE.MathUtils.lerp(
    preset.position[2],
    preset.position[2] - 24.0,
    globalT,
  );
  const yaw = preset.rotation[1] + 0.12 + globalT * 0.06 + levitateYaw;
  const manualLocks = getManualAxisLocks(modelState);
  if (!manualLocks.position.x) {
    modelState.pivot.position.x +=
      (offsetX - modelState.pivot.position.x) * 0.38;
  }
  if (!manualLocks.position.y) {
    modelState.pivot.position.y +=
      (offsetY - modelState.pivot.position.y) * 0.18;
  }
  if (!manualLocks.position.z) {
    modelState.pivot.position.z +=
      (offsetZ - modelState.pivot.position.z) * 0.16;
  }
  if (!manualLocks.rotation.y) {
    modelState.pivot.rotation.y += (yaw - modelState.pivot.rotation.y) * 0.14;
  }

  const holoOpacity = clamp01(progress / Math.max(SECTION_FLOW.end, 0.000001));
  hologramUniformSets.forEach((u) => {
    if (u.uHoloOpacity)
      u.uHoloOpacity.value += (holoOpacity - u.uHoloOpacity.value) * 0.08;
  });
  modelState.pivot.traverse((obj) => {
    if (obj.isLine && obj.material) obj.material.opacity = holoOpacity * 0.22;
  });
}

function applyParticleViewportSize() {
  const width = Math.max(1, Math.round(window.innerWidth));
  const height = Math.max(1, Math.round(window.innerHeight));

  if (
    width === viewportResizeState.width &&
    height === viewportResizeState.height
  ) {
    return false;
  }

  viewportResizeState.width = width;
  viewportResizeState.height = height;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  composer.setSize(width, height);
  bloomPass.setSize(width, height);

  return true;
}

function applyModelViewportSize() {
  // Model now renders in the global particle scene/canvas.
}

async function initRotorViewer() {
  const modelSrc = ROTOR_MODEL_SRC;
  if (!modelSrc) {
    rotorModelState.enabled = false;
    return;
  }

  if (rotorModelState.requested) {
    return;
  }
  rotorModelState.requested = true;

  const pivot = new THREE.Group();
  scene.add(pivot);

  rotorModelState.pivot = pivot;
  rotorModelState.enabled = true;
  applyDevScenePivotPreset(rotorModelState, {
    position: [62, -9, -8.2],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    visible: true,
  });

  const handleLoad = (gltf) => {
    const root = gltf.scene;
    pivot.add(root);
    rotorModelState.root = root;

    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    root.position.sub(center);

    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    root.scale.setScalar(200.0 / maxDim);

    const fixedBox = new THREE.Box3().setFromObject(root);
    const fixedCenter = new THREE.Vector3();
    fixedBox.getCenter(fixedCenter);
    root.position.sub(fixedCenter);
    root.position.y += 0.15;
    root.position.x -= 0.15;
    root.position.z -= 0.55;

    rotorModelState.ringMeshes = [root.getObjectByName("Circle004")].filter(
      Boolean,
    );
    rotorModelState.coreMesh = null;
    rotorModelState.pulseMesh = rotorModelState.ringMeshes[0] || root;
    rotorModelState.pulseBaseScale.copy(rotorModelState.pulseMesh.scale);
    rotorModelState.pulseScaleBoost = 0;
    rotorModelState.lastElapsed = 0;
    rotorModelState.clipActions = [];

    stylizeModelAsNanomaterial(root, {
      glowStrength: 0.24,
      emissiveIntensity: 0.2,
      baseOpacity: 0.4,
      wireOpacity: 0.08,
    });
    cleanLooseModelArtifacts(root, gltf.animations || []);

    if (gltf.animations && gltf.animations.length > 0) {
      const mixer = new THREE.AnimationMixer(root);
      const actions = gltf.animations
        .map((clip) => {
          const action = mixer.clipAction(clip);
          action.enabled = true;
          action.setEffectiveWeight(1);
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
          action.play();
          action.paused = true;
          return action;
        })
        .filter(Boolean);

      const longestClip = gltf.animations.reduce(
        (longest, clip) => (clip.duration > longest.duration ? clip : longest),
        gltf.animations[0],
      );

      rotorModelState.clip = longestClip;
      rotorModelState.clipDuration = longestClip.duration || 0;
      rotorModelState.primaryAction = actions[0] || null;
      rotorModelState.clipActions = actions;
      rotorModelState.mixer = mixer;
    }
  };

  try {
    const loader = await createGltfLoader();
    const gltf = await loader.loadAsync(modelSrc);
    handleLoad(gltf);
  } catch (error) {
    rotorModelState.enabled = false;
    recordStartupIssue("rotor-viewer", error);
  }
}

function applyRotorFlowBehavior(elapsed) {
  if (!rotorModelState.enabled || !rotorModelState.pivot) {
    return;
  }

  const progress = clamp01(rotorModelState.scrollProgress);
  const preset = getDevSceneTransformPreset(rotorModelState.codeRef, {
    position: [62, -9, -8.2],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    visible: true,
  });
  const globalT = clamp01(
    (progress - SECTION_FLOW.uiux) /
      Math.max(SECTION_FLOW.end - SECTION_FLOW.uiux, 0.000001),
  );
  const postFlowT = clamp01(
    (progress - SECTION_FLOW.end) / Math.max(1 - SECTION_FLOW.end, 0.000001),
  );
  const delta = Math.min(
    Math.max(elapsed - (rotorModelState.lastElapsed || elapsed), 0),
    0.05,
  );
  rotorModelState.lastElapsed = elapsed;

  if (rotorModelState.mixer && rotorModelState.clipDuration > 0) {
    const flowT = clamp01(progress / 0.9);
    const flowTime = rotorModelState.clipDuration * easeValue(flowT, "smooth");
    rotorModelState.clipActions.forEach((action) => {
      action.enabled = true;
      action.paused = true;
    });
    rotorModelState.mixer.setTime(flowTime);
  }
  rotorModelState.pulseScaleBoost +=
    (0 - rotorModelState.pulseScaleBoost) * Math.min(1, delta * 7.5);
  if (rotorModelState.pulseMesh) {
    const pulseScale =
      1 +
      rotorModelState.pulseScaleBoost *
        THREE.MathUtils.lerp(0.12, 0.4, globalT);
    rotorModelState.pulseMesh.scale.set(
      rotorModelState.pulseBaseScale.x * pulseScale,
      rotorModelState.pulseBaseScale.y * pulseScale,
      rotorModelState.pulseBaseScale.z * pulseScale,
    );
  }
  const manualLocks = getManualAxisLocks(rotorModelState);
  if (!manualLocks.position.x) {
    rotorModelState.pivot.position.x +=
      (preset.position[0] - rotorModelState.pivot.position.x) * 0.18;
  }
  if (!manualLocks.position.y) {
    rotorModelState.pivot.position.y +=
      (preset.position[1] - rotorModelState.pivot.position.y) * 0.18;
  }
  if (!manualLocks.position.z) {
    rotorModelState.pivot.position.z +=
      (preset.position[2] - rotorModelState.pivot.position.z) * 0.16;
  }
  if (!manualLocks.rotation.y) {
    rotorModelState.pivot.rotation.y +=
      (preset.rotation[1] - rotorModelState.pivot.rotation.y) * 0.14;
  }

  const holoOpacity = clamp01(progress / Math.max(SECTION_FLOW.end, 0.000001));
  hologramUniformSets.forEach((u) => {
    if (u.uHoloOpacity)
      u.uHoloOpacity.value += (holoOpacity - u.uHoloOpacity.value) * 0.08;
  });
  rotorModelState.pivot.traverse((obj) => {
    if (obj.isLine && obj.material) obj.material.opacity = holoOpacity * 0.22;
  });
}

async function initOuterRingViewer() {
  const modelSrc = OUTER_RING_MODEL_SRC;
  const fallbackModelSrc = OUTER_RING_FALLBACK_MODEL_SRC;
  if (!modelSrc) {
    outerRingState.enabled = false;
    return;
  }

  if (outerRingState.requested) {
    return;
  }
  outerRingState.requested = true;

  const pivot = new THREE.Group();
  scene.add(pivot);

  outerRingState.pivot = pivot;
  outerRingState.enabled = true;
  applyDevScenePivotPreset(outerRingState, {
    position: [62, -9, -8.2],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    visible: true,
  });

  const handleLoad = (gltf) => {
    const root = gltf.scene;
    pivot.add(root);
    outerRingState.root = root;

    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    root.position.sub(center);

    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    root.scale.setScalar(200.0 / maxDim);

    const fixedBox = new THREE.Box3().setFromObject(root);
    const fixedCenter = new THREE.Vector3();
    fixedBox.getCenter(fixedCenter);
    root.position.sub(fixedCenter);
    root.position.y += 0.15;
    root.position.x -= 0.15;
    root.position.z -= 0.55;

    outerRingState.lastElapsed = 0;
    outerRingState.clipActions = [];

    stylizeModelAsNanomaterial(root, {
      glowStrength: 0.2,
      emissiveIntensity: 0.16,
      baseOpacity: 0.32,
      wireOpacity: 0.06,
    });
    cleanLooseModelArtifacts(root, gltf.animations || []);

    if (gltf.animations && gltf.animations.length > 0) {
      const mixer = new THREE.AnimationMixer(root);
      const actions = gltf.animations
        .map((clip) => {
          const action = mixer.clipAction(clip);
          action.enabled = true;
          action.setEffectiveWeight(1);
          action.setLoop(THREE.LoopRepeat, Infinity);
          action.play();
          action.paused = false;
          return action;
        })
        .filter(Boolean);

      const longestClip = gltf.animations.reduce(
        (longest, clip) => (clip.duration > longest.duration ? clip : longest),
        gltf.animations[0],
      );

      outerRingState.clip = longestClip;
      outerRingState.clipDuration = longestClip.duration || 0;
      outerRingState.primaryAction = actions[0] || null;
      outerRingState.clipActions = actions;
      outerRingState.mixer = mixer;
    }
  };

  try {
    const loader = await createGltfLoader();
    const gltf = await loadGltfWithFallback(loader, modelSrc, fallbackModelSrc);
    handleLoad(gltf);
  } catch (error) {
    outerRingState.enabled = false;
    recordStartupIssue("outer-ring-viewer", error);
  }
}

function applyOuterRingFlowBehavior(elapsed) {
  if (!outerRingState.enabled || !outerRingState.pivot) {
    return;
  }

  const progress = clamp01(outerRingState.scrollProgress);
  const preset = getDevSceneTransformPreset(outerRingState.codeRef, {
    position: [62, -9, -8.2],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    visible: true,
  });
  const globalT = clamp01(
    (progress - SECTION_FLOW.uiux) /
      Math.max(SECTION_FLOW.end - SECTION_FLOW.uiux, 0.000001),
  );
  const postFlowT = clamp01(
    (progress - SECTION_FLOW.end) / Math.max(1 - SECTION_FLOW.end, 0.000001),
  );
  const delta = Math.min(
    Math.max(elapsed - (outerRingState.lastElapsed || elapsed), 0),
    0.05,
  );
  outerRingState.lastElapsed = elapsed;

  if (outerRingState.mixer && outerRingState.clipDuration > 0) {
    const flowTimeScale =
      THREE.MathUtils.lerp(0.18, 2.8, globalT) *
      THREE.MathUtils.lerp(1.0, 0.42, postFlowT);
    outerRingState.clipActions.forEach((action) => {
      action.enabled = true;
      action.paused = false;
      action.setEffectiveTimeScale(flowTimeScale);
    });
    if (delta > 0) {
      outerRingState.mixer.update(delta);
    }
  }

  const manualLocks = getManualAxisLocks(outerRingState);
  if (!manualLocks.position.x) {
    outerRingState.pivot.position.x +=
      (preset.position[0] - outerRingState.pivot.position.x) * 0.18;
  }
  if (!manualLocks.position.y) {
    outerRingState.pivot.position.y +=
      (preset.position[1] - outerRingState.pivot.position.y) * 0.18;
  }
  if (!manualLocks.position.z) {
    outerRingState.pivot.position.z +=
      (preset.position[2] - outerRingState.pivot.position.z) * 0.16;
  }
  if (!manualLocks.rotation.y) {
    outerRingState.pivot.rotation.y +=
      (preset.rotation[1] - outerRingState.pivot.rotation.y) * 0.14;
  }

  const holoOpacity = clamp01(progress / Math.max(SECTION_FLOW.end, 0.000001));
  outerRingState.pivot.traverse((obj) => {
    if (obj.isLine && obj.material) obj.material.opacity = holoOpacity * 0.12;
  });
}

async function initParticleCoreWireframe() {
  const modelSrc = PARTICLE_CORE_WIREFRAME_SRC;
  if (!modelSrc) {
    coreWireframeState.enabled = false;
    return;
  }

  if (coreWireframeState.requested) {
    return;
  }
  coreWireframeState.requested = true;

  const pivot = new THREE.Group();
  scene.add(pivot);
  coreWireframeState.pivot = pivot;
  coreWireframeState.enabled = true;
  applyDevScenePivotPreset(coreWireframeState, {
    position: [
      particles.position.x,
      particles.position.y,
      particles.position.z,
    ],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    visible: true,
  });

  try {
    const loader = await createGltfLoader();
    const gltf = await loader.loadAsync(modelSrc);
    const root = gltf.scene;
    pivot.add(root);
    coreWireframeState.root = root;

    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    root.position.sub(center);

    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const normalizedSize = 50.0;
    root.scale.setScalar(normalizedSize / maxDim);
    coreWireframeState.wrapRadius = Math.max(maxDim * root.scale.x * 0.52, 10);

    root.traverse((node) => {
      if (!node.isMesh) {
        return;
      }
      const materials = Array.isArray(node.material)
        ? node.material
        : [node.material];
      materials.forEach((material) => {
        if (!material) {
          return;
        }
        material.wireframe = true;
        material.transparent = true;
        material.opacity = 1.0;
        material.depthWrite = false;
        material.color = new THREE.Color(0xffffff);
        material.emissive = new THREE.Color(0xffffff);
        material.emissiveIntensity = 0.11;
        material.onBeforeCompile = (shader) => {
          shader.uniforms.uFieldTime = { value: 0 };
          shader.uniforms.uFieldOpacity = { value: 0 };

          shader.vertexShader = shader.vertexShader.replace(
            "#include <common>",
            `#include <common>
              varying vec3 vFieldLocalPos;`,
          );

          shader.vertexShader = shader.vertexShader.replace(
            "#include <begin_vertex>",
            `#include <begin_vertex>
              vFieldLocalPos = transformed;`,
          );

          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <common>",
            `#include <common>
              uniform float uFieldTime;
              uniform float uFieldOpacity;
              varying vec3 vFieldLocalPos;

              float fieldHash(vec2 p) {
                p = fract(p * vec2(0.1031, 0.1030));
                p += dot(p, p.yx + 33.33);
                return fract((p.x + p.y) * p.x);
              }

              float fieldNoise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                vec2 u = f * f * (3.0 - 2.0 * f);
                float a = fieldHash(i);
                float b = fieldHash(i + vec2(1.0, 0.0));
                float c = fieldHash(i + vec2(0.0, 1.0));
                float d = fieldHash(i + vec2(1.0, 1.0));
                return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
              }`,
          );

          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <dithering_fragment>",
            `
              float radial = length(vFieldLocalPos.xz);
              float axial = vFieldLocalPos.y;
              float outwardPhase = radial * 0.28 - uFieldTime * 1.35;

              float noise = fieldNoise(vec2(radial * 0.22 + uFieldTime * 0.18, axial * 0.42 + uFieldTime * 0.55));
              float streaks = smoothstep(0.38, 0.92, sin(outwardPhase + axial * 0.35) * 0.5 + 0.5);
              float pulse = 0.62 + 0.38 * sin(uFieldTime * 1.9 - radial * 0.24);
              float alphaMask = (0.25 + noise * 0.5) * streaks * pulse;

              gl_FragColor.a *= alphaMask * uFieldOpacity;
              #include <dithering_fragment>
              `,
          );

          coreWireframeState.uniformSets.push(shader.uniforms);
        };
        material.customProgramCacheKey = () => "core-field-wire-v1";
        material.needsUpdate = true;
      });
    });

    try {
      const ringGltf = await loader.loadAsync(DYSON_RING_MODEL_SRC);
      const ringRoot = ringGltf.scene;
      pivot.add(ringRoot);
      coreWireframeState.attachedRing = ringRoot;

      const ringBox = new THREE.Box3().setFromObject(ringRoot);
      const ringSize = new THREE.Vector3();
      const ringCenter = new THREE.Vector3();
      ringBox.getSize(ringSize);
      ringBox.getCenter(ringCenter);

      ringRoot.position.sub(ringCenter);

      const ringMaxDim = Math.max(ringSize.x, ringSize.y, ringSize.z) || 1;
      ringRoot.scale.setScalar(normalizedSize / ringMaxDim);

      ringRoot.traverse((node) => {
        if (!node.isMesh) {
          return;
        }
        enableFrustumCullingIfSafe(node);
      });
    } catch (error) {
      recordStartupIssue("dyson-ring-attachment", error);
    }
  } catch (error) {
    coreWireframeState.enabled = false;
    recordStartupIssue("particle-core-wireframe", error);
  }
}

function updateCoreWireframeAnchor(flowProgress, elapsed) {
  if (!coreWireframeState.enabled || !coreWireframeState.pivot) {
    return;
  }

  const manualLocks = getManualAxisLocks(coreWireframeState);

  // Starts at the crossfade band so the wireframe is already fading in while
  // the particle field fades out (previously started exactly at 0.75).
  const collapseProgress = Math.max(
    clamp01(
      (flowProgress - gravityFieldConfig.startProgress) /
        Math.max(1 - gravityFieldConfig.startProgress, 0.000001),
    ),
    getCoreCrossfadeT(flowProgress) * 0.35,
  );
  if (collapseProgress <= 0) {
    coreWireframeState.uniformSets.forEach((uniforms) => {
      if (!uniforms) {
        return;
      }
      if (uniforms.uFieldTime) {
        uniforms.uFieldTime.value = elapsed;
      }
      if (uniforms.uFieldOpacity) {
        uniforms.uFieldOpacity.value +=
          (0 - uniforms.uFieldOpacity.value) * 0.15;
      }
    });
    return;
  }

  const opacity = THREE.MathUtils.lerp(0.0, 0.32, collapseProgress);
  coreWireframeState.uniformSets.forEach((uniforms) => {
    if (!uniforms) {
      return;
    }
    if (uniforms.uFieldTime) {
      uniforms.uFieldTime.value = elapsed;
    }
    if (uniforms.uFieldOpacity) {
      uniforms.uFieldOpacity.value +=
        (opacity - uniforms.uFieldOpacity.value) * 0.14;
    }
  });

  if (!coreWireframeState.followParticleCore) {
    const targetXOffsetPx = 25;
    const cameraDistance = Math.max(
      camera.position.distanceTo(coreWireframeState.pivot.position),
      0.0001,
    );
    const worldWidthAtDepth =
      2 *
      Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) *
      cameraDistance *
      camera.aspect;
    const targetXOffsetWorld =
      (targetXOffsetPx / Math.max(window.innerWidth, 1)) * worldWidthAtDepth;
    const sharedAnchorX =
      modelState.enabled && modelState.pivot
        ? modelState.pivot.position.x
        : -0.04;
    if (!manualLocks.position.x) {
      coreWireframeState.pivot.position.x +=
        (sharedAnchorX +
          targetXOffsetWorld -
          coreWireframeState.pivot.position.x) *
        0.22;
    }
    if (!manualLocks.position.y) {
      coreWireframeState.pivot.position.y +=
        (particles.position.y - coreWireframeState.pivot.position.y) * 0.22;
    }
    if (!manualLocks.position.z) {
      coreWireframeState.pivot.position.z +=
        (particles.position.z - coreWireframeState.pivot.position.z) * 0.22;
    }
    return;
  }

  let sumX = 0;
  let sumY = 0;
  let sumZ = 0;
  let count = 0;
  const stride = 8;
  for (let i = 0; i < particleCount; i += stride) {
    const i3 = i * 3;
    sumX += positions[i3];
    sumY += positions[i3 + 1];
    sumZ += positions[i3 + 2];
    count += 1;
  }

  if (count === 0) {
    return;
  }

  coreWireframeState.target.set(sumX / count, sumY / count, sumZ / count);
  coreWireframeState.smoothed.lerp(coreWireframeState.target, 0.16);

  if (!manualLocks.position.x) {
    coreWireframeState.pivot.position.x +=
      (coreWireframeState.smoothed.x - coreWireframeState.pivot.position.x) *
      0.28;
  }
  if (!manualLocks.position.y) {
    coreWireframeState.pivot.position.y +=
      (coreWireframeState.smoothed.y - coreWireframeState.pivot.position.y) *
      0.28;
  }
  if (!manualLocks.position.z) {
    coreWireframeState.pivot.position.z +=
      (coreWireframeState.smoothed.z - coreWireframeState.pivot.position.z) *
      0.2;
    coreWireframeState.pivot.position.z +=
      (particles.position.z - coreWireframeState.pivot.position.z) * 0.18;
  }
}

async function initPseudoHumanViewer() {
  const modelSrc = PSEUDO_HUMAN_MODEL_SRC;
  if (!modelSrc) {
    modelState.enabled = false;
    return;
  }

  if (modelState.requested) {
    return;
  }
  modelState.requested = true;

  scene.add(new THREE.AmbientLight(0xffffff, 0.45));

  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(2, 3, 3);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x9cc2ff, 0.6);
  fill.position.set(-2, 1, -2);
  scene.add(fill);

  const rim = new THREE.PointLight(0xffffff, 0.9, 20);
  rim.position.set(0, 2, 4);
  scene.add(rim);

  const pivot = new THREE.Group();
  scene.add(pivot);

  modelState.pivot = pivot;
  modelState.enabled = true;
  applyDevScenePivotPreset(modelState, {
    position: [-0.04, -9, -8],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    visible: true,
  });

  try {
    const loader = await createGltfLoader();
    const gltf = await loader.loadAsync(modelSrc);
    const root = gltf.scene;
    pivot.add(root);
    modelState.root = root;

    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    root.position.sub(center);

    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    root.scale.setScalar(20.0 / maxDim);

    const fixedBox = new THREE.Box3().setFromObject(root);
    const fixedCenter = new THREE.Vector3();
    fixedBox.getCenter(fixedCenter);
    root.position.sub(fixedCenter);
    root.position.y += 0.15;
    root.position.x -= 0.15;
    root.position.z -= 0.55;

    filterToAnimatedModelBranch(root, gltf.animations || []);
    stylizeModelAsNanomaterial(root);
    cleanLooseModelArtifacts(root, gltf.animations || []);

    if (gltf.animations && gltf.animations.length > 0) {
      const mixer = new THREE.AnimationMixer(root);
      const primaryClip = gltf.animations.reduce(
        (longest, clip) =>
          clip.duration > longest.duration ? clip : longest,
        gltf.animations[0],
      );
      modelState.clip = primaryClip;
      modelState.clipDuration = primaryClip.duration || 0;
      const action = mixer.clipAction(primaryClip);
      action.enabled = true;
      action.setEffectiveWeight(1);
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.play();
      action.paused = false;
      modelState.mixer = mixer;
      modelState.primaryAction = action;
    }
  } catch (error) {
    modelState.enabled = false;
    recordStartupIssue("pseudo-human-viewer", error);
  }
}

async function initCorporateAgentViewer() {
  const modelSrc = CORPORATE_AGENT_MODEL_SRC;
  if (!modelSrc || corporateAgentState.requested) {
    if (!modelSrc) {
      corporateAgentState.enabled = false;
    }
    return;
  }
  corporateAgentState.requested = true;

  const pivot = new THREE.Group();
  scene.add(pivot);

  corporateAgentState.pivot = pivot;
  corporateAgentState.enabled = true;
  applyDevScenePivotPreset(corporateAgentState, {
    position: [0, 0, 0],
    rotation: [THREE.MathUtils.degToRad(-90), 0, 0],
    scale: [1, 1, 1],
    visible: true,
  });

  function buildCorporateAgentGlassMaterial(material, node) {
    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: material?.color?.isColor
        ? material.color.clone()
        : new THREE.Color(0xffffff),
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0,
      transparent: true,
      opacity: 0.32,
      depthTest: true,
      depthWrite: false,
      metalness: 0,
      roughness: 0.08,
      transmission: 0.92,
      ior: 1.45,
      thickness: 0.8,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      side: THREE.DoubleSide,
      toneMapped: true,
    });

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
    ].forEach((key) => {
      if (material?.[key]) {
        glassMaterial[key] = material[key];
      }
    });

    if (material?.normalScale?.isVector2) {
      glassMaterial.normalScale = material.normalScale.clone();
    }

    if ("skinning" in glassMaterial) {
      glassMaterial.skinning = !!node?.isSkinnedMesh;
    }
    if ("morphTargets" in glassMaterial) {
      glassMaterial.morphTargets = !!node?.morphTargetInfluences;
    }
    if ("morphNormals" in glassMaterial) {
      glassMaterial.morphNormals = !!node?.morphTargetInfluences;
    }

    glassMaterial.userData = {
      ...(material?.userData || {}),
      __devMaterialPreset: "glass",
    };
    glassMaterial.needsUpdate = true;
    return glassMaterial;
  }

  try {
    const loader = await createGltfLoader();
    const gltf = await loader.loadAsync(modelSrc);
    const root = gltf.scene;
    pivot.add(root);
    corporateAgentState.root = root;

    root.visible = true;

    root.traverse((node) => {
      if (!node.isMesh) {
        return;
      }
      node.visible = true;
      enableFrustumCullingIfSafe(node);
      const sourceMaterials = Array.isArray(node.material)
        ? node.material
        : [node.material];
      const visibleMaterials = sourceMaterials.map((sourceMat) =>
        buildCorporateAgentGlassMaterial(sourceMat, node),
      );

      node.material = Array.isArray(node.material)
        ? visibleMaterials
        : visibleMaterials[0];
    });

    if (gltf.animations && gltf.animations.length > 0) {
      const mixer = new THREE.AnimationMixer(root);
      const actions = gltf.animations
        .map((clip) => {
          const action = mixer.clipAction(clip);
          action.enabled = true;
          action.setEffectiveWeight(1);
          action.setEffectiveTimeScale(1);
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
          action.play();
          action.paused = true;
          return action;
        })
        .filter(Boolean);

      corporateAgentState.mixer = mixer;
      corporateAgentState.clipActions = actions;
    }

    if (corporateAgentState.selectionHelper) {
      scene.remove(corporateAgentState.selectionHelper);
    }
    const selectionHelper = new THREE.BoxHelper(root, 0x22c1ff);
    selectionHelper.frustumCulled = false;
    scene.add(selectionHelper);
    corporateAgentState.selectionHelper = selectionHelper;
  } catch (error) {
    corporateAgentState.enabled = false;
    recordStartupIssue("corporate-agent-viewer", error);
  }
}

async function initAuxiliaryGlbLibrary() {
  if (auxiliaryGlbState.requested || AUXILIARY_GLB_SRCS.length === 0) {
    return;
  }
  auxiliaryGlbState.requested = true;

  const tasks = AUXILIARY_GLB_STATES.map(async (auxState, idx) => {
    const modelSrc = auxState.src;
    if (modelSrc === DYSON_RING_MODEL_SRC) {
      return;
    }
    try {
      const loader = await createGltfLoader();
      const gltf = await loader.loadAsync(modelSrc);
      const pivot = new THREE.Group();
      const spawn = AUXILIARY_GLB_POSITIONS[idx];
      scene.add(pivot);

      auxState.pivot = pivot;
      auxState.enabled = true;
      applyDevScenePivotPreset(auxState, {
        position: spawn
          ? [spawn.x, spawn.y, spawn.z]
          : [4.2 + idx * 2.8, -4.8, -9.0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        visible: true,
      });

      const root = gltf.scene;
      pivot.add(root);
      auxState.root = root;

      const box = new THREE.Box3().setFromObject(root);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);
      const skipNormalization =
        AUXILIARY_GLB_SKIP_NORMALIZATION_SRCS.has(modelSrc);
      const preserveAuthoredMaterials =
        AUXILIARY_GLB_PRESERVE_AUTHORED_MATERIAL_SRCS.has(modelSrc);
      const applySourceMaterialEntry =
        preserveAuthoredMaterials ||
        AUXILIARY_GLB_APPLY_SOURCE_MATERIAL_SRCS.has(modelSrc);
      const serializedMaterialEntry = DEV_SCENE_MATERIALS.find(
        (entry) => entry.ref === auxState.codeRef,
      );
      if (!skipNormalization) {
        root.position.sub(center);
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        root.scale.setScalar(8.0 / maxDim);
      }

      const hasAttachedAnimations =
        Array.isArray(gltf.animations) && gltf.animations.length > 0;

      root.traverse((node) => {
        if (!node.isMesh) {
          return;
        }
        node.visible = true;
        enableFrustumCullingIfSafe(node);

        if (preserveAuthoredMaterials) {
          return;
        }

        const sourceMaterials = Array.isArray(node.material)
          ? node.material
          : [node.material];
        const visibleMaterials = sourceMaterials.map((material) => {
          if (!material) {
            return material;
          }
          const nextMaterial =
            typeof material.clone === "function"
              ? material.clone()
              : material;
          nextMaterial.side = THREE.DoubleSide;
          nextMaterial.needsUpdate = true;
          return nextMaterial;
        });

        node.material = Array.isArray(node.material)
          ? visibleMaterials
          : visibleMaterials[0];
      });

      if (!hasAttachedAnimations && !applySourceMaterialEntry) {
        stylizeModelAsNanomaterial(root, {
          glowStrength: 0.2,
          emissiveIntensity: 0.16,
          baseOpacity: 0.28,
          wireOpacity: 0.06,
        });
      }

      if (applySourceMaterialEntry && serializedMaterialEntry) {
        applySerializedMaterialEntryToRoot(root, serializedMaterialEntry);
      }

      let mixer = null;
      let clipDuration = 0;
      let clipActions = [];
      if (gltf.animations && gltf.animations.length > 0) {
        mixer = new THREE.AnimationMixer(root);
        clipActions = gltf.animations
          .map((clip) => {
            const action = mixer.clipAction(clip);
            action.enabled = true;
            action.setEffectiveWeight(1);
            action.play();
            action.paused = true;
            return action;
          })
          .filter(Boolean);
        clipDuration = Math.max(
          ...gltf.animations.map((clip) => clip.duration || 0),
        );
      }

      auxState.mixer = mixer;
      auxState.clipDuration = clipDuration;
      auxState.clipActions = clipActions;

      auxiliaryGlbState.entries.push({
        mixer,
        clipDuration,
      });
      auxiliaryGlbState.enabled = true;
      } catch (error) {
        auxState.enabled = false;
        recordStartupIssue(`auxiliary-glb-${idx + 1}`, error);
      }
  });

  await Promise.all(tasks);
}

// Assets not needed for the first screen are streamed after the hero is
// ready (idle time), or immediately if the visitor scrolls toward them.
const DEFERRED_SCENE_TASKS = [
  { task: initParticleCoreWireframe, neededAtProgress: 0.55 },
];
let deferredSceneTasksStarted = false;

function startDeferredSceneTasks() {
  if (deferredSceneTasksStarted) return;
  deferredSceneTasksStarted = true;
  DEFERRED_SCENE_TASKS.forEach(({ task }) => {
    task().catch((error) => recordStartupIssue("deferred-scene-task", error));
  });
}

function scheduleDeferredSceneTasks() {
  const idle =
    window.requestIdleCallback ||
    ((cb) => window.setTimeout(() => cb({ timeRemaining: () => 0 }), 600));
  idle(() => startDeferredSceneTasks(), { timeout: 2500 });
}

function maybeStartDeferredSceneTasks(flowProgress) {
  if (deferredSceneTasksStarted) return;
  if (DEFERRED_SCENE_TASKS.some((t) => flowProgress >= t.neededAtProgress)) {
    startDeferredSceneTasks();
  }
}

async function bootstrapSceneAssets() {
  // Hero-critical assets only; see DEFERRED_SCENE_TASKS for the rest.
  const startupTasks = [
    initPseudoHumanViewer,
    initCorporateAgentViewer,
    initRotorViewer,
    initOuterRingViewer,
    initAuxiliaryGlbLibrary,
  ];
  let completed = 0;
  updateStartupPreloadProgress(0, startupTasks.length);

  await Promise.all(
    startupTasks.map(async (task) => {
      await task();
      completed += 1;
      updateStartupPreloadProgress(completed, startupTasks.length);
    }),
  );

  document.body.dataset.startupState =
    startupIssues.length > 0 ? "degraded" : "ready";
  document.body.dataset.startupIssues = String(startupIssues.length);
  setPreloadProgress(startupIssues.length > 0 ? 96 : 100);
  window.setTimeout(hidePreloadOverlay, startupIssues.length > 0 ? 420 : 240);
  scheduleDeferredSceneTasks();
}

function updateAuxiliaryGlbLibrary(flowProgress, elapsed) {
  if (!auxiliaryGlbState.enabled) {
    return;
  }

  AUXILIARY_GLB_STATES.forEach((entry) => {
    if (!entry.enabled || !entry.mixer || !entry.clipActions?.length) {
      return;
    }

    const easedFlow = easeValue(
      getAuxiliaryDefaultNormalizedFlow(entry, flowProgress),
      "smooth",
    );

    const control = entry.devAnimationControl || null;
    const hasScrubOverride = !!control?.scrubEnabled;
    if (control?.suppressFlow && !hasScrubOverride) {
      const delta = Math.max(0, elapsed - (control.lastElapsed || elapsed));
      control.lastElapsed = elapsed;
      if (entry.clipActions.some((action) => !action.paused)) {
        entry.mixer.update(delta);
      }
      return;
    }

    const normalizedTime = hasScrubOverride
      ? clamp01(control.scrubNormalizedTime)
      : easedFlow;

    if (control) {
      control.lastElapsed = elapsed;
    }

    entry.clipActions.forEach((action) => {
      const duration = action.getClip().duration || entry.clipDuration || 0;
      action.paused = true;
      action.time = Math.min(Math.max(normalizedTime * duration, 0), duration);
    });
    entry.mixer.update(0);
  });
}

function updateCorporateAgentViewer(elapsed, flowProgress) {
  if (!corporateAgentState.enabled) {
    return;
  }

  if (corporateAgentState.selectionHelper && corporateAgentState.root) {
    corporateAgentState.selectionHelper.update();
  }

  if (!corporateAgentState.mixer || !corporateAgentState.clipActions.length) {
    return;
  }

  // Scrub each clip to the time determined by the 8-point flow contact map.
  // FLOW_CONTACT_POINTS[i] maps linearly to clip normalized time i/(n-1).
  const pts = FLOW_CONTACT_POINTS;
  const n = pts.length; // 8
  let normT;
  if (flowProgress <= pts[0]) {
    normT = 0;
  } else if (flowProgress >= pts[n - 1]) {
    normT = 1;
  } else {
    for (let i = 0; i < n - 1; i++) {
      if (flowProgress >= pts[i] && flowProgress < pts[i + 1]) {
        const segProgress = (flowProgress - pts[i]) / (pts[i + 1] - pts[i]);
        normT = (i + segProgress) / (n - 1);
        break;
      }
    }
  }

  corporateAgentState.clipActions.forEach((action) => {
    const duration = action.getClip().duration;
    action.time = Math.min(Math.max(normT * duration, 0), duration);
  });
  // update(0) applies the new time without advancing by clock delta.
  corporateAgentState.mixer.update(0);
}

const VIEWPORT_RESIZE_SETTLE_MS = 140;

const viewportResizeState = {
  width: 0,
  height: 0,
  raf: 0,
  settleTimer: 0,
  active: false,
};

function flushViewportResize() {
  if (viewportResizeState.raf) {
    cancelAnimationFrame(viewportResizeState.raf);
  }

  viewportResizeState.raf = requestAnimationFrame(() => {
    applyParticleViewportSize();
    viewportResizeState.raf = 0;
    viewportResizeState.active = false;
  });
}

function scheduleViewportResize() {
  viewportResizeState.active = true;

  if (viewportResizeState.settleTimer) {
    clearTimeout(viewportResizeState.settleTimer);
  }

  viewportResizeState.settleTimer = window.setTimeout(() => {
    viewportResizeState.settleTimer = 0;
    flushViewportResize();
  }, VIEWPORT_RESIZE_SETTLE_MS);
}

window.__applyParticleResize = scheduleViewportResize;

applyParticleViewportSize();
hideEmptyContainers();
initSectionOrbitNodes();
initSectionViewZoom();
initFlowSections();
initOrbitKeywordCloud();
initFlowPanels();
setPreloadProgress(72);
bootstrapSceneAssets();

updateMenuState(getEffectiveScrollProgress());

updateRailMotion(0, 0);

modelState.scrollProgress = getEffectiveScrollProgress();
lastScrollY = getEffectiveScrollY();

window.addEventListener(
  "pointermove",
  (event) => {
    const nx = (event.clientX / window.innerWidth) * 2 - 1;
    const ny = (event.clientY / window.innerHeight) * 2 - 1;
    parallaxState.targetX = nx * parallaxState.maxOffsetX;
    parallaxState.targetY = -ny * parallaxState.maxOffsetY;
  },
  { passive: true },
);

document.querySelectorAll(".menu-item").forEach((item) => {
  item.addEventListener("click", () => {
    const progress = Number.parseFloat(
      item.getAttribute("data-scroll-to") || "0",
    );
    if (Number.isFinite(progress)) {
      setEffectiveScrollProgress(progress, "smooth");
      return;
    }

    const selector = item.getAttribute("data-scroll-target") || "";
    if (selector) {
      const targetNode = document.querySelector(selector);
      if (targetNode) {
        targetNode.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  });
});

function initTypedReveal() {
  const lines = Array.from(document.querySelectorAll(".typed-line"));
  if (lines.length === 0) {
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }
        const block = entry.target;
        const blockLines = block.classList.contains("typed-line")
          ? [block]
          : Array.from(block.querySelectorAll(".typed-line"));

        blockLines.forEach((line, idx) => {
          if (
            line.classList.contains("is-typed") ||
            line.classList.contains("is-typed-done")
          ) {
            return;
          }
          window.setTimeout(() => {
            line.classList.add("is-typed");
            window.setTimeout(() => {
              line.classList.remove("is-typed");
              line.classList.add("is-typed-done");
            }, 1120);
          }, idx * 180);
        });

        observer.unobserve(block);
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.24 },
  );

  document
    .querySelectorAll("[data-typed-block], .typed-list")
    .forEach((node) => {
      observer.observe(node);
    });
}

initTypedReveal();

window.addEventListener("resize", scheduleViewportResize, { passive: true });
window.addEventListener("orientationchange", scheduleViewportResize, {
  passive: true,
});

document.addEventListener("visibilitychange", () => {
  pageIsVisible = !document.hidden;
});

window.addEventListener("scroll", () => {
  const now = performance.now();
  const currentY = getEffectiveScrollY();
  const deltaY = currentY - lastScrollY;
  applyScrollState(deltaY, now);
});

window.addEventListener(
  "wheel",
  (event) => {
    const now = performance.now();
    const normalizedDeltaY =
      event.deltaMode === 1
        ? event.deltaY * 16
        : event.deltaMode === 2
          ? event.deltaY * window.innerHeight
          : event.deltaY;
    lastWheelIntentDelta = -normalizedDeltaY;
    lastWheelIntentAt = now;

    if (!shouldUseVirtualScroll() && hasNativeScrollableRange()) {
      return;
    }

    event.preventDefault();
    const deltaY = applyVirtualScrollDelta(normalizedDeltaY);
    if (deltaY !== 0) {
      applyScrollState(deltaY, now);
    }
  },
  { passive: false },
);

window.addEventListener(
  "touchstart",
  (event) => {
    if (event.touches.length > 0) {
      lastScrollY = getEffectiveScrollY();
    }
  },
  { passive: true },
);

window.addEventListener(
  "touchmove",
  (event) => {
    if (
      (!shouldUseVirtualScroll() && hasNativeScrollableRange()) ||
      event.touches.length === 0
    ) {
      return;
    }

    const currentTouchY = event.touches[0].clientY;
    const previousTouchY = Number(
      document.body.dataset.virtualTouchY || currentTouchY,
    );
    const rawDelta = (previousTouchY - currentTouchY) * 1.15;
    document.body.dataset.virtualTouchY = String(currentTouchY);

    if (Math.abs(rawDelta) < 0.01) {
      return;
    }

    event.preventDefault();
    const deltaY = applyVirtualScrollDelta(rawDelta);
    if (deltaY !== 0) {
      applyScrollState(deltaY, performance.now());
    }
  },
  { passive: false },
);

window.addEventListener(
  "touchend",
  () => {
    delete document.body.dataset.virtualTouchY;
  },
  { passive: true },
);

window.addEventListener("keydown", (event) => {
  if (!shouldUseVirtualScroll() && hasNativeScrollableRange()) {
    return;
  }

  const vh = window.innerHeight;
  let delta = 0;

  if (event.key === "ArrowDown") {
    delta = 72;
  } else if (event.key === "ArrowUp") {
    delta = -72;
  } else if (
    event.key === "PageDown" ||
    (event.key === " " && !event.shiftKey)
  ) {
    delta = vh * 0.82;
  } else if (event.key === "PageUp" || (event.key === " " && event.shiftKey)) {
    delta = -vh * 0.82;
  } else if (event.key === "Home") {
    event.preventDefault();
    const prevY = getEffectiveScrollY();
    virtualScrollProgress = 0;
    applyScrollState(getEffectiveScrollY() - prevY, performance.now());
    return;
  } else if (event.key === "End") {
    event.preventDefault();
    const prevY = getEffectiveScrollY();
    virtualScrollProgress = 1;
    applyScrollState(getEffectiveScrollY() - prevY, performance.now());
    return;
  } else {
    return;
  }

  event.preventDefault();
  const deltaY = applyVirtualScrollDelta(delta);
  if (deltaY !== 0) {
    applyScrollState(deltaY, performance.now());
  }
});

function applyScrollState(deltaY, now) {
  const scrollProgress = getEffectiveScrollProgress();

  modelState.scrollProgress = scrollProgress;
  rotorModelState.scrollProgress = scrollProgress;
  outerRingState.scrollProgress = scrollProgress;
  updateMenuState(scrollProgress);

  const deltaT = Math.max(now - lastScrollTime, 16);
  const velocity = Math.min(Math.abs(deltaY) / deltaT, 3);
  scrollDirection = deltaY === 0 ? scrollDirection : Math.sign(deltaY);
  if (deltaY !== 0) {
    rotorModelState.pulseScaleBoost = Math.max(
      rotorModelState.pulseScaleBoost,
      THREE.MathUtils.lerp(0.18, 1.0, velocity / 3),
    );
  }

  const railDelta = getRailControlDelta(deltaY, now);
  updateRailMotion(railDelta, velocity);

  if (scrollDirection > 0) {
    document.body.classList.add("is-scrolling-down");
    if (scrollDownClassTimer !== null) {
      clearTimeout(scrollDownClassTimer);
    }
    scrollDownClassTimer = window.setTimeout(() => {
      document.body.classList.remove("is-scrolling-down");
      scrollDownClassTimer = null;
    }, 320);
  }

  zoomBlurTarget = Math.max(zoomBlurTarget, getBlurImpulse(velocity));
  secondaryTarget = 0.82;
  if (scrollActiveTimer !== null) {
    clearTimeout(scrollActiveTimer);
  }
  scrollActiveTimer = setTimeout(() => {
    secondaryTarget = 0;
    scrollActiveTimer = null;
  }, 280);
  lastScrollY = getEffectiveScrollY();
  lastScrollTime = now;
}

// --- Runtime visibility culling -------------------------------------------
// Objects whose material is fully transparent still cost a full draw (vertex
// work + fill). Hide them while effectively invisible and restore them as soon
// as their opacity rises. Only objects hidden by this pass are ever unhidden.
const AUTO_HIDE_OPACITY = 0.004;
const autoHideState = { list: [], builtAt: -1, childCount: -1 };

function rebuildAutoHideList() {
  const list = [];
  scene.traverse((node) => {
    if (!(node.isMesh || node.isLine || node.isPoints)) return;
    if (node === particles || node === secondaryParticles) return;
    const mats = Array.isArray(node.material) ? node.material : [node.material];
    if (mats.every((m) => m && m.transparent && !m.uniforms)) list.push(node);
  });
  autoHideState.list = list;
}

function countSceneNodes() {
  let n = 0;
  scene.traverse(() => {
    n += 1;
  });
  return n;
}

function setAutoSkipped(node, skip) {
  if (skip) {
    if (!node.userData.__autoSkipped && node.layers.isEnabled(0)) {
      node.layers.disable(0);
      node.userData.__autoSkipped = true;
    }
  } else if (node.userData.__autoSkipped) {
    node.layers.enable(0);
    node.userData.__autoSkipped = false;
  }
}

function applyAutoHide(elapsed) {
  // Re-scan only when the scene graph grows (async GLB loads), at most 1x/sec.
  if (elapsed - autoHideState.builtAt > 1) {
    const count = countSceneNodes();
    if (count !== autoHideState.childCount) {
      autoHideState.childCount = count;
      rebuildAutoHideList();
    }
    autoHideState.builtAt = elapsed;
  }
  // Never touches `visible` (the site's own code owns it). Skipping is done by
  // taking the object off render layer 0 and putting it back only if this pass
  // removed it, so an object is never shown that the original code would hide.
  for (const node of autoHideState.list) {
    const mats = Array.isArray(node.material) ? node.material : [node.material];
    let maxOpacity = 0;
    for (const m of mats) maxOpacity = Math.max(maxOpacity, m.visible === false ? 0 : m.opacity);
    setAutoSkipped(node, maxOpacity < AUTO_HIDE_OPACITY);
  }

  // Particle-core wireframe: ~565k triangles drawn as wireframe whose
  // alpha is driven by uFieldOpacity (0 until gravityFieldConfig.startProgress).
  if (coreWireframeState.root) {
    let fieldOpacity = 0;
    coreWireframeState.uniformSets.forEach((u) => {
      if (u && u.uFieldOpacity) fieldOpacity = Math.max(fieldOpacity, u.uFieldOpacity.value);
    });
    // Before first compile uniformSets is empty: keep it visible so it compiles.
    const shouldSkip = coreWireframeState.uniformSets.length > 0 && fieldOpacity < AUTO_HIDE_OPACITY;
    coreWireframeState.root.traverse((node) => {
      if (node.isMesh || node.isLine || node.isPoints) setAutoSkipped(node, shouldSkip);
    });
  }
}

function enableFrustumCullingIfSafe(node) {
  // Skinned meshes keep culling off (bounds don't follow bones); static or
  // node-animated meshes have valid bounds and can be culled.
  if (node.isSkinnedMesh) return;
  if (node.geometry && !node.geometry.boundingSphere) node.geometry.computeBoundingSphere();
  node.frustumCulled = true;
}

function animate() {
  requestAnimationFrame(animate);

  if (!pageIsVisible) {
    return;
  }

  const elapsed = performance.now() * 0.001;
  const flowProgress = getEffectiveScrollProgress();
  maybeStartDeferredSceneTasks(flowProgress);
  modelState.scrollProgress = flowProgress;
  rotorModelState.scrollProgress = flowProgress;
  outerRingState.scrollProgress = flowProgress;

  parallaxState.currentX +=
    (parallaxState.targetX - parallaxState.currentX) * parallaxState.damping;
  parallaxState.currentY +=
    (parallaxState.targetY - parallaxState.currentY) * parallaxState.damping;

  if (sceneBuilder.state.enabled) {
    const pose = sceneBuilder.compute(
      flowProgress,
      elapsed,
      parallaxState.currentX,
      parallaxState.currentY,
    );
    camera.position.copy(pose.position);
    camera.lookAt(pose.lookAt);
  } else {
    const orbitAngle =
      THREE.MathUtils.degToRad(10) + Math.sin(elapsed * 0.18) * 0.035;
    const orbitRadius = 20;
    camera.position.x =
      Math.sin(orbitAngle) * orbitRadius + parallaxState.currentX * 0.18;
    camera.position.z = Math.cos(orbitAngle) * orbitRadius;
    camera.position.y = baseCameraPosition.y + parallaxState.currentY * 0.18;
    camera.lookAt(0, 0, 0);
  }

  // Dev curve camera — overrides orbit when enabled in inspector
  if (devCurveCam) devCurveCam(camera, flowProgress, elapsed);

  if (modelState.enabled) {
    applyModelFlowBehavior(elapsed);
  }

  if (rotorModelState.enabled) {
    applyRotorFlowBehavior(elapsed);
  }

  if (outerRingState.enabled) {
    applyOuterRingFlowBehavior(elapsed);
  }

  updateCorporateAgentViewer(elapsed, flowProgress);

  updateAuxiliaryGlbLibrary(flowProgress, elapsed);
  updateFlowPanels(flowProgress, elapsed);

  updateHologramShaderTime(elapsed);

  updateSectionOrbitNodes(elapsed, flowProgress);
  updateFlowSections(flowProgress, elapsed);
  updateProjectsSectionPhase(flowProgress);
  updateOrbitKeywordCloud(elapsed, flowProgress);

  updateAtomPositions(elapsed);
  const target = getTargetPositions();

  const orbPhaseT = 0;
  const particleFade = 1 - getCoreCrossfadeT(flowProgress);
  const particlesCutoff = particleFade > 0;
  // Keep drawing until the eased opacity has actually reached ~0, but never
  // past the crossfade band (the scroll impulse also drives secondary opacity).
  const inFadeTail = flowProgress < CORE_CROSSFADE_END + 0.04;
  particles.visible =
    particlesCutoff ||
    (inFadeTail && material.uniforms.uOpacity.value > 0.004);
  secondaryParticles.visible =
    particlesCutoff ||
    (inFadeTail && secondaryMaterial.uniforms.uOpacity.value > 0.004);

  for (let i = 0; i < particleCount; i += 1) {
    const i3 = i * 3;
    const desiredX = target[i3];
    const desiredY = target[i3 + 1];
    const desiredZ = target[i3 + 2];

    positions[i3] += (desiredX - positions[i3]) * morphStrength;
    positions[i3 + 1] += (desiredY - positions[i3 + 1]) * morphStrength;
    positions[i3 + 2] += (desiredZ - positions[i3 + 2]) * morphStrength;
  }

  updateCoreWireframeAnchor(flowProgress, elapsed);

  geometry.attributes.position.needsUpdate = true;
  particles.rotation.y += 0.0015;
  // Global scene rotation controls for the main particle field.
  particles.rotation.x = Math.sin(elapsed * 0.12) * 0.035;

  secondaryOpacity += (secondaryTarget - secondaryOpacity) * 0.25;
  secondaryMaterial.uniforms.uOpacity.value = secondaryOpacity;
  for (let i = 0; i < secondaryCount; i += 1) {
    const i3 = i * 3;
    const seed = secondarySeed[i];
    const phase = secondaryOrbitPhase[i] + elapsed * secondaryOrbitSpeed[i];
    const radiusBreath =
      1.0 +
      Math.sin(elapsed * (0.3 + seed * 0.5) + seed * 6.28318530718) * 0.08;
    const radius = secondaryOrbitRadius[i] * radiusBreath;
    secondaryPos[i3] = Math.cos(phase) * radius;
    secondaryPos[i3 + 1] =
      secondaryOrbitHeight[i] +
      Math.sin(phase * 1.4 + elapsed * 0.4) * (0.18 + seed * 0.85);
    secondaryPos[i3 + 2] =
      Math.sin(phase) * radius * 0.72 +
      secondaryOrbitDepth[i] +
      Math.cos(elapsed * (0.4 + seed * 0.2) + phase) * 0.8;
  }
  secondaryGeo.attributes.position.needsUpdate = true;

  zoomBlurStrength += (zoomBlurTarget - zoomBlurStrength) * 0.52;
  zoomBlurTarget *= 0.9;
  const preProjectsT = clamp01(
    (flowProgress - SECTION_FLOW.uiux) /
      Math.max(SECTION_FLOW.projects - SECTION_FLOW.uiux, 0.000001),
  );
  const postProjectsT = clamp01(
    (flowProgress - SECTION_FLOW.projects) /
      Math.max(SECTION_FLOW.end - SECTION_FLOW.projects, 0.000001),
  );
  const meditationFlow = clamp01(
    (flowProgress - SECTION_FLOW.projects) /
      Math.max(SECTION_FLOW.contact - SECTION_FLOW.projects, 0.000001),
  );
  const particleScale =
    flowProgress < SECTION_FLOW.projects
      ? THREE.MathUtils.lerp(1.02, 0.9, preProjectsT)
      : THREE.MathUtils.lerp(0.9, 0.12, postProjectsT);
  const lateShrinkT = orbPhaseT;
  const particleScaleWithShrink =
    particleScale * THREE.MathUtils.lerp(1.0, 0.76, lateShrinkT);
  const secondaryScale =
    flowProgress < SECTION_FLOW.projects
      ? THREE.MathUtils.lerp(1.0, 0.88, preProjectsT)
      : THREE.MathUtils.lerp(0.88, 0.08, postProjectsT);
  particles.scale.setScalar(particleScaleWithShrink);
  secondaryParticles.scale.setScalar(secondaryScale);
  particles.position.z =
    flowProgress < SECTION_FLOW.projects
      ? THREE.MathUtils.lerp(0, -26.0, preProjectsT)
      : THREE.MathUtils.lerp(-26.0, -36, postProjectsT);
  secondaryParticles.position.z =
    flowProgress < SECTION_FLOW.projects
      ? THREE.MathUtils.lerp(0, -34.0, preProjectsT)
      : THREE.MathUtils.lerp(-34.0, -46, postProjectsT);
  particles.position.y =
    flowProgress < SECTION_FLOW.projects
      ? THREE.MathUtils.lerp(0, -0.2, preProjectsT)
      : THREE.MathUtils.lerp(-0.2, -1.4, postProjectsT);
  secondaryParticles.position.y =
    flowProgress < SECTION_FLOW.projects
      ? THREE.MathUtils.lerp(0, -0.35, preProjectsT)
      : THREE.MathUtils.lerp(-0.35, -1.9, postProjectsT);

  const mainOpacityTarget = particlesCutoff
    ? clamp01(THREE.MathUtils.lerp(0.86, 0.1, flowProgress)) * particleFade
    : 0;
  material.uniforms.uOpacity.value +=
    (mainOpacityTarget - material.uniforms.uOpacity.value) * 0.1;
  const secondaryOpacityTarget = particlesCutoff
    ? (0.18 - meditationFlow * 0.14) * particleFade
    : 0;
  secondaryMaterial.uniforms.uOpacity.value +=
    (secondaryOpacityTarget - secondaryMaterial.uniforms.uOpacity.value) * 0.08;

  const graspGlow = 1.0 - clamp01(flowProgress / 0.34);
  const glowBoost = graspGlow * graspGlow * 0.22;
  const fieldBloomBoost = lateShrinkT * lateShrinkT * 0.08;
  const orbGlowBoost = orbPhaseT * orbPhaseT * 0.18;
  const bloomTarget = visualSafetyActive
    ? Math.min(bloomBaseStrength + glowBoost * 0.25, 0.78)
    : bloomBaseStrength + glowBoost + fieldBloomBoost + orbGlowBoost;
  bloomPass.strength += (bloomTarget - bloomPass.strength) * 0.12;

  if (nebulaState.points && nebulaState.positions && nebulaState.speeds) {
    const nebulaProgress = 0.02 + flowProgress * 0.03;
    for (let i = 0; i < nebulaState.count; i += 1) {
      const i3 = i * 3;
      const speed = nebulaState.speeds[i] * (0.55 + nebulaProgress);
      let nextZ = nebulaState.positions[i3 + 2] + speed * 0.06;
      if (nextZ > nebulaState.zNear) {
        nextZ = nebulaState.zFar;
      }
      nebulaState.positions[i3 + 2] = nextZ;
      nebulaState.positions[i3] =
        nebulaState.basePositions[i3] +
        Math.sin(elapsed * 0.08 + i * 0.14) * 0.45;
      nebulaState.positions[i3 + 1] =
        nebulaState.basePositions[i3 + 1] +
        Math.cos(elapsed * 0.07 + i * 0.11) * 0.4;
    }
    nebulaState.points.rotation.y += 0.00018;
    // Background plane rotation controls for nebula layer.
    nebulaState.points.rotation.x = Math.sin(elapsed * 0.04) * 0.05;
    nebulaState.points.geometry.attributes.position.needsUpdate = true;
    if (nebulaState.material) {
      nebulaState.material.uniforms.uTime.value = elapsed;
      const pulse = visualSafetyActive
        ? 0.085
        : 0.08 + (Math.sin(elapsed * 0.42) * 0.5 + 0.5) * 0.09;
      nebulaState.material.uniforms.uOpacity.value = pulse;
    }
  }

  zoomBlurPass.uniforms.strength.value = visualSafetyActive
    ? Math.min(zoomBlurStrength, 0.14)
    : zoomBlurStrength;
  zoomBlurPass.uniforms.direction.value = -scrollDirection;
  zoomBlurPass.uniforms.zBias.value = 0.48 + zoomBlurStrength * 38.0;
  const gltfFocus = getActiveGltfFocusPoint();
  if (gltfFocus) {
    const center = projectWorldToViewport(gltfFocus);
    zoomBlurPass.uniforms.center.value.x = THREE.MathUtils.clamp(
      center.x,
      0.08,
      0.92,
    );
    zoomBlurPass.uniforms.center.value.y = THREE.MathUtils.clamp(
      center.y,
      0.08,
      0.92,
    );
  }
  if (filmNoisePass) {
    filmNoisePass.uniforms.time.value = elapsed;
    filmNoisePass.uniforms.strength.value = visualSafetyActive
      ? 0.012 + Math.min(zoomBlurStrength, 0.14) * 0.35
      : 0.05 + zoomBlurStrength * 2.2;
  }

  updateRuntimeProjectionOverlays();

  if (devToolsUpdate) {
    try {
      devToolsUpdate(elapsed);
    } catch (e) {
      console.warn("[devTools]", e);
    }
  }

  applyAutoHide(elapsed);

  if (viewportResizeState.active) {
    renderer.render(scene, camera);
  } else {
    composer.render();
  }

}

animate();

// Dev-only scene inspector — excluded from production build automatically by Vite
if (import.meta.env.DEV) {
  import("./js/dev-container-tools.js").then(({ initDevContainerTools }) => {
    initDevContainerTools();
  });

  import("./js/three-scene-inspector-extension.js").then(
    ({ initThreeSceneInspectorExtension }) => {
      const registry = {
        "Rotor + Outer (Linked)": linkedRotorOuterState,
        Rotor: rotorModelState,
        "Outer Ring": outerRingState,
        "Main Model": modelState,
        "Corporate Agent": corporateAgentState,
        "Particle Core Wireframe": coreWireframeState,
      };

      AUXILIARY_GLB_STATES.forEach((entry) => {
        registry[entry.label] = entry;
      });

      const inspectorExtension = initThreeSceneInspectorExtension(registry, {
        camera,
        renderer,
        sceneBuilder,
        getFlowProgress: () => getEffectiveScrollProgress(),
        flowPoints: FLOW_CONTACT_POINTS,
        initialSourceState: {
          transforms: DEV_SCENE_TRANSFORMS,
          manualKeyframes: DEV_SCENE_MANUAL_KEYFRAMES,
          materials: DEV_SCENE_MATERIALS,
          projectionOverlays: DEV_SCENE_PROJECTION_OVERLAYS,
        },
        flowMap: {
          uiux: SECTION_FLOW.uiux,
          research: SECTION_FLOW.research,
          archive: SECTION_FLOW.archive,
          resources: SECTION_FLOW.resources,
          timeline: SECTION_FLOW.timeline,
          projects: SECTION_FLOW.projects,
          system: SECTION_FLOW.system,
          contact: SECTION_FLOW.contact,
        },
      });
      devCurveCam = inspectorExtension.applyCameraCurve;
      devManualAxisLocks = inspectorExtension.getManualAxisLocks;
      devToolsUpdate = inspectorExtension.update;
    },
  );
}

// DEV-SCENE:lod:start
// Dynamic LOD profile export
const devLodProfiles = {
  "lod_profile_1": {
    "highLabel": "Rotor + Outer (Linked)",
    "midLabel": "",
    "lowLabel": "",
    "near": 28,
    "mid": 62,
    "far": 110,
    "cullBeyond": 180,
    "scrollBoost": 22,
    "freezeFarAnimations": true,
    "bakeStaticFar": false
  }
};

// Runtime strategy:
// 1) Select one visible tier per profile by camera distance.
// 2) Bias distance by scroll speed for smoother navigation.
// 3) Optionally freeze far animation and bake far transforms.
// DEV-SCENE:lod:end

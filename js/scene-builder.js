import * as THREE from "three";

function clamp01(value) {
  return Math.min(Math.max(value, 0), 1);
}

function easeInOutSine(t) {
  return -(Math.cos(Math.PI * t) - 1) * 0.5;
}

export function createSceneBuilder(initial = {}) {
  const state = {
    enabled: initial.enabled ?? false,
    orbitRadius: initial.orbitRadius ?? 20,
    orbitSpeed: initial.orbitSpeed ?? 0.18,
    orbitTiltDeg: initial.orbitTiltDeg ?? 10,
    curvatureStrength: initial.curvatureStrength ?? 1.35,
    curvatureExpo: initial.curvatureExpo ?? 1.7,
    yBias: initial.yBias ?? 0,
    yCurvature: initial.yCurvature ?? 0.48,
    yWaveAmp: initial.yWaveAmp ?? 0.36,
    yWaveSpeed: initial.yWaveSpeed ?? 0.44,
    lookAtX: initial.lookAtX ?? 0,
    lookAtY: initial.lookAtY ?? 0,
    lookAtZ: initial.lookAtZ ?? 0,
  };

  const _lookAt = new THREE.Vector3();
  const _position = new THREE.Vector3();

  function compute(flowProgress, elapsed, parallaxX = 0, parallaxY = 0) {
    const p = clamp01(flowProgress);
    const curved = Math.pow(p, Math.max(state.curvatureExpo, 0.001));
    const cinematic = easeInOutSine(curved);

    const orbitAngleBase =
      THREE.MathUtils.degToRad(state.orbitTiltDeg) +
      Math.sin(elapsed * state.orbitSpeed) * 0.035;
    const orbitAngle = orbitAngleBase + cinematic * state.curvatureStrength;

    _position.set(
      Math.sin(orbitAngle) * state.orbitRadius + parallaxX * 0.18,
      state.yBias +
        Math.sin(elapsed * state.yWaveSpeed + cinematic * Math.PI) *
          state.yWaveAmp +
        cinematic * state.yCurvature +
        parallaxY * 0.18,
      Math.cos(orbitAngle) * state.orbitRadius,
    );

    _lookAt.set(state.lookAtX, state.lookAtY, state.lookAtZ);

    return {
      position: _position,
      lookAt: _lookAt,
      curvedProgress: cinematic,
    };
  }

  return {
    state,
    compute,
  };
}

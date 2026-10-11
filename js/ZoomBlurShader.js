import * as THREE from "three";

export const ZoomBlurShader = {
  uniforms: {
    tDiffuse: { value: null },
    strength: {
      value: 0.02,
    },
    direction: { value: 1 },
    center: { value: new THREE.Vector2(0.5, 0.5) }, // Center of zoom effect
    zBias: { value: 0.42 },
    edgeWarp: { value: 0.72 },
    noiseScale: { value: 0.16 },
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
    uniform float strength;
    uniform float direction;
    uniform vec2 center;
    uniform float zBias;
    uniform float edgeWarp;
    uniform float noiseScale;
    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    
    void main() {
      vec2 texCoord = vUv;
      vec2 toCenter = center - texCoord;
      float dist = length(toCenter);
      vec2 dir = dist > 0.0001 ? normalize(toCenter) : vec2(0.0);
      float edge = smoothstep(zBias, 1.0, dist);
      float warp = 1.0 + edge * edgeWarp;
      float grain = (hash(vUv * 1200.0) - 0.5) * noiseScale;
      float blur = dist * strength * warp;
      vec2 yNoise = vec2(0.0, grain * strength * 0.85);
      vec4 color = vec4(0.0);
      color += texture2D(tDiffuse, texCoord + dir * blur * 0.15 * direction + yNoise) * 0.30;
      color += texture2D(tDiffuse, texCoord + dir * blur * 0.45 * direction + yNoise * 0.5) * 0.25;
      color += texture2D(tDiffuse, texCoord + dir * blur * 0.75 * direction) * 0.20;
      color += texture2D(tDiffuse, texCoord - dir * blur * 0.20 * direction) * 0.15;
      color += texture2D(tDiffuse, texCoord) * 0.10;
      gl_FragColor = color;
    }
  `,
};

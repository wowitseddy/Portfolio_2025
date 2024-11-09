export const ZoomBlurShader = {
  uniforms: {
    tDiffuse: { value: null },
    strength: {
      value: 0.00000000000000000000000000000000000000000000000000000000000000000000000002,
    },
    center: { value: new THREE.Vector2(0.5, 0.5) }, // Center of zoom effect
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
    uniform vec2 center;
    varying vec2 vUv;
    
    void main() {
      vec2 texCoord = vUv;
      vec2 toCenter = center - texCoord;
      float dist = length(toCenter);
      float blur = dist * strength;
      vec4 color = texture2D(tDiffuse, texCoord + toCenter * blur);
      gl_FragColor = color;
    }
  `,
};

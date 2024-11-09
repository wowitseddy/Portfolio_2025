import * as THREE from "three";

export function runDNAHelix(container) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    75,
    container.clientWidth / container.clientHeight,
    0.1,
    1000
  );
  camera.position.z = 20;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  // DNA Helix Geometry
  const dnaGeometry = new THREE.BufferGeometry();
  const dnaMaterial = new THREE.PointsMaterial({ color: 0x00fff0, size: 0.05 });
  const positions = new Float32Array(500 * 3); // 500 particles

  // Create helix shape
  for (let i = 0; i < 500; i++) {
    positions[i * 3] = Math.sin(i * 0.1) * 2; // X-axis
    positions[i * 3 + 1] = i * 0.05; // Y-axis (height)
    positions[i * 3 + 2] = Math.cos(i * 0.1) * 2; // Z-axis
  }
  dnaGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const dnaHelix = new THREE.Points(dnaGeometry, dnaMaterial);
  scene.add(dnaHelix);

  function animate() {
    requestAnimationFrame(animate);
    dnaHelix.rotation.y += 0.01; // Rotate helix slowly
    renderer.render(scene, camera);
  }
  animate();
}

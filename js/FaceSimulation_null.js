import * as THREE from "three";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass";

export function runFaceSimulation(container) {
  // Initialize Three.js scene
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.z = 30;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);

  // Append renderer to the specified container
  container.appendChild(renderer.domElement);

  // Create particles for the helix
  const particleCount = 1500;
  const particlesGeometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);

  // Generate helix structure
  function generateHelixStructure() {
    const radius = 5;
    const turns = 4;
    const helixHeight = 15;

    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2 * turns; // Angle for helix
      const y = (i / particleCount) * helixHeight - helixHeight / 2; // Y-axis height for helix

      positions[i * 3] = Math.cos(angle) * radius; // X position
      positions[i * 3 + 1] = y; // Y position
      positions[i * 3 + 2] = Math.sin(angle) * radius; // Z position
    }
  }

  generateHelixStructure();
  particlesGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3)
  );

  const particleMaterial = new THREE.PointsMaterial({
    color: 0xff0000, // Red color for visibility
    size: 0.1,
    transparent: true,
    opacity: 0.8,
  });
  const particleSystem = new THREE.Points(particlesGeometry, particleMaterial);
  scene.add(particleSystem);

  // Animation function to rotate helix and add twisting motion
  function animateHelix() {
    const positions = particlesGeometry.attributes.position.array;
    for (let i = 0; i < particleCount; i++) {
      const angleOffset = (i / particleCount) * Math.PI * 2 * 0.05;
      positions[i * 3 + 1] += Math.sin(Date.now() * 0.001 + angleOffset) * 0.01;
      positions[i * 3 + 2] += Math.cos(Date.now() * 0.001 + angleOffset) * 0.01;
    }
    particlesGeometry.attributes.position.needsUpdate = true;

    // Rotate the entire helix
    particleSystem.rotation.y += 0.01;
  }

  function animate() {
    requestAnimationFrame(animate);
    animateHelix();
    renderer.render(scene, camera);
  }

  animate();
}

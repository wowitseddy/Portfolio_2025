import * as THREE from "three";

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.z = 20;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const particleCount = 1000;
const particlesGeometry = new THREE.BufferGeometry();
const positions = new Float32Array(particleCount * 3);

function generateFaceStructure() {
  for (let i = 0; i < particleCount; i++) {
    // Basic layout for face contours
    const x = Math.sin(i) * 5;
    const y = Math.cos(i) * 5;

    // Simulate different facial features
    if (i < particleCount * 0.3) {
      // Left eye
      positions[i * 3] = x - 2.5;
      positions[i * 3 + 1] = y + 2;
    } else if (i < particleCount * 0.6) {
      // Right eye
      positions[i * 3] = x + 2.5;
      positions[i * 3 + 1] = y + 2;
    } else if (i < particleCount * 0.8) {
      // Mouth
      positions[i * 3] = x;
      positions[i * 3 + 1] = y - 2;
    } else {
      // Face contour
      positions[i * 3] = Math.sin(i * 0.05) * 6;
      positions[i * 3 + 1] = Math.cos(i * 0.05) * 8;
    }
    positions[i * 3 + 2] = (Math.random() - 0.5) * 2; // Randomize z-axis for depth
  }
}
generateFaceStructure();

particlesGeometry.setAttribute(
  "position",
  new THREE.BufferAttribute(positions, 3)
);

const particleMaterial = new THREE.PointsMaterial({
  color: 0xffffff,
  size: 0.1,
  transparent: true,
  opacity: 0.8,
});
const particleSystem = new THREE.Points(particlesGeometry, particleMaterial);
scene.add(particleSystem);

function animateParticles() {
  const positions = particlesGeometry.attributes.position.array;
  for (let i = 0; i < particleCount; i++) {
    // Simple wave-like streaming motion for particles
    positions[i * 3 + 1] += Math.sin((i + Date.now() * 0.001) * 0.05) * 0.02;
    positions[i * 3 + 2] += Math.cos((i + Date.now() * 0.001) * 0.05) * 0.02;
  }
  particlesGeometry.attributes.position.needsUpdate = true; // Update particles
}

function animate() {
  requestAnimationFrame(animate);
  animateParticles();
  renderer.render(scene, camera);
}
animate();

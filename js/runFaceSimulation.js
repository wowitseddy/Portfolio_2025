import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass";

export function runFaceSimulation(container) {
  // Initialize Three.js scene
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(10, -10, 30);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  // Bloom pass setup
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.2,
    0.4,
    0.85
  );
  composer.addPass(bloomPass);

  // Particle grid properties
  const gridSize = 8;
  const particleSpacing = 2;
  const particles = [];

  // Create particles in a grid
  const particleGeometry = new THREE.SphereGeometry(0.1, 8, 8);
  const particleMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });

  for (let x = -gridSize; x <= gridSize; x += particleSpacing) {
    for (let y = -gridSize; y <= gridSize; y += particleSpacing) {
      for (let z = -gridSize; z <= gridSize; z += particleSpacing) {
        const particle = new THREE.Mesh(particleGeometry, particleMaterial);
        particle.position.set(x, y, z);
        scene.add(particle);
        particles.push(particle);
      }
    }
  }

  // Simple particle oscillation for dynamic effect
  function animateParticles() {
    particles.forEach((particle, index) => {
      particle.position.x += Math.sin(Date.now() * 0.001 + index) * 0.005;
      particle.position.y += Math.cos(Date.now() * 0.001 + index) * 0.005;
    });
  }

  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener("resize", onWindowResize, false);

  function animate() {
    requestAnimationFrame(animate);
    animateParticles();
    composer.render();
  }

  animate();
}

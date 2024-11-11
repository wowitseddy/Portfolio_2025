import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass";
import gsap from "gsap";
import { ScrollTrigger, ScrollToPlugin } from "gsap/all";
import { runFaceSimulation } from "./js/runFaceSimulation";
import { runDNAHelix } from "./js/runDNAHelix";
import "./js/reticule.js";
import "./js/hexgrid.js";
import "./js/resize.js";
import "./js/conditionalResize.js";
//import "./js/textAnimate.js";
//import "./js/ZoomBlurShader.js";
//import "./js/textTrigger.js";

gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);

// Update renderer size on window resize
window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.z = 20;

const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById("background-canvas"),
  antialias: true,
  alpha: true,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ReinhardToneMapping;
renderer.toneMappingExposure = 1.5;

// Particle System Configuration
const particleCount = 1000;
const particlesGeometry = new THREE.BufferGeometry();
const positions = new Float32Array(particleCount * 3);
particlesGeometry.setAttribute(
  "position",
  new THREE.BufferAttribute(positions, 3)
);
const particleMaterial = new THREE.PointsMaterial({
  color: 0xffffff,
  size: 0.02,
  transparent: true,
  opacity: 0.6,
});
const particleSystem = new THREE.Points(particlesGeometry, particleMaterial);
scene.add(particleSystem);

// Shape Position Arrays
const spherePositions = new Float32Array(particleCount * 3);
const gridPositions = new Float32Array(particleCount * 3);
const ringPositions = new Float32Array(particleCount * 3);

// Generate Shape Positions
function generateShapePositions(shape) {
  switch (shape) {
    case "sphere":
      const radius = 7;
      for (let i = 0; i < particleCount; i++) {
        const theta = Math.random() * 2 * Math.PI;
        const phi = Math.acos(2 * Math.random() - 1);
        spherePositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
        spherePositions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
        spherePositions[i * 3 + 2] = radius * Math.cos(phi);
      }
      return spherePositions;

    case "grid":
      const size = 10;
      const gridSize = Math.cbrt(particleCount);
      let index = 0;
      for (let x = -size; x < size; x += size / gridSize) {
        for (let y = -size; y < size; y += size / gridSize) {
          for (let z = -size; z < size; z += size / gridSize) {
            if (index < particleCount * 3) {
              gridPositions[index] = x;
              gridPositions[index + 1] = y;
              gridPositions[index + 2] = z;
              index += 3;
            }
          }
        }
      }
      return gridPositions;

    case "ring":
      const ringRadius = 7;
      for (let i = 0; i < particleCount; i++) {
        const angle = (i / particleCount) * 2 * Math.PI;
        ringPositions[i * 3] = ringRadius * Math.cos(angle);
        ringPositions[i * 3 + 1] = ringRadius * Math.sin(angle);
        ringPositions[i * 3 + 2] = (Math.random() - 0.5) * 2;
      }
      return ringPositions;

    default:
      console.warn(`Unknown shape: ${shape}`);
      return spherePositions;
  }
}

// Morph Particles with GSAP
function morphParticles(targetShape, duration = 3) {
  const targetPositions = generateShapePositions(targetShape);

  gsap.to(particlesGeometry.attributes.position.array, {
    endArray: targetPositions,
    duration: duration,
    ease: "power2.inOut", // Smooth, curved easing
    onUpdate: () => (particlesGeometry.attributes.position.needsUpdate = true),
  });
}

// ScrollTrigger Setup to Control Morphing on Scroll
ScrollTrigger.create({
  trigger: document.body,
  start: "top top",
  end: "bottom bottom",
  scrub: true,
  onUpdate: (self) => {
    const progress = self.progress;

    if (progress < 0.3) {
      morphParticles("sphere", 1); // Morph to sphere
    } else if (progress < 0.7) {
      morphParticles("grid", 1); // Morph to grid
    } else {
      morphParticles("ring", 1); // Morph to ring
    }
  },
});

// Keyboard controls for morphing
document.addEventListener("keydown", (event) => {
  if (event.key === "1") morphParticles("sphere");
  if (event.key === "2") morphParticles("grid");
  if (event.key === "3") morphParticles("ring");
});

// Face and DNA Simulation Trigger
ScrollTrigger.create({
  trigger: "#face-simulation-section",
  start: "top 70%",
  onEnter: () => {
    const container = document.getElementById("face-simulation-container");
    if (!container.hasChildNodes()) {
      runFaceSimulation(container); // Run face simulation
      runDNAHelix(container); // Run DNA helix simulation
    }
  },
});

// Toggle for About section
document
  .getElementById("about-toggle")
  .addEventListener("click", toggleContent);

function toggleContent() {
  const content = document.getElementById("collapsible-content");
  const arrow = document.getElementById("arrow");

  if (content.classList.contains("show")) {
    content.classList.remove("show");
    arrow.textContent = ">";
  } else {
    content.classList.add("show");
    arrow.textContent = "v";
  }
}

// Auto-expand the About section on page load
window.addEventListener("load", () => {
  setTimeout(() => {
    const content = document.getElementById("collapsible-content");
    const arrow = document.getElementById("arrow");

    content.classList.add("show");
    arrow.textContent = "v";
  }, 70); // Adjust the delay as needed (500ms in this example)
});

document.querySelectorAll(".content-section").forEach((section) => {
  gsap.fromTo(
    section,
    {
      "--border-opacity": 0,
      "--border-scaleX": 0,
    },
    {
      "--border-opacity": 1,
      "--border-scaleX": 1,
      duration: 0.6,
      ease: "power2.out",
      scrollTrigger: {
        trigger: section,
        start: "top 80%",
        toggleActions: "play none none reverse",
      },
      onUpdate: function () {
        section.style.setProperty(
          "--border-opacity",
          gsap.getProperty(section, "--border-opacity")
        );
        section.style.setProperty(
          "--border-scaleX",
          gsap.getProperty(section, "--border-scaleX")
        );
      },
    }
  );
});

document.querySelectorAll(".bubble").forEach((bubble, index) => {
  // Set unique starting x-position based on bubble index
  const initialXPosition = index === 0 ? -200 : index === 1 ? 0 : 200;

  gsap.fromTo(
    bubble,
    { x: initialXPosition, opacity: 0 },
    {
      x: 0,
      opacity: 1,
      duration: 1.5,
      ease: "power2.out",
      scrollTrigger: {
        trigger: bubble,
        start: `${index * 30 + 30}% 80%`, // Different scroll start for each bubble
        toggleActions: "play none none reverse",
      },
    }
  );
});

// Function to scroll to specific positions
function scrollToPosition(progress) {
  gsap.to(window, {
    duration: 1,
    scrollTo: { y: progress * document.body.scrollHeight, autoKill: false },
    ease: "power2.inOut",
  });
}

// Add event listeners to each main-ticker for click functionality
document.querySelectorAll(".main-ticker").forEach((mainTicker) => {
  mainTicker.addEventListener("click", () => {
    const scrollPosition = parseFloat(
      mainTicker.getAttribute("data-scroll-to")
    );
    scrollToPosition(scrollPosition);
  });
});

// Adjust multiplier for faster movement on mini-tickers
const scrollSpeedMultiplier = 0.6; // Apply only to mini-tickers

// ScrollTrigger for Mini Tickers (faster scrolling effect)
document.querySelectorAll(".ticker").forEach((miniTicker) => {
  const sectionPosition = parseFloat(miniTicker.getAttribute("data-section"));

  ScrollTrigger.create({
    trigger: document.body,
    start: "top top",
    end: "bottom bottom",
    scrub: true,
    onUpdate: (self) => {
      const progress = self.progress * scrollSpeedMultiplier;

      // Calculate distance from scroll position to each mini-ticker's position
      const distance = Math.abs(progress - sectionPosition);

      // Fade effect for mini-ticker
      miniTicker.style.opacity = Math.max(1 - distance * 3, 0.1);
    },
  });
});

// ScrollTrigger for Main Tickers (normal scrolling effect)
document.querySelectorAll(".main-ticker").forEach((mainTicker) => {
  const sectionPosition = parseFloat(mainTicker.getAttribute("data-scroll-to"));

  ScrollTrigger.create({
    trigger: document.body,
    start: "top top",
    end: "bottom bottom",
    scrub: true,
    onUpdate: (self) => {
      const progress = self.progress;

      // Calculate distance from scroll position to each main-ticker's position
      const distance = Math.abs(progress - sectionPosition);

      // Fade effect for main-ticker
      mainTicker.style.opacity = Math.max(1 - distance * 2, 0.5);
    },
  });
});

document.querySelectorAll(".flowchart").forEach((mainTicker) => {
  const sectionPosition = parseFloat(mainTicker.getAttribute("data-scroll-to"));

  ScrollTrigger.create({
    trigger: document.body,
    start: "top top",
    end: "bottom bottom",
    scrub: true,
    onUpdate: (self) => {
      const progress = self.progress;

      // Calculate distance from scroll position to each main-ticker's position
      const distance = Math.abs(progress - sectionPosition);

      // Fade effect for main-ticker
      mainTicker.style.opacity = Math.max(1 - distance * 2, 0.5);
    },
  });

  gsap.fromTo(
    flowchart,
    { x: initialXPosition, opacity: 0 },
    {
      x: 0,
      opacity: 1,
      duration: 1.5,
      ease: "power2.out",
      scrollTrigger: {
        trigger: flowchart,
        start: `${index * 40 + 40}% 50%`, // Different scroll start for each
        toggleActions: "play none none reverse",
      },
    }
  );
});

document.addEventListener("DOMContentLoaded", () => {
  const steps = document.querySelectorAll(".flowchart-step");

  // Use GSAP's timeline for animation control
  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: ".flowchart-step", // or a specific element ID if you want to trigger on a container
      start: "top 75%", // Starts when the top of the trigger hits 70% from the top of the viewport
      end: "bottom top", // Ends when the bottom of the trigger hits the top of the viewport
      toggleActions: "play none none reverse",
    },
  });

  // Animate each step
  steps.forEach((step, index) => {
    // Initially hide all steps
    gsap.set(step, { opacity: 0, y: 20 });

    tl.to(
      step,
      {
        duration: 2,
        opacity: 1,
        y: 0,
        ease: "power2.out",
        delay: index * 0.1, // Delay each step by 0.1 seconds
      },
      index * 0.1
    ); // This delay is for the timeline itself, ensuring steps animate sequentially
  });
});

document.addEventListener("DOMContentLoaded", () => {
  gsap.registerPlugin(ScrollTrigger);

  document.querySelectorAll(".bubble p").forEach((text, index) => {
    // Initial state for each text bubble
    gsap.set(text, { opacity: 0, y: 20 });

    // Create a timeline for each bubble
    const bubbleTimeline = gsap.timeline({
      scrollTrigger: {
        trigger: text,
        start: "top 90%", // Animation starts when 90% of the bubble is scrolled into view
        toggleActions: "play none none reverse", // Only plays or reverses, no other actions
      },
    });

    // Animate bubble's width and text content
    bubbleTimeline
      .fromTo(
        text,
        { width: 0 },
        {
          width: "100%",
          duration: 2,
          ease: "power2.out",
        },
        0 // At the start of the timeline
      )
      .to(
        text,
        {
          opacity: 1,
          y: 0,
          duration: 1,
          ease: "power2.out",
        },
        0.2 // This animation starts 0.2 seconds after the width animation begins
      );
  });
});

// Main Animation Loop
function animateParticles() {
  requestAnimationFrame(animateParticles);
  particleSystem.rotation.y += 0.0003; // Rotate particles for extra effect
  composer.render();
}

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(
  new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    3,
    0.009,
    0.09
  )
);

// Start animation loop
animateParticles();

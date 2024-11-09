import gsap from "gsap";

/**
 * Creates a pulse effect for the particles by animating the opacity.
 * @param {THREE.PointsMaterial} particleMaterial - The material of the particles.
 * @param {number} particleCount - The number of particles.
 */
export function createPulseEffect(particleMaterial, particleCount) {
  // Use GSAP to animate opacity over time
  for (let i = 0; i < particleCount; i++) {
    const randomDelay = Math.random() * 5; // Random delay between 0 to 5 seconds
    const randomDuration = 3 + Math.random() * 2; // Random duration between 3 to 5 seconds

    // GSAP animation for pulsing effect
    gsap.to(particleMaterial, {
      opacity: Math.random() * 0.5 + 0.5, // Randomized opacity (0.5 to 1)
      duration: randomDuration,
      delay: randomDelay,
      repeat: -1, // Loop infinitely
      yoyo: true, // Reverse animation to create pulse effect
      ease: "power1.inOut",
    });
  }
}

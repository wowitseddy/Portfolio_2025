import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
gsap.registerPlugin(ScrollTrigger);

export function setupScrollAnimations(particleSystem) {
  // Rotate particle system based on scroll
  ScrollTrigger.create({
    trigger: document.body,
    start: "top top",
    end: "bottom bottom",
    scrub: true, // Smooth animation as you scroll
    onUpdate: (self) => {
      const scrollProgress = self.progress;
      particleSystem.rotation.x = scrollProgress * Math.PI;
      particleSystem.rotation.y = scrollProgress * Math.PI * 2;
    },
  });

  // Animate individual bubbles on scroll
  document.querySelectorAll(".bubble").forEach((bubble) => {
    gsap.fromTo(
      bubble,
      { opacity: 0, y: 100 },
      {
        opacity: 1,
        y: 0,
        duration: 1,
        scrollTrigger: {
          trigger: bubble,
          start: "top 80%",
          toggleActions: "play none none reverse",
        },
      }
    );
  });
}

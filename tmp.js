// Keyboard controls for morphing
document.addEventListener("keydown", (event) => {
  if (event.key === "1") morphParticles("sphere");
  if (event.key === "2") morphParticles("grid");
  if (event.key === "3") morphParticles("ring");
});

// Face and DNA Simulation Trigger
ScrollTrigger.create({
  trigger: "#face-simulation-section",
  start: "bottom 25%",
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

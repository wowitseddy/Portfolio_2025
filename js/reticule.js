import "./hexgrid.js";

// Select elements
const hexOverlay = document.getElementById("hex-overlay");
const reticule = document.getElementById("reticule");

// Add click pulse effect
document.addEventListener("click", () => {
  reticule.classList.add("click-effect");

  // Remove the effect after animation ends
  setTimeout(() => {
    reticule.classList.remove("click-effect");
  }, 400); // Duration matches pulse animation
});

// Hover effect for interactive elements
document
  .querySelectorAll("button, a, input, select, textarea, .selectable-item")
  .forEach((element) => {
    element.addEventListener("mouseenter", () => {
      reticule.classList.add("hovered");
      hexOverlay.style.clipPath = "circle(75px at var(--x) var(--y))"; // Expands hex grid radius
    });
    element.addEventListener("mouseleave", () => {
      reticule.classList.remove("hovered");
      hexOverlay.style.clipPath = "circle(50px at var(--x) var(--y))"; // Shrinks hex grid radius
    });
  });

document.addEventListener("DOMContentLoaded", () => {
  const hexOverlay = document.getElementById("hex-overlay");
  const reticule = document.getElementById("reticule");

  // Function to update CSS variables for cursor position
  function updateCursorPosition(e) {
    const { clientX, clientY } = e.type === "touchmove" ? e.touches[0] : e;

    // Update CSS variables for cursor position
    document.documentElement.style.setProperty("--x", `${clientX}px`);
    document.documentElement.style.setProperty("--y", `${clientY}px`);

    // Move reticule to follow cursor
    reticule.style.left = `${clientX}px`;
    reticule.style.top = `${clientY}px`;
  }

  // Event listeners for mouse and touch move to track cursor
  ["mousemove", "touchmove"].forEach((event) => {
    document.addEventListener(
      event,
      (e) => {
        if (event === "touchmove") {
          e.preventDefault(); // Prevent scrolling on touch devices if needed
        }
        updateCursorPosition(e);
      },
      { passive: false }
    );
  });
});

// Cancel animation frame on mouse out to save resources
document.addEventListener("mouseleave", () => {
  cancelAnimationFrame(requestId);
  requestId = null;
});

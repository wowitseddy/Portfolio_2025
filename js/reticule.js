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
document.querySelectorAll("button, a, input").forEach((element) => {
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
  const reticule = document.getElementById("reticule"); // Assuming there's an element for the reticule

  // Initialize variables to store cursor position
  let cursorX = 0;
  let cursorY = 0;

  // Function to update the overlay, reticule, and mask positions
  function updateCursorPosition(e) {
    const { clientX, clientY } = e.type === "touchmove" ? e.touches[0] : e;

    cursorX = clientX;
    cursorY = clientY;

    // Update reticule position
    reticule.style.left = `${cursorX}px`;
    reticule.style.top = `${cursorY}px`;

    // Update clip-path for hex overlay
    hexOverlay.style.clipPath = `circle(50px at ${cursorX}px ${cursorY}px)`;

    // Update mask position
    hexOverlay.style.maskPosition = `${cursorX}px ${cursorY}px`;
    hexOverlay.style.webkitMaskPosition = `${cursorX}px ${cursorY}px`; // For Webkit browsers

    // Schedule the next frame update
    requestAnimationFrame(updateCursorPosition.bind(null, e));
  }

  // Event listeners for both mouse and touch movement
  ["mousemove", "touchmove"].forEach((event) => {
    document.addEventListener(
      event,
      (e) => {
        if (event === "touchmove") {
          e.preventDefault(); // Prevent scrolling if needed
        }
        updateCursorPosition(e);
      },
      event === "touchmove" ? { passive: false } : undefined
    );
  });
});

// Cancel animation frame on mouse out to save resources
document.addEventListener("mouseleave", () => {
  cancelAnimationFrame(requestId);
  requestId = null;
});

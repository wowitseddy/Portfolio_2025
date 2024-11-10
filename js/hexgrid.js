window.onload = () => {
  document.addEventListener("mousemove", updateCursorPosition);
};

const hexGrid = document.querySelector(".hex-grid");
const gradientMask = document.querySelector(".gradient-mask");

let cursorX = 0;
let cursorY = 0;

// Track cursor position with CSS variables
document.addEventListener("mousemove", (e) => {
  const x = `${e.clientX}px`;
  const y = `${e.clientY}px`;

  // Update CSS variables for cursor position
  hexGrid.style.setProperty("--cursor-x", x);
  hexGrid.style.setProperty("--cursor-y", y);
  gradientMask.style.setProperty("--cursor-x", x);
  gradientMask.style.setProperty("--cursor-y", y);
});

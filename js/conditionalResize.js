// Detect device type based on screen width
const isMobileDevice = window.matchMedia("(max-width: 767px)").matches;
const isTabletDevice = window.matchMedia(
  "(min-width: 768px) and (max-width: 1023px)"
).matches;
const isDesktopDevice = window.matchMedia("(min-width: 1024px)").matches;

// Function to dynamically load a CSS file
function loadCSS(filename) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = filename;
  document.head.appendChild(link);
}

// Load the appropriate CSS file based on the detected device type
if (isMobileDevice) {
  loadCSS("mobile.css");
  document.body.classList.add("mobile");
} else if (isTabletDevice) {
  loadCSS("tablet.css");
  document.body.classList.add("tablet");
} else if (isDesktopDevice) {
  loadCSS("desktop.css");
  document.body.classList.add("desktop");
}

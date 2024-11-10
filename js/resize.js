// Function to update dimensions and maintain 1:1 aspect ratio
function updateDimensions() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  // Log updated dimensions for debugging
  console.log(`Updated dimensions: Width = ${width}, Height = ${height}`);

  // Update canvas dimensions
  const canvas = document.getElementById("myCanvas");
  if (canvas) {
    canvas.width = width;
    canvas.height = height;
  }

  // Update Three.js renderer if defined
  if (typeof renderer !== "undefined") {
    renderer.setSize(width, height);
  }

  // Update camera aspect ratio and projection matrix
  if (typeof camera !== "undefined") {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  // Maintain 1:1 scaling for geometry objects
  const minDimension = Math.min(width, height);
  const scaleFactor = minDimension / 500; // Adjust the baseline if needed

  // Update geometry scales to maintain 1:1 ratio
  if (typeof sphere !== "undefined") {
    sphere.scale.set(scaleFactor, scaleFactor, scaleFactor);
  }
  if (typeof grid !== "undefined") {
    grid.scale.set(scaleFactor, scaleFactor, scaleFactor);
  }
  if (typeof ring !== "undefined") {
    ring.scale.set(scaleFactor, scaleFactor, scaleFactor);
  }
}

// Attach event listener for resizing and call once on page load
window.addEventListener("resize", updateDimensions);
updateDimensions();

window.addEventListener("orientationchange", updateDimensions);

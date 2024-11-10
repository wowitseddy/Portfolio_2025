// Function to update dimensions
function updateDimensions() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  // Update any elements or variables dependent on window size
  console.log(`Updated dimensions: Width = ${width}, Height = ${height}`);

  // Example: Update canvas or element dimensions
  const canvas = document.getElementById("myCanvas");
  if (canvas) {
    canvas.width = width;
    canvas.height = height;
  }

  // You can also add logic to reposition elements or re-render parts of the page if needed
}

// Add event listener to call updateDimensions on resize
window.addEventListener("resize", updateDimensions);

// Initial call to set dimensions on page load
updateDimensions();

window.addEventListener("orientationchange", () => {
  // Re-run the dimensions update on orientation change
  updateDimensions();
});

// Disable right-click context menu
document.addEventListener("contextmenu", (e) => {
  e.preventDefault();
});

document.addEventListener("keydown", (e) => {
  // Disable specific shortcuts
  if (
    (e.ctrlKey && e.key === "s") ||
    (e.ctrlKey && e.shiftKey && e.key === "I") ||
    e.key === "F12"
  ) {
    e.preventDefault();
  }
});

document.addEventListener("dragstart", (e) => {
  if (e.target.tagName === "IMG" || e.target.tagName === "A") {
    e.preventDefault();
  }
});

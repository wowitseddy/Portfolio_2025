export function toggleContent() {
  const content = document.getElementById("collapsible-content");
  const arrow = document.getElementById("arrow");

  // Toggle collapsed class and update arrow direction
  content.classList.toggle("collapsed");
  arrow.textContent = content.classList.contains("collapsed") ? ">" : "v";
}

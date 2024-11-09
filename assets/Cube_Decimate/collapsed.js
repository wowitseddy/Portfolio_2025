function toggleContent() {
  const content = document.getElementById("content");
  const arrow = document.getElementById("arrow");

  // Toggle the collapsed class
  content.classList.toggle("collapsed");

  // Toggle the arrow direction
  if (content.classList.contains("collapsed")) {
    arrow.textContent = ">";
    arrow.style.transform = "rotate(0deg)";
  } else {
    arrow.textContent = "v";
    arrow.style.transform = "rotate(90deg)";
  }
}

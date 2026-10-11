import "./hexgrid.js";

document.addEventListener("DOMContentLoaded", () => {
  const hexOverlay = document.getElementById("hex-overlay");
  const reticule = document.getElementById("reticule");

  if (!reticule) {
    return;
  }

  document.documentElement.style.setProperty("--hex-reveal-radius", "210px");

  function setCursorVars(x, y) {
    document.documentElement.style.setProperty("--x", `${x}px`);
    document.documentElement.style.setProperty("--y", `${y}px`);
    document.documentElement.style.setProperty("--cursor-x", `${x}px`);
    document.documentElement.style.setProperty("--cursor-y", `${y}px`);
  }

  function updateCursorPosition(e) {
    const point = e.touches ? e.touches[0] : e;
    if (!point) {
      return;
    }

    const x = point.clientX;
    const y = point.clientY;

    setCursorVars(x, y);
    reticule.style.left = `${x}px`;
    reticule.style.top = `${y}px`;
    if (hexOverlay) {
      hexOverlay.style.opacity = "1";
    }
  }

  function setHexRadius(value) {
    document.documentElement.style.setProperty("--hex-reveal-radius", value);
  }

  document.addEventListener("mousemove", updateCursorPosition, {
    passive: true,
  });
  document.addEventListener(
    "touchmove",
    (e) => {
      updateCursorPosition(e);
    },
    { passive: true },
  );

  document.addEventListener("click", () => {
    reticule.classList.add("click-effect");
    window.setTimeout(() => {
      reticule.classList.remove("click-effect");
    }, 400);
  });

  document
    .querySelectorAll("button, a, input, select, textarea, .selectable-item")
    .forEach((element) => {
      element.addEventListener("mouseenter", () => {
        reticule.classList.add("hovered");
        setHexRadius("260px");
      });

      element.addEventListener("mouseleave", () => {
        reticule.classList.remove("hovered");
        setHexRadius("210px");
      });
    });

  window.addEventListener("mouseout", (event) => {
    if (event.relatedTarget) {
      return;
    }
    reticule.classList.remove("hovered");
    setHexRadius("210px");
    if (hexOverlay) {
      hexOverlay.style.opacity = "0.98";
    }
  });

  window.addEventListener("focus", () => {
    setHexRadius("210px");
  });

  if (window.matchMedia("(pointer: coarse)").matches) {
    document.body.style.cursor = "none";
  }
});

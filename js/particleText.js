import * as THREE from "three";

export async function generateParticleText(text, scene) {
  // Load font
  const loader = new THREE.FontLoader();
  const font = await loader.loadAsync(
    "https://threejs.org/examples/fonts/helvetiker_regular.typeface.json"
  );

  // Generate text geometry
  const textGeometry = new THREE.TextGeometry(text, {
    font: font,
    size: 5,
    height: 1,
    curveSegments: 12,
  });

  textGeometry.center();

  // Convert text geometry vertices to particles
  const pointsMaterial = new THREE.PointsMaterial({
    color: 0x00ff99,
    size: 0.1,
  });
  const points = new THREE.Points(textGeometry, pointsMaterial);
  scene.add(points);

  return points;
}

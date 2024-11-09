// Add the ZoomBlur Shader as a ShaderPass
const zoomBlurPass = new ShaderPass(ZoomBlurShader);
zoomBlurPass.uniforms["center"].value.set(0.5, 0.5); // Center for zoom effect
composer.addPass(zoomBlurPass);

// ScrollTrigger to control zoom blur effect strength
ScrollTrigger.create({
  trigger: document.body,
  start: "top top",
  end: "bottom bottom",
  scrub: true,
  onUpdate: (self) => {
    zoomBlurPass.uniforms["strength"].value = self.progress * 0.05; // Lower multiplier for subtler blur
  },
});

document.querySelectorAll(".bubble p").forEach((text, index) => {
  gsap.fromTo(
    text,
    { width: 0 },
    {
      width: "100%",
      duration: 2,
      ease: "power2.out",
      scrollTrigger: {
        trigger: text,
        start: "top 90%",
        toggleActions: "play none none reverse",
      },
    }
  );
});

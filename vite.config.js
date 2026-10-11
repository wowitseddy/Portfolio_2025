import { resolve } from "node:path";
import { defineConfig } from "vite";
import devSceneApplyPlugin from "./vite-plugin-dev-scene-apply.js";
import resumeToolsPlugin from "./vite-plugin-resume-tools.js";

export default defineConfig({
  plugins: [devSceneApplyPlugin(), resumeToolsPlugin()],
  server: {
    open: true,
    port: 3000,
  },
  base: "./",
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        resumeTools: resolve(__dirname, "resume-tools.html"),
        examDiagnostics: resolve(__dirname, "exam-diagnostics.html"),
        dragonfireProtocol: resolve(__dirname, "dragonfire-protocol.html"),
      },
      output: {
        manualChunks: {
          // Three.js and related loaders in separate chunks
          "three-vendor": ["three"],
          // OrbitControls and GLTFLoader on-demand
          "gltf-loaders": [
            "three/examples/jsm/loaders/GLTFLoader.js",
            "three/examples/jsm/loaders/DRACOLoader.js",
            "three/examples/jsm/controls/OrbitControls.js",
          ],
          // Post-processing effects
          effects: [
            "three/examples/jsm/postprocessing/EffectComposer.js",
            "three/examples/jsm/postprocessing/RenderPass.js",
            "three/examples/jsm/postprocessing/ShaderPass.js",
            "three/examples/jsm/postprocessing/UnrealBloomPass.js",
          ],
        },
      },
    },
    // Increase chunk warning limit since we have optimized chunks
    chunkSizeWarningLimit: 700,
  },
});

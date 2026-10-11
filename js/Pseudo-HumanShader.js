import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

/**
 * PseudoHumanShader - Loads and manages the Harness_PK GLTF model
 * Optimized for performance with proper async loading and mesh optimization
 */
export class PseudoHumanShader {
  constructor(scene, camera, onLoadStart, onLoadProgress, onLoadComplete) {
    this.scene = scene;
    this.camera = camera;
    this.model = null;
    this.mixer = null;
    this.actions = [];
    this.isLoading = false;

    this.onLoadStart = onLoadStart || (() => {});
    this.onLoadProgress = onLoadProgress || (() => {});
    this.onLoadComplete = onLoadComplete || (() => {});

    // Model configuration
    this.modelPath = "assets/GLTF/Harness_PK_GLTF.glb";
    this.modelScale = 1.0;
    this.autoRotate = true;
    this.autoRotateSpeed = 0.5;

    this.init();
  }

  /**
   * Initialize GLTF loader with Draco compression support
   */
  init() {
    this.loader = new GLTFLoader();

    // Setup Draco loader for compressed geometries
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(
      "https://www.gstatic.com/draco/versioned/decoders/1.5.6/",
    );
    this.loader.setDRACOLoader(dracoLoader);

    this.loadModel();
  }

  /**
   * Load GLTF model asynchronously
   */
  loadModel() {
    if (this.isLoading) return;

    this.isLoading = true;
    this.onLoadStart();

    this.loader.load(
      this.modelPath,
      (gltf) => this.onModelLoaded(gltf),
      (progress) => this.onProgress(progress),
      (error) => this.onLoadError(error),
    );
  }

  /**
   * Handle successful model load
   */
  onModelLoaded(gltf) {
    this.model = gltf.scene;

    // Optimize the model for performance
    this.optimizeModel(this.model);

    // Apply scale and position
    this.model.scale.set(this.modelScale, this.modelScale, this.modelScale);
    this.model.position.set(0, 0, 0);

    // Add to scene
    this.scene.add(this.model);

    // Setup animations if available
    if (gltf.animations && gltf.animations.length > 0) {
      this.setupAnimations(gltf);
    }

    this.isLoading = false;
    this.onLoadComplete(this.model);

    console.log("✓ Harness_PK GLTF loaded successfully", this.model);
  }

  /**
   * Optimize model for better performance
   */
  optimizeModel(model) {
    model.traverse((child) => {
      // Cache material properties
      if (child.isMesh) {
        // Merge geometries where possible
        child.geometry.computeVertexNormals();

        // Enable frustum culling
        child.frustumCulled = true;

        // Mark for shadow casting
        child.castShadow = true;
        child.receiveShadow = true;

        // Dispose of unused properties
        if (child.material) {
          child.material.side = THREE.DoubleSide;
          if (child.material.map) {
            child.material.map.generateMipmaps = true;
          }
        }
      }
    });
  }

  /**
   * Setup animation mixer and actions
   */
  setupAnimations(gltf) {
    this.mixer = new THREE.AnimationMixer(this.model);

    gltf.animations.forEach((clip) => {
      const action = this.mixer.clipAction(clip);
      this.actions.push(action);

      // Auto-play first animation
      if (this.actions.length === 1) {
        action.play();
      }
    });

    console.log(`✓ Setup ${gltf.animations.length} animation(s)`);
  }

  /**
   * Handle load progress
   */
  onProgress(progressEvent) {
    if (progressEvent.lengthComputable) {
      const percentComplete =
        (progressEvent.loaded / progressEvent.total) * 100;
      this.onLoadProgress(percentComplete);
      console.log(`Loading: ${percentComplete.toFixed(2)}%`);
    }
  }

  /**
   * Handle load error
   */
  onLoadError(error) {
    this.isLoading = false;
    console.error("✗ Failed to load Harness_PK GLTF:", error);
    this.onLoadProgress(100); // Complete loading UI
  }

  /**
   * Update animations (call from main render loop)
   */
  update(deltaTime) {
    if (this.mixer) {
      this.mixer.update(deltaTime);
    }

    if (this.model && this.autoRotate) {
      this.model.rotation.y += this.autoRotateSpeed * deltaTime;
    }
  }

  /**
   * Play specific animation by name
   */
  playAnimation(name) {
    if (!this.mixer) return;

    const clip = THREE.AnimationClip.findByName(this.actions, name);
    if (clip) {
      this.mixer.stopAllAction();
      this.mixer.clipAction(clip).play();
    }
  }

  /**
   * Stop all animations
   */
  stopAnimations() {
    if (this.mixer) {
      this.mixer.stopAllAction();
    }
  }

  /**
   * Set model visibility
   */
  setVisible(visible) {
    if (this.model) {
      this.model.visible = visible;
    }
  }

  /**
   * Dispose resources
   */
  dispose() {
    if (this.model) {
      this.model.traverse((child) => {
        if (child.isMesh) {
          child.geometry.dispose();
          if (child.material) {
            child.material.dispose();
          }
        }
      });
    }

    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer = null;
    }

    this.scene.remove(this.model);
  }
}

//Morph target of particles map to mesh geometry faces, GLTF importer to convert human model with alpha shader for
// intentional transparency with noise array for randomization of distribution. Particles flow uinidirectionally as camera rotates
//around mesh which rotation is controlled by canvas scrolling to transition webpage elements. Pseudo
//human element is not rendered when not in-view.

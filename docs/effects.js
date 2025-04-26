// docs/effects.js

// Needs access to globals: scene, camera, gunViewModel, CONFIG, currentRecoilOffset, gunModel, loadManager
// Needs access to utils: createImpactParticle

const Effects = {
    muzzleFlash: null,
    flashDuration: CONFIG?.MUZZLE_FLASH_DURATION || 50, // Use optional chaining and default
    flashIntensity: 3, // Adjust intensity as needed
    flashColor: 0xfff5a0, // Yellowish-white color
    flashActive: false,
    flashTimeout: null,

    initialize: function(sceneRef) { // Needs scene passed in
        if (!sceneRef) { console.error("[Effects] Scene reference is needed for initialization!"); return; }
        if (typeof THREE === 'undefined') { console.error("THREE library not loaded before Effects initialization!"); return; }

        try {
             // Create the point light for muzzle flash but keep intensity 0 initially
             this.muzzleFlash = new THREE.PointLight(this.flashColor, 0, 4, 2); // color, intensity, distance, decay
             this.muzzleFlash.castShadow = false; // Muzzle flash shouldn't cast shadows
             console.log("[Effects] Initialized (Muzzle flash ready).");
        }
        catch(e) { console.error("[Effects] Initialization failed:", e); }
    },

    triggerMuzzleFlash: function() {
        // Check essential components
        if (!this.muzzleFlash || !gunViewModel || !camera || typeof CONFIG === 'undefined' || !scene) {
             // console.warn("[Effects] Cannot trigger muzzle flash: Prerequisites missing."); // Less verbose
             return;
        }
        if (gunViewModel.parent !== camera) {
             console.warn("[Effects] Cannot trigger muzzle flash: Gun view model not attached to camera.");
             return;
        }
        if (this.flashTimeout) clearTimeout(this.flashTimeout);

        try {
            // Ensure muzzle offset exists in config
            const muzzleOffset = CONFIG.MUZZLE_LOCAL_OFFSET ? CONFIG.MUZZLE_LOCAL_OFFSET.clone() : new THREE.Vector3(0, 0, -1); // Default offset
            const worldMuzzlePosition = gunViewModel.localToWorld(muzzleOffset);

            this.muzzleFlash.position.copy(worldMuzzlePosition);
            this.muzzleFlash.intensity = this.flashIntensity;
            this.flashActive = true;
            if (this.muzzleFlash.parent !== scene) { scene.add(this.muzzleFlash); }

            const duration = CONFIG.MUZZLE_FLASH_DURATION || 50; // Get duration from config or default
            this.flashTimeout = setTimeout(() => {
                 this.muzzleFlash.intensity = 0;
                 this.flashActive = false;
                 if (scene && this.muzzleFlash.parent === scene) { scene.remove(this.muzzleFlash); }
                 this.flashTimeout = null;
            }, duration);

        } catch (e) {
            console.error("[Effects] Muzzle flash error:", e);
            this.muzzleFlash.intensity = 0;
            if (scene && this.muzzleFlash.parent === scene) scene.remove(this.muzzleFlash);
            if (this.flashTimeout) clearTimeout(this.flashTimeout); this.flashTimeout = null;
        }
    },

    createImpact: function(position) {
         if (!position) return;
         if (typeof createImpactParticle === 'function') {
             const particleCount = CONFIG?.BULLET_IMPACT_PARTICLES || 5;
             for (let i = 0; i < particleCount; i++) { createImpactParticle(position); }
         } else { console.warn("[Effects] createImpactParticle utility function not found."); }
     },

    update: function(deltaTime) {
        // Placeholder for future particle/effect updates
    },

    updateViewModel: function(deltaTime) {
         if(!gunViewModel || !camera || !CONFIG || !currentRecoilOffset) return; // Check required globals
         const recoverSpeed = CONFIG.RECOIL_RECOVER_SPEED || 10; // Use config or default
         currentRecoilOffset.lerp(new THREE.Vector3(0, 0, 0), deltaTime * recoverSpeed);
         const baseOffset = CONFIG.GUN_POS_OFFSET ? CONFIG.GUN_POS_OFFSET.clone() : new THREE.Vector3(0, 0, 0); // Use config or default
         const finalPosition = baseOffset.add(currentRecoilOffset);
         gunViewModel.position.copy(finalPosition);
    },

    attachGunViewModel: function() {
         console.log("[Effects] Attempting to attach gun view model...");

         // *** ADDED CHECK: Use loadManager.isAssetReady for robustness ***
         const gunModelIsReady = loadManager && loadManager.isAssetReady('gunModel') && window.gunModel instanceof THREE.Object3D;
         const cameraIsReady = !!(camera);
         const configIsReady = !!(CONFIG);

         console.log(`[Effects] >>> attachGunViewModel Checks: gunModelIsReady=${gunModelIsReady}, cameraIsReady=${cameraIsReady}, configIsReady=${configIsReady}`);

         if (!gunModelIsReady || !cameraIsReady || !configIsReady) {
             console.warn(`[Effects] Cannot attach gun: Prereqs missing/fail. gun=${gunModelIsReady}, cam=${cameraIsReady}, cfg=${configIsReady}`);
             return; // Stop if prerequisites aren't met
         }

         // Prevent re-attaching if already attached
         if (gunViewModel && gunViewModel.parent === camera) {
             console.log("[Effects] Gun view model already attached.");
             return;
         }
         // Remove any previous instance if it exists but wasn't parented correctly
         if (gunViewModel) {
             this.removeGunViewModel();
         }

         try {
             // Use config values with defaults
             const gunScale = CONFIG.GUN_SCALE || 0.1;
             const gunOffset = CONFIG.GUN_POS_OFFSET ? CONFIG.GUN_POS_OFFSET.clone() : new THREE.Vector3(0, -0.2, -0.5);

             console.log("[Effects] Cloning gun model. Using Offset:", gunOffset.toArray(), "Scale:", gunScale);
             gunViewModel = window.gunModel.clone(); // Clone from the verified global model

             gunViewModel.scale.set(gunScale, gunScale, gunScale);
             gunViewModel.position.copy(gunOffset);
             gunViewModel.rotation.y = Math.PI; // Standard rotation - adjust if needed based on model export

             // Reset recoil state
             if (typeof currentRecoilOffset !== 'undefined') {
                 currentRecoilOffset.set(0, 0, 0);
             } else { console.warn("[Effects] currentRecoilOffset global missing."); }

             // Add to camera
             camera.add(gunViewModel);
             console.log("[Effects] Gun view model attached successfully to camera.");

         } catch (e) {
             console.error("[Effects] Error attaching gun view model:", e);
             gunViewModel = null; // Ensure gunViewModel is null if cloning/attaching failed
         }
     },

    removeGunViewModel: function() {
         // Check if gunViewModel exists and is attached to the camera
         if (gunViewModel && camera && gunViewModel.parent === camera) {
             try {
                 camera.remove(gunViewModel);
                 // Optional: Dispose of geometry/materials if the clone won't be reused
                 // Consider performance implications before enabling deep disposal
                 // gunViewModel.traverse(child => { ... dispose logic ... });
                 gunViewModel = null; // Clear the global reference
                 console.log("[Effects] Gun view model removed from camera.");
             } catch (e) {
                 console.error("[Effects] Error removing gun view model:", e);
                 gunViewModel = null; // Ensure reference is cleared even on error
             }
         } else if (gunViewModel) {
             // If gunViewModel exists but isn't properly parented, just clear the reference
             console.log("[Effects] Gun view model exists but is not attached to camera, clearing reference.");
             gunViewModel = null;
         }
    },

    triggerRecoil: function() {
         // Check dependencies
         if (typeof currentRecoilOffset !== 'undefined' && typeof CONFIG !== 'undefined' && CONFIG.RECOIL_AMOUNT) {
             // Directly set the offset to the configured recoil amount
             currentRecoilOffset.copy(CONFIG.RECOIL_AMOUNT);
         } else {
             console.error("[Effects] Cannot trigger recoil: currentRecoilOffset or CONFIG.RECOIL_AMOUNT missing!");
         }
     }

};
window.Effects = Effects; // Export globally
console.log("effects.js loaded");

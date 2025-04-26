// docs/effects.js

// Needs access to globals: scene, camera, gunViewModel, CONFIG, currentRecoilOffset, gunModel
// Needs access to utils: createImpactParticle

const Effects = {
    muzzleFlash: null,
    flashDuration: CONFIG.MUZZLE_FLASH_DURATION || 50, // Duration in ms
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
             // console.warn("[Effects] Cannot trigger muzzle flash: Prerequisites missing."); // Keep logging minimal
             return;
        }
        // Ensure gunViewModel is properly attached to the camera for localToWorld to work correctly
        if (gunViewModel.parent !== camera) {
             console.warn("[Effects] Cannot trigger muzzle flash: Gun view model not attached to camera.");
             return;
        }

        // Clear any existing timeout to reset the flash if triggered rapidly
        if (this.flashTimeout) clearTimeout(this.flashTimeout);

        try {
            // Calculate world position of the muzzle offset relative to the gun view model
            const worldMuzzlePosition = gunViewModel.localToWorld(CONFIG.MUZZLE_LOCAL_OFFSET.clone());

            // Position the light at the muzzle
            this.muzzleFlash.position.copy(worldMuzzlePosition);

            // Set intensity and add to scene if not already added
            this.muzzleFlash.intensity = this.flashIntensity;
            this.flashActive = true;
            if (this.muzzleFlash.parent !== scene) {
                 scene.add(this.muzzleFlash);
            }

            // Set timeout to turn off the flash
            this.flashTimeout = setTimeout(() => {
                 this.muzzleFlash.intensity = 0;
                 this.flashActive = false;
                 // Remove from scene when inactive to potentially save resources
                 if (scene && this.muzzleFlash.parent === scene) {
                     scene.remove(this.muzzleFlash);
                 }
                 this.flashTimeout = null; // Clear timeout reference
            }, this.flashDuration);

        } catch (e) {
            console.error("[Effects] Muzzle flash error:", e);
            // Ensure flash is turned off in case of error
            this.muzzleFlash.intensity = 0;
            if (scene && this.muzzleFlash.parent === scene) scene.remove(this.muzzleFlash);
            if (this.flashTimeout) clearTimeout(this.flashTimeout);
            this.flashTimeout = null;
        }
    },

    // Placeholder for creating impact effects (e.g., particles)
    createImpact: function(position) {
         if (!position) return;
         // Use utility function if available
         if (typeof createImpactParticle === 'function') {
             const particleCount = CONFIG?.BULLET_IMPACT_PARTICLES || 5; // Use config value or default
             for (let i = 0; i < particleCount; i++) {
                 createImpactParticle(position);
             }
         } else {
             console.warn("[Effects] createImpactParticle utility function not found.");
         }
     },

     // Placeholder for updating ongoing effects (e.g., particle movement)
    update: function(deltaTime) {
        // Update particle systems or other time-dependent effects here
    },

    // Updates the position and handles recoil recovery for the gun view model
    updateViewModel: function(deltaTime) {
         // Check required globals
         if(!gunViewModel || !camera || typeof CONFIG === 'undefined' || typeof currentRecoilOffset === 'undefined') return;

         // Smoothly interpolate recoil offset back to zero
         currentRecoilOffset.lerp(new THREE.Vector3(0, 0, 0), deltaTime * CONFIG.RECOIL_RECOVER_SPEED);

         // Calculate final position including base offset and current recoil offset
         const finalPosition = CONFIG.GUN_POS_OFFSET.clone().add(currentRecoilOffset);
         gunViewModel.position.copy(finalPosition);

         // Rotation is handled implicitly by the gunViewModel being a child of the camera
    },

    // Attaches the loaded gun model to the camera to act as a view model
    attachGunViewModel: function() {
         console.log("[Effects] Attempting to attach gun view model...");

         // ** MODIFIED Prerequisite Check - Explicitly use window.gunModel **
         const gunModelIsReady = !!(window.gunModel && window.gunModel !== 'error' && window.gunModel instanceof THREE.Object3D);
         const cameraIsReady = !!(camera); // camera is already global
         const configIsReady = !!(CONFIG); // CONFIG is already global

         // Log the results of the checks performed *inside* this function
         console.log(`[Effects] >>> attachGunViewModel Checks: gunModelIsReady=${gunModelIsReady}, cameraIsReady=${cameraIsReady}, configIsReady=${configIsReady}`);

         if (!gunModelIsReady || !cameraIsReady || !configIsReady) {
             // Use the results just checked for the log message
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
             // *** ADDED LOGGING FOR VALUES USED ***
             console.log("[Effects] Cloning gun model. Using Offset:", CONFIG.GUN_POS_OFFSET.toArray(), "Scale:", CONFIG.GUN_SCALE);

             gunViewModel = window.gunModel.clone(); // Clone from the explicitly checked global

             gunViewModel.scale.set(CONFIG.GUN_SCALE, CONFIG.GUN_SCALE, CONFIG.GUN_SCALE);
             gunViewModel.position.copy(CONFIG.GUN_POS_OFFSET);
             // *** Keep or comment out rotation based on testing ***
             gunViewModel.rotation.y = Math.PI; // Rotate 180 degrees around Y (Try commenting this out if gun is still invisible)
             // gunViewModel.rotation.set(0, 0, 0); // Try resetting rotation completely

             if (typeof currentRecoilOffset !== 'undefined') {
                 currentRecoilOffset.set(0, 0, 0);
             } else {
                 console.warn("[Effects] currentRecoilOffset global missing, cannot reset on attach.");
             }

             // Add to camera
             camera.add(gunViewModel);
             console.log("[Effects] Gun view model attached successfully to camera.");

         } catch (e) {
             console.error("[Effects] Error attaching gun view model:", e);
             gunViewModel = null; // Ensure gunViewModel is null if cloning/attaching failed
         }
     },

    // Removes the gun view model from the camera
    removeGunViewModel: function() {
         // Check if gunViewModel exists and is attached to the camera
         if (gunViewModel && camera && gunViewModel.parent === camera) {
             try {
                 camera.remove(gunViewModel);
                 // Optional: Dispose of geometry/materials if the clone won't be reused
                 // gunViewModel.traverse(child => { ... dispose logic ... });
                 gunViewModel = null; // Clear the global reference
                 console.log("[Effects] Gun view model removed from camera.");
             } catch (e) {
                 console.error("[Effects] Error removing gun view model:", e);
                 gunViewModel = null; // Ensure reference is cleared even on error
             }
         } else if (gunViewModel) {
             console.log("[Effects] Gun view model exists but is not attached to camera, clearing reference.");
             gunViewModel = null;
         }
    },

    // Applies an immediate recoil impulse to the view model offset
    triggerRecoil: function() {
         // Check dependencies
         if (typeof currentRecoilOffset !== 'undefined' && typeof CONFIG !== 'undefined' && CONFIG.RECOIL_AMOUNT) {
             // Directly set the offset to the configured recoil amount
             // The updateViewModel function will handle lerping it back to zero
             currentRecoilOffset.copy(CONFIG.RECOIL_AMOUNT);
             // console.log("Triggered recoil, offset:", currentRecoilOffset.toArray());
         } else {
             console.error("[Effects] Cannot trigger recoil: currentRecoilOffset or CONFIG.RECOIL_AMOUNT missing!");
         }
     }

};
window.Effects = Effects; // Export globally
console.log("effects.js loaded");

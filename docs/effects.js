// docs/effects.js

// Needs access to globals: scene, camera, CONFIG, currentRecoilOffset, loadManager
// Needs access to utils: createImpactParticle
// Manages its own gunViewModel internally

const Effects = {
    gunViewModel: null, // Internal reference, not global
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
             this.gunViewModel = null; // Ensure internal view model starts null
             console.log("[Effects] Initialized (Muzzle flash ready).");
        } catch(e) { console.error("[Effects] Initialization failed:", e); }
    },

    // --- Sound Playback Helper ---
    playSound: function(assetKey) {
        if (!loadManager) { console.error("[Effects] LoadManager missing, cannot play sound."); return; }
        // Use the getter, which checks readiness internally
        const soundData = loadManager.getAssetData(assetKey);

        // *** ADDED LOGGING HERE ***
        console.log(`[Effects] Attempting to play sound '${assetKey}'. Retrieved data:`, soundData);


        if (soundData && soundData instanceof Audio) {
            console.log(`[Effects] Playing sound: ${assetKey}`);
            try {
                 // Clone node to allow overlapping plays
                 soundData.cloneNode().play().catch(e => {
                     // Log browser playback interruption errors, but don't spam console
                      if (e.name === 'NotAllowedError' || e.name === 'NotSupportedError') {
                         console.warn(`[Effects] Sound playback prevented for ${assetKey}: ${e.message}`);
                      } else {
                          // console.warn(`[Effects] Sound play() promise rejected for ${assetKey}: ${e.message}`); // Less verbose
                      }
                 });
            } catch (e) {
                 console.error(`[Effects] Error cloning/playing sound ${assetKey}:`, e);
            }
        } else {
            console.warn(`[Effects] Sound asset data not ready or invalid for key: ${assetKey}. Unable to play.`);
        }
    },

    // --- Muzzle Flash ---
    triggerMuzzleFlash: function() {
        // Now depends on internal gunViewModel
        if (!this.muzzleFlash || !this.gunViewModel || !camera || !CONFIG || !scene) return;
        if (this.gunViewModel.parent !== camera) { // Still need parent check
            console.warn("[Effects] Muzzle flash cannot trigger: Gun view model not child of camera.");
            return;
        }
        if (this.flashTimeout) clearTimeout(this.flashTimeout);
        try {
            // Ensure muzzle offset exists in config
            const muzzleOffset = CONFIG.MUZZLE_LOCAL_OFFSET ? CONFIG.MUZZLE_LOCAL_OFFSET.clone() : new THREE.Vector3(0,0,-1); // Default offset
            const worldMuzzlePosition = this.gunViewModel.localToWorld(muzzleOffset); // Use internal view model
            this.muzzleFlash.position.copy(worldMuzzlePosition);
            this.muzzleFlash.intensity = this.flashIntensity; this.flashActive = true;
            if (this.muzzleFlash.parent !== scene) scene.add(this.muzzleFlash);
            const duration = CONFIG.MUZZLE_FLASH_DURATION || 50; // Get duration from config or default
            this.flashTimeout = setTimeout(() => {
                 this.muzzleFlash.intensity = 0; this.flashActive = false;
                 if (scene && this.muzzleFlash.parent === scene) scene.remove(this.muzzleFlash);
                 this.flashTimeout = null;
            }, duration);
        } catch (e) {
            console.error("[Effects] Muzzle flash error:", e);
            // Cleanup on error
            this.muzzleFlash.intensity = 0;
            if (scene && this.muzzleFlash.parent === scene) scene.remove(this.muzzleFlash);
            if (this.flashTimeout) clearTimeout(this.flashTimeout); this.flashTimeout = null;
        }
    },

    // --- Impact ---
    createImpact: function(position) {
         if (!position) return;
         if (typeof createImpactParticle === 'function') {
             const particleCount = CONFIG?.BULLET_IMPACT_PARTICLES || 5;
             for (let i = 0; i < particleCount; i++) { createImpactParticle(position); }
         } else {
             console.warn("[Effects] createImpactParticle utility function not found.");
         }
     },

    // --- Update ---
    update: function(deltaTime) {
        // Placeholder for future particle/effect updates
    },

    // --- ViewModel Update ---
    updateViewModel: function(deltaTime) {
         // Use internal gunViewModel
         if(!this.gunViewModel || !camera || !CONFIG || !currentRecoilOffset) return; // Check required globals/internals
         const recoverSpeed = CONFIG.RECOIL_RECOVER_SPEED || 10; // Use config or default
         currentRecoilOffset.lerp(new THREE.Vector3(0, 0, 0), deltaTime * recoverSpeed);
         const baseOffset = CONFIG.GUN_POS_OFFSET ? CONFIG.GUN_POS_OFFSET.clone() : new THREE.Vector3(0, 0, 0); // Use config or default
         const finalPosition = baseOffset.add(currentRecoilOffset);
         // Apply position to the container group
         this.gunViewModel.position.copy(finalPosition);
         // Rotation handled by parent (camera)
    },

    // --- ViewModel Attachment ---
    attachGunViewModel: function() {
         console.log("[Effects] Attempting to attach gun view model...");
         // Get data directly from loadManager
         const gunModelData = loadManager?.getAssetData('gunModel'); // Use getter
         const cameraIsReady = !!(camera);
         const configIsReady = !!(CONFIG);

         // Log results of checks performed here
         console.log(`[Effects] >>> attachGunViewModel Checks: gunModelData=${!!gunModelData}, cameraIsReady=${cameraIsReady}, configIsReady=${configIsReady}`);

         // Ensure model data is a valid THREE object
         if (!gunModelData || !(gunModelData instanceof THREE.Object3D) || !cameraIsReady || !configIsReady) {
             console.warn(`[Effects] Cannot attach gun: Prerequisites invalid or not ready.`);
             return; // Stop if prerequisites aren't met
         }

         // Prevent re-attaching if already attached
         if (this.gunViewModel && this.gunViewModel.parent === camera) {
             console.log("[Effects] Gun view model already attached.");
             return;
         }
         // Remove any previous instance if it exists but wasn't parented correctly
         if (this.gunViewModel) {
             this.removeGunViewModel(); // Use the internal removal method
         }

         try {
             // Use config values with defaults
             const gunScale = CONFIG.GUN_SCALE || 0.5; // Use default if not in config
             const gunOffset = CONFIG.GUN_POS_OFFSET ? CONFIG.GUN_POS_OFFSET.clone() : new THREE.Vector3(0.35, -0.35, -0.6); // Default offset

             console.log("[Effects] Cloning gun model data. Using Offset:", gunOffset.toArray(), "Scale:", gunScale);

             const clonedGunScene = gunModelData.clone(); // Clone the whole scene/group

             // *** NEW: Center Geometry (Optional but often helpful) ***
             // Calculate bounding box of the cloned model
             const box = new THREE.Box3().setFromObject(clonedGunScene);
             const center = box.getCenter(new THREE.Vector3());
             // Offset the children so the center of the bounding box is at the object's origin (0,0,0)
             clonedGunScene.children.forEach((child) => {
                 child.position.sub(center);
             });
             console.log("[Effects] Centered gun geometry around origin based on bounding box center:", center.toArray());
             // Now, the `gunOffset` will position this centered model relative to the camera.


             // Create a new group to act as the actual view model container
             this.gunViewModel = new THREE.Group(); // This becomes the object managed by Effects
             this.gunViewModel.add(clonedGunScene); // Add the (now possibly centered) clone to the container group

             // Apply scale and offset to the *container* group
             this.gunViewModel.scale.set(gunScale, gunScale, gunScale);
             this.gunViewModel.position.copy(gunOffset);

             // Apply rotation to the *container* group
             this.gunViewModel.rotation.set(0, Math.PI, 0); // Rotate container 180 degrees on Y

             // Reset recoil state associated with the view model
             if (typeof currentRecoilOffset !== 'undefined') {
                 currentRecoilOffset.set(0, 0, 0);
             } else { console.warn("[Effects] currentRecoilOffset global missing."); }

             // Add the container group to the camera
             camera.add(this.gunViewModel);
             console.log("[Effects] Gun view model container attached successfully to camera.");

             // --- Force Visibility Test (Temporary - Uncomment for debugging visibility) ---
             /*
             console.warn("--- FORCING GUN VISIBILITY TEST ---");
             this.gunViewModel.position.set(0, 0, -0.5); // Directly in front
             this.gunViewModel.scale.set(1, 1, 1); // Large scale
             this.gunViewModel.rotation.set(0, 0, 0); // No rotation
             */
             // --- End Force Visibility Test ---


         } catch (e) {
             console.error("[Effects] Error attaching gun view model:", e);
             this.gunViewModel = null; // Ensure internal ref is null on error
         }
     },

    // --- ViewModel Removal ---
    removeGunViewModel: function() {
         // Use internal gunViewModel
         if (this.gunViewModel && camera && this.gunViewModel.parent === camera) {
             try {
                 camera.remove(this.gunViewModel); // Remove the container group
                 // Optional: Dispose nested objects if necessary
                 // Need to properly traverse the clonedGunScene *within* this.gunViewModel if doing deep disposal
                 // e.g., this.gunViewModel.traverse(obj => { /* dispose geometry/material */ });
                 this.gunViewModel = null; // Clear the internal reference
                 console.log("[Effects] Gun view model removed from camera.");
             } catch (e) {
                 console.error("[Effects] Error removing gun view model:", e);
                 this.gunViewModel = null; // Ensure reference is cleared even on error
             }
         } else if (this.gunViewModel) {
             // If gunViewModel exists but isn't properly parented, just clear the internal reference
             console.log("[Effects] Internal gun view model exists but not attached, clearing reference.");
             this.gunViewModel = null;
         }
    },

    // --- Recoil ---
    triggerRecoil: function() {
         // Check dependencies
         if (typeof currentRecoilOffset !== 'undefined' && typeof CONFIG !== 'undefined' && CONFIG.RECOIL_AMOUNT) {
             // Directly set the offset to the configured recoil amount
             currentRecoilOffset.copy(CONFIG.RECOIL_AMOUNT);
         } else {
             console.error("[Effects] Cannot trigger recoil: currentRecoilOffset or CONFIG.RECOIL_AMOUNT missing!");
         }
     },

     // --- Helper to get muzzle position ---
     getMuzzleWorldPosition: function() {
        // Use internal view model (the container group)
        if (this.gunViewModel && this.gunViewModel.parent === camera && CONFIG?.MUZZLE_LOCAL_OFFSET) {
             try {
                // Calculate world position FROM THE CONTAINER GROUP using the offset
                // The offset is relative to the container's origin, which should align with the centered gun model
                return this.gunViewModel.localToWorld(CONFIG.MUZZLE_LOCAL_OFFSET.clone());
             } catch(e) {
                 console.error("[Effects] Error getting muzzle world position:", e);
                 return null; // Return null on error
             }
        }
        // Return null if view model not ready/attached or config missing
        // console.warn("[Effects] getMuzzleWorldPosition prerequisites not met."); // Can be spammy
        return null;
     }

};
// Make Effects globally accessible
window.Effects = Effects;
console.log("effects.js loaded");

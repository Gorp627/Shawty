// docs/effects.js

// Needs access to globals: scene, camera, CONFIG, currentRecoilOffset, loadManager, THREE
// Needs access to utils: createImpactParticle
// Manages its own gunViewModel internally

const Effects = {
    gunViewModel: null, // Internal reference, managed solely by Effects
    gunAxesHelper: null, // Reference to the axes helper for removal
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
             this.gunAxesHelper = null; // Init helper ref
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
            // console.log(`[Effects] Playing sound: ${assetKey}`); // Less verbose success log
            try {
                 // Clone node to allow overlapping plays
                 soundData.cloneNode().play().catch(e => {
                     // Log browser playback interruption errors, but don't spam console
                      if (e.name === 'NotAllowedError' || e.name === 'NotSupportedError') {
                         console.warn(`[Effects] Sound playback prevented for ${assetKey}: ${e.message}`);
                      } else {
                          // Log other promise rejections, but they might be benign (e.g., interrupting previous play)
                          // console.warn(`[Effects] Sound play() promise rejected for ${assetKey}: ${e.message}`);
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
        // *** Use getMuzzleWorldPosition helper ***
        const muzzleWorldPos = this.getMuzzleWorldPosition(); // Check internal view model status

        if (!this.muzzleFlash || !muzzleWorldPos || !scene) {
            // Avoid spamming if gun isn't ready when shoot is called early
            // console.warn("[Effects] Cannot trigger muzzle flash (muzzle pos calculation failed or no light/scene).");
            return;
        }

        if (this.flashTimeout) clearTimeout(this.flashTimeout);
        try {
            this.muzzleFlash.position.copy(muzzleWorldPos); // Position flash at muzzle
            this.muzzleFlash.intensity = this.flashIntensity; this.flashActive = true;
            if (this.muzzleFlash.parent !== scene) { scene.add(this.muzzleFlash); } // Add only if not present
            const duration = CONFIG.MUZZLE_FLASH_DURATION || 50;
            this.flashTimeout = setTimeout(() => {
                 this.muzzleFlash.intensity = 0; this.flashActive = false;
                 if (scene && this.muzzleFlash.parent === scene) { scene.remove(this.muzzleFlash); } // Remove when done
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
             // console.warn("[Effects] createImpactParticle utility function not found."); // Less verbose
         }
     },

    // --- Update ---
    update: function(deltaTime) {
        // Placeholder for future particle/effect updates (e.g., particle physics)
    },

    // --- ViewModel Update (Recoil recovery, position) ---
    updateViewModel: function(deltaTime) {
         // Use internal gunViewModel
         if(!this.gunViewModel || !camera || !CONFIG || !currentRecoilOffset) return; // Check required globals/internals

         const recoverSpeed = CONFIG.RECOIL_RECOVER_SPEED || 10; // Use config or default
         currentRecoilOffset.lerp(new THREE.Vector3(0, 0, 0), deltaTime * recoverSpeed); // Interpolate recoil back to zero

         // Determine the base position (ignoring forced test position for recoil recovery)
         const baseOffset = CONFIG.GUN_POS_OFFSET ? CONFIG.GUN_POS_OFFSET.clone() : new THREE.Vector3(0.35, -0.35, -0.6); // Use config or default

         // Calculate final position = base offset + current recoil
         const finalPosition = baseOffset.add(currentRecoilOffset);

         // Apply position to the container group
         // Let's keep applying it even during the forced test, so recoil still works visually if the forced pos is active
         this.gunViewModel.position.copy(finalPosition);

         // If forced test is active, override position *after* recoil calculation for testing visibility
          /*
          if (true) { // Condition to know if force test is active (could use a flag)
                const forcePosition = new THREE.Vector3(0, -0.1, -0.4);
                this.gunViewModel.position.copy(forcePosition); // Override with forced position
          }
          */


    },

    // --- ViewModel Attachment ---
    attachGunViewModel: function() {
         console.log("[Effects] Attempting to attach gun view model...");
         // Get gun model data directly from loadManager
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
             console.log("[Effects] Cloning gun model data...");
             const clonedGunScene = gunModelData.clone(); // Clone the whole scene/group

             // Log children of the cloned scene
             console.log(`[Effects] Cloned gun scene children (${clonedGunScene.children.length}):`);
             clonedGunScene.children.forEach((child, index) => {
                 console.log(`  - Child[${index}] Name: ${child.name}, Type: ${child.type}`);
             });

             // --- REMOVED Geometry Centering ---
             // console.log("[Effects] Geometry centering REMOVED for testing.");

             // Create container group
             this.gunViewModel = new THREE.Group();
             this.gunViewModel.name = "GunViewModelContainer";
             this.gunViewModel.add(clonedGunScene); // Add clone to container

             // *** FORCE VISIBILITY SETTINGS - OVERRIDE CONFIG ***
             const forceScale = 1.0; // Large scale
             const forcePosition = new THREE.Vector3(0, -0.1, -0.4); // Centered H, slightly down, very close
             const forceRotation = new THREE.Euler(0, 0, 0); // No rotation initially

             console.warn(`--- APPLYING FORCE VISIBILITY SETTINGS ---`);
             console.log(`    Scale: ${forceScale}`);
             console.log(`    Position: ${forcePosition.toArray()}`);
             console.log(`    Rotation: ${forceRotation.toArray()}`);

             this.gunViewModel.scale.set(forceScale, forceScale, forceScale);
             this.gunViewModel.position.copy(forcePosition); // Apply forced position initially
             this.gunViewModel.rotation.copy(forceRotation); // Apply forced rotation initially
             // --- END FORCE VISIBILITY ---

             // Reset recoil state associated with the view model
             if (typeof currentRecoilOffset !== 'undefined') {
                 currentRecoilOffset.set(0, 0, 0);
             } else { console.warn("[Effects] currentRecoilOffset global missing."); }

             // *** Add Axes Helper ***
             if (this.gunAxesHelper) this.gunViewModel.remove(this.gunAxesHelper); // Remove old one if exists
             this.gunAxesHelper = new THREE.AxesHelper(0.3); // Size 0.3 units (adjust size if needed)
             this.gunAxesHelper.name = "GunContainerAxes";
             this.gunViewModel.add(this.gunAxesHelper); // Add helper to the container group
             console.log("[Effects] Added AxesHelper to gunViewModel container.");
             // *** End Add Axes Helper ***

             // Add the container group to the camera
             camera.add(this.gunViewModel);
             console.log("[Effects] Gun view model container attached successfully to camera.");

             // Log final world matrix after attachment to see position relative to world
             this.gunViewModel.updateMatrixWorld(true); // Force update of world matrix
             const worldPos = new THREE.Vector3();
             this.gunViewModel.getWorldPosition(worldPos); // Get world position of the container group
             console.log("[Effects] GunViewModel World Position after attachment:", worldPos.toArray().map(n=>n.toFixed(2)).join(','));


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
                 // Remove axes helper if it exists
                 if (this.gunAxesHelper) {
                      this.gunViewModel.remove(this.gunAxesHelper); // Remove helper from container first
                 }
                 camera.remove(this.gunViewModel); // Remove the container group from camera
                 // Consider recursive disposal of clonedGunScene children if memory becomes an issue
                 // this.gunViewModel.traverse(obj => { /* ... dispose geometry/material ... */ });
                 this.gunViewModel = null; // Clear the internal reference
                 this.gunAxesHelper = null; // Clear helper reference
                 console.log("[Effects] Gun view model removed from camera.");
             } catch (e) {
                 console.error("[Effects] Error removing gun view model:", e);
                 this.gunViewModel = null; // Ensure reference is cleared even on error
                 this.gunAxesHelper = null;
             }
         } else if (this.gunViewModel) {
             // If gunViewModel exists but isn't properly parented, just clear the internal reference
             console.log("[Effects] Internal gun view model exists but not attached, clearing reference.");
             this.gunViewModel = null;
             this.gunAxesHelper = null;
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
        // *** ADDED LOGGING ***
        // console.log(`[Effects] getMuzzleWorldPosition called. this.gunViewModel exists: ${!!this.gunViewModel}, parent is camera: ${this.gunViewModel?.parent === camera}`); // Less verbose

        // Use internal view model (the container group)
        if (this.gunViewModel && this.gunViewModel.parent === camera && CONFIG?.MUZZLE_LOCAL_OFFSET) {
             try {
                 const localOffset = CONFIG.MUZZLE_LOCAL_OFFSET.clone();
                 // console.log(`[Effects] Calculating world position from local offset:`, localOffset.toArray()); // Less verbose
                 const worldPos = this.gunViewModel.localToWorld(localOffset); // Calculate world pos from container
                 // console.log(`[Effects] Calculated muzzle world position:`, worldPos.toArray()); // Less verbose
                 return worldPos;
             } catch(e) {
                 console.error("[Effects] Error in localToWorld for muzzle:", e);
                 return null; // Return null on error
             }
        }
        // console.warn("[Effects] getMuzzleWorldPosition returning null (prerequisites failed)."); // Less verbose
        return null; // Return null if view model not ready/attached or config missing
     }

};
// Make Effects globally accessible
window.Effects = Effects;
console.log("effects.js loaded");

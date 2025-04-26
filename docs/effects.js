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
        if (gunViewModel.parent !== camera) {
             console.warn("[Effects] Cannot trigger muzzle flash: Gun view model not attached to camera.");
             return;
        }
        if (this.flashTimeout) clearTimeout(this.flashTimeout);

        try {
            const worldMuzzlePosition = gunViewModel.localToWorld(CONFIG.MUZZLE_LOCAL_OFFSET.clone());
            this.muzzleFlash.position.copy(worldMuzzlePosition);
            this.muzzleFlash.intensity = this.flashIntensity;
            this.flashActive = true;
            if (this.muzzleFlash.parent !== scene) { scene.add(this.muzzleFlash); }

            this.flashTimeout = setTimeout(() => {
                 this.muzzleFlash.intensity = 0;
                 this.flashActive = false;
                 if (scene && this.muzzleFlash.parent === scene) { scene.remove(this.muzzleFlash); }
                 this.flashTimeout = null;
            }, this.flashDuration);

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

    update: function(deltaTime) { /* Update ongoing effects */ },

    updateViewModel: function(deltaTime) {
         if(!gunViewModel || !camera || typeof CONFIG === 'undefined' || typeof currentRecoilOffset === 'undefined') return;
         currentRecoilOffset.lerp(new THREE.Vector3(0, 0, 0), deltaTime * CONFIG.RECOIL_RECOVER_SPEED);
         const finalPosition = CONFIG.GUN_POS_OFFSET.clone().add(currentRecoilOffset);
         gunViewModel.position.copy(finalPosition);
    },

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

         if (gunViewModel && gunViewModel.parent === camera) {
             console.log("[Effects] Gun view model already attached.");
             return;
         }
         if (gunViewModel) { this.removeGunViewModel(); }

         try {
             console.log("[Effects] Cloning gun model from window.gunModel...");
             gunViewModel = window.gunModel.clone(); // Clone from the explicitly checked global

             gunViewModel.scale.set(CONFIG.GUN_SCALE, CONFIG.GUN_SCALE, CONFIG.GUN_SCALE);
             gunViewModel.position.copy(CONFIG.GUN_POS_OFFSET);
             gunViewModel.rotation.y = Math.PI; // Rotate 180 degrees around Y

             if (typeof currentRecoilOffset !== 'undefined') { currentRecoilOffset.set(0, 0, 0); }
             else { console.warn("[Effects] currentRecoilOffset global missing."); }

             camera.add(gunViewModel);
             console.log("[Effects] Gun view model attached successfully to camera.");

         } catch (e) {
             console.error("[Effects] Error attaching gun view model:", e);
             gunViewModel = null;
         }
     },

    removeGunViewModel: function() {
         if (gunViewModel && camera && gunViewModel.parent === camera) {
             try {
                 camera.remove(gunViewModel);
                 gunViewModel = null;
                 console.log("[Effects] Gun view model removed from camera.");
             } catch (e) { console.error("[Effects] Error removing gun view model:", e); gunViewModel = null; }
         } else if (gunViewModel) {
             console.log("[Effects] Gun view model exists but is not attached, clearing reference.");
             gunViewModel = null;
         }
    },

    triggerRecoil: function() {
         if (typeof currentRecoilOffset !== 'undefined' && typeof CONFIG !== 'undefined' && CONFIG.RECOIL_AMOUNT) {
             currentRecoilOffset.copy(CONFIG.RECOIL_AMOUNT);
         } else { console.error("[Effects] Cannot trigger recoil: prereqs missing!"); }
     }

};
window.Effects = Effects; // Export globally
console.log("effects.js loaded");

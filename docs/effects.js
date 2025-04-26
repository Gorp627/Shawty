// docs/effects.js

// Needs access to globals: scene, camera, CONFIG, currentRecoilOffset, loadManager, THREE
// Needs access to utils: createImpactParticle
// NO LONGER MANAGES gunViewModel

const Effects = {
    // gunViewModel: null, // REMOVED internal view model reference
    muzzleFlash: null, // Keep muzzle flash light
    flashDuration: CONFIG?.MUZZLE_FLASH_DURATION || 50,
    flashIntensity: 3,
    flashColor: 0xfff5a0,
    flashActive: false,
    flashTimeout: null,

    initialize: function(sceneRef) {
        if (!sceneRef || typeof THREE === 'undefined') { console.error("Effects init prereqs failed."); return; }
        try {
             this.muzzleFlash = new THREE.PointLight(this.flashColor, 0, 4, 2);
             this.muzzleFlash.castShadow = false;
             // No gunViewModel to initialize
             console.log("[Effects] Initialized (Muzzle flash ready).");
        } catch(e) { console.error("[Effects] Init failed:", e); }
    },

    // --- Sound Playback Helper ---
    playSound: function(assetKey) {
        if (!loadManager) { console.error("[Effects] LoadManager missing, cannot play sound."); return; }
        // Use the getter, which checks readiness internally
        const soundData = loadManager.getAssetData(assetKey);
        // console.log(`[Effects] Attempting sound '${assetKey}'. Data:`, soundData); // Less verbose
        if (soundData instanceof Audio) {
            try {
                soundData.cloneNode().play().catch(e => {
                    // Ignore benign playback interruption errors
                    if (e.name === 'NotAllowedError' || e.name === 'NotSupportedError') {
                       console.warn(`[Effects] Sound playback prevented for ${assetKey}: ${e.message}`);
                    }
                });
            }
            catch (e) { console.error(`[Effects] Error playing sound ${assetKey}:`, e); }
        } else {
            console.warn(`[Effects] Sound asset data invalid for ${assetKey}.`);
        }
    },

    // --- Muzzle Flash ---
    // Now needs the origin position passed to it
    triggerMuzzleFlash: function(position) {
        if (!this.muzzleFlash || !position || !scene) {
            // console.warn("[Effects] Cannot trigger muzzle flash (no light, position, or scene)."); // Less verbose
            return; // Requires a position now
        }
        if (this.flashTimeout) clearTimeout(this.flashTimeout);
        try {
            // Position flash directly at the calculated bullet origin
            this.muzzleFlash.position.copy(position);
            this.muzzleFlash.intensity = this.flashIntensity; this.flashActive = true;
            if (this.muzzleFlash.parent !== scene) scene.add(this.muzzleFlash); // Add only if not present
            const duration = CONFIG.MUZZLE_FLASH_DURATION || 50;
            this.flashTimeout = setTimeout(() => {
                 this.muzzleFlash.intensity = 0; this.flashActive = false;
                 if (scene && this.muzzleFlash.parent === scene) scene.remove(this.muzzleFlash); // Remove when done
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
         }
         // Removed warning for missing createImpactParticle to reduce noise
     },

    // --- Update ---
    update: function(deltaTime) {
        // Placeholder for future particle/effect updates (e.g., particle physics)
    },

    // --- ViewModel Update (NOW ONLY RECOIL OFFSET recovery) ---
    updateViewModel: function(deltaTime) {
         // This function now ONLY handles the interpolation of the recoil offset value back to zero.
         // It doesn't touch any view model object directly.
         if(!CONFIG || typeof currentRecoilOffset === 'undefined') return;
         const recoverSpeed = CONFIG.RECOIL_RECOVER_SPEED || 10; // Use config or default
         currentRecoilOffset.lerp(new THREE.Vector3(0, 0, 0), deltaTime * recoverSpeed);
    },

    // --- ViewModel Attachment / Removal - REMOVED ENTIRELY ---
    // attachGunViewModel: function() { ... REMOVED ... },
    // removeGunViewModel: function() { ... REMOVED ... },

    // --- Recoil Trigger (Sets offset for camera kick) ---
    triggerRecoil: function() {
         // We still calculate the offset, assuming gameLogic (or elsewhere) will use it for camera rotation
         if (typeof currentRecoilOffset !== 'undefined' && typeof CONFIG !== 'undefined' && CONFIG.RECOIL_AMOUNT) {
             console.log("[Effects] Triggering recoil offset for camera kick.");
             currentRecoilOffset.copy(CONFIG.RECOIL_AMOUNT);
         } else {
             console.error("[Effects] Cannot trigger recoil: currentRecoilOffset or CONFIG.RECOIL_AMOUNT missing!");
         }
     },

     // --- Get Muzzle Position - REMOVED ENTIRELY ---
     // getMuzzleWorldPosition: function() { ... REMOVED ... }

};
// Make Effects globally accessible
window.Effects = Effects;
console.log("effects.js loaded");

// docs/effects.js

// Needs access to globals: scene, camera, gunViewModel
// Needs access to config: CONFIG
// Needs access to utils: createImpactParticle

const Effects = {
    muzzleFlash: null, // THREE.PointLight for flash
    flashDuration: CONFIG.MUZZLE_FLASH_DURATION,
    flashIntensity: 3, // Brighter intensity
    flashColor: 0xfff5a0, // More orangey-yellow
    flashActive: false,
    flashTimeout: null,
    // impactParticlePool: [], // Potential optimization later

    initialize: function(sceneRef) {
        if (!sceneRef) { console.error("[Effects] Scene needed for init!"); return; }
        try {
             this.muzzleFlash = new THREE.PointLight(this.flashColor, 0, 4, 2); // Color, Intensity(0), Distance, Decay
             this.muzzleFlash.castShadow = false;
             // Add light initially but keep intensity 0
             sceneRef.add(this.muzzleFlash);
             console.log("[Effects] Initialized.");
        } catch(e) { console.error("[Effects] Init failed:", e); }
    },

    triggerMuzzleFlash: function() {
        if (!this.muzzleFlash || !gunViewModel || !camera) { console.warn("Cannot trigger flash: missing components."); return; }
        if (this.flashTimeout) clearTimeout(this.flashTimeout);

        try {
            // Get world position of the muzzle offset from the gun model
            const worldMuzzlePosition = gunViewModel.localToWorld(CONFIG.MUZZLE_LOCAL_OFFSET.clone());
            this.muzzleFlash.position.copy(worldMuzzlePosition);
            this.muzzleFlash.intensity = this.flashIntensity;
            this.flashActive = true;

            // Turn off after duration
            this.flashTimeout = setTimeout(() => {
                this.muzzleFlash.intensity = 0;
                this.flashActive = false;
            }, this.flashDuration);
        } catch (e) {
             console.error("Error triggering muzzle flash:", e);
             this.muzzleFlash.intensity = 0; // Ensure off on error
        }
    },

    createImpact: function(position) {
        if (!position || typeof createImpactParticle !== 'function') return;
        // console.log("Create impact at:", position.toArray().map(n=>n.toFixed(2))); // Reduce noise
        for (let i = 0; i < CONFIG.BULLET_IMPACT_PARTICLES; i++) {
             createImpactParticle(position);
        }
    },

    update: function(deltaTime) {
        // Could update particle positions here if using a proper particle system
    }
};

console.log("effects.js loaded");

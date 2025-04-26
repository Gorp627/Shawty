// docs/effects.js

const Effects = {
    muzzleFlash: null, // THREE.PointLight for flash
    flashDuration: CONFIG.MUZZLE_FLASH_DURATION,
    flashIntensity: 2, // Intensity of light
    flashColor: 0xfff055, // Yellowish flash
    flashActive: false,
    flashTimeout: null,
    impactParticlePool: [], // Could pool particle objects later

    initialize: function(sceneRef) {
        if (!sceneRef) return;
        // Create point light but don't add it yet
        this.muzzleFlash = new THREE.PointLight(this.flashColor, 0, 5); // Color, Intensity (starts at 0), Distance
        this.muzzleFlash.castShadow = false; // No shadows from flash
        console.log("[Effects] Initialized.");
    },

    // Show flash near the gun model
    triggerMuzzleFlash: function() {
        if (!this.muzzleFlash || !gunViewModel || !camera) return;

        if (this.flashTimeout) clearTimeout(this.flashTimeout); // Reset timeout if flashing again quickly

        // Attach flash slightly in front of estimated muzzle position
        // Convert local offset to world position relative to gun, then add to scene (or attach to gun?)
        const worldMuzzlePosition = gunViewModel.localToWorld(CONFIG.MUZZLE_LOCAL_OFFSET.clone());

        this.muzzleFlash.position.copy(worldMuzzlePosition);
        this.muzzleFlash.intensity = this.flashIntensity; // Turn light on
        this.flashActive = true;
        if (scene && this.muzzleFlash.parent !== scene) { // Add light to scene if not already there
             scene.add(this.muzzleFlash);
        }

        // Set timeout to turn off flash
        this.flashTimeout = setTimeout(() => {
            this.muzzleFlash.intensity = 0; // Turn light off
            this.flashActive = false;
             // Optional: remove light from scene when off to save resources?
             // if(scene && this.muzzleFlash.parent === scene) scene.remove(this.muzzleFlash);
        }, this.flashDuration);
    },

    // Create simple impact particles
    createImpact: function(position) {
        console.log("Create impact at:", position.toArray().map(n=>n.toFixed(2)));
        // Create multiple small particles for a basic burst effect
        for (let i = 0; i < CONFIG.BULLET_IMPACT_PARTICLES; i++) {
             // Maybe use CSS particles instead for performance? Or THREE.Points
             createImpactParticle(position); // Use utility function for now
        }
    },

    update: function(deltaTime) {
        // Update any ongoing effects if needed (e.g., particle physics)
    }
};

console.log("effects.js loaded");

// docs/effects.js

// Needs access to globals: scene, camera, CONFIG, loadManager, THREE (maybe)
// Needs access to utils: createImpactParticle (if impacts kept)
// NO LONGER MANAGES gunViewModel, muzzle flash, recoil, sound

const Effects = {

    // --- REMOVED PROPERTIES ---
    // gunViewModel: null,
    // muzzleFlash: null,
    // flashDuration: CONFIG?.MUZZLE_FLASH_DURATION || 50,
    // flashIntensity: 3,
    // flashColor: 0xfff5a0,
    // flashActive: false,
    // flashTimeout: null,

    initialize: function(sceneRef) {
        // Minimal initialization now
        if (!sceneRef) { console.error("[Effects] Scene needed for init (though less critical now)."); }
        if (typeof THREE === 'undefined') { console.error("THREE missing!");}
        console.log("[Effects] Initialized (Simplified - No gun/flash managed).");
    },

    // --- REMOVED METHODS ---
    // playSound: function(assetKey) { ... },
    // triggerMuzzleFlash: function(position) { ... },
    // triggerRecoil: function() { ... },
    // updateViewModel: function(deltaTime) { ... }, // Keep update empty? Or remove if unused
    // attachGunViewModel: function() { ... },
    // removeGunViewModel: function() { ... },
    // getMuzzleWorldPosition: function() { ... },

    // --- KEEP Impact & Update placeholder ---
    createImpact: function(position) {
        // This might still be useful if some other effect causes impacts
        if (!position) return;
        if (typeof createImpactParticle === 'function') {
            const particleCount = CONFIG?.BULLET_IMPACT_PARTICLES || 5; // Keep if needed later
            for (let i = 0; i < particleCount; i++) { createImpactParticle(position); }
        }
     },

    update: function(deltaTime) {
        // Placeholder for any non-gun related effects (e.g. environmental particle systems)
    },


};
// Make Effects globally accessible
window.Effects = Effects;
console.log("effects.js loaded (Simplified)");

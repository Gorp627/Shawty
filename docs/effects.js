// docs/effects.js

// Needs access to globals: scene, camera, gunViewModel, CONFIG, currentRecoilOffset
// Needs access to utils: createImpactParticle

const Effects = {
    muzzleFlash: null, flashDuration: CONFIG.MUZZLE_FLASH_DURATION || 50, flashIntensity: 3, flashColor: 0xfff5a0, flashActive: false, flashTimeout: null,

    initialize: function(sceneRef) {
        if (!sceneRef) { console.error("[Effects] Scene needed!"); return; }
        try { this.muzzleFlash = new THREE.PointLight(this.flashColor, 0, 4, 2); this.muzzleFlash.castShadow = false; sceneRef.add(this.muzzleFlash); console.log("[Effects] Initialized."); } // Add initially, keep intensity 0
        catch(e) { console.error("[Effects] Init failed:", e); }
    },

    triggerMuzzleFlash: function() {
        if (!this.muzzleFlash || !gunViewModel || !camera) return; // Add gunViewModel check
        if (this.flashTimeout) clearTimeout(this.flashTimeout);
        try {
            // Ensure MUZZLE_LOCAL_OFFSET is defined
            if (typeof CONFIG.MUZZLE_LOCAL_OFFSET === 'undefined') throw new Error("MUZZLE_LOCAL_OFFSET not defined in CONFIG");

            const worldMuzzlePosition = gunViewModel.localToWorld(CONFIG.MUZZLE_LOCAL_OFFSET.clone());
            this.muzzleFlash.position.copy(worldMuzzlePosition);
            this.muzzleFlash.intensity = this.flashIntensity; this.flashActive = true;
            if (scene && this.muzzleFlash.parent !== scene) { scene.add(this.muzzleFlash); } // Add light only when active
            this.flashTimeout = setTimeout(() => { this.muzzleFlash.intensity = 0; this.flashActive = false; if(scene && this.muzzleFlash.parent === scene) scene.remove(this.muzzleFlash); }, this.flashDuration);
        } catch (e) { console.error("Muzzle flash error:", e); this.muzzleFlash.intensity = 0; }
    },

    createImpact: function(position) { if (!position || typeof createImpactParticle !== 'function') return; for (let i = 0; i < CONFIG.BULLET_IMPACT_PARTICLES; i++) { createImpactParticle(position); } },
    update: function(deltaTime) { /* Future particle updates */ },

    // Moved view model updates here
    updateViewModel: function(deltaTime) { if(!gunViewModel || !camera) return; currentRecoilOffset.lerp(new THREE.Vector3(0,0,0), deltaTime * CONFIG.RECOIL_RECOVER_SPEED); const fP=CONFIG.GUN_POS_OFFSET.clone().add(currentRecoilOffset); gunViewModel.position.copy(fP); gunViewModel.rotation.y = camera.rotation.y; gunViewModel.rotation.x=0; gunViewModel.rotation.z=0; /* Simple Y follow */ },
    attachGunViewModel: function() { if (!gunModel || gunModel === 'error' || !camera) return; if (gunViewModel && gunViewModel.parent === camera) return; if (gunViewModel) this.removeGunViewModel(); try { gunViewModel=gunModel.clone(); gunViewModel.scale.set(CONFIG.GUN_SCALE,CONFIG.GUN_SCALE,CONFIG.GUN_SCALE); gunViewModel.position.copy(CONFIG.GUN_POS_OFFSET); currentRecoilOffset.set(0,0,0); gunViewModel.rotation.y=Math.PI; camera.add(gunViewModel); console.log("Gun attached by Effects.");} catch (e) { console.error("Err attach gun:",e); gunViewModel=null;} },
    removeGunViewModel: function() { if(gunViewModel&&camera){ try{camera.remove(gunViewModel);gunViewModel=null;console.log("Gun removed by Effects.");}catch(e){console.error("Err remove gun:",e);gunViewModel=null;}}},
    triggerRecoil: function() { if (typeof currentRecoilOffset !== 'undefined') currentRecoilOffset.copy(CONFIG.RECOIL_AMOUNT); else console.error("currentRecoilOffset missing!"); } // Check existence

};
window.Effects = Effects; // Export globally
console.log("effects.js loaded");

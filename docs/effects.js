// docs/effects.js

// Needs access to globals: scene, camera, gunViewModel, CONFIG
// Needs access to utils: createImpactParticle

const Effects = { // Keep as const
    muzzleFlash: null, flashDuration: CONFIG.MUZZLE_FLASH_DURATION, flashIntensity: 3, flashColor: 0xfff5a0, flashActive: false, flashTimeout: null,

    initialize: function(sceneRef) { /* ... Same init logic ... */ },
    triggerMuzzleFlash: function() { /* ... Same logic ... */ },
    createImpact: function(position) { /* ... Same logic ... */ },
    update: function(deltaTime) { /* ... Same logic ... */ },
    // Add updateViewModel here, previously maybe in gameLogic? Seems effects-related.
    updateViewModel: function(deltaTime) {
         if(!gunViewModel || !camera) return;
         currentRecoilOffset.lerp(new THREE.Vector3(0,0,0), deltaTime * CONFIG.RECOIL_RECOVER_SPEED);
         const finalGunPos = CONFIG.GUN_POS_OFFSET.clone().add(currentRecoilOffset);
         gunViewModel.position.copy(finalGunPos);
         // No explicit rotation needed if attached to camera
         // const cameraWorldQuaternion = new THREE.Quaternion(); camera.getWorldQuaternion(cameraWorldQuaternion);
         // const cameraEuler = new THREE.Euler().setFromQuaternion(cameraWorldQuaternion, 'YXZ');
         // gunViewModel.rotation.y = cameraEuler.y;
         // Add initial offsets directly in attach function if needed
    },
     attachGunViewModel: function() {
         if (!gunModel || gunModel === 'error' || !camera) { console.warn("Cannot attach gun: Model/cam missing/fail"); return; }
         if (gunViewModel && gunViewModel.parent === camera) return; // Already attached
         if (gunViewModel) this.removeGunViewModel(); // Use internal remove
         try {
             gunViewModel = gunModel.clone();
             gunViewModel.scale.set(CONFIG.GUN_SCALE, CONFIG.GUN_SCALE, CONFIG.GUN_SCALE); // Use CONFIG
             gunViewModel.position.copy(CONFIG.GUN_POS_OFFSET); // Use CONFIG
             currentRecoilOffset.set(0,0,0); // Use global recoil var
             gunViewModel.rotation.y = Math.PI; // Example initial rotation offset - REMOVE if not needed
             camera.add(gunViewModel);
             console.log("Gun view model attached by Effects.");
         } catch (e) { console.error("Error attaching gun:", e); gunViewModel = null; }
     },
     removeGunViewModel: function() {
         if (gunViewModel && camera) { try { camera.remove(gunViewModel); gunViewModel = null; console.log("Gun removed by Effects."); } catch (e) { console.error("Error removing gun:", e); gunViewModel = null; } }
     },
      triggerRecoil: function() { // Centralize recoil trigger
          currentRecoilOffset.copy(CONFIG.RECOIL_AMOUNT); // Apply recoil offset instantly
     }


}; // End Effects object

// <<< EXPORT TO GLOBAL SCOPE >>>
window.Effects = Effects;
// <<< ------------------------ >>>

console.log("effects.js loaded");

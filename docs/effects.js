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

    initialize: function(sceneRef) { /* ... (No changes needed) ... */ if(!sceneRef){console.error("Effects init fail: no scene");return;}if(typeof THREE==='undefined'){console.error("Effects init fail: THREE missing");return;}try{this.muzzleFlash=new THREE.PointLight(this.flashColor,0,4,2);this.muzzleFlash.castShadow=false;console.log("[Effects] Initialized.");}catch(e){console.error("Effects init fail:",e);} },
    triggerMuzzleFlash: function() { /* ... (No changes needed) ... */ if(!this.muzzleFlash||!gunViewModel||!camera||!CONFIG||!scene)return;if(gunViewModel.parent!==camera){console.warn("Muzzle flash: GunVM not child of camera.");return;}if(this.flashTimeout)clearTimeout(this.flashTimeout);try{const worldMuzzlePosition=gunViewModel.localToWorld(CONFIG.MUZZLE_LOCAL_OFFSET.clone());this.muzzleFlash.position.copy(worldMuzzlePosition);this.muzzleFlash.intensity=this.flashIntensity;this.flashActive=true;if(this.muzzleFlash.parent!==scene)scene.add(this.muzzleFlash);this.flashTimeout=setTimeout(()=>{this.muzzleFlash.intensity=0;this.flashActive=false;if(scene&&this.muzzleFlash.parent===scene)scene.remove(this.muzzleFlash);this.flashTimeout=null;},this.flashDuration);}catch(e){console.error("Muzzle flash error:",e);this.muzzleFlash.intensity=0;if(scene&&this.muzzleFlash.parent===scene)scene.remove(this.muzzleFlash);if(this.flashTimeout)clearTimeout(this.flashTimeout);this.flashTimeout=null;} },
    createImpact: function(position) { /* ... (No changes needed) ... */ if(!position)return;if(typeof createImpactParticle==='function'){const n=CONFIG?.BULLET_IMPACT_PARTICLES||5;for(let i=0;i<n;i++)createImpactParticle(position);}else{console.warn("createImpactParticle missing.");} },
    update: function(deltaTime) { /* Update ongoing effects */ },
    updateViewModel: function(deltaTime) { /* ... (No changes needed) ... */ if(!gunViewModel||!camera||!CONFIG||!currentRecoilOffset)return;currentRecoilOffset.lerp(new THREE.Vector3(0,0,0),deltaTime*CONFIG.RECOIL_RECOVER_SPEED);const finalPosition=CONFIG.GUN_POS_OFFSET.clone().add(currentRecoilOffset);gunViewModel.position.copy(finalPosition); },

    attachGunViewModel: function() {
         console.log("[Effects] Attempting to attach gun view model...");
         const gunModelIsReady = !!(window.gunModel && window.gunModel !== 'error' && window.gunModel instanceof THREE.Object3D);
         const cameraIsReady = !!(camera);
         const configIsReady = !!(CONFIG);
         console.log(`[Effects] >>> attachGunViewModel Checks: gunModelIsReady=${gunModelIsReady}, cameraIsReady=${cameraIsReady}, configIsReady=${configIsReady}`);

         if (!gunModelIsReady || !cameraIsReady || !configIsReady) {
             console.warn(`[Effects] Cannot attach gun: Prereqs missing/fail. gun=${gunModelIsReady}, cam=${cameraIsReady}, cfg=${configIsReady}`);
             return;
         }
         if (gunViewModel && gunViewModel.parent === camera) { console.log("[Effects] Gun view model already attached."); return; }
         if (gunViewModel) { this.removeGunViewModel(); }

         try {
             // *** ADDED LOGGING FOR VALUES USED ***
             console.log("[Effects] Cloning gun model. Using Offset:", CONFIG.GUN_POS_OFFSET.toArray(), "Scale:", CONFIG.GUN_SCALE);

             gunViewModel = window.gunModel.clone();
             gunViewModel.scale.set(CONFIG.GUN_SCALE, CONFIG.GUN_SCALE, CONFIG.GUN_SCALE);
             gunViewModel.position.copy(CONFIG.GUN_POS_OFFSET);
             // *** Keep or comment out rotation based on testing ***
             gunViewModel.rotation.y = Math.PI; // Rotate 180 degrees around Y (Try commenting this out if gun is still invisible)
             // gunViewModel.rotation.set(0, 0, 0); // Try resetting rotation completely

             if (currentRecoilOffset) { currentRecoilOffset.set(0, 0, 0); }
             else { console.warn("[Effects] currentRecoilOffset missing."); }

             camera.add(gunViewModel);
             console.log("[Effects] Gun view model attached successfully to camera.");

         } catch (e) { console.error("[Effects] Error attaching gun view model:", e); gunViewModel = null; }
     },

    removeGunViewModel: function() { /* ... (No changes needed) ... */ if(gunViewModel&&camera&&gunViewModel.parent===camera){try{camera.remove(gunViewModel);gunViewModel=null;console.log("[Effects] Gun removed.");}catch(e){console.error("Err remove gun:",e);gunViewModel=null;}}else if(gunViewModel){console.log("[Effects] GunVM exists but not attached.");gunViewModel=null;} },
    triggerRecoil: function() { /* ... (No changes needed) ... */ if(currentRecoilOffset&&CONFIG?.RECOIL_AMOUNT){currentRecoilOffset.copy(CONFIG.RECOIL_AMOUNT);}else{console.error("Cannot trigger recoil: prereqs missing!");} }

};
window.Effects = Effects;
console.log("effects.js loaded");

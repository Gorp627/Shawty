// docs/effects.js

// Needs access to globals: scene, camera, gunViewModel, CONFIG, currentRecoilOffset
// Needs access to utils: createImpactParticle

const Effects = {
    muzzleFlash: null, flashDuration: CONFIG.MUZZLE_FLASH_DURATION || 50, flashIntensity: 3, flashColor: 0xfff5a0, flashActive: false, flashTimeout: null,

    initialize: function(sceneRef) { if(!sceneRef)return; try{this.muzzleFlash=new THREE.PointLight(this.flashColor,0,4,2);this.muzzleFlash.castShadow=false;sceneRef.add(this.muzzleFlash);console.log("[Effects] Initialized.");}catch(e){console.error("[Effects] Init failed:",e);} },
    triggerMuzzleFlash: function() { if(!this.muzzleFlash||!gunViewModel||!camera)return; if(this.flashTimeout)clearTimeout(this.flashTimeout); try{const p=gunViewModel.localToWorld(CONFIG.MUZZLE_LOCAL_OFFSET.clone());this.muzzleFlash.position.copy(p);this.muzzleFlash.intensity=this.flashIntensity;this.flashActive=true;if(scene&&this.muzzleFlash.parent!==scene)scene.add(this.muzzleFlash);this.flashTimeout=setTimeout(()=>{this.muzzleFlash.intensity=0;this.flashActive=false;if(scene&&this.muzzleFlash.parent===scene)scene.remove(this.muzzleFlash);},this.flashDuration);}catch(e){console.error("Muzzle flash error:",e);this.muzzleFlash.intensity=0;} },
    createImpact: function(pos) { if(!pos||typeof createImpactParticle!=='function')return;for(let i=0;i<CONFIG.BULLET_IMPACT_PARTICLES;i++){createImpactParticle(pos);} },
    update: function(dT) { /* particle updates */ },
    updateViewModel: function(dT) { if(!gunViewModel||!camera)return; currentRecoilOffset.lerp(new THREE.Vector3(0,0,0),dT*CONFIG.RECOIL_RECOVER_SPEED); const fP=CONFIG.GUN_POS_OFFSET.clone().add(currentRecoilOffset); gunViewModel.position.copy(fP); const cWQ=new THREE.Quaternion();camera.getWorldQuaternion(cWQ); const cE=new THREE.Euler().setFromQuaternion(cWQ,'YXZ'); gunViewModel.rotation.set(0,cE.y,0); }, // Simple Y follow
    attachGunViewModel: function() { if(!gunModel||gunModel==='error'||!camera)return; if(gunViewModel&&gunViewModel.parent===camera)return; if(gunViewModel)this.removeGunViewModel(); try{gunViewModel=gunModel.clone(); gunViewModel.scale.set(CONFIG.GUN_SCALE,CONFIG.GUN_SCALE,CONFIG.GUN_SCALE); gunViewModel.position.copy(CONFIG.GUN_POS_OFFSET); currentRecoilOffset.set(0,0,0); gunViewModel.rotation.y=Math.PI; camera.add(gunViewModel); console.log("Gun attached.");}catch(e){console.error("Err attach gun:",e);gunViewModel=null;} },
    removeGunViewModel: function() { if(gunViewModel&&camera){ try{camera.remove(gunViewModel);gunViewModel=null;console.log("Gun removed.");}catch(e){console.error("Err remove gun:",e);gunViewModel=null;}}},
    triggerRecoil: function() { if (typeof currentRecoilOffset!=='undefined')currentRecoilOffset.copy(CONFIG.RECOIL_AMOUNT);else console.error("recoil var missing!"); }
};
window.Effects = Effects; // Export globally
console.log("effects.js loaded");

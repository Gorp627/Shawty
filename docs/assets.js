// docs/assets.js

// Asset Loading Functions need access to 'loader' and state variables

function loadSound() { try{gunshotSound=new Audio(SOUND_PATH_GUNSHOT);gunshotSound.volume=0.4;gunshotSound.preload='auto';gunshotSound.load();console.log("Sound OK.");}catch(e){console.error("Audio err:",e);gunshotSound=null;} }

function loadPlayerModel() { playerModelLoadState = 'loading'; console.log(`Load P Model: ${PLAYER_MODEL_PATH}`); if (!loader) { console.error("! Loader missing"); playerModelLoadState = 'error'; checkAssetsReady(); return; } loader.load(PLAYER_MODEL_PATH, function(gltf){ playerModel=gltf.scene;playerModel.traverse(function(c){if(c.isMesh)c.castShadow=true;});playerModelLoadState='loaded';checkAssetsReady(); }, undefined, function(err){ console.error("P Model ERR:",err);playerModelLoadState='error';checkAssetsReady(); }); }

// <<< ADDED GUN MODEL LOADING >>>
function loadGunModel() {
    gunModelLoadState = 'loading'; console.log(`Load G Model: ${GUN_MODEL_PATH}`);
    if (!loader) { console.error("! Loader missing"); gunModelLoadState = 'error'; checkAssetsReady(); return; }
    loader.load(GUN_MODEL_PATH, function(gltf){
        gunModel=gltf.scene;
        gunModel.traverse(function(c){if(c.isMesh){c.castShadow=false; c.receiveShadow=false;}}); // Gun usually doesn't cast/receive shadow
        gunModelLoadState='loaded';
        checkAssetsReady();
    }, undefined, function(err){
        console.error("!!! G Model ERR:",err);
        gunModelLoadState='error';
        checkAssetsReady(); // Check readiness even if gun fails
    });
}
// <<< ----------------------- >>>

function loadMap(mapPath) { mapLoadState = 'loading'; console.log(`Load Map: ${mapPath}`); if (!loader) { console.error("! Loader missing"); mapLoadState = 'error'; checkAssetsReady(); return; } loader.load(mapPath, function(gltf){ mapMesh=gltf.scene;mapMesh.traverse(function(c){if(c.isMesh){c.castShadow=true; c.receiveShadow=true; c.userData.isCollidable=true;}});scene.add(mapMesh);mapLoadState='loaded';checkAssetsReady(); }, undefined, function(err){ console.error(`Map ERR (${mapPath}):`,err);mapLoadState='error';checkAssetsReady(); }); }

// <<< UPDATED READINESS CHECK >>>
function checkAssetsReady() {
    console.log(`CheckR: Map=${mapLoadState}, PModel=${playerModelLoadState}, GModel=${gunModelLoadState}`);
    const mapR=mapLoadState==='loaded'||mapLoadState==='error';
    const pModelR=playerModelLoadState==='loaded'||playerModelLoadState==='error';
    const gModelR=gunModelLoadState==='loaded'||gunModelLoadState==='error'; // Include gun state

    // Require Map and Player Model to be loaded (or failed) to consider basic assets ready
    if(mapR && pModelR){
        if(mapLoadState==='error'||playerModelLoadState==='error'){
            assetsReady=false; console.error("Map or Player Model load failed.");
            setGameState('loading',{message:"FATAL: Core Asset Error!",error:true});
        } else {
            assetsReady=true; console.log("Core Assets OK (Map+PModel).");
            // If gun also failed, log warning but proceed
            if (gunModelLoadState === 'error') {
                 console.warn("Gun model failed to load, proceeding without it.");
            }
            // Trigger next step if needed
            if(socket?.connected && gameState==='loading'){
                setGameState('homescreen',{playerCount:playerCountSpan?.textContent??'?'});
            } else if(gameState==='joining'){
                 sendJoinDetails(); // Proceed to join if waiting for assets
            }
        }
    } else { assetsReady=false; } // Still waiting for Map or Player Model
}
// <<< ------------------------ >>>

console.log("assets.js loaded");

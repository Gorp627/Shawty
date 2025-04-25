// docs/assets.js

// Asset Loading Functions need access to 'loader' and state variables

function loadSound() { try{gunshotSound=new Audio(SOUND_PATH_GUNSHOT);gunshotSound.volume=0.4;gunshotSound.preload='auto';gunshotSound.load();console.log("Sound OK.");}catch(e){console.error("Audio err:",e);gunshotSound=null;} }

function loadPlayerModel() {
    playerModelLoadState = 'loading'; console.log(`Load P Model: ${PLAYER_MODEL_PATH}`);
    if (!loader) { console.error("! Loader missing for P Model"); playerModelLoadState = 'error'; checkAssetsReady(); return; }
    loader.load(PLAYER_MODEL_PATH, function(gltf){ playerModel=gltf.scene;playerModel.traverse(function(c){if(c.isMesh)c.castShadow=true;});playerModelLoadState='loaded';checkAssetsReady(); }, undefined, function(err){ console.error("P Model ERR:",err);playerModelLoadState='error';checkAssetsReady(); });
}

function loadMap(mapPath) {
    mapLoadState = 'loading'; console.log(`Load Map: ${mapPath}`);
    if (!loader) { console.error("! Loader missing for Map"); mapLoadState = 'error'; checkAssetsReady(); return; }
    loader.load(mapPath, function(gltf){ mapMesh=gltf.scene;mapMesh.traverse(function(c){if(c.isMesh){c.castShadow=true; c.receiveShadow=true; c.userData.isCollidable=true;}});scene.add(mapMesh);mapLoadState='loaded';checkAssetsReady(); }, undefined, function(err){ console.error(`Map ERR (${mapPath}):`,err);mapLoadState='error';checkAssetsReady(); });
}

// Readiness check needs access to state variables and setGameState
function checkAssetsReady() {
    console.log(`CheckR: Map=${mapLoadState}, PModel=${playerModelLoadState}`);
    const mapR=mapLoadState==='loaded'||mapLoadState==='error';
    const pModelR=playerModelLoadState==='loaded'||playerModelLoadState==='error';
    if(mapR && pModelR){
        if(mapLoadState==='error'||playerModelLoadState==='error'){ assetsReady=false; console.error("Asset load fail."); if(typeof setGameState === 'function') setGameState('loading',{message:"FATAL: Asset Error!",error:true}); }
        else { assetsReady=true; console.log("Assets OK (Map+PModel)."); if(socket?.connected && gameState==='loading'){ if(typeof setGameState === 'function') setGameState('homescreen',{playerCount:playerCountSpan?.textContent??'?'});} else if(gameState==='joining'){ if(typeof sendJoinDetails === 'function') sendJoinDetails();}}
    } else { assetsReady=false; }
}

console.log("assets.js loaded");

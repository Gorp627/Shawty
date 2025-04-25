// docs/assets.js

function loadSound() { try{gunshotSound=new Audio(SOUND_PATH_GUNSHOT);gunshotSound.volume=0.4;gunshotSound.preload='auto';gunshotSound.load();console.log("Sound OK.");}catch(e){console.error("Audio err:",e);gunshotSound=null;} }

function loadPlayerModel() {
    // *** COMMENTED OUT FOR TESTING ***
    // playerModelLoadState = 'loading'; console.log(`Load P Model: ${PLAYER_MODEL_PATH}`);
    // if (!loader) { console.error("! Loader missing"); playerModelLoadState = 'error'; checkAssetsReady(); return; }
    // loader.load(PLAYER_MODEL_PATH, function(gltf){ console.log(">>> P Model OK!"); playerModel=gltf.scene;playerModel.traverse(function(c){if(c.isMesh)c.castShadow=true;});playerModelLoadState='loaded';checkAssetsReady(); }, undefined, function(err){ console.error("!!! P Model ERR:",err);playerModelLoadState='error';checkAssetsReady(); });
    console.log("--- Skipping Player Model Load (for testing) ---");
    playerModelLoadState = 'skipped'; // Use a distinct state
    checkAssetsReady(); // Still need to check readiness
}

function loadGunModel() {
    gunModelLoadState = 'loading'; console.log(`Load G Model: ${GUN_MODEL_PATH}`);
    if (!loader) { console.error("! Loader missing"); gunModelLoadState = 'error'; checkAssetsReady(); return; }
    loader.load(GUN_MODEL_PATH, function(gltf){ console.log(">>> G Model OK!"); gunModel=gltf.scene;gunModel.traverse(function(c){if(c.isMesh){c.castShadow=false; c.receiveShadow=false;}}); gunModelLoadState='loaded'; checkAssetsReady(); }, undefined, function(err){ console.error("!!! G Model ERR:",err); gunModelLoadState='error'; checkAssetsReady(); });
}

function loadMap(mapPath) {
    mapLoadState = 'loading'; console.log(`Load Map: ${mapPath}`);
    if (!loader) { console.error("! Loader missing"); mapLoadState = 'error'; checkAssetsReady(); return; }
    loader.load(mapPath, function(gltf){ console.log(">>> Map OK!"); mapMesh=gltf.scene;mapMesh.traverse(function(c){if(c.isMesh){c.castShadow=true; c.receiveShadow=true; c.userData.isCollidable=true;}}); scene.add(mapMesh); mapLoadState='loaded'; checkAssetsReady(); }, undefined, function(err){ console.error(`!!! Map ERR (${mapPath}):`,err); mapLoadState='error'; checkAssetsReady(); });
}

function checkAssetsReady() { // Check Map and Gun only for this test
    console.log(`CheckR: Map=${mapLoadState}, PModel=${playerModelLoadState}, GModel=${gunModelLoadState}`);
    const mapR=mapLoadState==='loaded'||mapLoadState==='error'||mapLoadState==='skipped'; // Include skipped
    const pModelR=playerModelLoadState==='loaded'||playerModelLoadState==='error'||playerModelLoadState==='skipped'; // Include skipped
    const gModelR=gunModelLoadState==='loaded'||gunModelLoadState==='error'||gunModelLoadState==='skipped'; // Include skipped

    // We need Map and Gun to be decided for this test (Player is skipped)
    if(mapR && gModelR){
        // Check if any required ones FAILED (Map or potentially Gun depending on requirements)
        if(mapLoadState==='error' /* || gunModelLoadState === 'error' */ ){ // Only fail on Map error for now
            assetsReady=false; console.error("Map asset load failed.");
            setGameState('loading',{message:"FATAL: Map Load Error!",error:true});
        } else {
            assetsReady=true; console.log("Required Assets OK (Map + Gun checked).");
            if(socket?.connected && gameState==='loading'){ setGameState('homescreen',{playerCount:playerCountSpan?.textContent??'?'});}
            else if(gameState==='joining'){ sendJoinDetails();}
        }
    } else { assetsReady=false; }
}

console.log("assets.js loaded");

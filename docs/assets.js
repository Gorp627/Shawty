// docs/assets.js

// Asset Loading Functions need access to state variables
// They will now RECEIVE the initialized loader instance

function loadSound() { /* ... Same ... */ }

function loadPlayerModel(loaderInstance) { // <<< Accept loader
    playerModelLoadState = 'loading'; console.log(`Load P Model: ${PLAYER_MODEL_PATH}`);
    if (!loaderInstance) { console.error("! Loader missing in loadPlayerModel call"); playerModelLoadState = 'error'; checkAssetsReady(); return; } // Check passed loader
    loaderInstance.load(PLAYER_MODEL_PATH, function(gltf){ console.log(">>> P Model OK!"); playerModel=gltf.scene;playerModel.traverse(function(c){if(c.isMesh)c.castShadow=true;});playerModelLoadState='loaded';checkAssetsReady(); }, undefined, function(err){ console.error("P Model ERR:",err);playerModelLoadState='error';checkAssetsReady(); });
}

function loadGunModel(loaderInstance) { // <<< Accept loader
    gunModelLoadState = 'loading'; console.log(`Load G Model: ${GUN_MODEL_PATH}`);
    if (!loaderInstance) { console.error("! Loader missing in loadGunModel call"); gunModelLoadState = 'error'; checkAssetsReady(); return; } // Check passed loader
    loaderInstance.load(GUN_MODEL_PATH, function(gltf){ console.log(">>> G Model OK!"); gunModel=gltf.scene;gunModel.traverse(function(c){if(c.isMesh){c.castShadow=false; c.receiveShadow=false;}}); gunModelLoadState='loaded'; checkAssetsReady(); }, undefined, function(err){ console.error("!!! G Model ERR:",err); gunModelLoadState='error'; checkAssetsReady(); });
}

function loadMap(mapPath, loaderInstance) { // <<< Accept loader
    mapLoadState = 'loading'; console.log(`Load Map: ${mapPath}`);
    if (!loaderInstance) { console.error("! Loader missing in loadMap call"); mapLoadState = 'error'; checkAssetsReady(); return; } // Check passed loader
    loaderInstance.load(mapPath, function(gltf){ console.log(">>> Map OK!"); mapMesh=gltf.scene;mapMesh.traverse(function(c){if(c.isMesh){c.castShadow=true; c.receiveShadow=true; c.userData.isCollidable=true;}}); if (scene) scene.add(mapMesh); else console.error("Scene not ready for map!"); mapLoadState='loaded'; checkAssetsReady(); }, undefined, function(err){ console.error(`!!! Map ERR (${mapPath}):`,err); mapLoadState='error'; checkAssetsReady(); });
}


function checkAssetsReady() { // Checks all three assets now
    console.log(`CheckR: Map=${mapLoadState}, PModel=${playerModelLoadState}, GModel=${gunModelLoadState}`);
    const mapR=mapLoadState==='loaded'||mapLoadState==='error';const pModelR=playerModelLoadState==='loaded'||playerModelLoadState==='error';const gModelR=gunModelLoadState==='loaded'||gunModelLoadState==='error';
    if(mapR && pModelR && gModelR){
        if(mapLoadState==='error'||playerModelLoadState==='error'||gunModelLoadState==='error'){
            assetsReady=false; console.error("Asset load failed.");
            // Use global setGameState if available
            if(typeof setGameState === 'function') setGameState('loading',{message:"FATAL: Asset Error!<br/>Check Console.",error:true});
        } else {
            assetsReady=true; console.log("Assets OK.");
            // Trigger next state if appropriate
             if(socket?.connected && gameState==='loading'){ if(typeof setGameState === 'function') setGameState('homescreen',{playerCount:playerCountSpan?.textContent??'?'}); }
             else if(gameState==='joining'){ if(typeof sendJoinDetails === 'function') sendJoinDetails(); }
        }
    } else { assetsReady=false; }
}

console.log("assets.js loaded");

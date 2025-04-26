// docs/assets.js

// Asset Loading Functions need access to 'loader' and state variables
// Relies on 'loader' being initialized globally in config.js

function loadSound() { try{gunshotSound=new Audio(SOUND_PATH_GUNSHOT);gunshotSound.volume=0.4;gunshotSound.preload='auto';gunshotSound.load();console.log("Sound OK.");}catch(e){console.error("Audio err:",e);gunshotSound=null;} }

function loadPlayerModel() { // Loads Player model
    playerModelLoadState = 'loading'; console.log(`Load P Model: ${PLAYER_MODEL_PATH}`);
    if (!loader) { console.error("! Loader not init before loadPlayerModel"); playerModelLoadState = 'error'; checkAssetsReady(); return; } // Safety check
    loader.load(PLAYER_MODEL_PATH, function(gltf){ console.log(">>> P Model OK!"); playerModel=gltf.scene;playerModel.traverse(function(c){if(c.isMesh)c.castShadow=true;});playerModelLoadState='loaded';checkAssetsReady(); }, undefined, function(err){ console.error("P Model ERR:",err);playerModelLoadState='error';checkAssetsReady(); });
}

// function loadGunModel() { ... } // GUN MODEL LOADING REMOVED FOR BASELINE

function loadMap(mapPath) { // Loads Map
    mapLoadState = 'loading'; console.log(`Load Map: ${mapPath}`);
    if (!loader) { console.error("! Loader not init before loadMap"); mapLoadState = 'error'; checkAssetsReady(); return; } // Safety check
    loader.load(mapPath, function(gltf){ console.log(">>> Map OK!"); mapMesh=gltf.scene;mapMesh.traverse(function(c){if(c.isMesh){c.castShadow=true; c.receiveShadow=true; c.userData.isCollidable=true;}}); if (scene) scene.add(mapMesh); else console.error("Scene not ready for map!"); mapLoadState='loaded';checkAssetsReady(); }, undefined, function(err){ console.error(`Map ERR (${mapPath}):`,err);mapLoadState='error';checkAssetsReady(); });
}


function checkAssetsReady() { // Check only Map and Player Model
    console.log(`CheckR: Map=${mapLoadState}, PModel=${playerModelLoadState}`);
    const mapR=mapLoadState==='loaded'||mapLoadState==='error';
    const pModelR=playerModelLoadState==='loaded'||playerModelLoadState==='error';
    // NO GUN const gModelR = ...;
    if(mapR && pModelR){ // Check if Map and Player Model are done
        if(mapLoadState==='error'||playerModelLoadState==='error'){ // Check if either failed
            assetsReady=false; console.error("Asset load fail.");
            if(typeof setGameState === 'function') setGameState('loading',{message:"FATAL: Asset Error!",error:true});
        } else {
            assetsReady=true; console.log("Assets OK (Map+PModel).");
            if(socket?.connected && gameState==='loading'){ // Check socket and state
                if(typeof setGameState === 'function') setGameState('homescreen',{playerCount:playerCountSpan?.textContent??'?'});
            } else if(gameState==='joining'){ // If join was clicked while waiting
                 if(typeof sendJoinDetails === 'function') sendJoinDetails(); else console.error("sendJoinDetails missing!");
            }
        }
    } else { assetsReady=false; } // Still waiting
}

console.log("assets.js loaded");

// docs/assets.js

// Needs access to globals: loader, playerModelLoadState, gunModelLoadState, mapLoadState, socket, gameState, playerCountSpan, players, bullets, gunshotSound, playerModel, gunModel, mapMesh, scene
// Needs access to functions: checkAssetsReady, setGameState, sendJoinDetails

function loadSound() { try{gunshotSound=new Audio(SOUND_PATH_GUNSHOT);gunshotSound.volume=0.4;gunshotSound.preload='auto';gunshotSound.load();console.log("Sound OK.");}catch(e){console.error("Audio err:",e);gunshotSound=null;} }

function loadPlayerModel() {
    playerModelLoadState = 'loading'; console.log(`Load P Model: ${PLAYER_MODEL_PATH}`);
    if (!loader) { console.error("! Loader not init before loadPlayerModel"); playerModelLoadState = 'error'; checkAssetsReady(); return; }
    loader.load(PLAYER_MODEL_PATH,
    function(gltf){ // Success
        console.log(">>> P Model OK!"); playerModel=gltf.scene;playerModel.traverse(function(c){if(c.isMesh)c.castShadow=true;}); playerModelLoadState='loaded'; checkAssetsReady();
    },
    undefined, // Progress
    function(error){ // Error
        console.error("!!! P Model ERR:",error); playerModelLoadState='error'; checkAssetsReady();
    });
}

function loadGunModel() { // Load GUN model
    gunModelLoadState = 'loading'; console.log(`Load G Model: ${GUN_MODEL_PATH}`);
    if (!loader) { console.error("! Loader not init before loadGunModel"); gunModelLoadState = 'error'; checkAssetsReady(); return; }
    loader.load(GUN_MODEL_PATH,
    function(gltf){ // Success
        console.log(">>> G Model OK!"); gunModel=gltf.scene;gunModel.traverse(function(c){if(c.isMesh){c.castShadow=false; c.receiveShadow=false;}}); gunModelLoadState='loaded'; checkAssetsReady();
    },
    undefined, // Progress
    function(error){ // Error
        console.error("!!! G Model ERR:",error); gunModelLoadState='error'; checkAssetsReady();
    });
}

function loadMap(mapPath) {
    mapLoadState = 'loading'; console.log(`Load Map: ${mapPath}`);
    if (!loader) { console.error("! Loader not init before loadMap"); mapLoadState = 'error'; checkAssetsReady(); return; }
    loader.load(mapPath,
    function(gltf){ // Success
        console.log(">>> Map OK!"); mapMesh=gltf.scene;mapMesh.traverse(function(c){if(c.isMesh){c.castShadow=true; c.receiveShadow=true; c.userData.isCollidable=true;}});
        if (scene) scene.add(mapMesh); else console.error("Scene not ready for map!"); // Add check
        mapLoadState='loaded'; checkAssetsReady();
    },
    undefined, // Progress
    function(error){ // Error
        console.error(`!!! Map ERR (${mapPath}):`,error); mapLoadState='error'; checkAssetsReady();
    });
}


function checkAssetsReady() { // Checks all three assets now
    // console.log(`CheckR: Map=${mapLoadState}, PModel=${playerModelLoadState}, GModel=${gunModelLoadState}`); // Reduce noise
    const mapR=mapLoadState==='loaded'||mapLoadState==='error';
    const pModelR=playerModelLoadState==='loaded'||playerModelLoadState==='error';
    const gModelR=gunModelLoadState==='loaded'||gunModelLoadState==='error';
    if(mapR && pModelR && gModelR){ // Wait for all 3
        if(mapLoadState==='error'||playerModelLoadState==='error'||gunModelLoadState==='error'){ // Fail if any fail
            assetsReady=false; console.error("Asset load failed.");
            // Ensure setGameState exists before calling
            if(typeof setGameState === 'function') setGameState('loading',{message:"FATAL: Asset Error!<br/>Check Console.",error:true});
        } else {
            assetsReady=true; console.log("Assets ready.");
            if(socket?.connected && gameState==='loading'){
                 if(typeof setGameState === 'function') setGameState('homescreen',{playerCount:playerCountSpan?.textContent??'?'});
            } else if(gameState==='joining'){
                 if(typeof sendJoinDetails === 'function') sendJoinDetails(); else console.error("sendJoinDetails missing!");
            }
        }
    } else { assetsReady=false; } // Still waiting
}

console.log("assets.js loaded");

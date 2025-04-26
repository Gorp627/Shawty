// docs/assets.js

function loadSound() { /* ... Same ... */ }

function loadPlayerModel(loaderInstance) {
    playerModelLoadState = 'loading'; console.log(`Load P Model: ${PLAYER_MODEL_PATH}`);
    if (!loaderInstance) { console.error("! Loader missing in loadPlayerModel"); playerModelLoadState = 'error'; checkAssetsReady(); return; }
    // <<< LOG BEFORE LOAD >>>
    console.log(`[Asset] Attempting loader.load for Player Model...`);
    loaderInstance.load(PLAYER_MODEL_PATH, function(gltf){ console.log(">>> P Model OK!"); playerModel=gltf.scene;playerModel.traverse(function(c){if(c.isMesh)c.castShadow=true;});playerModelLoadState='loaded';checkAssetsReady(); }, undefined, function(err){ console.error("!!! P Model ERR:",err);playerModelLoadState='error';checkAssetsReady(); });
}

function loadGunModel(loaderInstance) {
    gunModelLoadState = 'loading'; console.log(`Load G Model: ${GUN_MODEL_PATH}`);
    if (!loaderInstance) { console.error("! Loader missing in loadGunModel"); gunModelLoadState = 'error'; checkAssetsReady(); return; }
    // <<< LOG BEFORE LOAD >>>
    console.log(`[Asset] Attempting loader.load for Gun Model...`);
    loaderInstance.load(GUN_MODEL_PATH, function(gltf){ console.log(">>> G Model OK!"); gunModel=gltf.scene;gunModel.traverse(function(c){if(c.isMesh){c.castShadow=false; c.receiveShadow=false;}}); gunModelLoadState='loaded'; checkAssetsReady(); }, undefined, function(err){ console.error("!!! G Model ERR:",err); gunModelLoadState='error'; checkAssetsReady(); });
}

function loadMap(mapPath, loaderInstance) {
    mapLoadState = 'loading'; console.log(`Load Map: ${mapPath}`);
    if (!loaderInstance) { console.error("! Loader missing in loadMap"); mapLoadState = 'error'; checkAssetsReady(); return; }
    // <<< LOG BEFORE LOAD >>>
    console.log(`[Asset] Attempting loader.load for Map...`);
    loaderInstance.load(mapPath, function(gltf){ console.log(">>> Map OK!"); mapMesh=gltf.scene;mapMesh.traverse(function(c){if(c.isMesh){c.castShadow=true; c.receiveShadow=true; c.userData.isCollidable=true;}}); if (scene) scene.add(mapMesh); else console.error("Scene not ready for map!"); mapLoadState='loaded';checkAssetsReady(); }, undefined, function(err){ console.error(`!!! Map ERR (${mapPath}):`,err); mapLoadState='error'; checkAssetsReady(); });
}

function checkAssetsReady() { /* ... Same ... */ }

console.log("assets.js loaded");

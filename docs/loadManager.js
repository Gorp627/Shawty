// docs/loadManager.js

const loadManager = {
    assets: { /* ... Same asset definitions ... */ },
    loaders: {},
    requiredForGame: ['map', 'playerModel', 'gunModel'],
    eventListeners: {'ready': [], 'error': [], 'progress': [], 'assetLoaded': []},

    initializeLoaders: function() { /* ... Same ... */ },
    startLoading: function() { /* ... Same ... */ },
    loadAsset: function(key) { /* ... Same ... */ },

    // Callbacks from actual loader
    _assetLoadedCallback: function(assetKey, success, loadedAssetOrError) {
        if (!this.assets[assetKey]) return; // Asset key not tracked

        if (success) {
            console.log(`[LoadManager] OK ${assetKey}`);
            this.assets[assetKey].state = 'loaded';
             // Assign loaded asset to global scope (or handle differently if needed)
            if (assetKey === 'map') {
                 window.mapMesh = loadedAssetOrError.scene; // Assign scene to global mapMesh
                 window.mapMesh.traverse(function(c){ if(c.isMesh){ c.castShadow=true; c.receiveShadow=true; c.userData.isCollidable=true; }});
                 if(scene) scene.add(window.mapMesh); // Add map to scene
            } else if (assetKey === 'playerModel' || assetKey === 'gunModel') {
                 window[assetKey] = loadedAssetOrError.scene; // Assign scene to global playerModel/gunModel
                 window[assetKey].traverse(function(c){ if(c.isMesh) c.castShadow = (assetKey === 'playerModel'); }); // Shadows only for player model
            } else if (assetKey === 'gunshotSound') {
                 window.gunshotSound = loadedAssetOrError; // Assign Audio object
            }
             // Store potentially for other uses: this.assets[assetKey].data = loadedAssetOrError;
        } else {
            console.error(`[LoadManager] !!! ${assetKey} ERR:`, loadedAssetOrError);
            this.assets[assetKey].state = 'error';
        }
        this.trigger('assetLoaded', {key: assetKey, success: success}); // Trigger asset loaded event
        this.checkCompletion(); // Check if all required assets are now done
    },

    // Simplified loadAsset using the combined callback
    loadAsset: function(key) {
        const asset = this.assets[key]; if (!asset) return; asset.state = 'loading';
        console.log(`[LoadManager] Loading ${key}...`);
        const manager = this; const loadStartTime = Date.now();
        const onProg = (xhr) => { if(xhr.lengthComputable) manager.trigger('progress', {key:key, p:Math.round(xhr.loaded/xhr.total*100)}); };
        const onError = (err) => { manager._assetLoadedCallback(key, false, err); }; // Call combined callback on error
        const onSuccess = (loadedAsset) => { manager._assetLoadedCallback(key, true, loadedAsset); }; // Call combined callback on success

        if (asset.type === 'audio') {
            try { const audio = new Audio(asset.path); audio.preload='auto'; audio.load(); console.log(`[LoadManager] Assume ${key} audio ready.`); onSuccess(audio); } catch (e) { onError(e); } // Basic audio - assume success quickly
        } else { // Assume GLTF
            if (!this.loaders.gltfLoader) { onError("GLTF Loader missing"); return; }
            this.loaders.gltfLoader.load(asset.path, (gltf) => onSuccess(gltf), onProg, onError); // Pass scene directly now
        }
    },

    checkCompletion: function() {
        let done = true, error = false;
        for (const key of this.requiredForGame) { const state = this.assets[key]?.state || 'missing'; if (state === 'pending' || state === 'loading') done = false; if (state === 'error') error = true; }
        // console.log(`[LoadManager] Completion Check - Done: ${done}, Error: ${error}`); // Less noise

        if (done) {
             if (error) {
                  console.error("[LoadManager] Required assets FAIL.");
                  this.trigger('error', {m:'Asset Fail'}); // <<< Trigger IMMEDIATELY
             } else {
                  console.log("[LoadManager] Required assets READY.");
                  this.trigger('ready'); // <<< Trigger IMMEDIATELY
             }
        }
    },

     on: function(evName, cb) { /* ... Same ... */ },
     trigger: function(evName, data={}) { /* ... Same ... */ }
};
console.log("loadManager.js loaded");

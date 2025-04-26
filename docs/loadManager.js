// docs/loadManager.js

const loadManager = {
    assets: {
        map: { state: 'pending', path: CONFIG.MAP_PATH },
        playerModel: { state: 'pending', path: CONFIG.PLAYER_MODEL_PATH },
        gunModel: { state: 'pending', path: CONFIG.GUN_MODEL_PATH },
        gunshotSound: { state: 'pending', path: CONFIG.SOUND_PATH_GUNSHOT, type: 'audio' },
    },
    loaders: {}, // GLTF Loader initialized in game.js now
    requiredForGame: ['map', 'playerModel', 'gunModel'],
    eventListeners: {'ready': [], 'error': [], 'progress': [], 'assetLoaded': []},

    // Loaders are now initialized in game.js->initializeCoreComponents before this module's functions are likely called
    // initializeLoaders: function() { ... },

    startLoading: function() {
        console.log("[LoadManager] Start Loading All Assets...");
        if (!loader) { // Check if global loader exists (created in game.js)
             console.error("[LoadManager] GLTF Loader not initialized before startLoading!");
             this.trigger('error',{m:'GFX Loader Fail'});
             return;
        }
        let assetsToLoadCount = 0;
        for (const key in this.assets) { if (this.assets[key].state === 'pending') { assetsToLoadCount++; this.loadAsset(key); }}
        if (assetsToLoadCount === 0) { console.log("[LoadManager] No pending assets found."); this.checkCompletion(); }
    },

    loadAsset: function(key) {
        const asset = this.assets[key]; if (!asset || asset.state !== 'pending') return; asset.state = 'loading';
        console.log(`[LoadManager] Loading ${key}...`);
        const manager = this; const loadStartTime = Date.now();
        const onProg = function(xhr){ if(xhr.lengthComputable) manager.trigger('progress', {key:key, progress:Math.round(xhr.loaded/xhr.total*100)}); };
        const onError = function(err){ manager._assetLoadedCallback(key, false, err); };
        // Modify onSuccess to pass the whole gltf object for models initially
        const onSuccess = function(loadedAsset){ manager._assetLoadedCallback(key, true, loadedAsset); };

        if (asset.type === 'audio') {
            try { const audio = new Audio(asset.path); audio.preload='auto'; const promise = audio.load(); if (promise !== undefined) promise.then(()=>{ onSuccess(audio); }).catch(onError); else setTimeout(() => onSuccess(audio), 500); } catch (e) { onError(e); }
        } else { // Assume GLTF/GLB
            if (!loader) { onError("GLTF Loader missing"); return; } // Use global loader
            loader.load(asset.path, onSuccess, onProg, onError); // Pass the raw gltf to onSuccess
        }
    },

    _assetLoadedCallback: function(assetKey, success, loadedAssetOrError) {
        if (!this.assets[assetKey]) return;
        this.assets[assetKey].state = success ? 'loaded' : 'error';
        if (success) {
            console.log(`[LoadManager] OK ${assetKey}`);
            // Process and assign based on asset type
            if (assetKey === 'gunshotSound') {
                 window.gunshotSound = loadedAssetOrError; // Assign Audio object
            } else { // GLTF model/map
                window[assetKey] = loadedAssetOrError.scene; // Assign the scene graph to the global variable
                 if(assetKey === 'map' && typeof scene !== 'undefined') scene.add(window[assetKey]);
                 else if (assetKey === 'playerModel' || assetKey === 'gunModel') window[assetKey].traverse(function(c){if(c.isMesh) c.castShadow=(assetKey==='playerModel');});
            }
        } else { console.error(`[LoadManager] !!! ${assetKey} ERR:`, loadedAssetOrError); }
        this.trigger('assetLoaded', {key: assetKey, success: success});
        this.checkCompletion();
    },

    checkCompletion: function() { // Directly attempts state transition
        let done = true, error = false;
        for (const key of this.requiredForGame) { const state = this.assets[key]?.state || 'missing'; if (state === 'pending' || state === 'loading') done = false; if (state === 'error') error = true; }

        if (!done) { assetsReady = false; return; } // Still loading required assets

        console.log(`[LoadManager] Required assets loading complete. Error state: ${error}`);
        assetsReady = !error; // Set global flag based *only* on asset state

        if (error) {
            this.trigger('error', {m:'Asset Fail'});
            if (typeof stateMachine !== 'undefined' && stateMachine.is('loading')) { stateMachine.transitionTo('loading',{message:"FATAL: Asset Error!", error:true}); }
        } else {
            console.log("[LoadManager] Required assets READY.");
            this.trigger('ready'); // Trigger ready event

            // Directly attempt transition if socket also ready
            if (typeof Network !== 'undefined' && Network.isConnected() && typeof stateMachine !== 'undefined' && stateMachine.is('loading')) {
                console.log("[LoadManager] Assets ready & Socket connected. Transitioning...");
                // Use global UIManager reference if available
                 if (typeof UIManager !== 'undefined') {
                    stateMachine.transitionTo('homescreen', { playerCount: UIManager.playerCountSpan?.textContent ?? '?' });
                 } else {
                     console.error("UIManager missing, cannot transition state from LoadManager!");
                 }
            } else if (typeof Network === 'undefined' || !Network.isConnected()) { console.log("[LoadManager] Assets ready, but waiting for socket connection."); }
             else if (stateMachine.is('joining')) { console.log("[LoadManager] Assets ready while joining state active."); if(typeof Network !== 'undefined') Network.sendJoinDetails(); }
        }
    },

     on: function(evName, cb) { if(!this.eventListeners[evName])this.eventListeners[evName]=[]; this.eventListeners[evName].push(cb); },
     trigger: function(evName, data={}) { if(this.eventListeners[evName]) this.eventListeners[evName].forEach(function(cb){ try { cb(data); } catch(e){ console.error(`Listener Error ${evName}:`, e)} }); }
};
window.loadManager = loadManager; // Export globally
console.log("loadManager.js loaded");

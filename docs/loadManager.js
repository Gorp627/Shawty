// docs/loadManager.js

const loadManager = {
    assets: {
        map: { state: 'pending', path: CONFIG.MAP_PATH },
        playerModel: { state: 'pending', path: CONFIG.PLAYER_MODEL_PATH },
        gunModel: { state: 'pending', path: CONFIG.GUN_MODEL_PATH },
        gunshotSound: { state: 'pending', path: CONFIG.SOUND_PATH_GUNSHOT, type: 'audio' },
    },
    loaders: {},
    requiredForGame: ['map', 'playerModel', 'gunModel'],
    eventListeners: {'ready': [], 'error': [], 'progress': [], 'assetLoaded': []},

    initializeLoaders: function() {
        console.log("[LoadManager] Init Loaders");
        try {
            this.loaders.gltfLoader = new THREE.GLTFLoader();
            this.loaders.dracoLoader = new THREE.DRACOLoader();
            this.loaders.dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/');
            this.loaders.dracoLoader.setDecoderConfig({ type: 'js' });
            this.loaders.gltfLoader.setDRACOLoader(this.loaders.dracoLoader);
            console.log("[LoadManager] Loaders OK."); return true;
        } catch(e) { console.error("[LoadManager] Loader Init FAIL!", e); this.trigger('error',{m:'GFX Loader Fail'}); return false; }
    },

    startLoading: function() {
        console.log("[LoadManager] Start Loading All Assets...");
        if (!this.loaders.gltfLoader && !this.initializeLoaders()) return;
        let assetsToLoadCount = 0;
        for (const key in this.assets) { if (this.assets[key].state === 'pending') { assetsToLoadCount++; this.loadAsset(key); }}
        if (assetsToLoadCount === 0) { console.log("[LoadManager] No pending assets found."); this.checkCompletion(); }
    },

    loadAsset: function(key) {
        const asset = this.assets[key]; if (!asset || asset.state !== 'pending') return; asset.state = 'loading';
        // console.log(`[LoadManager] Loading ${key}...`); // Reduce noise
        const manager = this; const loadStartTime = Date.now();
        const onProg = (xhr) => { if(xhr.lengthComputable) manager.trigger('progress', {key:key, progress:Math.round(xhr.loaded/xhr.total*100)}); };
        const onError = (err) => { manager._assetLoadedCallback(key, false, err); };
        const onSuccess = (loadedAsset) => { let processedAsset = loadedAsset; if (loadedAsset && loadedAsset.scene && asset.type !== 'audio') processedAsset = loadedAsset.scene; manager._assetLoadedCallback(key, true, processedAsset); };

        if (asset.type === 'audio') {
            try { const audio = new Audio(asset.path); audio.preload='auto'; const promise = audio.load(); if (promise !== undefined) promise.then(()=>onSuccess(audio)).catch(onError); else setTimeout(() => onSuccess(audio), 500); } catch (e) { onError(e); }
        } else { if (!this.loaders.gltfLoader) { onError("GLTF Loader missing"); return; } this.loaders.gltfLoader.load(asset.path, (gltf) => onSuccess(gltf), onProg, onError); } // Pass gltf directly to success
    },

    _assetLoadedCallback: function(assetKey, success, loadedAssetOrError) {
        if (!this.assets[assetKey]) return;
        this.assets[assetKey].state = success ? 'loaded' : 'error';
        if (success) {
            console.log(`[LoadManager] OK ${assetKey}`); window[assetKey] = loadedAssetOrError; // Assign to global
             if(assetKey==='map'&&scene) scene.add(window[assetKey]); // Add map
             else if(assetKey === 'playerModel' || assetKey === 'gunModel') window[assetKey].traverse(function(c){if(c.isMesh) c.castShadow=(assetKey==='playerModel');}); // Process models
        } else { console.error(`[LoadManager] !!! ${assetKey} ERR:`, loadedAssetOrError); }
        this.trigger('assetLoaded', {key: assetKey, success: success});
        this.checkCompletion(); // Check overall completion status
    },

    checkCompletion: function() {
        let done = true, error = false;
        for (const key of this.requiredForGame) { const state = this.assets[key]?.state || 'missing'; if (!state || state === 'pending' || state === 'loading') done = false; if (state === 'error') error = true; }

        if (!done) { assetsReady = false; return; } // Still loading required assets

        console.log(`[LoadManager] Required assets loading complete. Error state: ${error}`);
        assetsReady = !error; // Set global flag

        if (error) {
            this.trigger('error', {m:'Asset Fail'});
            if (typeof stateMachine !== 'undefined' && stateMachine.is('loading')) { stateMachine.transitionTo('loading',{message:"FATAL: Asset Error!", error:true}); }
        } else {
            console.log("[LoadManager] Required assets READY.");
            this.trigger('ready'); // Still trigger ready event for game.js listener

            // *** Directly attempt transition to homescreen if conditions met ***
            if (typeof Network !== 'undefined' && Network.isConnected() && typeof stateMachine !== 'undefined' && stateMachine.is('loading')) {
                console.log("[LoadManager] Assets ready & Socket connected. Transitioning to homescreen...");
                stateMachine.transitionTo('homescreen', { playerCount: UIManager?.playerCountSpan?.textContent ?? '?' });
            } else if (typeof Network === 'undefined' || !Network.isConnected()) { console.log("[LoadManager] Assets ready, but waiting for socket connection."); }
            else if (stateMachine.is('joining')) { console.log("[LoadManager] Assets ready while joining state active."); if(typeof Network !== 'undefined' && typeof Network.sendJoinDetails === 'function') Network.sendJoinDetails(); }
        }
    },

     on: function(evName, cb) { if(!this.eventListeners[evName])this.eventListeners[evName]=[]; this.eventListeners[evName].push(cb); },
     trigger: function(evName, data={}) { if(this.eventListeners[evName]) this.eventListeners[evName].forEach(cb => { try { cb(data); } catch(e){ console.error(`Error in listener for ${evName}:`, e)} }); }
};
window.loadManager = loadManager; // Export globally
console.log("loadManager.js loaded");

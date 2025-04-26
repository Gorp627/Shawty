// docs/loadManager.js

const loadManager = {
    assets: {
        map: { state: 'pending', path: CONFIG.MAP_PATH },
        playerModel: { state: 'pending', path: CONFIG.PLAYER_MODEL_PATH },
        gunModel: { state: 'pending', path: CONFIG.GUN_MODEL_PATH },
        gunshotSound: { state: 'pending', path: CONFIG.SOUND_PATH_GUNSHOT, type: 'audio' },
        // Add other assets like impact sounds, textures, etc. here
    },
    loaders: {}, // To hold loader instances like GLTFLoader
    requiredForGame: ['map', 'playerModel', 'gunModel'], // Assets needed before 'playing' state
    eventListeners: {'ready': [], 'error': [], 'progress': [], 'assetLoaded': []}, // Basic events

    // Initialize loaders needed
    initializeLoaders: function() {
        console.log("[LoadManager] Init Loaders");
        try {
            this.loaders.gltfLoader = new THREE.GLTFLoader();
            const dracoLoader = new THREE.DRACOLoader(); // Keep Draco setup
            dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/');
            dracoLoader.setDecoderConfig({ type: 'js' });
            this.loaders.gltfLoader.setDRACOLoader(dracoLoader);
            console.log("[LoadManager] Loaders OK.");
            return true;
        } catch(e) { console.error("[LoadManager] Loader Init FAIL!", e); this.trigger('error',{m:'GFX Loader Fail'}); return false; }
    },

    // Start loading all assets marked 'pending'
    startLoading: function() {
        console.log("[LoadManager] Start Loading All Assets...");
        if (!this.loaders.gltfLoader && !this.initializeLoaders()) return; // Stop if loaders fail

        let assetsToLoadCount = 0;
        for (const key in this.assets) {
            if (this.assets[key].state === 'pending') {
                assetsToLoadCount++;
                this.loadAsset(key);
            }
        }
         if (assetsToLoadCount === 0) {
             console.log("[LoadManager] No pending assets found, checking completion immediately.");
             this.checkCompletion(); // Check if already complete if no assets were pending
         }
    },

    // Load a specific asset
    loadAsset: function(key) {
        const asset = this.assets[key];
        if (!asset || asset.state !== 'pending') { // Only load if pending
            // console.warn(`[LoadManager] Skipped loading ${key}, state: ${asset?.state}`);
            return;
        }
        asset.state = 'loading';
        console.log(`[LoadManager] Loading ${key}...`);

        const manager = this; // Reference for callbacks
        const loadStartTime = Date.now();

        // --- Unified Callbacks ---
        function onProg(xhr) { if(xhr.lengthComputable) manager.trigger('progress', {key:key, progress:Math.round(xhr.loaded/xhr.total*100)}); }
        function onError(err) { manager._assetLoadedCallback(key, false, err); }
        function onSuccess(loadedAssetData) { // Renamed for clarity
             // Store the asset correctly (e.g., gltf.scene for models)
             let processedAsset = loadedAssetData;
             if (loadedAssetData && loadedAssetData.scene && asset.type !== 'audio') { // It's a GLTF result
                 processedAsset = loadedAssetData.scene;
             }
             manager._assetLoadedCallback(key, true, processedAsset);
         }
        // -------------------------


        // Handle different asset types
        if (asset.type === 'audio') {
            try {
                 const audio = new Audio(asset.path);
                 audio.preload = 'auto';
                 const canPlayPromise = audio.load(); // load() returns a promise in some browsers
                 if (canPlayPromise !== undefined) {
                    canPlayPromise.then(() => onSuccess(audio)).catch(onError); // Use promise if available
                 } else {
                    // Fallback for older browsers or if load() doesn't return promise
                    // Assume loaded after a short delay - less reliable
                    console.warn(`[LoadManager] Audio load for ${key} might not track accurately.`);
                    setTimeout(() => onSuccess(audio), 500);
                 }
            } catch (e) { onError(e); }

        } else { // Assume GLTF/GLB
            if (!this.loaders.gltfLoader) { onError("GLTF Loader missing"); return; }
            this.loaders.gltfLoader.load(asset.path, onSuccess, onProg, onError); // Pass onSuccess directly
        }
    },

    // Combined callback handler (internal)
    _assetLoadedCallback: function(assetKey, success, loadedAssetOrError) {
        if (!this.assets[assetKey]) return; // Asset key not tracked

        if (success) {
            console.log(`[LoadManager] OK ${assetKey}`);
            this.assets[assetKey].state = 'loaded';
             // Assign loaded asset to global scope
             window[assetKey] = loadedAssetOrError; // e.g., window.mapMesh = loadedAssetOrError;
             // Optional: Pre-process models after loading if needed
              if (assetKey === 'playerModel' || assetKey === 'gunModel') {
                  window[assetKey].traverse(function(c){ if(c.isMesh) c.castShadow = (assetKey === 'playerModel'); });
              } else if (assetKey === 'map') {
                  window[assetKey].traverse(function(c){ if(c.isMesh){ c.castShadow=true; c.receiveShadow=true; c.userData.isCollidable=true; }});
                  if(scene) scene.add(window[assetKey]); // Add map to scene after load
              }
             this.trigger('assetLoaded', {key: assetKey, success: true});
        } else {
            console.error(`[LoadManager] !!! ${assetKey} ERR:`, loadedAssetOrError);
            this.assets[assetKey].state = 'error';
            this.trigger('assetLoaded', {key: assetKey, success: false});
        }
        this.checkCompletion(); // Check overall completion status
    },


    // Check if required assets are loaded or failed
    checkCompletion: function() {
        let done = true; let error = false; let status = {};
        for (const key of this.requiredForGame) {
             status[key] = this.assets[key]?.state || 'missing';
             if (!this.assets[key] || status[key] === 'pending' || status[key] === 'loading') { done = false; }
             if (status[key] === 'error') { error = true; }
        }
        // console.log(`[LoadManager] Completion Check - Done: ${done}, Error: ${error}`, status); // Less noise

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

     // Basic event system
     on: function(evName, cb) { if(this.eventListeners[evName]) this.eventListeners[evName].push(cb); else console.warn(`LM Listener unknown event: ${evName}`);},
     trigger: function(evName, data={}) { if(this.eventListeners[evName]) this.eventListeners[evName].forEach(cb => { try { cb(data); } catch(e){ console.error(`Error in listener for ${evName}:`, e)} }); }
};
console.log("loadManager.js loaded");

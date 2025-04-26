// docs/loadManager.js

const loadManager = {
    assets: {
        map: { state: 'pending', path: CONFIG.MAP_PATH },
        playerModel: { state: 'pending', path: CONFIG.PLAYER_MODEL_PATH },
        gunModel: { state: 'pending', path: CONFIG.GUN_MODEL_PATH },
        gunshotSound: { state: 'pending', path: CONFIG.SOUND_PATH_GUNSHOT, type: 'audio' },
        // Add other assets like impact sounds, textures, etc. here
    },
    loaders: {},
    requiredForGame: ['map', 'playerModel', 'gunModel'], // Assets absolutely needed to play
    eventListeners: {'ready': [], 'error': [], 'progress': [], 'assetLoaded': []}, // Added assetLoaded

    initializeLoaders: function() {
        console.log("[LoadManager] Init Loaders");
        try {
            this.loaders.gltfLoader = new THREE.GLTFLoader();
            this.loaders.dracoLoader = new THREE.DRACOLoader(); // Keep Draco setup
            this.loaders.dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/');
            this.loaders.dracoLoader.setDecoderConfig({ type: 'js' });
            this.loaders.gltfLoader.setDRACOLoader(this.loaders.dracoLoader);
            // If using THREE.AudioLoader: this.loaders.audioLoader = new THREE.AudioLoader();
            console.log("[LoadManager] Loaders OK.");
            return true;
        } catch(e) { console.error("[LoadManager] Loader Init FAIL!", e); this.trigger('error',{m:'GFX Loader Fail'}); return false; }
    },

    startLoading: function() {
        console.log("[LoadManager] Start Loading");
        if (!this.loaders.gltfLoader && !this.initializeLoaders()) return;

        for (const key in this.assets) {
            if (this.assets[key].state === 'pending') {
                this.loadAsset(key);
            }
        }
    },

    loadAsset: function(key) {
        const asset = this.assets[key];
        if (!asset) return;
        asset.state = 'loading';
        console.log(`[LoadManager] Loading ${key}...`);

        const manager = this; // Reference for callbacks
        const loadStartTime = Date.now();

        function onProg(xhr) {
            if (xhr.lengthComputable) {
                const percent = Math.round(xhr.loaded / xhr.total * 100);
                manager.trigger('progress', { assetKey: key, progress: percent });
            }
        }
        function onError(err) {
            console.error(`[LoadManager] ERR ${key}:`, err);
            asset.state = 'error'; manager.trigger('assetLoaded', {key: key, success: false}); manager.checkCompletion();
        }

        // Handle different asset types
        if (asset.type === 'audio') {
            try {
                 // Basic Audio object loading
                 window[key] = new Audio(asset.path); // Assign to global scope based on key
                 window[key].preload = 'auto';
                 window[key].load();
                 // Annoyingly, 'canplaythrough' isn't always reliable enough to know it's "ready"
                 // We'll assume it loads reasonably quickly or handle errors on play attempt later
                 // For simplicity, mark as loaded relatively soon
                 setTimeout(() => {
                      console.log(`[LoadManager] Assume ${key} audio ready.`);
                      asset.state = 'loaded'; manager.trigger('assetLoaded', {key: key, success: true}); manager.checkCompletion();
                 }, 500); // Assume ready after 0.5 sec (adjust if needed)
            } catch (e) { onError(e); }

        } else { // Assume GLTF/GLB
            if (!this.loaders.gltfLoader) { onError("GLTF Loader missing"); return; }
            this.loaders.gltfLoader.load(asset.path, function(gltf) {
                 console.log(`[LoadManager] OK ${key} (${Date.now() - loadStartTime}ms)`);
                 // Store the loaded asset data (the scene for models)
                 window[key] = gltf.scene; // Assign to global scope using asset key as variable name
                 // Pre-process if needed (e.g., shadows)
                 if (key === 'playerModel' || key === 'gunModel') {
                      window[key].traverse(function(c){ if(c.isMesh) c.castShadow = (key === 'playerModel'); }); // Only player casts shadow
                 } else if (key === 'map') {
                      window[key].traverse(function(c){ if(c.isMesh){ c.castShadow=true; c.receiveShadow=true; c.userData.isCollidable=true; }});
                 }
                 asset.state = 'loaded'; manager.trigger('assetLoaded', {key: key, success: true}); manager.checkCompletion();
             }, onProg, onError);
        }
    },

    checkCompletion: function() {
        let done = true, error = false, status = {};
        for (const key of this.requiredForGame) {
             status[key] = this.assets[key]?.state || 'missing';
             if (!this.assets[key] || status[key] === 'pending' || status[key] === 'loading') { done = false; }
             if (status[key] === 'error') { error = true; }
        }
        // console.log(`[LoadManager] Completion Check - Done: ${done}, Error: ${error}`, status);
        if (done) {
             if (error) { console.error("[LoadManager] Required assets FAIL."); this.trigger('error', {m:'Asset Fail'}); }
             else { console.log("[LoadManager] Required assets READY."); this.trigger('ready'); }
        }
    },

     on: function(evName, cb) { if(this.eventListeners[evName]) this.eventListeners[evName].push(cb); },
     trigger: function(evName, data={}) { if(this.eventListeners[evName]) this.eventListeners[evName].forEach(cb => cb(data)); }
};
console.log("loadManager.js loaded");

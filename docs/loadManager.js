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
            const draco = new THREE.DRACOLoader();
            draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/');
            draco.setDecoderConfig({ type: 'js' });
            this.loaders.gltfLoader.setDRACOLoader(draco);
            console.log("[LoadManager] Loaders OK."); return true;
        } catch(e) { console.error("[LoadManager] Loader Init FAIL!", e); this.trigger('error',{m:'GFX Loader Fail'}); return false; }
    },

    startLoading: function() {
        console.log("[LoadManager] Start Loading");
        if (!this.loaders.gltfLoader && !this.initializeLoaders()) return;
        for (const key in this.assets) { if (this.assets[key].state === 'pending') this.loadAsset(key); }
    },

    loadAsset: function(key) {
        const asset = this.assets[key]; if (!asset) return; asset.state = 'loading';
        console.log(`[LoadManager] Loading ${key}...`);
        const manager = this; const loadStartTime = Date.now();
        const onProg = (xhr) => { if(xhr.lengthComputable) manager.trigger('progress', {key:key, p:Math.round(xhr.loaded/xhr.total*100)}); };
        const onError = (err) => { console.error(`[LoadManager] ERR ${key}:`, err); asset.state = 'error'; manager.trigger('assetLoaded', {key:key, success:false}); manager.checkCompletion(); };
        const onSuccess = (loadedAsset) => {
            console.log(`[LoadManager] OK ${key} (${Date.now() - loadStartTime}ms)`);
            window[key] = loadedAsset; // Assign to global scope (e.g., mapMesh = gltf.scene)
             // Pre-process models
             if (key === 'playerModel' || key === 'gunModel') { window[key].traverse(c => {if(c.isMesh) c.castShadow = (key === 'playerModel');}); }
             else if (key === 'map') { window[key].traverse(c => {if(c.isMesh){c.castShadow=true; c.receiveShadow=true; c.userData.isCollidable=true;}}); if(scene) scene.add(window[key]); } // Add map directly
            asset.state = 'loaded'; manager.trigger('assetLoaded', {key: key, success: true}); manager.checkCompletion();
        };

        if (asset.type === 'audio') {
            try { window[key] = new Audio(asset.path); window[key].preload='auto'; window[key].load(); setTimeout(()=>{ onSuccess(window[key]); }, 500); } catch (e) { onError(e); } // Basic audio loading
        } else { // Assume GLTF
            if (!this.loaders.gltfLoader) { onError("GLTF Loader missing"); return; }
            this.loaders.gltfLoader.load(asset.path, (gltf) => onSuccess(gltf.scene), onProg, onError);
        }
    },

    checkCompletion: function() {
        let done = true, error = false;
        for (const key of this.requiredForGame) { const state = this.assets[key]?.state || 'missing'; if (state === 'pending' || state === 'loading') done = false; if (state === 'error') error = true; }
        if (done) { if (error) { console.error("[LoadManager] Required assets FAIL."); setTimeout(() => { this.trigger('error', {m:'Asset Fail'}); }, 0); } else { console.log("[LoadManager] Required assets READY."); setTimeout(() => { this.trigger('ready'); }, 10); }}
    },

     on: function(evName, cb) { if(this.eventListeners[evName]) this.eventListeners[evName].push(cb); else console.warn(`LM Listener unknown event: ${evName}`);},
     trigger: function(evName, data={}) { if(this.eventListeners[evName]) this.eventListeners[evName].forEach(cb => { try { cb(data); } catch(e){ console.error(`Error in listener for ${evName}:`, e)} }); }
};
console.log("loadManager.js loaded");

// docs/loadManager.js

const loadManager = {
    assets: {
        // Added 'data' field to store the loaded asset
        map: { state: 'pending', path: CONFIG.MAP_PATH, data: null },
        playerModel: { state: 'pending', path: CONFIG.PLAYER_MODEL_PATH, data: null },
        // gunModel: { state: 'pending', path: CONFIG.GUN_MODEL_PATH, data: null }, // REMOVED
        gunshotSound: { state: 'pending', path: CONFIG.SOUND_PATH_GUNSHOT, type: 'audio', data: null },
    },
    loaders: {}, // GLTF Loader initialized in game.js
    requiredForGame: ['map', 'playerModel', 'gunshotSound'], // REMOVED gunModel
    eventListeners: {'ready': [], 'error': [], 'progress': [], 'assetLoaded': []},

    // Helper to check if an asset is fully loaded and processed
    isAssetReady: function(key) {
        const asset = this.assets[key];
        if (!asset) return false; // Asset not defined in config
        const isLoadedState = asset.state === 'loaded';
        const hasValidData = !!(asset.data && asset.data !== 'error');
        return isLoadedState && hasValidData;
    },

    // Helper to retrieve loaded asset data
    getAssetData: function(key) {
        if (this.isAssetReady(key)) { return this.assets[key].data; }
        // console.warn(`[LoadManager] Attempted to getAssetData for non-ready asset: ${key}`);
        return null; // Return null if not ready
    },

    startLoading: function() {
        console.log("[LoadManager] Start Loading All Assets...");
        if (!loader || !loader.dracoLoader) {
             console.error("[LoadManager] Critical Loader Missing (GLTF or Draco)!");
             this.trigger('error',{m:'GFX/Draco Loader Fail'});
             if (stateMachine) stateMachine.transitionTo('loading', {message: 'FATAL: Graphics Loader Failed!', error: true});
             return;
         }
        console.log("[LoadManager] Verified GLTF & DracoLoader available.");
        let assetsToLoadCount = 0;
        for (const key in this.assets) { if (this.assets[key].state === 'pending') { assetsToLoadCount++; this.loadAsset(key); } }
        if (assetsToLoadCount === 0) { console.log("[LoadManager] No pending assets found."); this.checkCompletion(); }
    },

    loadAsset: function(key) {
        const asset = this.assets[key]; if (!asset || asset.state !== 'pending') return;
        asset.state = 'loading'; console.log(`[LoadManager] Loading ${key} from ${asset.path}...`);
        const manager = this; const startTime = Date.now();
        const onProg = (xhr) => { if(xhr.lengthComputable) manager.trigger('progress',{key:key,progress:Math.round(xhr.loaded/xhr.total*100)}); };
        const onSuccess = (ldAsset) => { console.log(`[LoadManager] Net OK ${key} in ${Date.now()-startTime}ms.`); manager._assetLoadedCallback(key, true, ldAsset); };
        const onError = (err) => { console.error(`[LoadManager] !!! FAILED ${key}. Path: ${asset.path}`, err); manager._assetLoadedCallback(key, false, err); };

        if (asset.type === 'audio') {
            try {
                const audio = new Audio();
                const audioLoaded = () => { console.log(`[LoadManager] Audio 'canplaythrough' for ${key}`); cleanupAudioListeners(); onSuccess(audio); };
                const audioError = (e) => { console.error(`[LoadManager] Audio 'error' for ${key}`, e); cleanupAudioListeners(); onError(e); };
                const cleanupAudioListeners = () => { audio.removeEventListener('canplaythrough', audioLoaded); audio.removeEventListener('error', audioError); };
                audio.addEventListener('canplaythrough', audioLoaded); audio.addEventListener('error', audioError);
                audio.src = asset.path; audio.preload = 'auto'; audio.load();
            } catch (e) { console.error(`[LoadManager] Error creating/loading Audio for ${key}`, e); onError(e); }
        } else { // Assume GLTF
            if (!loader) { onError("GLTF Loader missing"); return; }
            loader.load(asset.path, onSuccess, onProg, onError);
        }
    },

    _assetLoadedCallback: function(assetKey, success, loadedAssetOrError) {
        const assetEntry = this.assets[assetKey]; if (!assetEntry) return;
        assetEntry.state = success ? 'loaded' : 'error';
        assetEntry.data = 'error'; // Default
        console.log(`[LoadManager] Callback ${assetKey}: success=${success}. State: ${assetEntry.state}`);
        try {
            if (success) {
                if (assetKey === 'gunshotSound') {
                    if (loadedAssetOrError instanceof Audio) { assetEntry.data = loadedAssetOrError; }
                    else { console.error(`[LM] !!! ${assetKey} success but NOT Audio!`); assetEntry.state = 'error'; }
                } else { // GLTF
                    const sceneObject = loadedAssetOrError?.scene;
                    if (sceneObject && sceneObject instanceof THREE.Object3D) {
                        assetEntry.data = sceneObject;
                        if (assetKey === 'map' && scene) scene.add(assetEntry.data);
                        else if (assetKey === 'playerModel') { // Only playerModel now needs traversal
                            assetEntry.data.traverse(c => { if (c.isMesh) { c.castShadow=true; c.receiveShadow=true; } });
                        }
                    } else { console.error(`[LM] !!! GLTF ${assetKey} success but scene invalid!`); assetEntry.state = 'error'; }
                }
            } else { assetEntry.state = 'error'; } // Error reported by loader
        } catch (e) { console.error(`[LM] !!! Error proc ${assetKey}:`, e); assetEntry.state = 'error'; }
        finally {
            const finalData = assetEntry.data; const dataType = finalData==='error'?"'error'":(finalData?`[${finalData.constructor?.name||typeof finalData}]`:String(finalData));
            console.log(`[LoadManager] Final stored data for ${assetKey}: ${dataType}`);
        }
        this.trigger('assetLoaded', { key: assetKey, success: assetEntry.state === 'loaded' });
        this.checkCompletion();
    }, // End _assetLoadedCallback

    checkCompletion: function() {
        let allRequiredDone = true; let anyError = false;
        for (const key of this.requiredForGame) { // Now only checks map, playerModel, gunshotSound
            const assetInfo = this.assets[key]; if (!assetInfo) { anyError = true; continue; }
            const assetState = assetInfo.state;
            if (assetState === 'pending' || assetState === 'loading') { allRequiredDone = false; break; }
            if (!this.isAssetReady(key)) { // Checks state AND data validity
                anyError = true;
                 console.warn(`[LoadManager] checkCompletion: Problem detected for asset '${key}'. State: ${assetState}.`);
            }
        }
        if (!allRequiredDone) return; // Still loading...
        console.log(`[LoadManager] FINAL checkCompletion: allDone=${allRequiredDone}, anyError=${anyError}`);
        if (anyError) { this.trigger('error', { m: 'Required assets failed.' }); }
        else { this.trigger('ready'); }
    }, // End checkCompletion

    on: function(evName, cb) { if(!this.eventListeners[evName])this.eventListeners[evName]=[]; this.eventListeners[evName].push(cb); },
    trigger: function(evName, data={}) { if(this.eventListeners[evName]){ this.eventListeners[evName].forEach(cb=>{try{cb(data);}catch(e){console.error(`Listener Error ${evName}:`,e)}});} }
};
window.loadManager = loadManager;
console.log("loadManager.js loaded");

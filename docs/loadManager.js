// docs/loadManager.js

const loadManager = {
    assets: {
        map: { state: 'pending', path: CONFIG.MAP_PATH, data: null },
        playerModel: { state: 'pending', path: CONFIG.PLAYER_MODEL_PATH, data: null },
        // gunshotSound: { state: 'pending', path: CONFIG.SOUND_PATH_GUNSHOT, type: 'audio', data: null }, // REMOVED asset entry
    },
    loaders: {}, // GLTF Loader initialized in game.js
    requiredForGame: ['map', 'playerModel'], // REMOVED gunshotSound
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

        // *** ADDED LOGGING FOR PATH ***
        const assetPath = asset.path; // Get path from the asset config entry
        console.log(`[LoadManager] loadAsset('${key}') called. Path from config: ${assetPath}`);
        if (typeof assetPath !== 'string' || !assetPath) {
             console.error(`[LoadManager] Invalid or undefined path for asset: ${key}`);
             this._assetLoadedCallback(key, false, "Invalid path provided"); // Trigger error immediately
             return;
        }

        asset.state = 'loading'; console.log(`[LoadManager] Loading ${key} from ${assetPath}...`);
        const manager = this; const startTime = Date.now();
        const onProg = (xhr) => { if(xhr.lengthComputable) manager.trigger('progress',{key:key,progress:Math.round(xhr.loaded/xhr.total*100)}); };
        const onSuccess = (ldAsset) => { console.log(`[LoadManager] Net OK ${key} in ${Date.now()-startTime}ms.`); manager._assetLoadedCallback(key, true, ldAsset); };
        const onError = (err) => { console.error(`[LoadManager] !!! FAILED ${key}. Path: ${assetPath}`, err); manager._assetLoadedCallback(key, false, err); };

        // --- REMOVED AUDIO LOADING LOGIC ---
        // if (asset.type === 'audio') { ... }

        // Assume GLTF
        if (!loader) { onError("GLTF Loader missing"); return; }
        loader.load(assetPath, onSuccess, onProg, onError); // Use validated path

    },

    _assetLoadedCallback: function(assetKey, success, loadedAssetOrError) {
        const assetEntry = this.assets[assetKey]; if (!assetEntry) return;
        assetEntry.state = success ? 'loaded' : 'error';
        assetEntry.data = 'error'; // Default
        console.log(`[LoadManager] Callback ${assetKey}: success=${success}. State: ${assetEntry.state}`);
        try {
            if (success) {
                // --- REMOVED gunshotSound case ---
                // if (assetKey === 'gunshotSound') { ... }

                // GLTF Processing remains
                const sceneObject = loadedAssetOrError?.scene;
                if (sceneObject && sceneObject instanceof THREE.Object3D) {
                    assetEntry.data = sceneObject; // Store in internal data structure

                    // *** Assign global mapMesh ***
                    if (assetKey === 'map') {
                        window.mapMesh = sceneObject; // Assign to global mapMesh
                        console.log("[LoadManager] Assigned map data to global 'mapMesh'.");
                        if (scene) scene.add(window.mapMesh); // Add global mapMesh to scene
                    }
                    // *** END GLOBAL ASSIGNMENT ***
                    else if (assetKey === 'playerModel') {
                        // playerModel stored internally, set shadows
                        assetEntry.data.traverse(c => { if (c.isMesh) { c.castShadow=true; c.receiveShadow=true; } });
                    }
                } else { console.error(`[LM] !!! GLTF ${assetKey} success but scene invalid!`); assetEntry.state = 'error'; }

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
        let allDone=!0, anyErr=!1;
        for (const key of this.requiredForGame) { // Now only checks map, playerModel
            const assetInfo = this.assets[key]; if (!assetInfo) { anyErr=!0; continue; }
            const assetState = assetInfo.state;
            if (assetState==='pending'||assetState==='loading') { allDone=!1; break; }
            if (!this.isAssetReady(key)) { // Checks state AND internal data
                anyErr = true; console.warn(`[LM] checkCompletion: Problem asset '${key}'. State: ${assetState}.`);
            }
            // Explicitly check global mapMesh again for safety
            if (key === 'map' && (!window.mapMesh || window.mapMesh === 'error')) {
                 anyErr = true; console.error(`[LM] checkCompletion: map state '${assetState}' but global invalid!`);
            }
        }
        if (!allDone) return;
        console.log(`[LM] FINAL checkCompletion: allDone=${allDone}, anyError=${anyErr}`);
        if (anyErr) { this.trigger('error', { m: 'Required assets failed.' }); }
        else { this.trigger('ready'); }
    }, // End checkCompletion

    on: function(evName, cb) { if(!this.eventListeners[evName])this.eventListeners[evName]=[]; this.eventListeners[evName].push(cb); },
    trigger: function(evName, data={}) { if(this.eventListeners[evName]){ this.eventListeners[evName].forEach(cb=>{try{cb(data);}catch(e){console.error(`Listener Error ${evName}:`,e)}});} }
};
window.loadManager = loadManager;
console.log("loadManager.js loaded");

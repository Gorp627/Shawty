// docs/loadManager.js

const loadManager = {
    assets: {
        map: { state: 'pending', path: CONFIG.MAP_PATH, data: null },
        playerModel: { state: 'pending', path: CONFIG.PLAYER_MODEL_PATH, data: null },
    },
    loaders: {}, // GLTF Loader initialized in game.js
    requiredForGame: ['map', 'playerModel'],
    eventListeners: {'ready': [], 'error': [], 'progress': [], 'assetLoaded': []},

    // Helper to check if an asset is fully loaded and processed
    isAssetReady: function(key) {
        const asset = this.assets[key];
        if (!asset) return false; // Asset not defined in config
        const isLoadedState = asset.state === 'loaded';
        // Check if data exists and is not explicitly the string 'error'
        const hasValidData = asset.data !== null && asset.data !== undefined && asset.data !== 'error';
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
        if (typeof THREE === 'undefined' || !THREE.GLTFLoader || !THREE.DRACOLoader) {
             console.error("[LoadManager] Critical THREE component missing (THREE, GLTF or Draco)!");
             this.trigger('error',{m:'THREE Lib Load Fail'});
             if (stateMachine) stateMachine.transitionTo('loading', {message: 'FATAL: Graphics Library Failed!', error: true});
             return;
         }
        // Ensure global loader/dracoLoader are ready (should be init'd by game.js)
        if (!loader || !dracoLoader) {
             console.error("[LoadManager] Critical Loader Missing (GLTF or Draco refs)!");
             this.trigger('error',{m:'GFX/Draco Loader Ref Fail'});
             if (stateMachine) stateMachine.transitionTo('loading', {message: 'FATAL: Graphics Loader Ref Failed!', error: true});
             return;
         }
        console.log("[LoadManager] Verified GLTF & DracoLoader available.");

        let assetsToLoadCount = 0;
        for (const key in this.assets) { if (this.assets[key].state === 'pending') { assetsToLoadCount++; this.loadAsset(key); } }
        if (assetsToLoadCount === 0) { console.log("[LoadManager] No pending assets found."); this.checkCompletion(); }
    },

    loadAsset: function(key) {
        const asset = this.assets[key]; if (!asset || asset.state !== 'pending') return;

        const assetPath = asset.path;
        console.log(`[LoadManager] loadAsset('${key}') called. Path from config: ${assetPath}`);
        if (typeof assetPath !== 'string' || !assetPath) {
             console.error(`[LoadManager] Invalid or undefined path for asset: ${key}`);
             this._assetLoadedCallback(key, false, "Invalid path provided");
             return;
        }

        asset.state = 'loading'; console.log(`[LoadManager] Loading ${key} from ${assetPath}...`);
        const manager = this; const startTime = Date.now();
        const onProg = (xhr) => { if(xhr.lengthComputable) manager.trigger('progress',{key:key,progress:Math.round(xhr.loaded/xhr.total*100)}); };
        const onSuccess = (ldAsset) => { console.log(`[LoadManager] Net OK ${key} in ${Date.now()-startTime}ms.`); manager._assetLoadedCallback(key, true, ldAsset); };
        const onError = (err) => { console.error(`[LoadManager] !!! FAILED ${key}. Path: ${assetPath}`, err); manager._assetLoadedCallback(key, false, err); };

        // Assume GLTF
        if (!loader) { onError("GLTF Loader missing"); return; }
        loader.load(assetPath, onSuccess, onProg, onError);

    },

    _assetLoadedCallback: function(assetKey, success, loadedAssetOrError) {
        const assetEntry = this.assets[assetKey]; if (!assetEntry) return;

        assetEntry.state = success ? 'loaded' : 'error';
        assetEntry.data = success ? loadedAssetOrError : 'error'; // Store raw loaded data or 'error'

        console.log(`[LoadManager] Callback ${assetKey}: success=${success}. State: ${assetEntry.state}`);

        try {
            if (success) {
                const gltfScene = loadedAssetOrError?.scene; // Check specifically for GLTF structure

                if (gltfScene && gltfScene instanceof THREE.Object3D) {
                     // Store the main scene object
                    assetEntry.data = gltfScene; // Overwrite raw GLTF with just the scene object

                    // *** Handle specific assets ***
                    if (assetKey === 'map') {
                        window.mapMesh = gltfScene; // Assign to global mapMesh
                        console.log("[LoadManager] Assigned map data to global 'mapMesh'.");
                        if (scene) {
                            scene.add(window.mapMesh); // Add global mapMesh to scene
                            console.log("[LoadManager] Added mapMesh to the scene.");
                            window.mapMesh.traverse(child => {
                                if (child.isMesh) { child.receiveShadow = true; }
                            });
                        } else { console.error("[LoadManager] Scene not available when map loaded!"); }
                    }
                    else if (assetKey === 'playerModel') {
                        assetEntry.data.traverse(c => { if (c.isMesh) { c.castShadow=true; c.receiveShadow=true; } });
                        console.log("[LoadManager] Processed playerModel for shadows.");
                    }
                     // --- Asset successfully processed ---

                } else {
                    // Loaded asset wasn't a valid GLTF with a scene object
                    console.error(`[LM] !!! Asset ${assetKey} loaded but structure invalid!`, loadedAssetOrError);
                    assetEntry.state = 'error';
                    assetEntry.data = 'error'; // Ensure data reflects the error
                }

            } else {
                // Error reported by loader or previous stage
                assetEntry.state = 'error';
                assetEntry.data = 'error'; // Ensure data reflects the error
                console.error(`[LM] Load error for ${assetKey}:`, loadedAssetOrError);
            }
        } catch (e) {
            console.error(`[LM] !!! Error processing loaded asset ${assetKey}:`, e);
            assetEntry.state = 'error';
            assetEntry.data = 'error';
        } finally {
             const finalData = assetEntry.data;
             const dataType = finalData === 'error' ? "'error'" : (finalData ? `[${finalData.constructor?.name || typeof finalData}]` : String(finalData));
             console.log(`[LoadManager] Final internal data state for ${assetKey}: ${dataType}`);
        }

        this.trigger('assetLoaded', { key: assetKey, success: assetEntry.state === 'loaded' });
        this.checkCompletion();
    }, // End _assetLoadedCallback

    checkCompletion: function() {
        let allRequiredDone = true;
        let anyError = false;

        for (const key of this.requiredForGame) {
            const assetInfo = this.assets[key];
            if (!assetInfo) {
                console.error(`[LM] Required asset key '${key}' not found in assets list!`);
                anyError = true;
                allRequiredDone = false;
                continue;
            }
            const assetState = assetInfo.state;

            if (assetState === 'pending' || assetState === 'loading') {
                allRequiredDone = false; // Still waiting for some assets
                break; // No need to check further if any are still loading
            }

            // Use isAssetReady which checks state AND internal data validity
            if (!this.isAssetReady(key)) {
                anyError = true;
                console.warn(`[LM] checkCompletion: Problem with required asset '${key}'. State: ${assetState}.`);
                // No need to set allRequiredDone = false here, because state is not pending/loading
            }
        }

        if (!allRequiredDone) {
            // console.log("[LM] checkCompletion: Still loading assets...");
            return; // Exit if still loading
        }

        // If we reach here, all assets are either 'loaded' or 'error'
        console.log(`[LM] FINAL checkCompletion: allRequiredDone=${allRequiredDone}, anyError=${anyError}`);

        if (anyError) {
            this.trigger('error', { m: 'One or more required assets failed to load or process.' });
        } else {
            // Only trigger ready if all required assets loaded successfully
            console.log("[LM] All required assets loaded successfully. Triggering 'ready'.");
            this.trigger('ready');
        }
    }, // End checkCompletion

    on: function(evName, cb) { if(!this.eventListeners[evName])this.eventListeners[evName]=[]; this.eventListeners[evName].push(cb); },
    trigger: function(evName, data={}) { if(this.eventListeners[evName]){ this.eventListeners[evName].forEach(cb=>{try{cb(data);}catch(e){console.error(`Listener Error ${evName}:`,e)}});} }
};
window.loadManager = loadManager;
console.log("loadManager.js loaded (Simplified Completion Check)");

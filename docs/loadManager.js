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
        if (!asset) return false;
        const isLoadedState = asset.state === 'loaded';
        const hasValidData = asset.data !== null && asset.data !== undefined && asset.data !== 'error';
        return isLoadedState && hasValidData;
    },

    // Helper to retrieve loaded asset data
    getAssetData: function(key) {
        if (this.isAssetReady(key)) { return this.assets[key].data; }
        return null;
    },

    startLoading: function() {
        console.log("[LoadManager] Start Loading All Assets...");
        if (typeof THREE === 'undefined' || !THREE.GLTFLoader || !THREE.DRACOLoader) {
             console.error("[LoadManager] Critical THREE component missing!");
             this.trigger('error',{m:'THREE Lib Load Fail'});
             if (stateMachine) stateMachine.transitionTo('loading', {message: 'FATAL: Graphics Library Failed!', error: true});
             return;
         }
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
        console.log(`[LoadManager] loadAsset('${key}') called. Path: ${assetPath}`);
        if (typeof assetPath !== 'string' || !assetPath) {
             console.error(`[LoadManager] Invalid path for asset: ${key}`);
             this._assetLoadedCallback(key, false, "Invalid path provided");
             return;
        }
        asset.state = 'loading'; console.log(`[LoadManager] Loading ${key} from ${assetPath}...`);
        const manager = this; const startTime = Date.now();
        const onProg = (xhr) => { if(xhr.lengthComputable) manager.trigger('progress',{key:key,progress:Math.round(xhr.loaded/xhr.total*100)}); };
        const onSuccess = (ldAsset) => { console.log(`[LoadManager] Net OK ${key} in ${Date.now()-startTime}ms.`); manager._assetLoadedCallback(key, true, ldAsset); };
        const onError = (err) => { console.error(`[LoadManager] !!! FAILED ${key}. Path: ${assetPath}`, err); manager._assetLoadedCallback(key, false, err); };
        if (!loader) { onError("GLTF Loader missing"); return; }
        loader.load(assetPath, onSuccess, onProg, onError);
    },

    _assetLoadedCallback: function(assetKey, success, loadedAssetOrError) {
        const assetEntry = this.assets[assetKey]; if (!assetEntry) return;

        // Set initial state based purely on load success/failure
        assetEntry.state = success ? 'processing' : 'error'; // Use 'processing' state temporarily
        assetEntry.data = success ? loadedAssetOrError : 'error';

        console.log(`[LoadManager] Callback ${assetKey}: success=${success}. Initial State: ${assetEntry.state}`);

        try {
            if (success && assetEntry.data !== 'error') { // Check data is not error
                const gltfScene = loadedAssetOrError?.scene;

                if (gltfScene && gltfScene instanceof THREE.Object3D) {
                    // Store the main scene object in the internal data slot
                    assetEntry.data = gltfScene;

                    // Handle specific assets - DO THIS BEFORE setting final state
                    if (assetKey === 'map') {
                        window.mapMesh = gltfScene; // Assign to global FIRST
                        console.log("[LoadManager] Assigned map data to global 'mapMesh'.");
                        if (scene) {
                            scene.add(window.mapMesh); // Add to scene
                            console.log("[LoadManager] Added mapMesh to the scene.");
                            window.mapMesh.traverse(child => { if (child.isMesh) { child.receiveShadow = true; } });
                        } else { console.error("[LoadManager] Scene not available when map loaded!"); }
                    }
                    else if (assetKey === 'playerModel') {
                        assetEntry.data.traverse(c => { if (c.isMesh) { c.castShadow=true; c.receiveShadow=true; } });
                        console.log("[LoadManager] Processed playerModel for shadows.");
                    }

                    // If all processing is successful, mark as fully loaded
                    assetEntry.state = 'loaded'; // Set final state to 'loaded' AFTER processing

                } else {
                    console.error(`[LM] !!! Asset ${assetKey} loaded but structure invalid!`, loadedAssetOrError);
                    assetEntry.state = 'error';
                    assetEntry.data = 'error';
                }
            } else {
                // Error from loader, state is already 'error'
                assetEntry.state = 'error'; // Ensure state is error
                assetEntry.data = 'error';
                console.error(`[LM] Load error for ${assetKey}:`, loadedAssetOrError);
            }
        } catch (e) {
            console.error(`[LM] !!! Error processing loaded asset ${assetKey}:`, e);
            assetEntry.state = 'error';
            assetEntry.data = 'error';
        } finally {
             // Log final state AFTER processing attempt
             const finalData = assetEntry.data;
             const dataType = finalData === 'error' ? "'error'" : (finalData ? `[${finalData.constructor?.name || typeof finalData}]` : String(finalData));
             console.log(`[LoadManager] Final internal state for ${assetKey}: ${assetEntry.state}, Data: ${dataType}`);
        }

        // Trigger assetLoaded event (useful for progress tracking)
        this.trigger('assetLoaded', { key: assetKey, success: assetEntry.state === 'loaded' });

        // Check overall completion AFTER this asset's callback is fully done
        this.checkCompletion(); // <<< MOVED TO END

    }, // End _assetLoadedCallback

    checkCompletion: function() {
        let allRequiredDone = true;
        let anyError = false;

        for (const key of this.requiredForGame) {
            const assetInfo = this.assets[key];
            if (!assetInfo) {
                console.error(`[LM] Required asset key '${key}' not found!`);
                anyError = true; allRequiredDone = false; continue;
            }
            const assetState = assetInfo.state;

            // Check if any required asset is still pending, loading, or processing
            if (assetState === 'pending' || assetState === 'loading' || assetState === 'processing') {
                allRequiredDone = false; break; // Still waiting
            }

            // If an asset finished but resulted in error
            if (assetState === 'error') {
                 anyError = true;
                 console.warn(`[LM] checkCompletion: Required asset '${key}' finished with error.`);
            }
            // If asset state is 'loaded', double-check internal data just in case
            else if (assetState === 'loaded' && !this.isAssetReady(key)) {
                 anyError = true;
                 console.warn(`[LM] checkCompletion: Asset '${key}' state is 'loaded' but internal data seems invalid!`);
            }
        }

        if (!allRequiredDone) return; // Exit if still working

        // All required assets are either 'loaded' or 'error'
        console.log(`[LM] FINAL checkCompletion: allRequiredDone=${allRequiredDone}, anyError=${anyError}`);

        if (anyError) {
            this.trigger('error', { m: 'One or more required assets failed.' });
        } else {
            console.log("[LM] All required assets loaded. Triggering 'ready'.");
            this.trigger('ready');
        }
    }, // End checkCompletion

    on: function(evName, cb) { if(!this.eventListeners[evName])this.eventListeners[evName]=[]; this.eventListeners[evName].push(cb); },
    trigger: function(evName, data={}) { if(this.eventListeners[evName]){ this.eventListeners[evName].forEach(cb=>{try{cb(data);}catch(e){console.error(`Listener Error ${evName}:`,e)}});} }
};
window.loadManager = loadManager;
console.log("loadManager.js loaded (Completion Check Position Fixed)");

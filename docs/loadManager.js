// docs/loadManager.js (For Manual Physics System)

const loadManager = {
    assets: {
        map: { state: 'pending', path: CONFIG.MAP_PATH, data: null },
        playerModel: { state: 'pending', path: CONFIG.PLAYER_MODEL_PATH, data: null },
        // Add other assets here if needed (sounds, textures, etc.)
    },
    loaders: {}, // GLTF Loader initialized in game.js
    requiredForGame: ['map', 'playerModel'], // Assets needed before 'ready' event
    eventListeners: {'ready': [], 'error': [], 'progress': [], 'assetLoaded': []},

    // Helper to check if an asset is fully loaded and processed correctly
    isAssetReady: function(key) {
        const asset = this.assets[key];
        if (!asset) return false; // Asset not defined
        const isLoadedState = asset.state === 'loaded';
        // Check if data exists and is not explicitly the string 'error'
        const hasValidData = asset.data !== null && asset.data !== undefined && asset.data !== 'error';
        return isLoadedState && hasValidData;
    },

    // Helper to retrieve loaded asset data
    getAssetData: function(key) {
        if (this.isAssetReady(key)) { return this.assets[key].data; }
        // console.warn(`[LoadManager] Attempted getAssetData for non-ready asset: ${key}`);
        return null; // Return null if not ready or failed
    },

    startLoading: function() {
        console.log("[LoadManager] Start Loading All Assets...");
        // Basic checks for Three.js core components needed by the loader
        if (typeof THREE === 'undefined' || !THREE.GLTFLoader || !THREE.DRACOLoader) {
             console.error("[LoadManager] Critical THREE component missing (THREE, GLTF or Draco)!");
             this.trigger('error',{m:'THREE Lib Load Fail'});
             if (typeof stateMachine !== 'undefined') stateMachine.transitionTo('loading', {message: 'FATAL: Graphics Library Failed!', error: true});
             return;
         }
        // Ensure global loader/dracoLoader references are ready (these are assigned in game.js)
        if (typeof loader === 'undefined' || !loader || typeof dracoLoader === 'undefined' || !dracoLoader) {
             console.error("[LoadManager] Critical Loader Missing (GLTF or Draco refs)!");
             this.trigger('error',{m:'GFX/Draco Loader Ref Fail'});
             if (typeof stateMachine !== 'undefined') stateMachine.transitionTo('loading', {message: 'FATAL: Graphics Loader Ref Failed!', error: true});
             return;
         }
        console.log("[LoadManager] Verified GLTF & DracoLoader available.");

        let assetsToLoadCount = 0;
        for (const key in this.assets) { if (this.assets[key].state === 'pending') { assetsToLoadCount++; this.loadAsset(key); } }
        if (assetsToLoadCount === 0) { console.log("[LoadManager] No pending assets found."); this.checkCompletion(); } // Check immediately if nothing to load
    },

    loadAsset: function(key) {
        const asset = this.assets[key]; if (!asset || asset.state !== 'pending') return;

        const assetPath = asset.path;
        console.log(`[LoadManager] loadAsset('${key}') called. Path: ${assetPath}`);
        if (typeof assetPath !== 'string' || !assetPath) {
             console.error(`[LoadManager] Invalid or undefined path for asset: ${key}`);
             this._assetLoadedCallback(key, false, "Invalid path provided"); // Trigger error callback
             return;
        }

        asset.state = 'loading'; console.log(`[LoadManager] Loading ${key} from ${assetPath}...`);
        const manager = this; const startTime = Date.now();
        // Progress, Success, Error callbacks for the loader
        const onProg = (xhr) => { if(xhr.lengthComputable) manager.trigger('progress',{key:key,progress:Math.round(xhr.loaded/xhr.total*100)}); };
        const onSuccess = (ldAsset) => { console.log(`[LoadManager] Net OK ${key} in ${Date.now()-startTime}ms.`); manager._assetLoadedCallback(key, true, ldAsset); };
        const onError = (err) => { console.error(`[LoadManager] !!! FAILED ${key}. Path: ${assetPath}`, err); manager._assetLoadedCallback(key, false, err); };

        // Assume GLTF loading
        if (!loader) { onError("GLTF Loader global reference missing"); return; }
        loader.load(assetPath, onSuccess, onProg, onError); // Start loading
    },

    _assetLoadedCallback: function(assetKey, success, loadedAssetOrError) {
        const assetEntry = this.assets[assetKey]; if (!assetEntry) return;

        // Set initial state based purely on load success/failure
        assetEntry.state = success ? 'processing' : 'error'; // Intermediate state
        assetEntry.data = success ? loadedAssetOrError : 'error'; // Store raw loaded data or 'error' string

        console.log(`[LM] Callback ${assetKey}: success=${success}. Initial State: ${assetEntry.state}`);

        try {
            if (success && assetEntry.data !== 'error') { // Check data is not the error string
                const gltfScene = loadedAssetOrError?.scene; // Check specifically for GLTF structure

                if (gltfScene && gltfScene instanceof THREE.Object3D) {
                     // Store the main scene object from the GLTF
                    assetEntry.data = gltfScene; // Overwrite raw GLTF with just the scene object

                    // Handle specific assets AFTER successful load and validation
                    if (assetKey === 'map') {
                        window.mapMesh = gltfScene; // Assign to global mapMesh variable
                        console.log("[LM] Assigned map data to global 'mapMesh'.");
                        // Scene addition is handled by game.js 'ready' handler now
                        gltfScene.traverse(child => { if (child.isMesh) { child.receiveShadow = true; } }); // Set shadows etc.
                    }
                    else if (assetKey === 'playerModel') {
                        assetEntry.data.traverse(c => { if (c.isMesh) { c.castShadow=true; c.receiveShadow=true; } });
                        console.log("[LM] Processed playerModel shadows.");
                    }
                    // --- Asset successfully processed ---
                    assetEntry.state = 'loaded'; // Set final state to 'loaded' AFTER processing

                } else {
                    // Loaded asset wasn't a valid GLTF with a scene object
                    console.error(`[LM] Asset ${assetKey} loaded but structure invalid!`, loadedAssetOrError);
                    assetEntry.state = 'error'; assetEntry.data = 'error';
                }
            } else { // Error reported by loader or previous stage
                assetEntry.state = 'error'; assetEntry.data = 'error'; console.error(`[LM] Load error for ${assetKey}:`, loadedAssetOrError);
            }
        } catch (e) { // Catch errors during processing (e.g., traversing)
            console.error(`[LM] Error processing loaded asset ${assetKey}:`, e);
            assetEntry.state = 'error'; assetEntry.data = 'error';
        } finally {
             // Log final state AFTER processing attempt
             const finalData = assetEntry.data; const dataType = finalData==='error'?"'error'":(finalData?`[${finalData.constructor?.name||typeof finalData}]`:String(finalData));
             console.log(`[LM] Final state ${assetKey}: ${assetEntry.state}, Data: ${dataType}`);
        }

        // Trigger assetLoaded event regardless of success/fail
        this.trigger('assetLoaded', { key: assetKey, success: assetEntry.state === 'loaded' });

        // Check overall completion AFTER this asset's callback is fully done
        this.checkCompletion();
    }, // End _assetLoadedCallback

    checkCompletion: function() {
        let allRequiredDone = true;
        let anyError = false;

        for (const key of this.requiredForGame) {
            const assetInfo = this.assets[key];
            if (!assetInfo) { console.error(`[LM] Required asset key '${key}' missing!`); anyError = true; allRequiredDone = false; continue; }
            const assetState = assetInfo.state;

            // Check if any required asset is still loading/processing
            if (assetState === 'pending' || assetState === 'loading' || assetState === 'processing') {
                allRequiredDone = false; break; // Still working
            }
            // Check if any required asset finished with an error or invalid data
            if (!this.isAssetReady(key)) { // Checks state is 'loaded' AND data is valid
                anyError = true; console.warn(`[LM] Required asset '${key}' problem. State: ${assetState}.`);
            }
        }

        if (!allRequiredDone) return; // Exit if still loading/processing

        // All required assets are either 'loaded' or 'error'
        console.log(`[LM] FINAL checkCompletion: allRequiredDone=${allRequiredDone}, anyError=${anyError}`);
        if (anyError) { this.trigger('error', { m: 'One or more required assets failed.' }); }
        else { console.log("[LM] All required assets loaded. Triggering 'ready'."); this.trigger('ready'); } // Trigger ready only if NO errors
    }, // End checkCompletion

    // Basic event emitter pattern
    on: function(evName, cb) { if(!this.eventListeners[evName])this.eventListeners[evName]=[]; this.eventListeners[evName].push(cb); },
    trigger: function(evName, data={}) { if(this.eventListeners[evName]){ this.eventListeners[evName].forEach(cb=>{try{cb(data);}catch(e){console.error(`Listener Error ${evName}:`,e)}});} }
};
window.loadManager = loadManager;
console.log("loadManager.js loaded (Manual Physics Setup)");

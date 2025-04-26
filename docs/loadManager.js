// docs/loadManager.js

const loadManager = {
    assets: {
        // Added 'data' field to store the loaded asset
        map: { state: 'pending', path: CONFIG.MAP_PATH, data: null },
        playerModel: { state: 'pending', path: CONFIG.PLAYER_MODEL_PATH, data: null },
        // gunModel: { state: 'pending', path: CONFIG.GUN_MODEL_PATH, data: null }, // REMOVED
        gunshotSound: { state: 'pending', path: CONFIG.SOUND_PATH_GUNSHOT, type: 'audio', data: null }, // Keep for potential future use or other sounds
    },
    loaders: {}, // GLTF Loader initialized in game.js
    requiredForGame: ['map', 'playerModel', /* 'gunshotSound' // Optional now */ ], // Gunshot sound not strictly required if not shooting
    eventListeners: {'ready': [], 'error': [], 'progress': [], 'assetLoaded': []},

    // Helper to check if an asset is fully loaded and processed
    isAssetReady: function(key) {
        const asset = this.assets[key];
        if (!asset) return false; // Asset not defined in config
        const isLoadedState = asset.state === 'loaded';
        const hasValidData = !!(asset.data && asset.data !== 'error');
        // Detailed logging for debugging discrepancies
        // if (isLoaded && !globalReady) {
        //     console.warn(`[LoadManager] isAssetReady Discrepancy: Asset '${key}' state is loaded, but global var is not ready (value: ${globalVar}).`);
        // } else if (!isLoaded && globalReady) {
        //      console.warn(`[LoadManager] isAssetReady Discrepancy: Asset '${key}' state is ${asset.state}, but global var IS ready.`);
        // }
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
        // Ensure the global loader and its draco sub-loader are available
        if (!loader || !loader.dracoLoader) {
             console.error("[LoadManager] Critical Loader Missing (GLTF or Draco)! Check game.js initialization.");
             this.trigger('error',{m:'GFX/Draco Loader Fail'});
             if (typeof stateMachine !== 'undefined') {
                stateMachine.transitionTo('loading', {message: 'FATAL: Graphics/Draco Loader Failed!', error: true});
             }
             return; // Stop loading
         }
        console.log("[LoadManager] Verified GLTF & DracoLoader available.");

        let assetsToLoadCount = 0;
        for (const key in this.assets) {
            // Only load assets that are currently 'pending'
            if (this.assets[key].state === 'pending') {
                assetsToLoadCount++;
                this.loadAsset(key);
            }
        }

        if (assetsToLoadCount === 0) {
            console.log("[LoadManager] No pending assets found on startLoading. Checking completion immediately.");
            // This case might happen on a reload where assets are cached but state is reset
            this.checkCompletion();
        }
    },

    loadAsset: function(key) {
        const asset = this.assets[key];
        if (!asset || asset.state !== 'pending') return; // Don't load if not pending

        asset.state = 'loading'; // Mark as loading
        console.log(`[LoadManager] Loading ${key} from ${asset.path}...`);
        const manager = this;
        const loadStartTime = Date.now();

        // Progress handler
        const onProg = function(xhr){
            if(xhr.lengthComputable) {
                manager.trigger('progress', {key:key, progress:Math.round(xhr.loaded/xhr.total*100)});
            }
        };
        // Success handler (passes the raw loaded asset)
        const onSuccess = function(loadedAsset){
             const loadTime = Date.now() - loadStartTime;
             console.log(`[LoadManager] Successfully loaded network request for ${key} in ${loadTime}ms.`);
             // Pass to the internal callback for processing and assignment
             manager._assetLoadedCallback(key, true, loadedAsset);
        };
        // Error handler
        const onError = function(err){
             console.error(`[LoadManager] !!! Loading FAILED for ${key}. Path: ${asset.path}`);
             // Log the specific error object provided by the loader/browser
             console.error(`[LoadManager] >>> Error details for ${key}:`, err);
             // Pass error to internal callback
             manager._assetLoadedCallback(key, false, err);
        };


        // --- Asset Type Specific Loading ---
        if (asset.type === 'audio') {
            try {
                const audio = new Audio(); // Create audio element
                // console.log(`[LoadManager] Created Audio object for ${key}`); // Less verbose

                // Define event handlers scoped to this load attempt
                const audioLoaded = () => {
                    console.log(`[LoadManager] Audio event 'canplaythrough' triggered for ${key}`);
                    cleanupAudioListeners(); // Remove listeners
                    onSuccess(audio); // Call general success handler with the audio object
                };
                const audioError = (e) => {
                     console.error(`[LoadManager] Audio event 'error' triggered for ${key}`, e);
                     cleanupAudioListeners(); // Remove listeners
                     onError(e); // Call general error handler with the error event
                };
                const cleanupAudioListeners = () => {
                    audio.removeEventListener('canplaythrough', audioLoaded);
                    audio.removeEventListener('error', audioError);
                    // console.log(`[LoadManager] Cleaned up audio listeners for ${key}`);
                };

                // Attach listeners before setting src
                audio.addEventListener('canplaythrough', audioLoaded);
                audio.addEventListener('error', audioError);

                audio.src = asset.path; // Set the source path
                audio.preload = 'auto'; // Hint to browser
                // console.log(`[LoadManager] Set src for ${key} to ${asset.path}. Calling load()...`); // Less verbose
                audio.load(); // Explicitly call load to start fetching
                // console.log(`[LoadManager] audio.load() called for ${key}. Waiting for events...`); // Less verbose

            } catch (e) {
                 console.error(`[LoadManager] Error creating/loading Audio for ${key}`, e);
                 onError(e); // Catch synchronous errors during Audio object creation/setup
            }
        } else { // Assume GLTF/GLB
            if (!loader) { // Double check loader exists here
                 onError("GLTF Loader missing at load time");
                 return;
            }
            // console.log(`[LoadManager] Calling GLTFLoader.load for ${key}`); // Less verbose
            // Use the global GLTFLoader instance initialized in game.js
            loader.load(asset.path, onSuccess, onProg, onError);
        }
    },

    // MODIFIED _assetLoadedCallback
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
                        assetEntry.data = sceneObject; // Store in internal data structure

                        // *** RE-ADDED GLOBAL ASSIGNMENT for mapMesh ***
                        if (assetKey === 'map') {
                            window.mapMesh = sceneObject; // Assign to global mapMesh
                            console.log("[LoadManager] Assigned map data to global 'mapMesh'.");
                            if (scene) scene.add(window.mapMesh); // Add global mapMesh to scene
                        }
                        // *** END RE-ADDED GLOBAL ***
                        else if (assetKey === 'playerModel') {
                            // playerModel is still only stored internally via assetEntry.data
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
        for (const key of this.requiredForGame) { // Checks map, playerModel now
            const assetInfo = this.assets[key]; if (!assetInfo) { anyError = true; continue; }
            const assetState = assetInfo.state;
            if (assetState === 'pending' || assetState === 'loading') { allRequiredDone = false; break; }
            // Use isAssetReady (which checks state AND internal data)
            if (!this.isAssetReady(key)) {
                anyError = true;
                 console.warn(`[LoadManager] checkCompletion: Problem detected for asset '${key}'. State: ${assetState}.`);
            }
            // *** ADDED CHECK for global mapMesh specifically ***
            if (key === 'map' && (typeof window.mapMesh === 'undefined' || !window.mapMesh || window.mapMesh === 'error')) {
                 anyError = true;
                 console.error(`[LoadManager] checkCompletion: map asset state is '${assetState}' but global mapMesh is invalid!`);
            }
        }
        if (!allRequiredDone) return;
        console.log(`[LoadManager] FINAL checkCompletion: allDone=${allRequiredDone}, anyError=${anyError}`);
        if (anyError) { this.trigger('error', { m: 'Required assets failed.' }); }
        else { this.trigger('ready'); }
    }, // End checkCompletion

    on: function(evName, cb) { if(!this.eventListeners[evName])this.eventListeners[evName]=[]; this.eventListeners[evName].push(cb); },
    trigger: function(evName, data={}) { if(this.eventListeners[evName]){ this.eventListeners[evName].forEach(cb=>{try{cb(data);}catch(e){console.error(`Listener Error ${evName}:`,e)}});} }
};
window.loadManager = loadManager;
console.log("loadManager.js loaded");

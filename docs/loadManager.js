// docs/loadManager.js (REGENERATED v2)

const loadManager = {
    assets: {
        map: { state: 'pending', path: CONFIG?.MAP_PATH, data: null, type: 'gltf' },
        playerModel: { state: 'pending', path: CONFIG?.PLAYER_MODEL_PATH, data: null, type: 'gltf' },
        // Add other assets here (e.g., textures, sounds)
        // Example: rifleTexture: { state: 'pending', path: 'assets/textures/rifle.png', data: null, type: 'texture' },
    },
    loaders: { // Instantiated loaders will be populated
        gltf: null, // Assigned from global 'loader' in startLoading
        texture: null, // Instantiated in startLoading if needed
        // audio: null, // Example for audio loader
    },
    requiredForGame: ['map', 'playerModel'], // Assets essential before 'ready' event
    eventListeners: {'ready': [], 'error': [], 'progress': [], 'assetLoaded': []},

    // Helper to check if an asset is fully loaded and processed correctly
    isAssetReady: function(key) {
        const asset = this.assets[key];
        if (!asset) return false; // Asset not defined
        const isLoadedState = asset.state === 'loaded';
        // Check if data exists and is not explicitly the error marker
        const hasValidData = asset.data !== null && asset.data !== undefined && asset.data !== 'error';
        return isLoadedState && hasValidData;
    },

    // Helper to retrieve loaded asset data
    getAssetData: function(key) {
        if (this.isAssetReady(key)) {
            return this.assets[key].data;
        }
        // console.warn(`[LoadManager] Attempted getAssetData for non-ready/failed asset: ${key}`);
        return null; // Return null if not ready or failed
    },

    startLoading: function() {
        console.log("[LoadManager] Start Loading All Assets...");

        // --- Prerequisite Checks ---
        if (typeof THREE === 'undefined') {
             console.error("[LoadManager] CRITICAL: THREE object is undefined!");
             this.trigger('error',{message:'THREE library not loaded!'});
             if (typeof stateMachine !== 'undefined') stateMachine.transitionTo('loading', {message: 'FATAL: Graphics Library Failed!', error: true});
             return;
        }
        // Ensure global loaders (initialized in game.js) are ready
        if (typeof window.loader === 'undefined' || !window.loader || !(window.loader instanceof THREE.GLTFLoader) ||
            typeof window.dracoLoader === 'undefined' || !window.dracoLoader || !(window.dracoLoader instanceof THREE.DRACOLoader)) {
             console.error("[LoadManager] CRITICAL: Global GLTFLoader or DRACOLoader reference is missing or invalid!");
             this.trigger('error',{message:'GFX Loader Ref Missing!'});
             if (typeof stateMachine !== 'undefined') stateMachine.transitionTo('loading', {message: 'FATAL: Graphics Loader Ref Failed!', error: true});
             return;
        }
        // Assign the global GLTF loader to our internal reference
        this.loaders.gltf = window.loader; // Use the loader initialized in game.js

        // Instantiate other loaders as needed
        this.loaders.texture = new THREE.TextureLoader();
        // this.loaders.audio = new THREE.AudioLoader(); // Example

        console.log("[LoadManager] Verified Three.js and necessary Loaders available.");

        // --- Start Loading Each Pending Asset ---
        let assetsToLoadCount = 0;
        for (const key in this.assets) {
            // Use hasOwnProperty to ensure it's not from the prototype chain
            if (this.assets.hasOwnProperty(key) && this.assets[key].state === 'pending') {
                assetsToLoadCount++;
                this.loadAsset(key); // Call loadAsset for each pending item
            }
        }

        if (assetsToLoadCount === 0) {
            console.log("[LoadManager] No pending assets found to load.");
            this.checkCompletion(); // Check immediately if nothing was pending
        } else {
            console.log(`[LoadManager] Started loading process for ${assetsToLoadCount} asset(s).`);
        }
    },

    loadAsset: function(key) {
        const asset = this.assets[key];
        // Basic validation
        if (!asset || asset.state !== 'pending') {
            return; // Already loaded, loading, failed, or doesn't exist
        }

        const assetPath = asset.path;
        const assetType = asset.type?.toLowerCase();
        console.log(`[LoadManager] Requesting loadAsset('${key}'). Type: ${assetType || 'unknown'}, Path: ${assetPath}`);

        // Validate path
        if (typeof assetPath !== 'string' || !assetPath) {
             console.error(`[LoadManager] Invalid or undefined path for asset: ${key}. Path: ${assetPath}`);
             this._assetLoadedCallback(key, false, "Invalid path provided");
             return;
        }

        asset.state = 'loading'; // Mark as loading
        const manager = this;
        const startTime = Date.now();

        // --- Define Loader Callbacks ---
        const onProg = (xhr) => {
             if (xhr.lengthComputable) {
                 manager.trigger('progress', {key: key, progress: Math.round(xhr.loaded / xhr.total * 100)});
             }
             // Else: Progress is indeterminate
        };
        const onSuccess = (loadedAsset) => {
             console.log(`[LoadManager] Network load OK for ${key} in ${Date.now() - startTime}ms.`);
             // Pass to the callback for processing
             manager._assetLoadedCallback(key, true, loadedAsset);
        };
        const onError = (error) => {
             // Format a useful error message
             let errorMsg = `Failed to load asset '${key}'`;
             if (error instanceof Error) errorMsg += `: ${error.message}`;
             else if (error instanceof ProgressEvent && error.target?.status) errorMsg += ` (HTTP Error ${error.target.status})`;
             else if (typeof error === 'string') errorMsg += `: ${error}`;

             console.error(`[LoadManager] !!! FAILED to load ${key}. Path: ${assetPath}. Error:`, errorMsg, error);
             // Pass error message/object to the callback
             manager._assetLoadedCallback(key, false, errorMsg);
        };

        // --- Use Appropriate Loader Based on Asset Type ---
        switch (assetType) {
            case 'gltf':
                if (!this.loaders.gltf) { onError("GLTF Loader not available"); return; }
                this.loaders.gltf.load(assetPath, onSuccess, onProg, onError);
                break;
            case 'texture':
                 if (!this.loaders.texture) { onError("Texture Loader not available"); return; }
                 // Texture loader progress event isn't standard like XHR
                 this.loaders.texture.load(assetPath, onSuccess, undefined /* no progress */, onError);
                 break;
            // case 'audio': // Example for audio
            //     if (!this.loaders.audio) { onError("Audio Loader not available"); return; }
            //     this.loaders.audio.load(assetPath, onSuccess, onProg, onError);
            //     break;
            default:
                const unknownTypeError = `Unknown asset type: ${asset.type}`;
                console.error(`[LoadManager] ${unknownTypeError} for key '${key}'. Cannot load.`);
                onError(unknownTypeError);
        }
    },

    _assetLoadedCallback: function(assetKey, success, loadedAssetOrError) {
        const assetEntry = this.assets[assetKey];
        if (!assetEntry) {
            console.error(`[LM Callback] Asset entry for key '${assetKey}' not found! Orphan callback?`);
            return; // Should not happen
        }

        // Set initial state based purely on network load success/failure
        assetEntry.state = success ? 'processing' : 'error';
        // Store raw loaded data or the error object/message
        assetEntry.data = success ? loadedAssetOrError : (loadedAssetOrError || 'Unknown load error');

        console.log(`[LM Callback] Asset: ${assetKey}, Load Success: ${success}. State set to: '${assetEntry.state}'.`);

        // --- Process Loaded Data (if successful) ---
        try {
            if (success && assetEntry.data !== 'error') { // Double check data isn't the marker
                const assetType = assetEntry.type?.toLowerCase();
                let processedData = assetEntry.data; // Start with raw data

                // --- Type-Specific Processing/Validation ---
                if (assetType === 'gltf') {
                    const gltf = loadedAssetOrError; // Raw loaded GLTF object from loader
                    // Validate GLTF structure
                    if (!gltf?.scene || !(gltf.scene instanceof THREE.Object3D)) {
                        throw new Error("Loaded GLTF asset is invalid or lacks a 'scene' object.");
                    }
                    processedData = gltf.scene; // Extract the main scene graph
                    console.log(`[LM Process] Extracted scene from GLTF for ${assetKey}.`);

                    // Apply common settings based on asset key (map vs player model)
                    if (assetKey === 'map') {
                         // Assign to global immediately for access by game.js collider creation
                         window.mapMesh = processedData;
                         console.log("[LM Process] Assigned processed map data to global 'mapMesh'.");
                         processedData.traverse(child => {
                             if (child.isMesh) {
                                 child.receiveShadow = true; // Map surfaces receive shadows
                                 child.castShadow = true;    // Map elements can cast shadows
                             }
                         });
                    } else if (assetKey === 'playerModel') {
                         processedData.traverse(child => {
                             if (child.isMesh) {
                                 child.castShadow = true;    // Player model casts shadows
                                 child.receiveShadow = true; // Player model receives shadows
                             }
                         });
                         console.log("[LM Process] Applied shadow settings to playerModel.");
                    }
                     // Add any other specific GLTF processing here

                } else if (assetType === 'texture') {
                    // Validate texture type
                    if (!(loadedAssetOrError instanceof THREE.Texture)) {
                        throw new Error("Loaded texture asset is not a THREE.Texture instance.");
                    }
                    // Apply common texture settings if needed
                    // processedData.encoding = THREE.sRGBEncoding; // Example: Correct color space
                    // processedData.wrapS = THREE.RepeatWrapping; // Example: Tiling
                    // processedData.wrapT = THREE.RepeatWrapping;
                    console.log(`[LM Process] Validated texture for ${assetKey}.`);
                }
                // Add processing/validation for other asset types here...

                // --- Store Successfully Processed Data ---
                assetEntry.data = processedData;
                assetEntry.state = 'loaded'; // Mark as fully loaded and processed

            } else {
                // Load failed earlier, ensure state is 'error' and data is the error marker/object
                assetEntry.state = 'error';
                // Keep the error object/message stored in assetEntry.data
                console.error(`[LM Callback] Load or processing failed for ${assetKey}. Error details retained.`);
            }
        } catch (processingError) {
            // Catch errors specifically during the processing stage
            console.error(`[LM Process] Error processing loaded asset ${assetKey}:`, processingError);
            assetEntry.state = 'error';
            assetEntry.data = processingError.message || 'Processing error'; // Store error message
        } finally {
             // Log final state AFTER processing attempt
             const finalData = assetEntry.data;
             let dataType = typeof finalData;
             if (finalData instanceof Error) dataType = `Error("${finalData.message}")`;
             else if (typeof finalData === 'object' && finalData !== null) dataType = `[${finalData.constructor?.name || 'Object'}]`;
             else if (typeof finalData === 'string' && assetEntry.state === 'error') dataType = `ErrorMsg("${finalData}")`;
             else dataType = String(finalData); // Fallback

             console.log(`[LM Callback] Final state for ${assetKey}: ${assetEntry.state}, Data type: ${dataType}`);
        }

        // Trigger assetLoaded event (includes success status based on final state)
        this.trigger('assetLoaded', { key: assetKey, success: assetEntry.state === 'loaded' });

        // Check overall completion status AFTER this asset's processing is fully done
        this.checkCompletion();
    }, // End _assetLoadedCallback

    checkCompletion: function() {
        let allRequiredDone = true;
        let anyRequiredError = false;
        let stillInProgress = false;

        for (const key of this.requiredForGame) {
            const assetInfo = this.assets[key];
            // Check if the required asset is defined in our list
            if (!assetInfo) {
                console.error(`[LM Check] Required asset key '${key}' is missing from assets definition!`);
                anyRequiredError = true; // Treat missing definition as an error
                allRequiredDone = false; // Cannot be ready if definition is missing
                continue; // Check next required asset
            }

            const assetState = assetInfo.state;

            // Check if still loading or processing
            if (assetState === 'pending' || assetState === 'loading' || assetState === 'processing') {
                allRequiredDone = false; // Not all finished yet
                stillInProgress = true;
                // console.log(`[LM Check] Waiting for required asset: ${key} (State: ${assetState})`);
                break; // Exit loop early, no need to check further if one is still working
            }
            // Check if finished with an error
            if (assetState === 'error') {
                anyRequiredError = true;
                console.warn(`[LM Check] Required asset '${key}' failed to load or process.`);
                 // It's done, but with an error. Continue checking others.
            } else if (assetState !== 'loaded') {
                 // Should not happen if logic is correct (must be loaded or error if not in progress)
                 console.error(`[LM Check] Required asset '${key}' has unexpected final state: ${assetState}`);
                 anyRequiredError = true;
            }
        } // End loop through required assets

        // If any required asset is still loading/processing, exit and wait for next callback
        if (stillInProgress) return;

        // --- All required assets have finished (either loaded or error) ---
        if (allRequiredDone) { // This flag remains true only if all required assets finished (no missing definitions)
             console.log(`[LM Check] All required assets finished. Any Errors: ${anyRequiredError}`);
             if (anyRequiredError) {
                 // At least one required asset failed
                 console.error("[LM Check] Triggering global 'error' due to failed required asset(s).");
                 this.trigger('error', { message: 'One or more required assets failed to load.' });
                 // Game initialization should stop based on this error.
             } else {
                 // All required assets finished successfully!
                 console.log("[LM Check] All required assets loaded successfully. Triggering 'ready'.");
                 this.trigger('ready'); // Signal that core assets are available.
             }
        } else {
             // This case implies a required asset was missing from the definition list. Error already logged.
             console.error("[LM Check] Cannot trigger 'ready' because required asset definitions were missing.");
             this.trigger('error', { message: 'Missing required asset definitions.' });
        }
    }, // End checkCompletion

    // Basic event emitter pattern
    on: function(eventName, callback) {
        if (typeof callback !== 'function') { console.error(`[LM] Invalid callback provided for event '${eventName}'`); return; }
        if (!this.eventListeners[eventName]) this.eventListeners[eventName] = [];
        this.eventListeners[eventName].push(callback);
    },
    trigger: function(eventName, data = {}) {
        if (this.eventListeners[eventName]) {
            // console.log(`[LM Trigger] Event: ${eventName}`, data); // Optional: Log events being triggered
            // Use slice() to prevent issues if a listener modifies the array during iteration
            this.eventListeners[eventName].slice().forEach(callback => {
                try {
                    callback(data);
                } catch (e) {
                    console.error(`[LM Trigger] Error in listener for event '${eventName}':`, e);
                }
            });
        }
    }
};
window.loadManager = loadManager; // Export globally
console.log("loadManager.js loaded (REGENERATED v2)");

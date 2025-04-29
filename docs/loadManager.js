// docs/loadManager.js (REGENERATED v2 - Added Promise return, updated requirements)

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
    requiredForGame: ['map'], // <<< Only map is strictly REQUIRED before game can start physics/join // 'playerModel' removed as requirement for now
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
             return Promise.reject(new Error("THREE Missing")); // Return rejected promise
        }
        // Ensure global loaders (initialized in game.js) are ready
        // These are now initialized in game.js before calling loadManager
        if (typeof window.loader === 'undefined' || !window.loader || !(window.loader instanceof THREE.GLTFLoader) ||
            typeof window.dracoLoader === 'undefined' || !window.dracoLoader || !(window.dracoLoader instanceof THREE.DRACOLoader)) {
             console.error("[LoadManager] CRITICAL: Global GLTFLoader or DRACOLoader reference is missing or invalid! Should be set by game.js.");
             this.trigger('error',{message:'GFX Loader Ref Missing!'});
             if (typeof stateMachine !== 'undefined') stateMachine.transitionTo('loading', {message: 'FATAL: Graphics Loader Ref Failed!', error: true});
             return Promise.reject(new Error("Loaders Missing")); // Return rejected promise
        }
        // Assign the global GLTF loader to our internal reference
        this.loaders.gltf = window.loader; // Use the loader initialized in game.js

        // Instantiate other loaders as needed
        this.loaders.texture = new THREE.TextureLoader();
        // this.loaders.audio = new THREE.AudioLoader(); // Example

        console.log("[LoadManager] Verified Three.js and necessary Loaders available.");

        // --- Start Loading Each Pending Asset ---
        let assetsToLoadCount = 0;
        const loadPromises = []; // Array to hold promises for each asset load

        for (const key in this.assets) {
            // Use hasOwnProperty to ensure it's not from the prototype chain
            if (this.assets.hasOwnProperty(key) && this.assets[key].state === 'pending') {
                assetsToLoadCount++;
                loadPromises.push(this.loadAsset(key)); // Call loadAsset and store the promise
            }
        }

        if (assetsToLoadCount === 0) {
            console.log("[LoadManager] No pending assets found to load.");
            this.checkCompletion(); // Check immediately if nothing was pending
            return Promise.resolve(); // Resolve immediately
        } else {
            console.log(`[LoadManager] Started loading process for ${assetsToLoadCount} asset(s).`);
            // Return a promise that resolves when all individual asset promises resolve/reject
            // Note: checkCompletion will handle the 'ready' or 'error' event triggering
            return Promise.allSettled(loadPromises).then(() => {
                 console.log("[LoadManager] All individual asset load promises settled.");
                 // checkCompletion would have been called by the last _assetLoadedCallback
            });
        }
    },

    loadAsset: function(key) {
        // Return a promise for each asset load
        return new Promise((resolve, reject) => {
            const asset = this.assets[key];
            // Basic validation
            if (!asset || asset.state !== 'pending') {
                 // console.warn(`[LoadManager] Asset '${key}' not pending. Current state: ${asset?.state}`);
                 resolve({key: key, status: asset?.state || 'skipped'}); // Resolve indicating skipped/already processed
                 return;
            }

            const assetPath = asset.path;
            const assetType = asset.type?.toLowerCase();
            console.log(`[LoadManager] Requesting loadAsset('${key}'). Type: ${assetType || 'unknown'}, Path: ${assetPath}`);

            // Validate path
            if (typeof assetPath !== 'string' || !assetPath) {
                 console.error(`[LoadManager] Invalid or undefined path for asset: ${key}. Path: ${assetPath}`);
                 this._assetLoadedCallback(key, false, "Invalid path provided");
                 reject(new Error(`Invalid path for ${key}`)); // Reject the promise
                 return;
            }

            asset.state = 'loading'; // Mark as loading
            const manager = this;
            const startTime = Date.now();

            // --- Define Loader Callbacks ---
            const onProg = (xhr) => {
                 if (xhr.lengthComputable) {
                     const percent = Math.round(xhr.loaded / xhr.total * 100);
                     manager.trigger('progress', {key: key, progress: percent});
                     // Update loading screen message (optional)
                     if(stateMachine?.is('loading') && UIManager){
                         // UIManager.showLoading(`Loading ${key}: ${percent}%...`); // Can be spammy
                     }
                 }
                 // Else: Progress is indeterminate
            };
            const onSuccess = (loadedAsset) => {
                 console.log(`[LoadManager] Network load OK for ${key} in ${Date.now() - startTime}ms.`);
                 // Pass to the callback for processing
                 const success = manager._assetLoadedCallback(key, true, loadedAsset);
                 if (success) {
                     resolve({key: key, status: 'loaded'}); // Resolve the promise on success
                 } else {
                     reject(new Error(`Processing failed for ${key}`)); // Reject if callback indicates failure
                 }
            };
            const onError = (error) => {
                 // Format a useful error message
                 let errorMsg = `Failed to load asset '${key}'`;
                 if (error instanceof Error) errorMsg += `: ${error.message}`;
                 else if (error instanceof ProgressEvent && error.target?.status) errorMsg += ` (HTTP Error ${error.target.status})`;
                 else if (typeof error === 'string') errorMsg += `: ${error}`;
                 else if (error?.message) errorMsg += `: ${error.message}`; // Handle basic error objects

                 console.error(`[LoadManager] !!! FAILED to load ${key}. Path: ${assetPath}. Error:`, errorMsg, error);
                 // Pass error message/object to the callback
                 manager._assetLoadedCallback(key, false, errorMsg); // Callback handles state change
                 reject(new Error(errorMsg)); // Reject the promise
            };

            // --- Use Appropriate Loader Based on Asset Type ---
            try {
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
                        onError(unknownTypeError); // This will call _assetLoadedCallback and reject
                }
            } catch (loaderError) {
                 console.error(`[LoadManager] Error initiating load for ${key}:`, loaderError);
                 onError(loaderError); // Treat as a load failure
            }
        }); // End Promise
    },

    // Returns true if asset processed successfully, false otherwise
    _assetLoadedCallback: function(assetKey, success, loadedAssetOrError) {
        const assetEntry = this.assets[assetKey];
        if (!assetEntry) {
            console.error(`[LM Callback] Asset entry for key '${assetKey}' not found! Orphan callback?`);
            this.checkCompletion(); // Still check completion state
            return false; // Indicate failure
        }

        let processingSuccess = false;
        // Set initial state based purely on network load success/failure
        assetEntry.state = success ? 'processing' : 'error';
        // Store raw loaded data or the error object/message
        assetEntry.data = success ? loadedAssetOrError : (loadedAssetOrError || 'Unknown load error');

        console.log(`[LM Callback] Asset: ${assetKey}, Load Success: ${success}. State set to: '${assetEntry.state}'.`);

        // --- Process Loaded Data (if successful) ---
        try {
            if (success && assetEntry.data !== 'error') { // Double check data isn't the error marker
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
                    console.log(`[LM Process] Extracted scene from GLTF for ${assetKey}. Name: ${processedData.name}`);

                    // Apply common settings based on asset key (map vs player model)
                    if (assetKey === 'map') {
                         // Don't assign to global here, let game.js get it via getAssetData
                         console.log("[LM Process] Processing map GLTF...");
                         processedData.traverse(child => {
                             if (child.isMesh) {
                                 child.receiveShadow = true; // Map surfaces receive shadows
                                 child.castShadow = true;    // Map elements can cast shadows
                                 // console.log(`  - Map Mesh: ${child.name}, CastShadow: ${child.castShadow}, ReceiveShadow: ${child.receiveShadow}`);
                             }
                         });
                    } else if (assetKey === 'playerModel') {
                         console.log("[LM Process] Processing playerModel GLTF...");
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
                processingSuccess = true; // Mark processing as successful

            } else {
                // Load failed earlier, ensure state is 'error' and data is the error marker/object
                assetEntry.state = 'error';
                // Keep the error object/message stored in assetEntry.data
                console.error(`[LM Callback] Load failed for ${assetKey}. Error details retained.`);
                processingSuccess = false;
            }
        } catch (processingError) {
            // Catch errors specifically during the processing stage
            console.error(`[LM Process] Error processing loaded asset ${assetKey}:`, processingError);
            assetEntry.state = 'error';
            assetEntry.data = processingError.message || 'Processing error'; // Store error message
            processingSuccess = false;
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

        return processingSuccess; // Return success status of this specific asset
    }, // End _assetLoadedCallback

    checkCompletion: function() {
        let allRequiredDone = true;
        let anyRequiredError = false;
        let stillInProgress = false;
        let finishedCount = 0;
        let totalCount = Object.keys(this.assets).length; // Total defined assets
        let totalRequiredCount = this.requiredForGame.length;
        let requiredFinishedCount = 0;
        let requiredErrorCount = 0;


        for (const key in this.assets) {
             if (!this.assets.hasOwnProperty(key)) continue;
             const assetInfo = this.assets[key];
             const assetState = assetInfo.state;
             const isRequired = this.requiredForGame.includes(key);

             // Track overall progress
             if (assetState === 'loaded' || assetState === 'error') {
                 finishedCount++;
             } else if (assetState === 'loading' || assetState === 'processing' || assetState === 'pending') {
                 if (isRequired) {
                     stillInProgress = true; // A required asset is still working
                 }
             }

             // Check required assets specifically
             if (isRequired) {
                 if (assetState === 'pending' || assetState === 'loading' || assetState === 'processing') {
                      allRequiredDone = false; // Not all required finished yet
                 } else if (assetState === 'error') {
                      anyRequiredError = true;
                      requiredErrorCount++;
                      requiredFinishedCount++; // It's finished, just with an error
                      console.warn(`[LM Check] Required asset '${key}' failed to load or process.`);
                 } else if (assetState === 'loaded') {
                      requiredFinishedCount++; // Finished successfully
                 } else {
                      // Should not happen if logic is correct (must be loaded or error if not in progress)
                      console.error(`[LM Check] Required asset '${key}' has unexpected final state: ${assetState}`);
                      anyRequiredError = true;
                      requiredErrorCount++;
                      requiredFinishedCount++; // Count as finished but error
                      allRequiredDone = false; // Treat unexpected state as not done correctly
                 }
             }
        } // End loop through assets

        // Log overall progress (optional)
        // console.log(`[LM Check] Progress: ${finishedCount}/${totalCount} assets finished.`);
        // console.log(`[LM Check] Required Progress: ${requiredFinishedCount}/${totalRequiredCount} required assets finished. Errors: ${requiredErrorCount}. Still in Progress: ${stillInProgress}.`);


        // If any required asset is still loading/processing, exit and wait for next callback
        if (stillInProgress) {
            // console.log("[LM Check] Still waiting for required assets.");
            return;
        }

        // --- All required assets have finished (either loaded or error) ---
        // Check if *all* required assets are in 'loaded' state
        const allRequiredLoadedSuccessfully = this.requiredForGame.every(key => {
            const asset = this.assets[key];
            if (!asset) {
                 console.error(`[LM Check] Required asset key '${key}' missing from assets definition!`);
                 return false; // Missing definition counts as failure
            }
            return asset.state === 'loaded';
        });


        if (allRequiredLoadedSuccessfully) {
             // All required assets finished successfully!
             console.log("[LM Check] All required assets loaded successfully. Triggering 'ready'.");
             this.trigger('ready'); // Signal that core assets are available.
        } else {
             // This means at least one required asset ended in 'error', missing definition, or an unexpected state.
             console.error("[LM Check] Not all required assets loaded successfully. One or more failed or had issues.");
             this.trigger('error', { message: 'One or more required assets failed to load.' });
             // Game initialization should stop based on this error.
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

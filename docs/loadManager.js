// docs/loadManager.js

const loadManager = {
    assets: {
        map: { state: 'pending', path: CONFIG.MAP_PATH },
        playerModel: { state: 'pending', path: CONFIG.PLAYER_MODEL_PATH },
        gunModel: { state: 'pending', path: CONFIG.GUN_MODEL_PATH },
        gunshotSound: { state: 'pending', path: CONFIG.SOUND_PATH_GUNSHOT, type: 'audio' },
    },
    loaders: {}, // GLTF Loader initialized in game.js now
    requiredForGame: ['map', 'playerModel', 'gunModel', 'gunshotSound'], // Add gunshotSound as required
    eventListeners: {'ready': [], 'error': [], 'progress': [], 'assetLoaded': []},

    // Method to check if a specific asset is ready (state is loaded AND global var exists and is not 'error')
    isAssetReady: function(key) {
        const asset = this.assets[key];
        if (!asset) return false; // Asset not defined in config
        const isLoaded = asset.state === 'loaded';
        const globalVar = window[key];
        const globalReady = !!(globalVar && globalVar !== 'error');
        // Detailed logging for debugging discrepancies
        // if (isLoaded && !globalReady) {
        //     console.warn(`[LoadManager] isAssetReady Discrepancy: Asset '${key}' state is loaded, but global var is not ready (value: ${globalVar}).`);
        // } else if (!isLoaded && globalReady) {
        //      console.warn(`[LoadManager] isAssetReady Discrepancy: Asset '${key}' state is ${asset.state}, but global var IS ready.`);
        // }
        return isLoaded && globalReady;
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
                console.log(`[LoadManager] Created Audio object for ${key}`);

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
                console.log(`[LoadManager] Set src for ${key} to ${asset.path}. Calling load()...`);
                audio.load(); // Explicitly call load to start fetching
                console.log(`[LoadManager] audio.load() called for ${key}. Waiting for events...`);

            } catch (e) {
                 console.error(`[LoadManager] Error creating/loading Audio for ${key}`, e);
                 onError(e); // Catch synchronous errors during Audio object creation/setup
            }
        } else { // Assume GLTF/GLB
            if (!loader) { // Double check loader exists here
                 onError("GLTF Loader missing at load time");
                 return;
            }
            console.log(`[LoadManager] Calling GLTFLoader.load for ${key}`);
            // Use the global GLTFLoader instance initialized in game.js
            loader.load(asset.path, onSuccess, onProg, onError);
        }
    },

    _assetLoadedCallback: function(assetKey, success, loadedAssetOrError) {
        if (!this.assets[assetKey]) {
             console.warn(`[LoadManager] Received callback for unknown asset key: ${assetKey}`);
             return;
        }

        // Ensure state reflects success accurately based on the callback flag
        this.assets[assetKey].state = success ? 'loaded' : 'error';
        console.log(`[LoadManager] Callback ${assetKey}: success=${success}. State: ${this.assets[assetKey].state}`);

        // --- Assign Global Variable ---
        window[assetKey] = 'error'; // Default global to error, overwrite on success
        try {
            if (success) {
                // Handle successful load based on type
                if (assetKey === 'gunshotSound') {
                    // ** Critical check for Audio instance **
                    console.log(`[LoadManager] Processing successful callback for gunshotSound. Received:`, loadedAssetOrError);
                    if (loadedAssetOrError instanceof Audio) {
                        console.log(`[LoadManager] Assigning window.gunshotSound = [Audio Object]`);
                        window[assetKey] = loadedAssetOrError; // Assign the Audio object directly
                        // ** Crucial: Verify assignment immediately **
                        if (window[assetKey] instanceof Audio) {
                             console.log("[LoadManager] >>> window.gunshotSound verified as Audio object after assignment.");
                        } else {
                             console.error("[LoadManager] !!! Assignment of window.gunshotSound failed verification!");
                             this.assets[assetKey].state = 'error'; // Correct state if assignment failed
                             // window[assetKey] remains 'error'
                        }
                    } else {
                         console.error(`[LoadManager] !!! gunshotSound SUCCESS callback but received invalid type! Expected Audio, got ${typeof loadedAssetOrError}.`);
                         this.assets[assetKey].state = 'error'; // Mark asset state as error
                         // window[assetKey] remains 'error'
                    }
                } else { // GLTF model/map
                    const gltfData = loadedAssetOrError;
                    const sceneObject = gltfData?.scene;
                    // Check if the extracted scene is a valid THREE.Object3D (includes Group)
                    if (sceneObject && sceneObject instanceof THREE.Object3D) {
                        console.log(`[LoadManager] Assigning window.${assetKey} = [THREE.Object3D]`);
                        window[assetKey] = sceneObject; // Assign the scene graph

                        // --- Post-Load Processing (Shadows, Adding to Scene) ---
                        if (assetKey === 'map' && typeof scene !== 'undefined') {
                            scene.add(window[assetKey]);
                            console.log(`[LoadManager] Added map to the main scene.`);
                        } else if (assetKey === 'playerModel' || assetKey === 'gunModel') {
                            // Traverse and set shadow casting properties
                            window[assetKey].traverse(function(child) {
                                if (child.isMesh) {
                                    child.castShadow = (assetKey === 'playerModel'); // Player casts shadows
                                    child.receiveShadow = true; // All model parts receive shadows
                                }
                            });
                            console.log(`[LoadManager] Traversed ${assetKey} for shadow properties.`);
                        }
                    } else {
                        console.error(`[LoadManager] !!! GLTF loaded for ${assetKey} but 'scene' is missing or not a valid THREE.Object3D!`);
                        this.assets[assetKey].state = 'error'; // Mark asset state as error
                        // window[assetKey] remains 'error'
                    }
                }
            } else { // Explicit error from loader (onError callback was hit)
                console.error(`[LoadManager] !!! ${assetKey} reported load failure in callback.`);
                this.assets[assetKey].state = 'error'; // Ensure state reflects the error
                // window[assetKey] remains 'error'
            }
        } catch (e) {
            // Catch errors during the assignment/processing itself
            console.error(`[LoadManager] !!! Error during assignment/processing for ${assetKey}:`, e);
            this.assets[assetKey].state = 'error'; // Mark as error if processing fails
            // window[assetKey] remains 'error'
        } finally {
            // Log the final state of the global variable after try/catch/assignment attempt
            const finalGlobalVar = window[assetKey];
            const varType = finalGlobalVar === 'error' ? "'error'" : (finalGlobalVar ? `[${finalGlobalVar.constructor?.name || typeof finalGlobalVar}]` : String(finalGlobalVar));
            console.log(`[LoadManager] Final value of window.${assetKey} after callback processing: ${varType}`);
        }


        // Trigger event listeners for this specific asset
        this.trigger('assetLoaded', { key: assetKey, success: this.assets[assetKey].state === 'loaded' });
        // Check overall completion status AFTER this asset has been processed
        this.checkCompletion();

    }, // End _assetLoadedCallback

    checkCompletion: function() {
        let allRequiredDone = true;
        let anyError = false;
        // console.log("[LoadManager] checkCompletion running..."); // Less verbose

        for (const key of this.requiredForGame) {
            const assetInfo = this.assets[key];
            const assetState = assetInfo?.state || 'missing';

            // Check state first - if any required asset is still pending or loading, we're not done
            if (assetState === 'pending' || assetState === 'loading') {
                allRequiredDone = false;
                break; // Exit loop early
            }

            // If not pending/loading, check if it ended in error OR if the global isn't ready according to our helper
            // This covers cases where state might be 'loaded' but global var is 'error' or missing
            if (!this.isAssetReady(key)) {
                anyError = true;
                 // Log details only if there's an actual problem detected by isAssetReady
                 if (assetState === 'error') {
                    // console.warn(`[LoadManager] checkCompletion: Asset '${key}' has error state.`);
                 } else { // State is 'loaded' or 'missing' but global isn't ready
                    console.warn(`[LoadManager] checkCompletion: Problem detected for asset '${key}'. State: ${assetState}, isAssetReady: false.`);
                 }
                 // Optional: Break here if you want to fail fast on the first error/problem
                 // break;
            }
        }

        // Only proceed if all assets are done (i.e., none are pending/loading)
        if (!allRequiredDone) {
            // console.log("[LoadManager] Still loading required assets...");
            return;
        }

        // --- All required assets have finished attempting to load ---
        console.log(`[LoadManager] FINAL checkCompletion status: allRequiredDone=true, anyError=${anyError}`);

        // Trigger 'error' or 'ready' event based on the outcome
        if (anyError) {
            console.error("[LoadManager] Triggering 'error' event due to failed/invalid assets.");
            // Set global flag for consistency (though not strictly necessary if using events)
            if(typeof assetsAreReady !== 'undefined') assetsAreReady = false;
            this.trigger('error', { m: 'One or more required assets failed.' });
        } else {
            console.log("[LoadManager] Triggering 'ready' event - all required assets loaded successfully.");
             // Set global flag for consistency
            if(typeof assetsAreReady !== 'undefined') assetsAreReady = true;
            this.trigger('ready'); // Let game.js handle this event
        }
    }, // End checkCompletion

    on: function(evName, cb) {
        if(!this.eventListeners[evName])this.eventListeners[evName]=[];
        this.eventListeners[evName].push(cb);
    },
    trigger: function(evName, data={}) {
        if(this.eventListeners[evName]) {
            // console.log(`[LoadManager] Triggering event: ${evName}`, data);
            this.eventListeners[evName].forEach(function(cb){
                try { cb(data); } catch(e){ console.error(`Error in listener for ${evName}:`, e)}
            });
        }
    }
};
window.loadManager = loadManager;
console.log("loadManager.js loaded");

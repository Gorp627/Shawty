// docs/loadManager.js

const loadManager = {
    assets: {
        map: { state: 'pending', path: CONFIG.MAP_PATH },
        playerModel: { state: 'pending', path: CONFIG.PLAYER_MODEL_PATH },
        gunModel: { state: 'pending', path: CONFIG.GUN_MODEL_PATH },
        gunshotSound: { state: 'pending', path: CONFIG.SOUND_PATH_GUNSHOT, type: 'audio' },
    },
    loaders: {}, // GLTF Loader initialized in game.js now
    requiredForGame: ['map', 'playerModel', 'gunModel'], // Assets needed to start playing
    eventListeners: {'ready': [], 'error': [], 'progress': [], 'assetLoaded': []},

    startLoading: function() {
        console.log("[LoadManager] Start Loading All Assets...");
        // Ensure the global loader is available (initialized in game.js)
        if (!loader) {
             console.error("[LoadManager] GLTF Loader (global 'loader') not initialized before startLoading!");
             this.trigger('error',{m:'GFX Loader Fail'});
             // Also update state machine if possible
             if (typeof stateMachine !== 'undefined') {
                stateMachine.transitionTo('loading', {message: 'FATAL: Graphics Loader Failed!', error: true});
             }
             return; // Stop loading
        }

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
        // Error handler
        const onError = function(err){
             console.error(`[LoadManager] Error loading ${key}:`, err); // Log the specific error
             // Call the callback with success=false and the error object
             manager._assetLoadedCallback(key, false, err);
        };
        // Success handler (passes the raw loaded asset)
        const onSuccess = function(loadedAsset){
             const loadTime = Date.now() - loadStartTime;
             console.log(`[LoadManager] Successfully loaded ${key} in ${loadTime}ms.`);
             // Call the callback with success=true and the loaded asset
             manager._assetLoadedCallback(key, true, loadedAsset);
        };

        // --- Asset Type Specific Loading ---
        if (asset.type === 'audio') {
            try {
                 const audio = new Audio(asset.path);
                 audio.preload = 'auto'; // Hint to the browser to load

                 // Using events for more reliable load completion detection
                 const audioLoaded = () => {
                    audio.removeEventListener('canplaythrough', audioLoaded);
                    audio.removeEventListener('error', audioError);
                    onSuccess(audio);
                 };
                 const audioError = (e) => {
                    audio.removeEventListener('canplaythrough', audioLoaded);
                    audio.removeEventListener('error', audioError);
                    onError(e); // Pass the event or a new Error object
                 };

                 audio.addEventListener('canplaythrough', audioLoaded);
                 audio.addEventListener('error', audioError);

                 // Initiate loading (necessary for some browsers)
                 audio.load();

            } catch (e) {
                 onError(e); // Catch synchronous errors during Audio object creation
            }
        } else { // Assume GLTF/GLB if no type or other type specified
            if (!loader) { // Double check loader exists here
                 onError("GLTF Loader missing at load time");
                 return;
            }
            // Use the global GLTFLoader instance initialized in game.js
            loader.load(asset.path, onSuccess, onProg, onError);
        }
    },

    _assetLoadedCallback: function(assetKey, success, loadedAssetOrError) {
        if (!this.assets[assetKey]) {
             console.warn(`[LoadManager] Received callback for unknown asset key: ${assetKey}`);
             return;
        }

        // Update asset state
        this.assets[assetKey].state = success ? 'loaded' : 'error';
        console.log(`[LoadManager] Callback for ${assetKey}: success=${success}. New state: ${this.assets[assetKey].state}`);

        // --- Assign Global Variable ---
        try {
            if (success) {
                // Assign based on asset type
                if (assetKey === 'gunshotSound') {
                    console.log(`[LoadManager] Assigning window.gunshotSound...`);
                    window.gunshotSound = loadedAssetOrError; // Assign Audio object
                    console.log(`[LoadManager] window.gunshotSound assigned:`, window.gunshotSound);
                } else { // GLTF model/map
                    // loadedAssetOrError is the full GLTF object here
                    const sceneObject = loadedAssetOrError?.scene;
                    console.log(`[LoadManager] Assigning window.${assetKey} with scene object:`, sceneObject);
                    if (sceneObject) {
                        window[assetKey] = sceneObject; // Assign the scene graph
                        console.log(`[LoadManager] Value of window.${assetKey} after assignment:`, window[assetKey]);

                        // --- Post-Load Processing (Shadows, Adding to Scene) ---
                        if (assetKey === 'map' && typeof scene !== 'undefined') {
                            scene.add(window[assetKey]);
                            console.log(`[LoadManager] Added map to the main scene.`);
                        } else if (assetKey === 'playerModel' || assetKey === 'gunModel') {
                            // Traverse and set shadow casting properties
                            window[assetKey].traverse(function(child) {
                                if (child.isMesh) {
                                    // Let player model cast shadows, maybe gun model receive?
                                    child.castShadow = (assetKey === 'playerModel');
                                    child.receiveShadow = true; // Allow receiving shadows
                                }
                            });
                            console.log(`[LoadManager] Traversed ${assetKey} for shadow properties.`);
                        }
                    } else {
                         // This should not happen if loader succeeded, but check anyway
                         console.error(`[LoadManager] !!! GLTF loaded successfully but scene object is missing for ${assetKey}!`);
                         this.assets[assetKey].state = 'error'; // Mark as error if scene is missing
                         window[assetKey] = 'error'; // Assign error string to global
                         console.log(`[LoadManager] Assigned window.${assetKey} = 'error' due to missing scene.`);
                    }
                }
            } else { // Handle load failure
                 console.error(`[LoadManager] !!! Asset ${assetKey} failed to load. Error:`, loadedAssetOrError);
                 // Ensure the global variable reflects the error state explicitly
                 window[assetKey] = 'error'; // Assign string 'error'
                 console.log(`[LoadManager] Assigned window.${assetKey} = 'error'`);
            }
        } catch (e) {
             console.error(`[LoadManager] !!! Error during assignment/processing for ${assetKey}:`, e);
             this.assets[assetKey].state = 'error'; // Mark as error if processing fails
             window[assetKey] = 'error'; // Assign error string
        }


        // Trigger event listeners for this specific asset
        this.trigger('assetLoaded', {key: assetKey, success: success && this.assets[assetKey].state !== 'error'});

        // Check overall completion status AFTER this asset has been processed
        this.checkCompletion();
    },

    checkCompletion: function() {
        let allRequiredDone = true;
        let anyError = false;
        console.log("[LoadManager] checkCompletion called. Checking required assets:", this.requiredForGame);

        for (const key of this.requiredForGame) {
            const assetInfo = this.assets[key];
            const assetState = assetInfo?.state || 'missing';
            const globalVar = window[key]; // Check the actual global variable

            console.log(`[LoadManager] Checking asset: ${key} | State: ${assetState} | GlobalVar exists: ${!!globalVar} | GlobalVar is 'error': ${globalVar === 'error'}`);

            // If any required asset is still pending or loading, we are not done
            if (assetState === 'pending' || assetState === 'loading') {
                allRequiredDone = false;
            }
            // If any required asset has errored (or its global is 'error'), mark error flag
            if (assetState === 'error' || globalVar === 'error') {
                anyError = true;
            }
            // Add extra check: if state is loaded but globalVar is still missing, treat as error
            if (assetState === 'loaded' && !globalVar) {
                 console.error(`[LoadManager] CRITICAL! Asset ${key} state is 'loaded' but global variable window.${key} is missing!`);
                 anyError = true;
                 allRequiredDone = true; // Stop waiting, it's fundamentally broken
            }
        }

        console.log(`[LoadManager] checkCompletion status: allRequiredDone=${allRequiredDone}, anyError=${anyError}`);

        // Only proceed if all required assets have finished (either loaded or errored)
        if (!allRequiredDone) {
            console.log("[LoadManager] Still loading required assets...");
            return; // Exit, wait for more callbacks
        }

        // --- All required assets have finished ---
        console.log(`[LoadManager] All required assets loading attempts complete. Error state: ${anyError}`);

        if (anyError) {
            console.error("[LoadManager] One or more required assets failed to load or process.");
            this.trigger('error', {m:'One or more required assets failed.'}); // Trigger general error event
            // Transition state machine to error state if appropriate
            if (typeof stateMachine !== 'undefined' && stateMachine.is('loading')) {
                 stateMachine.transitionTo('loading', {message:"FATAL: Asset Load Error!", error:true});
            } else {
                 console.warn("[LoadManager] Asset error occurred but state is not 'loading'. State:", stateMachine?.currentState);
                 // Maybe force an error display anyway?
                 if (typeof UIManager !== 'undefined') UIManager.showError("Asset Load Error!", "loading");
            }
        } else {
            // SUCCESS: All required assets loaded without error
            console.log("[LoadManager] All required assets READY.");
            this.trigger('ready'); // Trigger the ready event

            // Now handle state transitions based on network status and current game state
            const isConnected = typeof Network !== 'undefined' && Network.isConnected();
            const currentState = typeof stateMachine !== 'undefined' ? stateMachine.currentState : 'unknown';

            console.log(`[LoadManager] Assets ready. isConnected=${isConnected}, currentState=${currentState}`);

            if (isConnected) {
                 if (currentState === 'loading') {
                     // Assets finished loading AFTER socket connected
                     console.log("[LoadManager] Assets ready & Socket connected. Transitioning from Loading to Homescreen...");
                     if (typeof UIManager !== 'undefined') {
                         stateMachine.transitionTo('homescreen', { playerCount: UIManager.playerCountSpan?.textContent ?? '?' });
                     } else {
                         console.error("[LoadManager] UIManager missing, cannot transition state!");
                         stateMachine.transitionTo('homescreen'); // Transition without player count
                     }
                 } else if (currentState === 'joining') {
                      // Assets finished loading WHILE attempting to join
                      console.log("[LoadManager] Assets ready while Joining state active. Sending join details...");
                      if(typeof Network !== 'undefined') Network.sendJoinDetails();
                 } else {
                      // Assets ready, connected, but in unexpected state (e.g., already on homescreen or playing)
                      console.log("[LoadManager] Assets ready & Socket connected, but state is not Loading/Joining. No automatic transition.");
                 }
            } else { // Not connected yet
                 console.log("[LoadManager] Assets ready, but waiting for socket connection.");
                 if (currentState === 'loading') {
                     // Update loading message to indicate waiting for connection
                     if(typeof UIManager !== 'undefined') UIManager.showLoading("Connecting to server...");
                 }
            }
        }
    }, // End checkCompletion

     on: function(evName, cb) {
         if(!this.eventListeners[evName]) this.eventListeners[evName]=[];
         this.eventListeners[evName].push(cb);
     },
     trigger: function(evName, data={}) {
         if(this.eventListeners[evName]) {
             // console.log(`[LoadManager] Triggering event: ${evName}`, data); // Optional: Log event triggers
             this.eventListeners[evName].forEach(function(cb){
                 try { cb(data); } catch(e){ console.error(`Error in listener for ${evName}:`, e)}
             });
         }
     }
};
window.loadManager = loadManager; // Export globally
console.log("loadManager.js loaded");

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
        if (!loader) { // Check global GLTFLoader instance
             console.error("[LoadManager] GLTF Loader (global 'loader') not initialized before startLoading!");
             this.trigger('error',{m:'GFX Loader Fail'});
             if (typeof stateMachine !== 'undefined') {
                stateMachine.transitionTo('loading', {message: 'FATAL: Graphics Loader Failed!', error: true});
             }
             return;
        }
         // Verify DracoLoader is attached (it should be if game.js ran correctly)
         if (!loader.dracoLoader) {
             console.error("[LoadManager] !!! DracoLoader is NOT attached to the GLTFLoader instance!");
             // Consider this a fatal error for compressed assets
              this.trigger('error',{m:'Draco Loader Missing'});
             if (typeof stateMachine !== 'undefined') {
                stateMachine.transitionTo('loading', {message: 'FATAL: Draco Loader Missing!', error: true});
             }
             return;
         } else {
             console.log("[LoadManager] Verified DracoLoader is attached to GLTFLoader.");
         }


        let assetsToLoadCount = 0;
        for (const key in this.assets) {
            if (this.assets[key].state === 'pending') {
                assetsToLoadCount++;
                this.loadAsset(key);
            }
        }

        if (assetsToLoadCount === 0) {
            console.log("[LoadManager] No pending assets found on startLoading. Checking completion immediately.");
            this.checkCompletion();
        }
    },

    loadAsset: function(key) {
        const asset = this.assets[key];
        if (!asset || asset.state !== 'pending') return;

        asset.state = 'loading';
        console.log(`[LoadManager] Loading ${key} from ${asset.path}...`);
        const manager = this;
        const loadStartTime = Date.now();

        const onProg = function(xhr){
            if(xhr.lengthComputable) {
                manager.trigger('progress', {key:key, progress:Math.round(xhr.loaded/xhr.total*100)});
            }
        };

        // --- Success Callback ---
        const onSuccess = function(loadedAsset){
             const loadTime = Date.now() - loadStartTime;
             console.log(`[LoadManager] Successfully loaded network request for ${key} in ${loadTime}ms.`);
             // Pass to the internal callback for processing and assignment
             manager._assetLoadedCallback(key, true, loadedAsset);
        };

        // --- Explicit Error Callback ---
        const onError = function(error){
             console.error(`[LoadManager] !!! Loading FAILED for ${key}. Path: ${asset.path}`);
             // Log the detailed error object provided by the loader
             console.error(`[LoadManager] >>> Error details for ${key}:`, error);
             // Pass error to internal callback
             manager._assetLoadedCallback(key, false, error);
        };


        // --- Asset Type Specific Loading ---
        if (asset.type === 'audio') {
            try {
                 const audio = new Audio(asset.path);
                 audio.preload = 'auto';
                 const audioLoaded = () => {
                    audio.removeEventListener('canplaythrough', audioLoaded); audio.removeEventListener('error', audioError);
                    onSuccess(audio); // Call general success handler
                 };
                 const audioError = (e) => {
                    audio.removeEventListener('canplaythrough', audioLoaded); audio.removeEventListener('error', audioError);
                    onError(e); // Call general error handler
                 };
                 audio.addEventListener('canplaythrough', audioLoaded);
                 audio.addEventListener('error', audioError);
                 audio.load();
            } catch (e) { onError(e); }
        } else { // Assume GLTF/GLB
            if (!loader) { // Should not happen due to check in startLoading, but safety first
                 onError("GLTF Loader missing at load time");
                 return;
            }
            console.log(`[LoadManager] Calling GLTFLoader.load for ${key}`);
            // Use the global GLTFLoader instance initialized in game.js
            // Pass our explicit onError and onSuccess callbacks
            loader.load(asset.path, onSuccess, onProg, onError);
        }
    },

    _assetLoadedCallback: function(assetKey, success, loadedAssetOrError) {
        if (!this.assets[assetKey]) {
             console.warn(`[LoadManager] Received callback for unknown asset key: ${assetKey}`);
             return;
        }

        // Update asset state ONLY based on the success flag from the callback
        this.assets[assetKey].state = success ? 'loaded' : 'error';
        console.log(`[LoadManager] _assetLoadedCallback for ${assetKey}: success=${success}. New state: ${this.assets[assetKey].state}`);

        // --- Assign Global Variable ---
        try {
            if (success) {
                // Handle successful load
                if (assetKey === 'gunshotSound') {
                    console.log(`[LoadManager] Assigning window.gunshotSound...`);
                    window.gunshotSound = loadedAssetOrError;
                    console.log(`[LoadManager] window.gunshotSound assigned.`);
                } else { // GLTF model/map
                    const gltfData = loadedAssetOrError; // Rename for clarity
                    const sceneObject = gltfData?.scene;
                    const sceneObjectType = Object.prototype.toString.call(sceneObject);

                    console.log(`[LoadManager] Processing successful GLTF load for ${assetKey}.`);
                    console.log(`[LoadManager] >>> Full loaded GLTF data for ${assetKey}:`, gltfData); // Log the whole object
                    console.log(`[LoadManager] >>> Extracted scene object for ${assetKey}:`, sceneObject);
                    console.log(`[LoadManager] >>> Type of scene object: ${sceneObjectType}`);

                    // Check if the extracted scene is a valid THREE.Object3D (or Group)
                    if (sceneObject && sceneObject instanceof THREE.Object3D) {
                        console.log(`[LoadManager] Assigning window.${assetKey} = sceneObject`);
                        window[assetKey] = sceneObject;
                        console.log(`[LoadManager] Value of window.${assetKey} after assignment:`, window[assetKey]);

                        // Post-Load Processing
                        if (assetKey === 'map' && typeof scene !== 'undefined') {
                            scene.add(window[assetKey]);
                            console.log(`[LoadManager] Added map to the main scene.`);
                        } else if (assetKey === 'playerModel' || assetKey === 'gunModel') {
                            window[assetKey].traverse(function(child) {
                                if (child.isMesh) {
                                    child.castShadow = (assetKey === 'playerModel');
                                    child.receiveShadow = true;
                                }
                            });
                            console.log(`[LoadManager] Traversed ${assetKey} for shadow properties.`);
                        }
                    } else {
                         // This case means loading seemed successful, but the scene graph wasn't extracted correctly or is invalid
                         console.error(`[LoadManager] !!! GLTF loaded for ${assetKey} but 'scene' is missing or not a valid THREE.Object3D! Type: ${sceneObjectType}`);
                         this.assets[assetKey].state = 'error'; // Mark as error
                         window[assetKey] = 'error'; // Assign error string
                    }
                }
            } else { // Handle load failure reported by the loader's onError callback
                 console.error(`[LoadManager] !!! Asset ${assetKey} processing failed load. Error object received:`, loadedAssetOrError);
                 window[assetKey] = 'error'; // Assign string 'error'
                 console.log(`[LoadManager] Assigned window.${assetKey} = 'error' due to load failure.`);
            }
        } catch (e) {
             // Catch errors during the assignment/processing itself
             console.error(`[LoadManager] !!! Error during assignment/processing for ${assetKey}:`, e);
             this.assets[assetKey].state = 'error'; // Mark as error if processing fails
             window[assetKey] = 'error';
        }


        // Trigger event listeners for this specific asset
        this.trigger('assetLoaded', {key: assetKey, success: this.assets[assetKey].state === 'loaded'});

        // Check overall completion status AFTER this asset has been processed
        // Remove the setTimeout diagnostic wrapper
        this.checkCompletion();

    }, // End _assetLoadedCallback

    checkCompletion: function() {
        let allRequiredDone = true;
        let anyError = false;
        // console.log("[LoadManager] checkCompletion called..."); // Less verbose logging

        for (const key of this.requiredForGame) {
            const assetInfo = this.assets[key];
            const assetState = assetInfo?.state || 'missing';
            const globalVar = window[key];

            if (assetState === 'pending' || assetState === 'loading') {
                allRequiredDone = false;
                break;
            }
            if (assetState === 'error' || globalVar === 'error') {
                anyError = true;
            }
            // Check again: if loaded state but missing global, it's an error
            if (assetState === 'loaded' && (!globalVar || globalVar === 'error')) {
                 console.error(`[LoadManager] Asset ${key} state 'loaded' but global var missing or error! Global:`, globalVar);
                 anyError = true;
            }
        }

        if (!allRequiredDone) return; // Still loading...

        // --- All finished ---
        console.log(`[LoadManager] FINAL checkCompletion status: allRequiredDone=true, anyError=${anyError}`);

        if (anyError) {
            console.error("[LoadManager] One or more required assets failed to load or process.");
            this.trigger('error', {m:'One or more required assets failed.'});
            if (typeof stateMachine !== 'undefined') {
                const currentState = stateMachine.currentState;
                if (currentState === 'loading' || currentState === 'joining') {
                     stateMachine.transitionTo('loading', {message:"FATAL: Asset Load Error!", error:true});
                }
                 // If already on homescreen, maybe show error there?
                 else if (currentState === 'homescreen' && typeof UIManager !== 'undefined') {
                     UIManager.showError("Asset loading failed.", 'homescreen');
                 }
            }
        } else {
            // SUCCESS
            console.log("[LoadManager] All required assets READY.");
            this.trigger('ready');

            const isConnected = typeof Network !== 'undefined' && Network.isConnected();
            const currentState = typeof stateMachine !== 'undefined' ? stateMachine.currentState : 'unknown';
            console.log(`[LoadManager] Assets ready. isConnected=${isConnected}, currentState=${currentState}`);

            if (isConnected) {
                 if (currentState === 'loading') {
                     console.log("[LoadManager] Assets ready & Socket connected. Transitioning from Loading to Homescreen...");
                     if (typeof UIManager !== 'undefined') {
                         stateMachine.transitionTo('homescreen', { playerCount: UIManager.playerCountSpan?.textContent ?? '?' });
                     } else { stateMachine.transitionTo('homescreen'); }
                 } else if (currentState === 'joining') {
                      console.log("[LoadManager] Assets ready while Joining state active. Ensuring join details are sent...");
                      if(typeof Network !== 'undefined') Network.sendJoinDetails();
                 }
            } else { // Not connected
                 console.log("[LoadManager] Assets ready, but waiting for socket connection.");
                 if (currentState === 'loading') {
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
             this.eventListeners[evName].forEach(function(cb){
                 try { cb(data); } catch(e){ console.error(`Error in listener for ${evName}:`, e)}
             });
         }
     }
};
window.loadManager = loadManager;
console.log("loadManager.js loaded");

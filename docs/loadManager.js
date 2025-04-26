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
        if (!loader) {
             console.error("[LoadManager] GLTF Loader (global 'loader') not initialized before startLoading!");
             this.trigger('error',{m:'GFX Loader Fail'});
             if (typeof stateMachine !== 'undefined') {
                stateMachine.transitionTo('loading', {message: 'FATAL: Graphics Loader Failed!', error: true});
             }
             return;
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
        const onError = function(err){
             console.error(`[LoadManager] Error loading ${key}:`, err);
             manager._assetLoadedCallback(key, false, err);
        };
        const onSuccess = function(loadedAsset){
             const loadTime = Date.now() - loadStartTime;
             console.log(`[LoadManager] Successfully loaded ${key} in ${loadTime}ms.`);
             manager._assetLoadedCallback(key, true, loadedAsset);
        };

        if (asset.type === 'audio') {
            try {
                 const audio = new Audio(asset.path);
                 audio.preload = 'auto';
                 const audioLoaded = () => {
                    audio.removeEventListener('canplaythrough', audioLoaded);
                    audio.removeEventListener('error', audioError);
                    onSuccess(audio);
                 };
                 const audioError = (e) => {
                    audio.removeEventListener('canplaythrough', audioLoaded);
                    audio.removeEventListener('error', audioError);
                    onError(e);
                 };
                 audio.addEventListener('canplaythrough', audioLoaded);
                 audio.addEventListener('error', audioError);
                 audio.load();
            } catch (e) { onError(e); }
        } else {
            if (!loader) { onError("GLTF Loader missing at load time"); return; }
            loader.load(asset.path, onSuccess, onProg, onError);
        }
    },

    _assetLoadedCallback: function(assetKey, success, loadedAssetOrError) {
        if (!this.assets[assetKey]) {
             console.warn(`[LoadManager] Received callback for unknown asset key: ${assetKey}`);
             return;
        }

        this.assets[assetKey].state = success ? 'loaded' : 'error';
        console.log(`[LoadManager] Callback for ${assetKey}: success=${success}. New state: ${this.assets[assetKey].state}`);

        // --- Assign Global Variable ---
        try {
            if (success) {
                if (assetKey === 'gunshotSound') {
                    console.log(`[LoadManager] Assigning window.gunshotSound...`);
                    window.gunshotSound = loadedAssetOrError;
                    console.log(`[LoadManager] window.gunshotSound assigned:`, window.gunshotSound);
                } else {
                    const sceneObject = loadedAssetOrError?.scene;
                    // ** More detailed logging specifically for gunModel **
                    if (assetKey === 'gunModel') {
                         console.log(`[LoadManager] >>> Processing gunModel callback. Success: ${success}`);
                         console.log(`[LoadManager] >>> gunModel raw loaded data:`, loadedAssetOrError);
                         console.log(`[LoadManager] >>> gunModel extracted scene:`, sceneObject);
                    }
                    console.log(`[LoadManager] Attempting assignment: window.${assetKey} = sceneObject`);
                    if (sceneObject) {
                        window[assetKey] = sceneObject;
                        // ** Log immediately after assignment **
                        console.log(`[LoadManager] Value of window.${assetKey} IMMEDIATELY after assignment:`, window[assetKey]);

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
                         console.error(`[LoadManager] !!! GLTF loaded successfully but scene object is missing for ${assetKey}!`);
                         this.assets[assetKey].state = 'error';
                         window[assetKey] = 'error';
                         console.log(`[LoadManager] Assigned window.${assetKey} = 'error' due to missing scene.`);
                    }
                }
            } else {
                 console.error(`[LoadManager] !!! Asset ${assetKey} failed to load. Error:`, loadedAssetOrError);
                 window[assetKey] = 'error';
                 console.log(`[LoadManager] Assigned window.${assetKey} = 'error'`);
            }
        } catch (e) {
             console.error(`[LoadManager] !!! Error during assignment/processing for ${assetKey}:`, e);
             this.assets[assetKey].state = 'error';
             window[assetKey] = 'error';
        }

        this.trigger('assetLoaded', {key: assetKey, success: success && this.assets[assetKey].state !== 'error'});

        // --- Check completion with a tiny delay (WORKAROUND/DIAGNOSTIC) ---
        // This helps if the global assignment takes a micro-tick to propagate
        // Remove this setTimeout wrapper if it doesn't help or causes other issues.
        console.log(`[LoadManager] Scheduling checkCompletion after processing ${assetKey}`);
        setTimeout(() => {
             console.log(`[LoadManager] Running delayed checkCompletion after ${assetKey}`);
             this.checkCompletion();
        }, 10); // Wait 10 milliseconds - increase if needed for testing, but keep small.

    }, // End _assetLoadedCallback

    checkCompletion: function() {
        let allRequiredDone = true;
        let anyError = false;
        // Don't log every checkCompletion call unless debugging timing heavily
        // console.log("[LoadManager] checkCompletion called. Checking required assets:", this.requiredForGame);

        for (const key of this.requiredForGame) {
            const assetInfo = this.assets[key];
            const assetState = assetInfo?.state || 'missing';
            const globalVar = window[key];

            // console.log(`[LoadManager] Checking asset: ${key} | State: ${assetState} | GlobalVar exists: ${!!globalVar} | GlobalVar is 'error': ${globalVar === 'error'}`);

            if (assetState === 'pending' || assetState === 'loading') {
                allRequiredDone = false;
                break; // Exit loop early if any asset is not finished loading/errored
            }
            if (assetState === 'error' || globalVar === 'error') {
                anyError = true;
            }
            if (assetState === 'loaded' && !globalVar) {
                 console.error(`[LoadManager] CRITICAL! Asset ${key} state is 'loaded' but global variable window.${key} is missing!`);
                 anyError = true;
            }
        }

        // Only proceed if all assets are done (loaded or error)
        if (!allRequiredDone) {
            // console.log("[LoadManager] Still loading required assets...");
            return;
        }

        // --- All required assets have finished attempting to load ---
        console.log(`[LoadManager] FINAL checkCompletion status: allRequiredDone=${allRequiredDone}, anyError=${anyError}`);

        if (anyError) {
            console.error("[LoadManager] One or more required assets failed to load or process.");
            this.trigger('error', {m:'One or more required assets failed.'});
            if (typeof stateMachine !== 'undefined' && stateMachine.is('loading')) {
                 stateMachine.transitionTo('loading', {message:"FATAL: Asset Load Error!", error:true});
            } else if (typeof stateMachine !== 'undefined' && stateMachine.is('joining')) {
                 // If error happens while joining, revert to homescreen with error
                 stateMachine.transitionTo('homescreen', { playerCount: UIManager?.playerCountSpan?.textContent ?? '?' });
                 if (typeof UIManager !== 'undefined') UIManager.showError("Asset Load Error!", 'homescreen');
            }
        } else {
            // SUCCESS: All required assets loaded without error
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
                 } else {
                      console.log("[LoadManager] Assets ready & Socket connected, but state is not Loading/Joining. No automatic transition needed.");
                 }
            } else {
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

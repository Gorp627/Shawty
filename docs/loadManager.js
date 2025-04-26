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

    // Method to check if a specific asset is ready (state is loaded AND global var exists)
    isAssetReady: function(key) {
        const asset = this.assets[key];
        if (!asset) return false;
        const isLoaded = asset.state === 'loaded';
        const globalVar = window[key];
        const globalReady = !!(globalVar && globalVar !== 'error');
        // Log if discrepancy found
        // if (isLoaded && !globalReady) {
        //     console.warn(`[LoadManager] Discrepancy: Asset '${key}' state is loaded, but global var is not ready.`);
        // }
        return isLoaded && globalReady;
    },


    startLoading: function() {
        console.log("[LoadManager] Start Loading All Assets...");
        if (!loader || !loader.dracoLoader) {
             console.error("[LoadManager] Critical Loader Missing (GLTF or Draco)!");
             this.trigger('error',{m:'GFX/Draco Loader Fail'});
             if (stateMachine) stateMachine.transitionTo('loading', {message: 'FATAL: Graphics/Draco Loader Failed!', error: true});
             return;
         }
        console.log("[LoadManager] Verified GLTF & DracoLoader available.");

        let assetsToLoadCount = 0;
        for (const key in this.assets) { if (this.assets[key].state === 'pending') { assetsToLoadCount++; this.loadAsset(key); } }
        if (assetsToLoadCount === 0) { console.log("[LoadManager] No pending assets found."); this.checkCompletion(); }
    },

    loadAsset: function(key) {
        const asset = this.assets[key];
        if (!asset || asset.state !== 'pending') return;
        asset.state = 'loading';
        console.log(`[LoadManager] Loading ${key} from ${asset.path}...`);
        const manager = this; const loadStartTime = Date.now();
        const onProg = (xhr) => { if(xhr.lengthComputable) manager.trigger('progress',{key:key,progress:Math.round(xhr.loaded/xhr.total*100)}); };
        const onSuccess = (loadedAsset) => { const lTime=Date.now()-loadStartTime; console.log(`[LoadManager] Net OK ${key} in ${lTime}ms.`); manager._assetLoadedCallback(key, true, loadedAsset); };
        const onError = (err) => { console.error(`[LoadManager] !!! FAILED ${key}. Path: ${asset.path}`, err); manager._assetLoadedCallback(key, false, err); };

        if (asset.type === 'audio') {
            try {
                const audio = new Audio(); // Create audio element
                console.log(`[LoadManager] Created Audio object for ${key}`);
                const audioLoaded = () => {
                    console.log(`[LoadManager] Audio event 'canplaythrough' triggered for ${key}`);
                    audio.removeEventListener('canplaythrough', audioLoaded); audio.removeEventListener('error', audioError);
                    onSuccess(audio); // Call general success handler
                };
                const audioError = (e) => {
                     console.error(`[LoadManager] Audio event 'error' triggered for ${key}`, e);
                    audio.removeEventListener('canplaythrough', audioLoaded); audio.removeEventListener('error', audioError);
                    onError(e); // Call general error handler
                };
                audio.addEventListener('canplaythrough', audioLoaded);
                audio.addEventListener('error', audioError);
                audio.src = asset.path; // Set the source path *after* attaching listeners
                audio.preload = 'auto'; // Hint to browser
                console.log(`[LoadManager] Set src for ${key} to ${asset.path}. Calling load()...`);
                audio.load(); // Explicitly call load
                console.log(`[LoadManager] audio.load() called for ${key}. Waiting for events...`);
            } catch (e) { console.error(`[LoadManager] Error creating/loading Audio for ${key}`, e); onError(e); }
        } else { // Assume GLTF
            if (!loader) { onError("GLTF Loader missing"); return; }
            console.log(`[LoadManager] Calling GLTFLoader.load for ${key}`);
            loader.load(asset.path, onSuccess, onProg, onError);
        }
    },

    _assetLoadedCallback: function(assetKey, success, loadedAssetOrError) {
        if (!this.assets[assetKey]) return;
        // Ensure state reflects success accurately
        this.assets[assetKey].state = success ? 'loaded' : 'error';
        console.log(`[LoadManager] Callback ${assetKey}: success=${success}. State: ${this.assets[assetKey].state}`);

        // Assign Global Variable
        window[assetKey] = 'error'; // Default to error
        try {
            if (success) {
                if (assetKey === 'gunshotSound') {
                    // ** Critical check for Audio **
                    if (loadedAssetOrError instanceof Audio) {
                        console.log(`[LoadManager] Assigning window.gunshotSound = [Audio Object]`);
                        window[assetKey] = loadedAssetOrError; // Assign the Audio object directly
                    } else {
                         console.error(`[LoadManager] !!! gunshotSound loaded successfully but is NOT an Audio object!`, loadedAssetOrError);
                         this.assets[assetKey].state = 'error'; // Mark as error if type is wrong
                    }
                } else { // GLTF
                    const sceneObject = loadedAssetOrError?.scene;
                    if (sceneObject && sceneObject instanceof THREE.Object3D) {
                        console.log(`[LoadManager] Assigning window.${assetKey} = [THREE.Object3D]`);
                        window[assetKey] = sceneObject; // Assign scene graph
                        // Post-load processing
                        if (assetKey === 'map' && scene) scene.add(window[assetKey]);
                        else if (assetKey === 'playerModel' || assetKey === 'gunModel') {
                            window[assetKey].traverse(c => { if (c.isMesh) { c.castShadow = (assetKey === 'playerModel'); c.receiveShadow = true; } });
                        }
                    } else {
                        console.error(`[LoadManager] !!! GLTF ${assetKey} loaded but scene invalid!`);
                        this.assets[assetKey].state = 'error'; // Ensure state is error
                    }
                }
            } else { // Explicit error from loader
                console.error(`[LoadManager] !!! ${assetKey} reported load failure.`);
                this.assets[assetKey].state = 'error'; // Ensure state is error
            }
        } catch (e) {
            console.error(`[LoadManager] !!! Error during assignment/processing for ${assetKey}:`, e);
            this.assets[assetKey].state = 'error'; // Ensure state is error
        } finally {
            // Log the final state of the global variable after try/catch
            console.log(`[LoadManager] Final value of window.${assetKey} after callback:`, window[assetKey] === 'error' ? "'error'" : (window[assetKey] ? `[${typeof window[assetKey]}]` : window[assetKey]));
        }


        this.trigger('assetLoaded', { key: assetKey, success: this.assets[assetKey].state === 'loaded' });
        this.checkCompletion();
    },

    checkCompletion: function() {
        let allRequiredDone = true;
        let anyError = false;

        for (const key of this.requiredForGame) {
            const assetInfo = this.assets[key];
            const assetState = assetInfo?.state || 'missing';

            // Check state first
            if (assetState === 'pending' || assetState === 'loading') {
                allRequiredDone = false; // Still loading
                break; // No need to check further if one is pending/loading
            }

            // If not pending/loading, check if it ended in error OR if the global isn't ready
            if (assetState === 'error' || !this.isAssetReady(key)) {
                anyError = true;
                 // Log details if error or discrepancy
                 if (assetState === 'error') {
                    // console.log(`[LoadManager] checkCompletion: Asset '${key}' has error state.`);
                 } else if (!this.isAssetReady(key)) {
                    console.warn(`[LoadManager] checkCompletion: Asset '${key}' state is '${assetState}', but isAssetReady() check failed! Global var issue?`);
                 }
                 // Optional: Break here if you want to fail fast on first error
                 // break;
            }
        }

        if (!allRequiredDone) return; // Still loading other assets...

        // --- All finished ---
        console.log(`[LoadManager] FINAL checkCompletion: allRequiredDone=true, anyError=${anyError}`);
        if (anyError) {
            console.error("[LoadManager] Triggering 'error' event due to failed/invalid assets.");
            this.trigger('error', { m: 'One or more required assets failed.' });
        } else {
            console.log("[LoadManager] Triggering 'ready' event - all required assets loaded successfully.");
            this.trigger('ready');
        }
    },

    on: function(evName, cb) { if(!this.eventListeners[evName])this.eventListeners[evName]=[]; this.eventListeners[evName].push(cb); },
    trigger: function(evName, data={}) { if(this.eventListeners[evName]){ this.eventListeners[evName].forEach(cb=>{try{cb(data);}catch(e){console.error(`Listener Error ${evName}:`,e)}});} }
};
window.loadManager = loadManager;
console.log("loadManager.js loaded");

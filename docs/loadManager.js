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
        if (!asset) return false;
        const isLoaded = asset.state === 'loaded';
        const globalVar = window[key];
        const globalReady = !!(globalVar && globalVar !== 'error');
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
                const audio = new Audio();
                console.log(`[LoadManager] Created Audio object for ${key}`);
                const audioLoaded = () => {
                    console.log(`[LoadManager] Audio event 'canplaythrough' triggered for ${key}`);
                    cleanupAudioListeners();
                    onSuccess(audio); // *** Pass the audio object on success ***
                };
                const audioError = (e) => {
                     console.error(`[LoadManager] Audio event 'error' triggered for ${key}`, e);
                     cleanupAudioListeners();
                     onError(e); // Pass the error object on failure
                };
                const cleanupAudioListeners = () => {
                    audio.removeEventListener('canplaythrough', audioLoaded);
                    audio.removeEventListener('error', audioError);
                };
                audio.addEventListener('canplaythrough', audioLoaded);
                audio.addEventListener('error', audioError);
                audio.src = asset.path;
                audio.preload = 'auto';
                console.log(`[LoadManager] Set src for ${key} to ${asset.path}. Calling load()...`);
                audio.load();
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
        this.assets[assetKey].state = success ? 'loaded' : 'error'; // Set state based *only* on success flag initially
        console.log(`[LoadManager] Callback ${assetKey}: success=${success}. State: ${this.assets[assetKey].state}`);

        window[assetKey] = 'error'; // Default global to error, overwrite on success
        try {
            if (success) {
                if (assetKey === 'gunshotSound') {
                    // *** ADDED LOGGING & STRICTER CHECK ***
                    console.log(`[LoadManager] Processing successful callback for gunshotSound. Received:`, loadedAssetOrError);
                    if (loadedAssetOrError instanceof Audio) {
                        console.log(`[LoadManager] Assigning window.gunshotSound = [Audio Object]`);
                        window[assetKey] = loadedAssetOrError; // Assign the Audio object
                        // ** Crucial: Verify assignment immediately **
                        if (window[assetKey] instanceof Audio) {
                             console.log("[LoadManager] >>> window.gunshotSound verified as Audio object after assignment.");
                        } else {
                             console.error("[LoadManager] !!! Assignment of window.gunshotSound failed verification!");
                             this.assets[assetKey].state = 'error'; // Correct state if assignment failed
                        }
                    } else {
                         console.error(`[LoadManager] !!! gunshotSound SUCCESS callback but received invalid type! Expected Audio, got ${typeof loadedAssetOrError}.`);
                         this.assets[assetKey].state = 'error'; // Mark asset state as error
                    }
                } else { // GLTF
                    const sceneObject = loadedAssetOrError?.scene;
                    if (sceneObject && sceneObject instanceof THREE.Object3D) {
                        console.log(`[LoadManager] Assigning window.${assetKey} = [THREE.Object3D]`);
                        window[assetKey] = sceneObject;
                        // Post-load processing... (shadows, add map)
                        if (assetKey === 'map' && scene) scene.add(window[assetKey]);
                        else if (assetKey === 'playerModel' || assetKey === 'gunModel') { window[assetKey].traverse(c => { if (c.isMesh) { c.castShadow = (assetKey==='playerModel'); c.receiveShadow = true; } }); }
                    } else {
                        console.error(`[LoadManager] !!! GLTF ${assetKey} success callback but scene invalid!`);
                        this.assets[assetKey].state = 'error';
                    }
                }
            } else { // Explicit error from loader
                console.error(`[LoadManager] !!! ${assetKey} reported load failure in callback.`);
                this.assets[assetKey].state = 'error'; // Ensure state reflects the error
            }
        } catch (e) {
            console.error(`[LoadManager] !!! Error during assignment/processing for ${assetKey}:`, e);
            this.assets[assetKey].state = 'error'; // Ensure state is error
        } finally {
            // Log final state for debugging
            const finalGlobalVar = window[assetKey];
            const varType = finalGlobalVar === 'error' ? "'error'" : (finalGlobalVar ? `[${finalGlobalVar.constructor?.name || typeof finalGlobalVar}]` : String(finalGlobalVar));
            console.log(`[LoadManager] Final value of window.${assetKey} after callback processing: ${varType}`);
        }

        this.trigger('assetLoaded', { key: assetKey, success: this.assets[assetKey].state === 'loaded' });
        this.checkCompletion();
    }, // End _assetLoadedCallback

    checkCompletion: function() {
        let allRequiredDone = true;
        let anyError = false;

        for (const key of this.requiredForGame) {
            const assetInfo = this.assets[key];
            const assetState = assetInfo?.state || 'missing';
            if (assetState === 'pending' || assetState === 'loading') { allRequiredDone = false; break; }
            // Use isAssetReady which checks state AND global variable validity
            if (!this.isAssetReady(key)) {
                anyError = true;
                // Log only if there's an actual problem detected by isAssetReady
                console.warn(`[LoadManager] checkCompletion: Problem detected for asset '${key}'. State: ${assetState}, isAssetReady: false.`);
            }
        }

        if (!allRequiredDone) return; // Still loading...

        console.log(`[LoadManager] FINAL checkCompletion: allRequiredDone=true, anyError=${anyError}`);
        if (anyError) {
            console.error("[LoadManager] Triggering 'error' event.");
            this.trigger('error', { m: 'One or more required assets failed.' });
        } else {
            console.log("[LoadManager] Triggering 'ready' event.");
            this.trigger('ready');
        }
    }, // End checkCompletion

    on: function(evName, cb) { if(!this.eventListeners[evName])this.eventListeners[evName]=[]; this.eventListeners[evName].push(cb); },
    trigger: function(evName, data={}) { if(this.eventListeners[evName]){ this.eventListeners[evName].forEach(cb=>{try{cb(data);}catch(e){console.error(`Listener Error ${evName}:`,e)}});} }
};
window.loadManager = loadManager;
console.log("loadManager.js loaded");

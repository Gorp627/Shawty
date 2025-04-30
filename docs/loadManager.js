// --- START OF FULL loadManager.js FILE ---
// docs/loadManager.js (Add Gun Model and Sound - Uses Global THREE - REGEN v5 - Add Map to Scene)

const loadManager = {
    assets: {
        // Access global CONFIG safely for paths
        map: { state: 'pending', path: (typeof CONFIG !== 'undefined' ? CONFIG.MAP_PATH : null), data: null, type: 'gltf' },
        playerModel: { state: 'pending', path: (typeof CONFIG !== 'undefined' ? CONFIG.PLAYER_MODEL_PATH : null), data: null, type: 'gltf' },
        gunModel: { state: 'pending', path: (typeof CONFIG !== 'undefined' ? CONFIG.GUN_MODEL_PATH : null), data: null, type: 'gltf'},
        gunSound: { state: 'pending', path: (typeof CONFIG !== 'undefined' ? CONFIG.GUN_SHOT_SOUND_PATH : null), data: null, type: 'audio'},
    },
    loaders: { // Will be populated in startLoading
        gltf: null,
        texture: null,
        audio: null,
    },
    requiredForGame: ['map', 'playerModel', 'gunModel', 'gunSound'], // Added gun assets as required
    eventListeners: {'ready': [], 'error': [], 'progress': [], 'assetLoaded': []},

    isAssetReady: function(key) {
        const asset = this.assets[key];
        if (!asset) return false;
        const isLoadedState = asset.state === 'loaded';
        const hasValidData = asset.data !== null && asset.data !== undefined && asset.data !== 'error';
        return isLoadedState && hasValidData;
    },

    getAssetData: function(key) {
        if (this.isAssetReady(key)) {
            return this.assets[key].data;
        }
        return null;
    },

    startLoading: function() {
        console.log("[LoadManager] Start Loading All Assets...");

        // --- Prerequisite Checks ---
        if (typeof THREE === 'undefined') {
             console.error("[LoadManager] CRITICAL: THREE object is undefined!");
             this.trigger('error',{message:'THREE library not loaded!'});
             if(typeof stateMachine !== 'undefined') stateMachine.transitionTo('loading', {message: 'FATAL: Graphics Library Failed!', error: true});
             return;
        }
        // Use global loaders created in game.js setupLoaders
        if (typeof window === 'undefined' || !window.loader || !window.dracoLoader) {
             console.error("[LoadManager] CRITICAL: Global GLTFLoader or DRACOLoader reference is missing or invalid!");
             this.trigger('error',{message:'GFX Loader Ref Missing!'});
             if(typeof stateMachine !== 'undefined') stateMachine.transitionTo('loading', {message: 'FATAL: Graphics Loader Ref Failed!', error: true});
             return;
        }
        this.loaders.gltf = window.loader; // Use global loader

        this.loaders.texture = new THREE.TextureLoader();
        this.loaders.audio = new THREE.AudioLoader();

        console.log("[LoadManager] Verified Three.js and necessary Loaders available.");

        // --- Start Loading Each Pending Asset ---
        let assetsToLoadCount = 0;
        for (const key in this.assets) {
            if (this.assets.hasOwnProperty(key)) {
                 if(typeof this.assets[key].path !== 'string' || !this.assets[key].path) {
                     console.error(`[LoadManager] Skipping asset '${key}': Invalid or missing path in CONFIG.`);
                     this.assets[key].state = 'error';
                     this.assets[key].data = 'Invalid path';
                     this.trigger('error', { message: `Asset '${key}' has invalid path.` });
                 } else if (this.assets[key].state === 'pending') {
                     assetsToLoadCount++;
                     this.loadAsset(key);
                 }
            }
        }

        if (assetsToLoadCount === 0) {
            console.log("[LoadManager] No pending assets found to load (or all had invalid paths).");
            this.checkCompletion();
        } else {
            console.log(`[LoadManager] Started loading process for ${assetsToLoadCount} asset(s).`);
        }
    },

    loadAsset: function(key) {
        const asset = this.assets[key];
        if (!asset || asset.state !== 'pending' || !asset.path) return;

        const assetPath = asset.path;
        const assetType = asset.type?.toLowerCase();
        console.log(`[LoadManager] Requesting loadAsset('${key}'). Type: ${assetType || 'unknown'}, Path: ${assetPath}`);

        asset.state = 'loading';
        const manager = this;
        const startTime = Date.now();

        const onProg = (xhr) => { if (xhr.lengthComputable) manager.trigger('progress', {key: key, progress: Math.round(xhr.loaded / xhr.total * 100)}); };
        const onSuccess = (loadedAsset) => { console.log(`[LoadManager] Net OK: ${key} in ${Date.now() - startTime}ms.`); manager._assetLoadedCallback(key, true, loadedAsset); };
        const onError = (error) => {
             let errorMsg = `Failed to load asset '${key}'`;
             if (error instanceof Error) errorMsg += `: ${error.message}`;
             else if (error instanceof ProgressEvent && error.target?.status) errorMsg += ` (HTTP Error ${error.target.status})`;
             else if (typeof error === 'string') errorMsg += `: ${error}`;
             console.error(`[LoadManager] !!! FAILED to load ${key}. Path: ${assetPath}. Error:`, errorMsg, error);
             manager._assetLoadedCallback(key, false, errorMsg);
        };

        switch (assetType) {
            case 'gltf':
                if (!this.loaders.gltf) { onError("GLTF Loader not available"); return; }
                this.loaders.gltf.load(assetPath, onSuccess, onProg, onError);
                break;
            case 'texture':
                 if (!this.loaders.texture) { onError("Texture Loader not available"); return; }
                 this.loaders.texture.load(assetPath, onSuccess, undefined, onError);
                 break;
            case 'audio':
                 if (!this.loaders.audio) { onError("Audio Loader not available"); return; }
                 // Need AudioListener from Effects.js to be ready before loading sounds
                 if (!window.listener) {
                     console.warn(`[LoadManager] AudioListener not ready, delaying load for ${key}`);
                     // Simple delay - a better approach involves event listeners or promises
                     setTimeout(() => this.loadAsset(key), 500);
                     asset.state = 'pending'; // Reset state to retry
                     return;
                 }
                 this.loaders.audio.load(assetPath, onSuccess, onProg, onError);
                 break;
            default:
                const unknownTypeError = `Unknown asset type: ${asset.type}`;
                console.error(`[LoadManager] ${unknownTypeError} for key '${key}'. Cannot load.`);
                onError(unknownTypeError);
        }
    },

    _assetLoadedCallback: function(assetKey, success, loadedAssetOrError) {
        const assetEntry = this.assets[assetKey];
        if (!assetEntry) { console.error(`[LM CB] Asset entry for key '${assetKey}' not found!`); return; }

        assetEntry.state = success ? 'processing' : 'error';
        assetEntry.data = success ? loadedAssetOrError : (loadedAssetOrError || 'Unknown load error');
        // console.log(`[LM CB] Asset: ${assetKey}, Load Success: ${success}. State set to: '${assetEntry.state}'.`);

        if (typeof THREE === 'undefined') {
             console.error("[LM CB] THREE not found during processing!");
             assetEntry.state = 'error'; assetEntry.data = 'THREE not loaded'; success = false;
        }

        try {
            if (success && assetEntry.data !== 'error') {
                const assetType = assetEntry.type?.toLowerCase();
                let processedData = assetEntry.data;

                if (assetType === 'gltf') {
                    const gltf = loadedAssetOrError;
                    if (!gltf?.scene || !(gltf.scene instanceof THREE.Object3D)) throw new Error("Loaded GLTF invalid or no scene.");
                    processedData = gltf; // Store the whole GLTF object (includes scene, animations etc)
                    // console.log(`[LM Process] GLTF OK: ${assetKey}.`);
                    const applyShadows = (obj) => { obj.traverse(c => { if(c.isMesh){c.castShadow=true; c.receiveShadow=true;} }); };

                    // Assign crucial data to global scope AND ADD MAP TO SCENE
                    if (assetKey === 'map') {
                        window.mapMesh = processedData.scene; // Assign the scene Object3D
                        applyShadows(window.mapMesh);
                        // ***** ADD MAP TO SCENE HERE *****
                        if (window.scene) {
                             console.log("[LoadManager] Adding map mesh to the scene.");
                             window.scene.add(window.mapMesh);
                        } else {
                             console.error("[LoadManager] Cannot add map to scene: window.scene is not available yet!");
                             // This might indicate a timing issue if loadManager finishes before game.js sets up the scene
                        }
                        // *********************************
                    }
                    else if (assetKey === 'playerModel') {
                        applyShadows(processedData.scene);
                        window.playerModelData = processedData; // Store the whole GLTF object
                    }
                    else if (assetKey === 'gunModel') {
                        processedData.scene.traverse(c=>{if(c.isMesh)c.castShadow=true;});
                        window.gunModelData = processedData; // Store the whole GLTF object
                    }
                } else if (assetType === 'texture') {
                    if (!(loadedAssetOrError instanceof THREE.Texture)) throw new Error("Loaded texture not THREE.Texture.");
                    // Assign texture to global scope if needed, e.g.:
                    // if (assetKey === 'someTexture') window.someTexture = loadedAssetOrError;
                } else if (assetType === 'audio') {
                     if (!(loadedAssetOrError instanceof AudioBuffer)) throw new Error("Loaded audio not AudioBuffer.");
                     // Assign audio buffer to global scope
                     if (assetKey === 'gunSound') window.gunSoundBuffer = loadedAssetOrError;
                     // if (assetKey === 'explosionSound') window.explosionSoundBuffer = loadedAssetOrError; // Example
                }
                assetEntry.data = processedData; // Store the processed data (GLTF object, Texture, AudioBuffer)
                assetEntry.state = 'loaded';
            } else {
                assetEntry.state = 'error';
            }
        } catch (processingError) {
            console.error(`[LM Process] Error processing loaded asset ${assetKey}:`, processingError);
            assetEntry.state = 'error'; assetEntry.data = processingError.message || 'Processing error';
        }

        this.trigger('assetLoaded', { key: assetKey, success: assetEntry.state === 'loaded' });
        this.checkCompletion();
    },

    checkCompletion: function() {
        let allRequiredDone = true; let anyRequiredError = false; let stillInProgress = false;
        for (const key of this.requiredForGame) {
            const assetInfo = this.assets[key];
            if (!assetInfo) { console.error(`[LM Check] Req asset key '${key}' missing def!`); anyRequiredError = true; allRequiredDone = false; continue; }
            const assetState = assetInfo.state;
            if (assetState === 'pending' || assetState === 'loading' || assetState === 'processing') { allRequiredDone = false; stillInProgress = true; break; }
            if (assetState === 'error') { anyRequiredError = true; console.warn(`[LM Check] Req asset '${key}' failed.`); }
            else if (assetState !== 'loaded') { console.error(`[LM Check] Req asset '${key}' unexpected state: ${assetState}`); anyRequiredError = true; }
        }
        // Only proceed if nothing is still loading/processing
        if (stillInProgress) return;

        if (allRequiredDone && !anyRequiredError) {
             console.log("[LM Check] All required assets loaded successfully. Triggering 'ready'.");
             if (typeof window !== 'undefined') window.assetsAreReady = true; // Set global flag
             this.trigger('ready');
        } else if (anyRequiredError) { // Check for errors only after confirming nothing is in progress
             console.error("[LM Check] Triggering global 'error' due to failed required asset(s).");
             this.trigger('error', { message: 'One or more required assets failed to load.' });
             if(typeof stateMachine !== 'undefined') stateMachine.transitionTo('loading', {message:"Required Assets Failed!", error:true});
        }
        // Implicitly handles the case where definitions might be missing if `allRequiredDone` remains false without errors
    },

    on: function(eventName, callback) {
        if (typeof callback !== 'function') { console.error(`[LM] Invalid cb for '${eventName}'`); return; }
        if (!this.eventListeners[eventName]) this.eventListeners[eventName] = [];
        this.eventListeners[eventName].push(callback);
    },
    trigger: function(eventName, data = {}) {
        if (this.eventListeners[eventName]) {
            this.eventListeners[eventName].slice().forEach(callback => {
                try { callback(data); } catch (e) { console.error(`[LM Trigger Err] '${eventName}':`, e); }
            });
        }
    }
};
if (typeof window !== 'undefined') {
    window.loadManager = loadManager;
}
console.log("loadManager.js loaded (Uses Global THREE/Scope - v5 - Add Map to Scene)");
// --- END OF FULL loadManager.js FILE ---

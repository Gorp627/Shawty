// docs/loadManager.js

const loadManager = {
    assets: { /* ... */ },
    loaders: {},
    requiredForGame: ['map', 'playerModel', 'gunModel'],
    eventListeners: { /* ... */ },

    startLoading: function() { /* ... (No changes needed from previous) ... */ },
    loadAsset: function(key) { /* ... (No changes needed from previous) ... */ },

    _assetLoadedCallback: function(assetKey, success, loadedAssetOrError) {
        if (!this.assets[assetKey]) return;
        this.assets[assetKey].state = success ? 'loaded' : 'error';
        console.log(`[LoadManager] Callback ${assetKey}: success=${success}. State: ${this.assets[assetKey].state}`);

        try {
            if (success) {
                if (assetKey === 'gunshotSound') {
                    window.gunshotSound = loadedAssetOrError;
                    console.log(`[LoadManager] Assigned window.gunshotSound.`);
                } else { // GLTF
                    const gltfData = loadedAssetOrError;
                    const sceneObject = gltfData?.scene;
                    console.log(`[LoadManager] Processing GLTF ${assetKey}. Scene valid: ${!!(sceneObject && sceneObject instanceof THREE.Object3D)}`);
                    if (sceneObject && sceneObject instanceof THREE.Object3D) {
                        window[assetKey] = sceneObject;
                        console.log(`[LoadManager] Assigned window.${assetKey}. Type: ${window[assetKey]?.constructor?.name}`);
                        // Post-load processing...
                        if (assetKey === 'map' && scene) scene.add(window[assetKey]);
                        else if (assetKey === 'playerModel' || assetKey === 'gunModel') {
                            window[assetKey].traverse(c => { if (c.isMesh) { c.castShadow = (assetKey === 'playerModel'); c.receiveShadow = true; } });
                        }
                    } else {
                        console.error(`[LoadManager] !!! GLTF ${assetKey} scene invalid!`);
                        this.assets[assetKey].state = 'error'; window[assetKey] = 'error';
                    }
                }
            } else { // Error case
                console.error(`[LoadManager] !!! ${assetKey} failed load.`);
                window[assetKey] = 'error';
            }
        } catch (e) {
            console.error(`[LoadManager] !!! Error proc ${assetKey}:`, e);
            this.assets[assetKey].state = 'error'; window[assetKey] = 'error';
        }

        this.trigger('assetLoaded', { key: assetKey, success: this.assets[assetKey].state === 'loaded' });

        // *** ADDED LOGGING HERE ***
        console.log(`[LoadManager] >>> Before checkCompletion (after ${assetKey}): window.gunModel is ${window.gunModel ? 'Object' : window.gunModel}`);
        this.checkCompletion();

    }, // End _assetLoadedCallback

    checkCompletion: function() {
        let allRequiredDone = true;
        let anyError = false;

        for (const key of this.requiredForGame) {
            const assetInfo = this.assets[key];
            const assetState = assetInfo?.state || 'missing';
            let globalVar = window[key]; // Check global variable again

            // *** ADDED LOGGING HERE ***
            if (key === 'gunModel') {
                 console.log(`[LoadManager] >>> checkCompletion evaluating gunModel: State=${assetState}, Global=${globalVar ? 'Object' : globalVar}`);
            }

            if (assetState === 'pending' || assetState === 'loading') {
                allRequiredDone = false; break;
            }
            if (assetState === 'error' || globalVar === 'error' || (assetState === 'loaded' && (!globalVar || globalVar === 'error'))) {
                anyError = true;
                if (assetState === 'loaded' && (!globalVar || globalVar === 'error')) console.error(`[LoadManager] Asset ${key} loaded but global invalid!`);
            }
        }

        if (!allRequiredDone) return; // Still loading...

        console.log(`[LoadManager] FINAL checkCompletion: allDone=true, anyError=${anyError}`);
        if (anyError) {
            console.error("[LoadManager] Triggering 'error' event.");
            this.trigger('error', { m: 'One or more required assets failed.' });
        } else {
            console.log("[LoadManager] Triggering 'ready' event.");
            this.trigger('ready');
        }
    }, // End checkCompletion

    on: function(evName, cb) { /* ... */ },
    trigger: function(evName, data = {}) { /* ... */ }
};
window.loadManager = loadManager;
console.log("loadManager.js loaded");

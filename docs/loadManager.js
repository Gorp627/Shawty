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
        if (!loader || !loader.dracoLoader) {
             console.error("[LoadManager] Critical Loader Missing (GLTF or Draco)! Check game.js initialization.");
             this.trigger('error',{m:'GFX/Draco Loader Fail'});
             if (typeof stateMachine !== 'undefined') stateMachine.transitionTo('loading', {message: 'FATAL: Graphics/Draco Loader Failed!', error: true});
             return;
         }
        console.log("[LoadManager] Verified GLTF & DracoLoader available.");

        let assetsToLoadCount = 0;
        for (const key in this.assets) { if (this.assets[key].state === 'pending') { assetsToLoadCount++; this.loadAsset(key); } }
        if (assetsToLoadCount === 0) { console.log("[LoadManager] No pending assets found. Checking completion."); this.checkCompletion(); }
    },

    loadAsset: function(key) { /* ... (No changes needed from previous version) ... */ const asset=this.assets[key];if(!asset||asset.state!=='pending')return;asset.state='loading';console.log(`[LoadManager] Loading ${key} from ${asset.path}...`);const manager=this;const loadStartTime=Date.now();const onProg=(xhr)=>{if(xhr.lengthComputable)manager.trigger('progress',{key:key,progress:Math.round(xhr.loaded/xhr.total*100)});};const onSuccess=(ldAsset)=>{const lTime=Date.now()-loadStartTime;console.log(`[LoadManager] Net OK ${key} in ${lTime}ms.`);manager._assetLoadedCallback(key,true,ldAsset);};const onError=(err)=>{console.error(`[LoadManager] !!! FAILED ${key}. Path: ${asset.path}`);console.error(`[LoadManager] >>> Error details:`,err);manager._assetLoadedCallback(key,false,err);};if(asset.type==='audio'){try{const audio=new Audio(asset.path);audio.preload='auto';const loaded=()=>{audio.removeEventListener('canplaythrough',loaded);audio.removeEventListener('error',err);onSuccess(audio);};const err=(e)=>{audio.removeEventListener('canplaythrough',loaded);audio.removeEventListener('error',err);onError(e);};audio.addEventListener('canplaythrough',loaded);audio.addEventListener('error',err);audio.load();}catch(e){onError(e);}}else{if(!loader){onError("GLTF Loader missing");return;}console.log(`[LoadManager] Calling GLTFLoader.load for ${key}`);loader.load(asset.path,onSuccess,onProg,onError);} },

    _assetLoadedCallback: function(assetKey, success, loadedAssetOrError) { /* ... (No changes needed from previous version) ... */ if(!this.assets[assetKey])return;this.assets[assetKey].state=success?'loaded':'error';console.log(`[LoadManager] Callback ${assetKey}: success=${success}. State: ${this.assets[assetKey].state}`);try{if(success){if(assetKey==='gunshotSound'){console.log(`[LoadManager] Assign window.gunshotSound`);window.gunshotSound=loadedAssetOrError;console.log(`[LoadManager] window.gunshotSound assigned.`);}else{const gltfData=loadedAssetOrError;const sceneObject=gltfData?.scene;const sceneObjectType=Object.prototype.toString.call(sceneObject);console.log(`[LoadManager] Proc GLTF ${assetKey}.`);console.log(`[LoadManager] >>> Full GLTF:`,gltfData);console.log(`[LoadManager] >>> Scene Obj:`,sceneObject);console.log(`[LoadManager] >>> Scene Type: ${sceneObjectType}`);if(sceneObject&&sceneObject instanceof THREE.Object3D){console.log(`[LoadManager] Assign window.${assetKey}`);window[assetKey]=sceneObject;console.log(`[LoadManager] window.${assetKey} after assign:`,window[assetKey]);if(assetKey==='map'&&scene)scene.add(window[assetKey]);else if(assetKey==='playerModel'||assetKey==='gunModel'){window[assetKey].traverse(c=>{if(c.isMesh){c.castShadow=(assetKey==='playerModel');c.receiveShadow=true;}});console.log(`[LoadManager] Traversed ${assetKey} shadows.`);}}else{console.error(`[LoadManager] !!! GLTF ${assetKey} ok but scene invalid! Type: ${sceneObjectType}`);this.assets[assetKey].state='error';window[assetKey]='error';}}}else{console.error(`[LoadManager] !!! ${assetKey} failed load. Error:`,loadedAssetOrError);window[assetKey]='error';console.log(`[LoadManager] Assigned window.${assetKey} = 'error'`);}}catch(e){console.error(`[LoadManager] !!! Error proc ${assetKey}:`,e);this.assets[assetKey].state='error';window[assetKey]='error';}this.trigger('assetLoaded',{key:assetKey,success:this.assets[assetKey].state==='loaded'});this.checkCompletion(); },

    // ** Simplified checkCompletion **
    checkCompletion: function() {
        let allRequiredDone = true;
        let anyError = false;

        for (const key of this.requiredForGame) {
            const assetInfo = this.assets[key];
            const assetState = assetInfo?.state || 'missing';
            const globalVar = window[key];

            if (assetState === 'pending' || assetState === 'loading') {
                allRequiredDone = false; // Still loading
                break;
            }
            // Check for explicit error state or missing/error global variable after load attempt
            if (assetState === 'error' || globalVar === 'error' || (assetState === 'loaded' && (!globalVar || globalVar === 'error'))) {
                anyError = true;
                if (assetState === 'loaded' && (!globalVar || globalVar === 'error')) {
                    console.error(`[LoadManager] Asset ${key} state 'loaded' but global invalid!`);
                }
            }
        }

        // Only proceed if all assets are done (loaded or error state)
        if (!allRequiredDone) {
            return; // Still loading...
        }

        // --- All finished ---
        console.log(`[LoadManager] FINAL checkCompletion: allRequiredDone=true, anyError=${anyError}`);

        // Trigger 'error' or 'ready' event. State transitions are handled in game.js listeners now.
        if (anyError) {
            console.error("[LoadManager] Triggering 'error' event.");
            this.trigger('error', {m:'One or more required assets failed.'});
        } else {
            console.log("[LoadManager] Triggering 'ready' event.");
            this.trigger('ready'); // Let game.js handle this
        }
    }, // End checkCompletion (Simplified)

     on: function(evName, cb) { /* ... (no changes) ... */ if(!this.eventListeners[evName])this.eventListeners[evName]=[];this.eventListeners[evName].push(cb); },
     trigger: function(evName, data={}) { /* ... (no changes) ... */ if(this.eventListeners[evName]){this.eventListeners[evName].forEach(cb=>{try{cb(data);}catch(e){console.error(`Listener Error ${evName}:`,e)}});} }
};
window.loadManager = loadManager;
console.log("loadManager.js loaded");

// docs/loadManager.js

const loadManager = {
    assets: {
        map: { state: 'pending', path: CONFIG.MAP_PATH, data: null },
        playerModel: { state: 'pending', path: CONFIG.PLAYER_MODEL_PATH, data: null },
        // gunshotSound: { state: 'pending', path: CONFIG.SOUND_PATH_GUNSHOT, type: 'audio', data: null }, // REMOVED
    },
    loaders: {}, // GLTF Loader initialized in game.js
    requiredForGame: ['map', 'playerModel'], // REMOVED gunshotSound
    eventListeners: {'ready': [], 'error': [], 'progress': [], 'assetLoaded': []},

    isAssetReady: function(key) { const a=this.assets[key]; if(!a)return!1; const iS=a.state==='loaded'; const hD=!!(a.data&&a.data!=='error'); return iS&&hD; },
    getAssetData: function(key) { if(this.isAssetReady(key)){return this.assets[key].data;} return null; },

    startLoading: function() {
        console.log("[LM] Start Loading...");
        if(!loader||!loader.dracoLoader){console.error("[LM] Loader Missing!"); this.trigger('error',{m:'GFX/Draco Fail'}); if(stateMachine)stateMachine.transitionTo('loading',{message:'FATAL: Loader Fail!',error:!0}); return;}
        let c=0; for(const k in this.assets){if(this.assets[k].state==='pending'){c++; this.loadAsset(k);}}
        if(c===0){console.log("[LM] No pending assets."); this.checkCompletion();}
    },

    loadAsset: function(key) {
        const asset = this.assets[key]; if (!asset || asset.state !== 'pending') return;
        const assetPath = asset.path;
        if (typeof assetPath !== 'string' || !assetPath) { console.error(`[LM] Invalid path for ${key}`); this._assetLoadedCallback(key, false, "Invalid path"); return; }
        asset.state = 'loading'; console.log(`[LM] Loading ${key} from ${assetPath}...`);
        const manager=this; const sT=Date.now();
        const p = (xhr)=>{if(xhr.lengthComputable)manager.trigger('progress',{key:key,progress:Math.round(xhr.loaded/xhr.total*100)});};
        const ok = (ld)=>{console.log(`[LM] Net OK ${key} in ${Date.now()-sT}ms.`); manager._assetLoadedCallback(key, !0, ld);};
        const err = (e)=>{console.error(`[LM] !!! FAILED ${key}. Path: ${assetPath}`, e); manager._assetLoadedCallback(key, !1, e);};

        // --- REMOVED AUDIO LOGIC ---

        // Assume GLTF
        if (!loader) { err("GLTF Loader missing"); return; }
        loader.load(assetPath, ok, p, err);
    },

    _assetLoadedCallback: function(assetKey, success, loadedAssetOrError) {
        const assetEntry = this.assets[assetKey]; if (!assetEntry) return;
        assetEntry.state = success ? 'loaded' : 'error';
        assetEntry.data = 'error'; // Default
        console.log(`[LM] Callback ${assetKey}: success=${success}. State: ${assetEntry.state}`);
        try {
            if (success) {
                 // --- REMOVED gunshotSound case ---

                 // GLTF Processing
                 const sceneObject = loadedAssetOrError?.scene;
                 if (sceneObject && sceneObject instanceof THREE.Object3D) {
                     assetEntry.data = sceneObject;
                     if (assetKey === 'map') {
                         window.mapMesh = sceneObject; // Assign global mapMesh
                         console.log("[LM] Assigned global 'mapMesh'.");
                         if (scene) scene.add(window.mapMesh); // Add global mapMesh to scene
                     } else if (assetKey === 'playerModel') {
                         assetEntry.data.traverse(c => { if (c.isMesh) { c.castShadow=true; c.receiveShadow=true; } });
                     }
                 } else { console.error(`[LM] !!! GLTF ${assetKey} success but scene invalid!`); assetEntry.state = 'error'; }

            } else { assetEntry.state = 'error'; } // Error reported by loader
        } catch (e) { console.error(`[LM] !!! Error proc ${assetKey}:`, e); assetEntry.state = 'error'; }
        finally {
            const finalData=assetEntry.data; const dataType=finalData==='error'?"'error'":(finalData?`[${finalData.constructor?.name||typeof finalData}]`:String(finalData));
            console.log(`[LM] Final stored data ${assetKey}: ${dataType}`);
        }
        this.trigger('assetLoaded', { key: assetKey, success: assetEntry.state === 'loaded' });
        this.checkCompletion();
    }, // End _assetLoadedCallback

    checkCompletion: function() {
        let allDone=!0, anyErr=!1;
        for (const key of this.requiredForGame) { // Checks map, playerModel
            const assetInfo = this.assets[key]; if (!assetInfo) { anyErr=!0; continue; }
            const assetState = assetInfo.state;
            if (assetState==='pending'||assetState==='loading') { allDone=!1; break; }
            if (!this.isAssetReady(key)) { // Checks state AND internal data
                anyErr = true; console.warn(`[LM] checkCompletion: Problem asset '${key}'. State: ${assetState}.`);
            }
            // Explicitly check global mapMesh again for safety
            if (key === 'map' && (!window.mapMesh || window.mapMesh === 'error')) {
                 anyErr = true; console.error(`[LM] checkCompletion: map state '${assetState}' but global invalid!`);
            }
        }
        if (!allDone) return;
        console.log(`[LM] FINAL checkCompletion: allDone=${allDone}, anyError=${anyErr}`);
        if (anyErr) { this.trigger('error', { m: 'Required assets failed.' }); }
        else { this.trigger('ready'); }
    }, // End checkCompletion

    on: function(evName, cb) { if(!this.eventListeners[evName])this.eventListeners[evName]=[]; this.eventListeners[evName].push(cb); },
    trigger: function(evName, data={}) { if(this.eventListeners[evName]){ this.eventListeners[evName].forEach(cb=>{try{cb(data);}catch(e){console.error(`Listener Error ${evName}:`,e)}});} }
};
window.loadManager = loadManager;
console.log("loadManager.js loaded");

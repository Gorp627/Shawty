// docs/loadManager.js

const loadManager = {
    assets: {
        map: { state: 'pending', path: CONFIG.MAP_PATH, data: null },
        playerModel: { state: 'pending', path: CONFIG.PLAYER_MODEL_PATH, data: null },
        gunshotSound: { state: 'pending', path: CONFIG.SOUND_PATH_GUNSHOT, type: 'audio', data: null },
    },
    loaders: {}, // GLTF Loader initialized in game.js
    requiredForGame: ['map', 'playerModel', 'gunshotSound'],
    eventListeners: {'ready': [], 'error': [], 'progress': [], 'assetLoaded': []},

    isAssetReady: function(key) { /* ... (no changes needed from previous) ... */ const a=this.assets[key];if(!a)return!1;const iS=a.state==='loaded';const hD=!!(a.data&&a.data!=='error');return iS&&hD; },
    getAssetData: function(key) { /* ... (no changes needed from previous) ... */ if(this.isAssetReady(key)){return this.assets[key].data;}return null; },
    startLoading: function() { /* ... (no changes needed from previous) ... */ console.log("[LM] Start Loading...");if(!loader||!loader.dracoLoader){console.error("[LM] Loader Missing!");this.trigger('error',{m:'GFX/Draco Fail'});if(stateMachine)stateMachine.transitionTo('loading',{message:'FATAL: Loader Fail!',error:!0});return;}let c=0;for(const k in this.assets){if(this.assets[k].state==='pending'){c++;this.loadAsset(k);}}if(c===0){console.log("[LM] No pending assets.");this.checkCompletion();} },
    loadAsset: function(key) { /* ... (no changes needed from previous) ... */ const a=this.assets[key];if(!a||a.state!=='pending')return;a.state='loading';console.log(`[LM] Loading ${key}...`);const m=this;const sT=Date.now();const p=(xhr)=>{if(xhr.lengthComputable)m.trigger('progress',{key:key,progress:Math.round(xhr.loaded/xhr.total*100)});};const ok=(ld)=>{console.log(`[LM] Net OK ${key} in ${Date.now()-sT}ms.`);m._assetLoadedCallback(key,!0,ld);};const err=(e)=>{console.error(`[LM] !!! FAIL ${key}`,e);m._assetLoadedCallback(key,!1,e);};if(a.type==='audio'){try{const aud=new Audio();const l=()=>{cleanup();ok(aud);};const e=(ev)=>{cleanup();err(ev);};const cleanup=()=>{aud.removeEventListener('canplaythrough',l);aud.removeEventListener('error',e);};aud.addEventListener('canplaythrough',l);aud.addEventListener('error',e);aud.src=a.path;aud.preload='auto';aud.load();}catch(e){err(e);}}else{if(!loader){err("GLTF Loader missing");return;}loader.load(a.path,ok,p,err);} },

    // MODIFIED _assetLoadedCallback
    _assetLoadedCallback: function(assetKey, success, loadedAssetOrError) {
        const assetEntry = this.assets[assetKey]; if (!assetEntry) return;
        assetEntry.state = success ? 'loaded' : 'error';
        assetEntry.data = 'error'; // Default
        // --- REMOVED global assignment removal --- We will assign mapMesh globally again
        // window[assetKey] = 'error';

        console.log(`[LoadManager] Callback ${assetKey}: success=${success}. State: ${assetEntry.state}`);
        try {
            if (success) {
                if (assetKey === 'gunshotSound') {
                    if (loadedAssetOrError instanceof Audio) { assetEntry.data = loadedAssetOrError; }
                    else { console.error(`[LM] !!! ${assetKey} success but NOT Audio!`); assetEntry.state = 'error'; }
                } else { // GLTF
                    const sceneObject = loadedAssetOrError?.scene;
                    if (sceneObject && sceneObject instanceof THREE.Object3D) {
                        assetEntry.data = sceneObject; // Store in internal data structure

                        // *** RE-ADDED GLOBAL ASSIGNMENT for mapMesh ***
                        if (assetKey === 'map') {
                            window.mapMesh = sceneObject; // Assign to global mapMesh
                            console.log("[LoadManager] Assigned map data to global 'mapMesh'.");
                            if (scene) scene.add(window.mapMesh); // Add global mapMesh to scene
                        }
                        // *** END RE-ADDED GLOBAL ***
                        else if (assetKey === 'playerModel') {
                            // playerModel is still only stored internally via assetEntry.data
                            assetEntry.data.traverse(c => { if (c.isMesh) { c.castShadow=true; c.receiveShadow=true; } });
                        }
                    } else { console.error(`[LM] !!! GLTF ${assetKey} success but scene invalid!`); assetEntry.state = 'error'; }
                }
            } else { assetEntry.state = 'error'; } // Error reported by loader
        } catch (e) { console.error(`[LM] !!! Error proc ${assetKey}:`, e); assetEntry.state = 'error'; }
        finally {
            const finalData = assetEntry.data; const dataType = finalData==='error'?"'error'":(finalData?`[${finalData.constructor?.name||typeof finalData}]`:String(finalData));
            console.log(`[LoadManager] Final stored data for ${assetKey}: ${dataType}`);
        }
        this.trigger('assetLoaded', { key: assetKey, success: assetEntry.state === 'loaded' });
        this.checkCompletion();
    }, // End _assetLoadedCallback

    checkCompletion: function() {
        let allRequiredDone = true; let anyError = false;
        for (const key of this.requiredForGame) {
            const assetInfo = this.assets[key]; if (!assetInfo) { anyError = true; continue; }
            const assetState = assetInfo.state;
            if (assetState === 'pending' || assetState === 'loading') { allRequiredDone = false; break; }
            // Use isAssetReady (which checks state AND internal data)
            if (!this.isAssetReady(key)) {
                anyError = true;
                console.warn(`[LoadManager] checkCompletion: Problem for asset '${key}'. State: ${assetState}.`);
            }
            // *** ADDED CHECK for global mapMesh specifically ***
            if (key === 'map' && (typeof window.mapMesh === 'undefined' || !window.mapMesh || window.mapMesh === 'error')) {
                 anyError = true;
                 console.error(`[LoadManager] checkCompletion: map asset state is '${assetState}' but global mapMesh is invalid!`);
            }
        }
        if (!allRequiredDone) return;
        console.log(`[LoadManager] FINAL checkCompletion: allDone=${allRequiredDone}, anyError=${anyError}`);
        if (anyError) { this.trigger('error', { m: 'Required assets failed.' }); }
        else { this.trigger('ready'); }
    }, // End checkCompletion

    on: function(evName, cb) { if(!this.eventListeners[evName])this.eventListeners[evName]=[]; this.eventListeners[evName].push(cb); },
    trigger: function(evName, data={}) { if(this.eventListeners[evName]){ this.eventListeners[evName].forEach(cb=>{try{cb(data);}catch(e){console.error(`Listener Error ${evName}:`,e)}});} }
};
window.loadManager = loadManager;
console.log("loadManager.js loaded");

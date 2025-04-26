// docs/loadManager.js

const loadManager = {
    assets: { /* ... Same asset definitions ... */ },
    loaders: {},
    requiredForGame: ['map', 'playerModel', 'gunModel'],
    eventListeners: {'ready': [], 'error': [], 'progress': [], 'assetLoaded': []},

    initializeLoaders: function() { /* ... Same ... */ },
    startLoading: function() { /* ... Same ... */ },
    loadAsset: function(key) { /* ... Same ... */ },
    assetLoaded: function(assetKey, success = true) { // Combined success/error callback source
        console.log(`[LoadManager] Asset Loaded/Error Callback for ${assetKey}. Success: ${success}`);
        if (this.assets[assetKey]) {
             this.assets[assetKey].state = success ? 'loaded' : 'error';
             this.trigger('assetLoaded', {key: assetKey, success: success}); // Keep assetLoaded trigger immediate
             this.checkCompletion(); // Check overall completion
         }
     },
     assetError: function(assetKey, error) { // Can likely be removed if using combined callback
        // console.error(`[LoadManager] !!! ${assetKey} ERR:`, error); // Covered by assetLoaded
        if (this.assets[assetKey]) {
             this.assets[assetKey].state = 'error';
             this.trigger('assetLoaded', {key: assetKey, success: false}); // Signal failure
             this.checkCompletion();
         }
     },

    checkCompletion: function() {
        let done = true, error = false, status = {};
        for (const key of this.requiredForGame) {
             status[key] = this.assets[key]?.state || 'missing';
             if (!this.assets[key] || status[key] === 'pending' || status[key] === 'loading') { done = false; }
             if (status[key] === 'error') { error = true; }
        }
        // console.log(`[LoadManager] Completion Check - Done: ${done}, Error: ${error}`, status); // Reduce noise

        if (done) {
             if (error) {
                  console.error("[LoadManager] Required assets FAIL.");
                  // Use setTimeout to ensure error event listeners can be attached
                  setTimeout(() => { this.trigger('error', {m:'Asset Fail'}); }, 0);
             } else {
                  console.log("[LoadManager] Required assets READY. Triggering 'ready' event soon...");
                  // *** Use setTimeout to trigger 'ready' slightly later ***
                  setTimeout(() => {
                        console.log("[LoadManager] Emitting 'ready' event.");
                        this.trigger('ready');
                   }, 10); // Small delay (10ms) to ensure listeners are attached
             }
        }
    },

     on: function(evName, cb) { if(this.eventListeners[evName]) this.eventListeners[evName].push(cb); else console.warn(`[LoadManager] Listener added for unknown event: ${evName}`);},
     trigger: function(evName, data={}) { if(this.eventListeners[evName]) this.eventListeners[evName].forEach(cb => { try { cb(data); } catch(e){ console.error(`Error in listener for ${evName}:`, e)} }); }
};
console.log("loadManager.js loaded");

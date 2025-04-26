// docs/network.js

const Network = {
    init: function() { this.setupSocketIO(); console.log("[Network] Initialized."); },
    isConnected: function() { return socket?.connected || false; },

    setupSocketIO: function() {
        if (typeof CONFIG === 'undefined' || !CONFIG.SERVER_URL) { console.error("! Network Config missing!"); return; }
        console.log(`Connect: ${CONFIG.SERVER_URL}`);
        socket = io(CONFIG.SERVER_URL,{transports:['websocket'],autoConnect:true});

        // --- Socket Event Listeners ---
        socket.on('connect', function(){console.log('Socket OK! ID:',socket.id); if(typeof checkAssetsReady === 'function') checkAssetsReady();});
        socket.on('disconnect', function(reason){console.warn('Disconnected:',reason); if(typeof stateMachine !== 'undefined') stateMachine.transitionTo('homescreen',{playerCount:0}); if(typeof infoDiv !== 'undefined' && infoDiv) infoDiv.textContent='Disconnected'; for(const id in players) if(typeof removePlayerMesh === 'function') removePlayerMesh(id); players={}; bullets=[];});
        socket.on('connect_error', function(err){console.error('Connect Err:',err.message); if(typeof loadManager!=='undefined'){mapLoadState='error'; playerModelLoadState='error'; gunModelLoadState='error'; assetsReady=false;} if(typeof stateMachine !== 'undefined') stateMachine.transitionTo('loading',{message:`Connect Fail!<br/>${err.message}`,error:true});});
        socket.on('playerCountUpdate', function(count){ const pCSElement = document.getElementById('playerCount'); if(pCSElement) pCSElement.textContent = count; else console.warn("playerCountSpan missing!");});
        socket.on('initialize', function(data){ Network.handleInitialize(data); });
        socket.on('playerJoined', function(d){ Network.handlePlayerJoined(d); });
        socket.on('playerLeft', function(id){ Network.handlePlayerLeft(id); });
        socket.on('gameStateUpdate', function(d){ Network.handleGameStateUpdate(d); });
        socket.on('shotFired', function(d){ Network.handleShotFired(d); });
        socket.on('healthUpdate', function(d){ Network.handleHealthUpdate(d); });
        socket.on('playerDied', function(d){ Network.handlePlayerDied(d); });
        socket.on('playerRespawned', function(d){ Network.handlePlayerRespawned(d); });
        socket.onAny(function(eventName, ...args) { if (eventName !== 'gameStateUpdate' && eventName !== 'playerMoved') console.log(`DEBUG Event: ${eventName}`); });
        socket.on('ping', function(data){ console.log(">>> NET: Received 'ping'", data); });

        console.log("Socket listeners attached inside Network.setupSocketIO.");
    }, // End setupSocketIO


    // --- Handlers for Server Events ---
    handleGameStateUpdate: function(state) { /* ... Same ... */ },
    handleInitialize: function(data) { /* ... Same ... */ },
    handlePlayerJoined: function(pD) { /* ... Same ... */ },
    handlePlayerLeft: function(pId) { /* ... Same ... */ },
    handleHealthUpdate: function(data) { /* ... Same ... */ },
    handlePlayerDied: function(data) { /* ... Same ... */ },
    handlePlayerRespawned: function(pD) { /* ... Same ... */ },
    handleShotFired: function(d){ if(typeof spawnBullet === 'function') spawnBullet(d); else console.error("spawnBullet missing!"); },


     // --- Actions Sent To Server ---
     attemptJoinGame: function() {
         console.log("--- attemptJoinGame called ---");
         // Ensure global element refs are set (should be by core.js->init)
         if (!playerNameInput || !playerPhraseInput || !homeScreenError) { console.error("! UI elements missing for attemptJoinGame!"); return; }

         localPlayerName = playerNameInput.value.trim() || 'Anonymous';
         localPlayerPhrase = playerPhraseInput.value.trim() || '...';
         if (!localPlayerName){homeScreenError.textContent='Enter name';return;} if(localPlayerPhrase.length>20){homeScreenError.textContent='Phrase too long';return;} homeScreenError.textContent='';

         // *** CHECK ASSET STATUS DIRECTLY VIA LoadManager ***
         let currentAssetsReady = false;
         let criticalAssetError = false;
         if (typeof loadManager !== 'undefined') {
            const mapOk = loadManager.assets.map?.state === 'loaded';
            const pModelOk = loadManager.assets.playerModel?.state === 'loaded';
            const gModelOk = loadManager.assets.gunModel?.state === 'loaded'; // Check gun too
            currentAssetsReady = mapOk && pModelOk && gModelOk; // Require all defined assets

            criticalAssetError = loadManager.assets.map?.state === 'error' ||
                                 loadManager.assets.playerModel?.state === 'error' ||
                                 loadManager.assets.gunModel?.state === 'error';
            console.log(`Attempting Join | Current Asset States: Map=${loadManager.assets.map?.state}, PModel=${loadManager.assets.playerModel?.state}, GModel=${loadManager.assets.gunModel?.state}`);
         } else {
            console.error("LoadManager not available to check asset status!");
            criticalAssetError = true; // Assume failure if manager missing
         }
         // ***************************************************

         if (criticalAssetError) {
            console.error("Cannot join because critical assets failed to load earlier.");
            homeScreenError.textContent = 'Asset error. Cannot join.';
            return; // Stop if assets definitively failed previously
         }

         console.log(`Joining as "${localPlayerName}" | Assets Check Passed: ${currentAssetsReady}`);
         if(typeof stateMachine!=='undefined') stateMachine.transitionTo('joining',{waitingForAssets:!currentAssetsReady}); else console.error("stateMachine missing!");

         if(currentAssetsReady){ // Use the locally checked status
             Network.sendJoinDetails(); // Assets were already ready
         } else {
             console.log("Waiting for assets..."); // checkAssetsReady will call sendJoinDetails later via event
         }
     }, // End attemptJoinGame

     sendJoinDetails: function() { /* ... Same as Response #73 ... */ },
     sendPlayerUpdate: function(updateData) { /* ... Same as Response #73 ... */ },
     sendShoot: function(shootData) { /* ... Same as Response #73 ... */ },
     sendHit: function(targetId, damage) { /* ... Same as Response #73 ... */ },
     sendVoidDeath: function() { /* ... Same as Response #73 ... */ }

}; // End Network object

// Export Network object to global scope
window.Network = Network;

console.log("network.js loaded");

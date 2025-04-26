// docs/network.js

// Needs access to globals and functions from other files
// Specifically needs CONFIG from config.js

const Network = {
    // socket: null // Can be kept global for now

    init: function() {
        // Call setupSocketIO during network initialization
        this.setupSocketIO();
        console.log("[Network] Initialized.");
    },

    isConnected: function() {
      return socket?.connected || false;
    },

    setupSocketIO: function() {
        // Check if CONFIG object exists
        if (typeof CONFIG === 'undefined' || typeof CONFIG.SERVER_URL === 'undefined') {
             console.error("!!! CRITICAL: CONFIG or CONFIG.SERVER_URL not defined! Check config.js load order.");
             if(typeof stateMachine !== 'undefined') stateMachine.transitionTo('loading',{message:"Network Config Error!",error:true});
             return;
        }
        console.log(`Connect: ${CONFIG.SERVER_URL}`); // <<< USE CONFIG.SERVER_URL
        socket=io(CONFIG.SERVER_URL,{transports:['websocket'],autoConnect:true}); // <<< USE CONFIG.SERVER_URL

        // --- Socket Event Listeners --- (using CONFIG for consistency if needed elsewhere)
        socket.on('connect', function(){console.log('Socket OK! ID:',socket.id); if(typeof checkAssetsReady === 'function') checkAssetsReady();});
        socket.on('disconnect', function(reason){console.warn('Disconnected:',reason); if(typeof stateMachine !== 'undefined') stateMachine.transitionTo('homescreen',{playerCount:0}); if(typeof infoDiv !== 'undefined' && infoDiv) infoDiv.textContent='Disconnected'; for(const id in players) if(typeof removePlayerMesh === 'function') removePlayerMesh(id); players={}; bullets=[]; });
        socket.on('connect_error', function(err){console.error('Connect Err:',err.message); mapLoadState='error'; playerModelLoadState='error'; gunModelLoadState = 'error'; assetsReady=false; if(typeof stateMachine !== 'undefined') stateMachine.transitionTo('loading',{message:`Connect Fail!<br/>${err.message}`,error:true});});
        socket.on('playerCountUpdate', function(count){playerCountSpan=playerCountSpan||document.getElementById('playerCount'); if(playerCountSpan)playerCountSpan.textContent=count; /* Removed state logic */});
        socket.on('initialize', function(data){ if(typeof Network.handleInitialize === 'function') Network.handleInitialize(data); });
        socket.on('playerJoined', function(d){ if(typeof Network.handlePlayerJoined === 'function') Network.handlePlayerJoined(d); });
        socket.on('playerLeft', function(id){ if(typeof Network.handlePlayerLeft === 'function') Network.handlePlayerLeft(id); });
        socket.on('gameStateUpdate', function(d){ if(typeof Network.handleGameStateUpdate === 'function') Network.handleGameStateUpdate(d); });
        socket.on('shotFired', function(d){ if(typeof Network.handleShotFired === 'function') Network.handleShotFired(d); });
        socket.on('healthUpdate', function(d){ if(typeof Network.handleHealthUpdate === 'function') Network.handleHealthUpdate(d); });
        socket.on('playerDied', function(d){ if(typeof Network.handlePlayerDied === 'function') Network.handlePlayerDied(d); });
        socket.on('playerRespawned', function(d){ if(typeof Network.handlePlayerRespawned === 'function') Network.handlePlayerRespawned(d); });
        socket.onAny(function(eventName, ...args) { if (eventName !== 'gameStateUpdate') console.log(`DEBUG Event: ${eventName}`); });
        socket.on('ping', function(data){ console.log(">>> NET: Received 'ping' from server!", data); });

        console.log("Socket listeners attached inside Network.setupSocketIO.");
    }, // End setupSocketIO


    // --- Handlers for Server Events (now methods of Network) ---
    handleGameStateUpdate: function(state) { /* ... Same as previous ... */ },
    handleInitialize: function(data) { /* ... Same as previous ... */ },
    handlePlayerJoined: function(pD) { /* ... Same ... */ },
    handlePlayerLeft: function(pId) { /* ... Same ... */ },
    handleHealthUpdate: function(data) { /* ... Same ... */ },
    handlePlayerDied: function(data) { /* ... Same ... */ },
    handlePlayerRespawned: function(pD) { /* ... Same ... */ },
    handleShotFired: function(d){ if(typeof spawnBullet === 'function') spawnBullet(d); else console.error("spawnBullet missing!"); },


     // --- Actions Sent To Server (now methods of Network) ---
     attemptJoinGame: function() {
         // Ensure UI elements are available (may have been cleared)
         playerNameInput = playerNameInput || document.getElementById('playerNameInput');
         playerPhraseInput = playerPhraseInput || document.getElementById('playerPhraseInput');
         homeScreenError = homeScreenError || document.getElementById('homeScreenError');
         if(!playerNameInput || !playerPhraseInput || !homeScreenError) return; // Exit if elements are gone

         localPlayerName = playerNameInput.value.trim() || 'Anonymous';
         localPlayerPhrase = playerPhraseInput.value.trim() || '...';
         if (!localPlayerName){homeScreenError.textContent='Enter name';return;} if(localPlayerPhrase.length>20){homeScreenError.textContent='Phrase too long';return;} homeScreenError.textContent='';
         console.log(`Joining as "${localPlayerName}" | Assets Ready: ${assetsReady}`);
         if(typeof stateMachine !== 'undefined') stateMachine.transitionTo('joining',{waitingForAssets:!assetsReady});
         if(assetsReady){ Network.sendJoinDetails(); } else console.log("Wait assets..."); // Use Network.sendJoinDetails
     },

     sendJoinDetails: function() {
         console.log("--- sendJoinDetails called ---");
         if(socket?.connected && stateMachine.is('joining')){
             console.log("Socket connected & joining state OK. Emitting setPlayerDetails...");
             socket.emit('setPlayerDetails',{name:localPlayerName,phrase:localPlayerPhrase});
         } else if (!stateMachine.is('joining')){
              console.warn("! Aborting sendDetails: No longer in 'joining' state.");
              if(typeof stateMachine !== 'undefined') stateMachine.transitionTo('homescreen',{playerCount:playerCountSpan?.textContent??'?'});
         } else {
             console.error("! Aborting sendDetails: Socket not connected.");
              homeScreenError = homeScreenError || document.getElementById('homeScreenError');
             if(homeScreenError) homeScreenError.textContent = 'Connection lost.';
              if(typeof stateMachine !== 'undefined') stateMachine.transitionTo('homescreen',{playerCount:playerCountSpan?.textContent??'?'});
         }
     },

      sendPlayerUpdate: function(updateData) { if(socket?.connected && stateMachine.is('playing')) { socket.emit('playerUpdate', updateData); } },
      sendShoot: function(shootData) { if(socket?.connected && stateMachine.is('playing')) { socket.emit('shoot', shootData); } },
      sendHit: function(targetId, damage) { if(socket?.connected && stateMachine.is('playing')) { socket.emit('hit', {targetId: targetId, damage: damage}); } },
      sendVoidDeath: function() { if(socket?.connected && stateMachine.is('playing')) { socket.emit('fellIntoVoid'); } }
}; // End Network object

console.log("network.js loaded");

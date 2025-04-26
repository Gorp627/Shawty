// docs/network.js

// Needs access to globals and functions from other files

const Network = { // Keep as const within this file scope
    // socket: null // Store socket reference if needed within methods

    init: function() {
        this.setupSocketIO();
        console.log("[Network] Initialized.");
    },

    isConnected: function() {
      return socket?.connected || false;
    },

    setupSocketIO: function() {
        if (typeof CONFIG === 'undefined' || !CONFIG.SERVER_URL) { console.error("! Network Config missing!"); return; }
        console.log(`Connect: ${CONFIG.SERVER_URL}`);
        socket = io(CONFIG.SERVER_URL,{transports:['websocket'],autoConnect:true}); // socket is still global here

        socket.on('connect', function(){console.log('Socket OK! ID:',socket.id); if(typeof checkAssetsReady === 'function') checkAssetsReady();});
        socket.on('disconnect', function(reason){console.warn('Disconnected:',reason); if(typeof stateMachine !== 'undefined') stateMachine.transitionTo('homescreen',{playerCount:0}); if(typeof infoDiv !== 'undefined' && infoDiv) infoDiv.textContent='Disconnected'; for(const id in players) if(typeof removePlayerMesh === 'function') removePlayerMesh(id); players={}; bullets=[]; });
        socket.on('connect_error', function(err){console.error('Connect Err:',err.message); mapLoadState='error'; playerModelLoadState='error'; gunModelLoadState = 'error'; assetsReady=false; if(typeof stateMachine !== 'undefined') stateMachine.transitionTo('loading',{message:`Connect Fail!<br/>${err.message}`,error:true});});
        socket.on('playerCountUpdate', function(count){playerCountSpan=playerCountSpan||document.getElementById('playerCount'); if(playerCountSpan)playerCountSpan.textContent=count; });
        socket.on('initialize', function(data){ Network.handleInitialize(data); }); // Call method
        socket.on('playerJoined', function(d){ Network.handlePlayerJoined(d); }); // Call method
        socket.on('playerLeft', function(id){ Network.handlePlayerLeft(id); });   // Call method
        socket.on('gameStateUpdate', function(d){ Network.handleGameStateUpdate(d); }); // Call method
        socket.on('shotFired', function(d){ Network.handleShotFired(d); });         // Call method
        socket.on('healthUpdate', function(d){ Network.handleHealthUpdate(d); }); // Call method
        socket.on('playerDied', function(d){ Network.handlePlayerDied(d); });       // Call method
        socket.on('playerRespawned', function(d){ Network.handlePlayerRespawned(d); }); // Call method
        socket.onAny(function(eventName, ...args) { if (eventName !== 'gameStateUpdate') console.log(`DEBUG Event: ${eventName}`); });
        socket.on('ping', function(data){ console.log(">>> NET: Received 'ping' from server!", data); });

        console.log("Socket listeners attached inside Network.setupSocketIO.");
    }, // End setupSocketIO

    // --- Handlers (as methods) ---
    handleGameStateUpdate: function(state) { /* ... Same logic ... */ },
    handleInitialize: function(data) { /* ... Same logic ... */ },
    handlePlayerJoined: function(pD) { /* ... Same logic ... */ },
    handlePlayerLeft: function(pId) { /* ... Same logic ... */ },
    handleHealthUpdate: function(data) { /* ... Same logic ... */ },
    handlePlayerDied: function(data) { /* ... Same logic ... */ },
    handlePlayerRespawned: function(pD) { /* ... Same logic ... */ },
    handleShotFired: function(d){ if(typeof spawnBullet === 'function') spawnBullet(d); else console.error("spawnBullet missing!"); },

    // --- Actions (as methods) ---
     attemptJoinGame: function() { /* ... Same logic ... */ },
     sendJoinDetails: function() { /* ... Same logic ... */ },
     sendPlayerUpdate: function(updateData) { if(socket?.connected && stateMachine.is('playing')) { socket.emit('playerUpdate', updateData); } },
     sendShoot: function(shootData) { if(socket?.connected && stateMachine.is('playing')) { socket.emit('shoot', shootData); } },
     sendHit: function(targetId, damage) { if(socket?.connected && stateMachine.is('playing')) { socket.emit('hit', {targetId: targetId, damage: damage}); } },
     sendVoidDeath: function() { if(socket?.connected && stateMachine.is('playing')) { socket.emit('fellIntoVoid'); } }

}; // End Network object

// <<< EXPORT TO GLOBAL SCOPE >>>
window.Network = Network;
// <<< ------------------------ >>>

console.log("network.js loaded");

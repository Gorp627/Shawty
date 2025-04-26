// docs/network.js

// Needs access to globals and functions from other files
// Specifically needs CONFIG from config.js

const Network = {
    // socket: null // Can be kept global for now

    init: function() {
        this.setupSocketIO();
        console.log("[Network] Initialized.");
    },

    isConnected: function() {
      return socket?.connected || false;
    },

    setupSocketIO: function() {
        // Check if CONFIG object exists
        if (typeof CONFIG === 'undefined' || typeof CONFIG.SERVER_URL === 'undefined') {
             console.error("!!! CRITICAL: CONFIG or CONFIG.SERVER_URL not defined!");
             if(typeof stateMachine !== 'undefined') stateMachine.transitionTo('loading',{message:"Network Config Error!",error:true});
             return;
        }
        console.log(`Connect: ${CONFIG.SERVER_URL}`);
        socket=io(CONFIG.SERVER_URL,{transports:['websocket'],autoConnect:true});

        // --- Socket Event Listeners ---
        socket.on('connect', function(){console.log('Socket OK! ID:',socket.id); if(typeof checkAssetsReady === 'function') checkAssetsReady();});
        socket.on('disconnect', function(reason){console.warn('Disconnected:',reason); if(typeof stateMachine !== 'undefined') stateMachine.transitionTo('homescreen',{playerCount:0}); if(typeof infoDiv !== 'undefined' && infoDiv) infoDiv.textContent='Disconnected'; for(const id in players) if(typeof removePlayerMesh === 'function') removePlayerMesh(id); players={}; bullets=[];});
        socket.on('connect_error', function(err){console.error('Connect Err:',err.message); mapLoadState='error'; playerModelLoadState='error'; gunModelLoadState = 'error'; assetsReady=false; if(typeof stateMachine !== 'undefined') stateMachine.transitionTo('loading',{message:`Connect Fail!<br/>${err.message}`,error:true});});

        // *** CORRECTED PLAYER COUNT HANDLER ***
        socket.on('playerCountUpdate', function(count){
            // console.log(`Player count update received: ${count}`); // Reduce noise
            // Get element reference INSIDE the handler
            const playerCountSpanElement = document.getElementById('playerCount');
            // Check if element was found BEFORE trying to update it
            if (playerCountSpanElement) {
                playerCountSpanElement.textContent = count;
                // console.log("Updated playerCountSpan content."); // Reduce noise
            } else {
                console.warn("playerCountSpan element not found when trying to update count!");
            }
            // Homescreen transition is now handled by loadManager/socket connect checks
        });
        // ***********************************

        socket.on('initialize', function(data){ Network.handleInitialize(data); });
        socket.on('playerJoined', function(d){ Network.handlePlayerJoined(d); });
        socket.on('playerLeft', function(id){ Network.handlePlayerLeft(id); });
        socket.on('gameStateUpdate', function(d){ Network.handleGameStateUpdate(d); });
        socket.on('shotFired', function(d){ Network.handleShotFired(d); });
        socket.on('healthUpdate', function(d){ Network.handleHealthUpdate(d); });
        socket.on('playerDied', function(d){ Network.handlePlayerDied(d); });
        socket.on('playerRespawned', function(d){ Network.handlePlayerRespawned(d); });
        socket.onAny(function(eventName, ...args) { if (eventName !== 'gameStateUpdate') console.log(`DEBUG Event: ${eventName}`); });
        socket.on('ping', function(data){ console.log(">>> NET: Received 'ping' from server!", data); });

        console.log("Socket listeners attached inside Network.setupSocketIO.");
    }, // End setupSocketIO


    // --- Handlers (as methods) ---
    handleGameStateUpdate: function(state) { /* ... Same as Response #69 ... */ },
    handleInitialize: function(data) { /* ... Same as Response #69 ... */ },
    handlePlayerJoined: function(pD) { /* ... Same as Response #69 ... */ },
    handlePlayerLeft: function(pId) { /* ... Same as Response #69 ... */ },
    handleHealthUpdate: function(data) { /* ... Same as Response #69 ... */ },
    handlePlayerDied: function(data) { /* ... Same as Response #69 ... */ },
    handlePlayerRespawned: function(pD) { /* ... Same as Response #69 ... */ },
    handleShotFired: function(d){ if(typeof spawnBullet === 'function') spawnBullet(d); else console.error("spawnBullet missing!"); },


     // --- Actions (as methods) ---
     attemptJoinGame: function() { /* ... Same as Response #69 ... */ },
     sendJoinDetails: function() { /* ... Same as Response #69 ... */ },
     sendPlayerUpdate: function(updateData) { /* ... Same as Response #69 ... */ },
     sendShoot: function(shootData) { /* ... Same as Response #69 ... */ },
     sendHit: function(targetId, damage) { /* ... Same as Response #69 ... */ },
     sendVoidDeath: function() { /* ... Same as Response #69 ... */ }

}; // End Network object

// <<< EXPORT TO GLOBAL SCOPE >>>
window.Network = Network;
// <<< ------------------------ >>>

console.log("network.js loaded");

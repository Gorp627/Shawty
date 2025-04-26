// docs/network.js

// ... (Network object definition and other methods like handleInitialize, attemptJoinGame, etc.) ...
// Keep the full Network object structure from Response #73

const Network = {
    init: function() { this.setupSocketIO(); console.log("[Network] Initialized."); },
    isConnected: function() { return socket?.connected || false; },

    setupSocketIO: function() {
        if (typeof CONFIG === 'undefined' || !CONFIG.SERVER_URL) { console.error("! Network Config missing!"); return; }
        console.log(`Connect: ${CONFIG.SERVER_URL}`);
        socket = io(CONFIG.SERVER_URL,{transports:['websocket'],autoConnect:true});

        // --- RAW Socket Event Listeners with logs first ---
        socket.on('connect', function(){
             console.log(">>> RAW Socket Event: 'connect'"); // <<< ADD RAW LOG
             console.log('Socket OK! ID:',socket.id);
             if(typeof checkAssetsReady === 'function') checkAssetsReady();
             else console.error("checkAssetsReady missing!");
        });
        socket.on('disconnect', function(reason){
             console.log(">>> RAW Socket Event: 'disconnect'", reason); // <<< ADD RAW LOG
             console.warn('Disconnected:',reason);
             if(typeof stateMachine !== 'undefined') stateMachine.transitionTo('homescreen',{playerCount:0});
             if(typeof infoDiv !== 'undefined' && infoDiv) infoDiv.textContent='Disconnected';
             for(const id in players) if(typeof removePlayerMesh === 'function') removePlayerMesh(id);
             players={}; bullets=[];
        });
        socket.on('connect_error', function(err){
             console.log(">>> RAW Socket Event: 'connect_error'", err); // <<< ADD RAW LOG
             console.error('Connect Err:',err.message);
             mapLoadState='error'; playerModelLoadState='error'; gunModelLoadState = 'error'; assetsReady=false;
             if(typeof stateMachine !== 'undefined') stateMachine.transitionTo('loading',{message:`Connect Fail!<br/>${err.message}`,error:true});
        });
        socket.on('playerCountUpdate', function(count){
             console.log(">>> RAW Socket Event: 'playerCountUpdate'", count); // <<< ADD RAW LOG
             playerCountSpan=playerCountSpan||document.getElementById('playerCount');
             if(playerCountSpan)playerCountSpan.textContent=count;
             // Do NOT change state here anymore
        });
        // --------------------------------------------------

        // Game Logic Event Listeners (calling handlers)
        socket.on('initialize', function(d){ console.log(">>> RAW Socket Event: 'initialize'"); if(typeof Network.handleInitialize === 'function') Network.handleInitialize(d);});
        socket.on('playerJoined', function(d){ console.log(">>> RAW Socket Event: 'playerJoined'"); if(typeof Network.handlePlayerJoined === 'function') Network.handlePlayerJoined(d);});
        socket.on('playerLeft', function(id){ console.log(">>> RAW Socket Event: 'playerLeft'"); if(typeof Network.handlePlayerLeft === 'function') Network.handlePlayerLeft(id);});
        socket.on('gameStateUpdate', function(d){ /* console.log(">>> RAW Socket Event: 'gameStateUpdate'"); */ if(typeof Network.handleGameStateUpdate === 'function') Network.handleGameStateUpdate(d);}); // Too noisy
        socket.on('shotFired', function(d){ console.log(">>> RAW Socket Event: 'shotFired'"); if(typeof Network.handleShotFired === 'function') Network.handleShotFired(d);});
        socket.on('healthUpdate', function(d){ console.log(">>> RAW Socket Event: 'healthUpdate'"); if(typeof Network.handleHealthUpdate === 'function') Network.handleHealthUpdate(d);});
        socket.on('playerDied', function(d){ console.log(">>> RAW Socket Event: 'playerDied'"); if(typeof Network.handlePlayerDied === 'function') Network.handlePlayerDied(d);});
        socket.on('playerRespawned', function(d){ console.log(">>> RAW Socket Event: 'playerRespawned'"); if(typeof Network.handlePlayerRespawned === 'function') Network.handlePlayerRespawned(d);});
        socket.onAny(function(eventName, ...args) { if (eventName !== 'gameStateUpdate' && eventName !== 'playerMoved') console.log(`DEBUG Any Event: ${eventName}`); }); // Reduce noise
        socket.on('ping', function(data){ console.log(">>> RAW Socket Event: 'ping'", data); });

        console.log("Socket listeners attached inside Network.setupSocketIO.");
    }, // End setupSocketIO

    // --- Methods for Handlers & Actions ---
    handleGameStateUpdate: function(state) { /* ... Same logic ... */ },
    handleInitialize: function(data) { /* ... Same logic ... */ },
    handlePlayerJoined: function(pD) { /* ... Same logic ... */ },
    handlePlayerLeft: function(pId) { /* ... Same logic ... */ },
    handleHealthUpdate: function(data) { /* ... Same logic ... */ },
    handlePlayerDied: function(data) { /* ... Same logic ... */ },
    handlePlayerRespawned: function(pD) { /* ... Same logic ... */ },
    handleShotFired: function(d){ if(typeof spawnBullet === 'function') spawnBullet(d); },
    attemptJoinGame: function() { /* ... Same logic ... */ },
    sendJoinDetails: function() { /* ... Same logic ... */ },
    sendPlayerUpdate: function(updateData) { /* ... Same logic ... */ },
    sendShoot: function(shootData) { /* ... Same logic ... */ },
    sendHit: function(targetId, damage) { /* ... Same logic ... */ },
    sendVoidDeath: function() { /* ... Same logic ... */ }

}; // End Network object

window.Network = Network; // Export to global

console.log("network.js loaded");

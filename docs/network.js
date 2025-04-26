// docs/network.js

// Needs access to globals and functions from other files
// Specifically needs CONFIG from config.js
// Accesses global UI element vars set in core.js init: playerNameInput, playerPhraseInput, homeScreenError, playerCountSpan, infoDiv
// Accesses global state vars: localPlayerName, localPlayerPhrase, assetsReady, gameState, players, bullets, localPlayerId
// Accesses global objects: stateMachine, socket (defined here), THREE (if needed), Input (if needed)
// Calls functions defined elsewhere: checkAssetsReady, setGameState, removePlayerMesh, handleInitialize, addPlayer, updateRemotePlayerPosition, spawnBullet, updateHealthBar, showKillMessage, handlePlayerJoined, handlePlayerLeft, handleHealthUpdate, handlePlayerDied, handlePlayerRespawned

const Network = {
    // socket: null // Socket is global for now

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
        socket = io(CONFIG.SERVER_URL,{transports:['websocket'],autoConnect:true});

        // --- Socket Event Listeners ---
        socket.on('connect', function(){console.log('Socket OK! ID:',socket.id); if(typeof checkAssetsReady === 'function') checkAssetsReady();});
        socket.on('disconnect', function(reason){console.warn('Disconnected:',reason); if(typeof stateMachine !== 'undefined') stateMachine.transitionTo('homescreen',{playerCount:0}); if(typeof infoDiv !== 'undefined' && infoDiv) infoDiv.textContent='Disconnected'; for(const id in players) if(typeof removePlayerMesh === 'function') removePlayerMesh(id); players={}; bullets=[];});
        socket.on('connect_error', function(err){console.error('Connect Err:',err.message); mapLoadState='error'; playerModelLoadState='error'; gunModelLoadState = 'error'; assetsReady=false; if(typeof stateMachine !== 'undefined') stateMachine.transitionTo('loading',{message:`Connect Fail!<br/>${err.message}`,error:true});});
        socket.on('playerCountUpdate', function(count){ const pCSElement = document.getElementById('playerCount'); if (pCSElement) pCSElement.textContent = count; else console.warn("playerCountSpan element not found in event!"); }); // Get element inside handler
        socket.on('initialize', function(data){ Network.handleInitialize(data); });
        socket.on('playerJoined', function(d){ Network.handlePlayerJoined(d); });
        socket.on('playerLeft', function(id){ Network.handlePlayerLeft(id); });
        socket.on('gameStateUpdate', function(d){ Network.handleGameStateUpdate(d); });
        socket.on('shotFired', function(d){ Network.handleShotFired(d); });
        socket.on('healthUpdate', function(d){ Network.handleHealthUpdate(d); });
        socket.on('playerDied', function(d){ Network.handlePlayerDied(d); });
        socket.on('playerRespawned', function(d){ Network.handlePlayerRespawned(d); });
        socket.onAny(function(eventName, ...args) { if (eventName !== 'gameStateUpdate' && eventName !== 'playerMoved') console.log(`DEBUG Event: ${eventName}`); }); // Reduce logging noise
        socket.on('ping', function(data){ console.log(">>> NET: Received 'ping' from server!", data); });

        console.log("Socket listeners attached inside Network.setupSocketIO.");
    }, // End setupSocketIO


    // --- Handlers for Server Events (now methods of Network) ---
    handleGameStateUpdate: function(state) { /* ... Same as Response #69/73 ... */ },
    handleInitialize: function(data) { /* ... Same as Response #69/73 ... */ },
    handlePlayerJoined: function(pD) { /* ... Same as Response #69/73 ... */ },
    handlePlayerLeft: function(pId) { /* ... Same as Response #69/73 ... */ },
    handleHealthUpdate: function(data) { /* ... Same as Response #69/73 (with logs) ... */ },
    handlePlayerDied: function(data) { /* ... Same as Response #69/73 (with logs) ... */ },
    handlePlayerRespawned: function(pD) { /* ... Same as Response #69/73 ... */ },
    handleShotFired: function(d){ if(typeof spawnBullet === 'function') spawnBullet(d); else console.error("spawnBullet missing!"); },


     // --- Actions Sent To Server (now methods of Network) ---
     attemptJoinGame: function() {
         console.log("--- attemptJoinGame called ---");
         // *** Use globally assigned element variables (assigned in core.js init) ***
         // *** REMOVED call to getUIElements() here ***
         if (!playerNameInput || !playerPhraseInput || !homeScreenError) {
             console.error("!!! UI elements (playerNameInput, etc.) missing for attemptJoinGame! Did init fail?");
             return; // Stop if essential elements weren't found initially by core.js
         }
         // *** ----------------------------------------------------------------- ***

         localPlayerName = playerNameInput.value.trim() || 'Anonymous';
         localPlayerPhrase = playerPhraseInput.value.trim() || '...';
         if (!localPlayerName){homeScreenError.textContent='Enter name';return;} if(localPlayerPhrase.length>20){homeScreenError.textContent='Phrase too long';return;} homeScreenError.textContent='';

         console.log(`Attempting Join as "${localPlayerName}" | Assets Ready: ${assetsReady}`);
         if(typeof stateMachine!=='undefined') stateMachine.transitionTo('joining',{waitingForAssets:!assetsReady}); else console.error("stateMachine missing!");

         if(assetsReady){
             Network.sendJoinDetails(); // Call internal method if assets ready
         } else {
             console.log("Wait assets..."); // checkAssetsReady will call sendJoinDetails later
         }
     }, // End attemptJoinGame

     sendJoinDetails: function() { /* ... Same as Response #73 ... */ },
     sendPlayerUpdate: function(updateData) { /* ... Same as Response #73 ... */ },
     sendShoot: function(shootData) { /* ... Same as Response #73 ... */ },
     sendHit: function(targetId, damage) { /* ... Same as Response #73 ... */ },
     sendVoidDeath: function() { /* ... Same as Response #73 ... */ }

}; // End Network object

// Export Network object to global scope so game.js can call Network.init() etc.
window.Network = Network;

console.log("network.js loaded");

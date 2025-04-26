// docs/network.js

// Needs access to globals and functions from other files
// Specifically needs CONFIG from config.js
// Accesses global UI element vars set in core.js init: playerNameInput, playerPhraseInput, homeScreenError, playerCountSpan, infoDiv
// Accesses global state vars: localPlayerName, localPlayerPhrase, assetsReady, gameState, players, bullets, localPlayerId
// Accesses global objects: stateMachine, socket (defined here), THREE (if needed), Input (if needed)
// Calls functions defined elsewhere: checkAssetsReady, setGameState, removePlayerMesh, handleInitialize, addPlayer, updateRemotePlayerPosition, spawnBullet, updateHealthBar, showKillMessage, handlePlayerJoined, handlePlayerLeft, handleHealthUpdate, handlePlayerDied, handlePlayerRespawned

const Network = {
    // socket: null // Socket is currently global, defined in setupSocketIO

    init: function() {
        this.setupSocketIO();
        console.log("[Network] Initialized.");
    },

    isConnected: function() {
      return socket?.connected || false;
    },

    setupSocketIO: function() {
        // Check if CONFIG object exists before using it
        if (typeof CONFIG === 'undefined' || typeof CONFIG.SERVER_URL === 'undefined') {
             console.error("!!! CRITICAL: CONFIG or CONFIG.SERVER_URL not defined! Check config.js load order.");
             // Attempt to show error state if possible
             if(typeof stateMachine !== 'undefined') stateMachine.transitionTo('loading',{message:"Network Config Error!",error:true});
             return;
        }
        console.log(`Connect: ${CONFIG.SERVER_URL}`);
        // Initialize the global socket variable
        socket = io(CONFIG.SERVER_URL, { transports: ['websocket'], autoConnect: true });

        // --- Socket Event Listeners ---
        socket.on('connect', function() {
            console.log('Socket OK! ID:', socket.id);
            // Check if assets are ready WHEN socket connects
            if (typeof checkAssetsReady === 'function') checkAssetsReady();
            else console.error("checkAssetsReady missing!");
        });
        socket.on('disconnect', function(reason) {
            console.warn('Disconnected:', reason);
            if (typeof stateMachine !== 'undefined') stateMachine.transitionTo('homescreen', { playerCount: 0 });
            // Clean up game state on disconnect
            if (typeof infoDiv !== 'undefined' && infoDiv) infoDiv.textContent = 'Disconnected';
            for (const id in players) {
                if (typeof removePlayerMesh === 'function') removePlayerMesh(id);
                else console.error("removePlayerMesh missing!");
            }
            players = {};
            bullets = [];
        });
        socket.on('connect_error', function(err) {
            console.error('Connect Err:', err.message);
            mapLoadState = 'error'; playerModelLoadState = 'error'; gunModelLoadState = 'error'; assetsReady = false;
            if (typeof stateMachine !== 'undefined') stateMachine.transitionTo('loading', { message: `Connect Fail!<br/>${err.message}`, error: true });
        });
        socket.on('playerCountUpdate', function(count) {
            // Get element reference INSIDE the handler for safety
            const playerCountSpanElement = document.getElementById('playerCount');
            if (playerCountSpanElement) { playerCountSpanElement.textContent = count; }
            else { console.warn("playerCountSpan element not found when trying to update count!"); }
            // State transition handled elsewhere (on connect/asset ready)
        });
        socket.on('initialize', function(data) { if(typeof Network.handleInitialize === 'function') Network.handleInitialize(data); else console.error("Network.handleInitialize missing!"); });
        socket.on('playerJoined', function(d){ if(typeof Network.handlePlayerJoined === 'function') Network.handlePlayerJoined(d); else console.error("Network.handlePlayerJoined missing!"); });
        socket.on('playerLeft', function(id){ if(typeof Network.handlePlayerLeft === 'function') Network.handlePlayerLeft(id); else console.error("Network.handlePlayerLeft missing!"); });
        socket.on('gameStateUpdate', function(d){ if(typeof Network.handleGameStateUpdate === 'function') Network.handleGameStateUpdate(d); else console.error("Network.handleGameStateUpdate missing!"); });
        socket.on('shotFired', function(d){ if(typeof Network.handleShotFired === 'function') Network.handleShotFired(d); else console.error("Network.handleShotFired missing!"); });
        socket.on('healthUpdate', function(d){ if(typeof Network.handleHealthUpdate === 'function') Network.handleHealthUpdate(d); else console.error("Network.handleHealthUpdate missing!"); });
        socket.on('playerDied', function(d){ if(typeof Network.handlePlayerDied === 'function') Network.handlePlayerDied(d); else console.error("Network.handlePlayerDied missing!"); });
        socket.on('playerRespawned', function(d){ if(typeof Network.handlePlayerRespawned === 'function') Network.handlePlayerRespawned(d); else console.error("Network.handlePlayerRespawned missing!"); });
        socket.onAny(function(eventName, ...args) { if (eventName !== 'gameStateUpdate') console.log(`DEBUG Event: ${eventName}`); });
        socket.on('ping', function(data){ console.log(">>> NET: Received 'ping' from server!", data); });

        console.log("Socket listeners attached inside Network.setupSocketIO.");
    }, // End setupSocketIO

    // --- Handlers for Server Events (now methods of Network) ---
    handleGameStateUpdate: function(state) {
        if (!players || typeof addPlayer !== 'function' || typeof handlePlayerLeft !== 'function' || typeof updateRemotePlayerPosition !== 'function') return;
        if (stateMachine.is('playing') && localPlayerId) {
            for (const id in state.players) { const pD=state.players[id]; if (id===localPlayerId){ if(players[localPlayerId] && players[localPlayerId].health !== pD.h){ Network.handleHealthUpdate({id: localPlayerId, health: pD.h}); } } else { if (players[id]) { updateRemotePlayerPosition(pD); } else { console.warn(`GSU unknown remote: ${id}`);}}}
            for (const lId in players) { if (lId !== localPlayerId && !state.players[lId]) { handlePlayerLeft(lId); }}
        }
    },
    handleInitialize: function(data) {
        console.log('Initialize handling.'); localPlayerId = data.id;
        for(const id in players) if(typeof removePlayerMesh === 'function') removePlayerMesh(id); players = {}; bullets = [];
        let iPosX=0,iPosY=0,iPosZ=0;
        for(const id in data.players){ const pD=data.players[id]; if(id===localPlayerId){ players[id]={...pD,name:localPlayerName,phrase:localPlayerPhrase,mesh:null}; iPosX=pD.x;iPosY=pD.y;iPosZ=pD.z; const visY=iPosY+CONFIG.PLAYER_HEIGHT; if(controls?.getObject()){controls.getObject().position.set(iPosX,visY,iPosZ);} velocityY=0;isOnGround=true; if(typeof UIManager!=='undefined') UIManager.updateHealthBar(pD.health); if(infoDiv) infoDiv.textContent=`Playing as ${localPlayerName}`; }else{ if(typeof addPlayer === 'function') addPlayer(pD);}}
        console.log("Initialized players:",Object.keys(players).length); if(typeof stateMachine!=='undefined') stateMachine.transitionTo('playing');
    },
    handlePlayerJoined: function(pD) { if(typeof addPlayer === 'function' && pD.id!==localPlayerId&&!players[pD.id]){addPlayer(pD);}},
    handlePlayerLeft: function(pId) { if(typeof removePlayerMesh === 'function') removePlayerMesh(pId); delete players[pId];},
    handleHealthUpdate: function(data) { // Contains Log
        console.log(`>>> NET: Received 'healthUpdate' for ${data.id}: ${data.health}`);
        if(players[data.id]){ players[data.id].health=data.health; if(data.id===localPlayerId){ if(typeof UIManager !== 'undefined') UIManager.updateHealthBar(data.health); }}
        else { console.warn(`Health update unknown player ${data.id}`); }
    },
    handlePlayerDied: function(data) { // Contains Log
        console.log(`>>> NET: Received 'playerDied' for ${data.targetId}`, data);
        if(players[data.targetId]){ players[data.targetId].health=0; if(players[data.targetId].mesh) players[data.targetId].mesh.visible=false; }
        else { console.warn(`Died event unknown player ${data.targetId}`); }
        if(data.targetId===localPlayerId){ if(typeof UIManager !== 'undefined'){ UIManager.updateHealthBar(0); const kN=data.killerName||'env';const kP=data.killerPhrase||'...'; let msg=`Got ${kP} by ${kN}.`; if(!data.killerId)msg=`Died.`; UIManager.showKillMessage(msg);} if(infoDiv) infoDiv.textContent=`DEAD`; }
    },
    handlePlayerRespawned: function(pD) { // Contains Log
         console.log(`>>> NET: Received 'playerRespawned' for ${pD.id}`);
         if(!players[pD.id]&&pD.id!==localPlayerId){if(typeof addPlayer==='function')addPlayer(pD);} else if(players[pD.id]||pD.id===localPlayerId){const p=players[pD.id]||players[localPlayerId];if(!p)return; p.health=pD.health;p.x=pD.x;p.y=pD.y;p.z=pD.z;p.rotationY=pD.rotationY;p.name=pD.name;p.phrase=pD.phrase; if(pD.id===localPlayerId){if(controls?.getObject())controls.getObject().position.set(p.x,p.y+CONFIG.PLAYER_HEIGHT,p.z);velocityY=0;isOnGround=true;if(typeof UIManager !== 'undefined')UIManager.updateHealthBar(p.health); if(infoDiv)infoDiv.textContent=`Playing as ${localPlayerName}`;if(typeof UIManager !== 'undefined')UIManager.clearKillMessage();}else{if(p.mesh){p.setVisible(true); let vY=p.mesh.geometry instanceof THREE.CylinderGeometry?p.y+(CONFIG.PLAYER_HEIGHT/2):p.y;p.mesh.position.set(p.x,vY,p.z);p.targetPosition.set(p.x,vY,p.z); p.targetRotationY=p.rotationY;}}}
     },
    handleShotFired: function(d){ if(typeof spawnBullet === 'function') spawnBullet(d); else console.error("spawnBullet missing!"); },

     // --- Actions Sent To Server (now methods of Network) ---
     attemptJoinGame: function() {
         console.log("--- attemptJoinGame called ---"); // Log start
         // Ensure elements exist when called (should be assigned by core.js init)
         if (!playerNameInput || !playerPhraseInput || !homeScreenError) {
             console.error("!!! UI elements missing for attemptJoinGame! Did init fail?");
             getUIElements(); // Attempt to re-grab references as a fallback
             if (!playerNameInput || !playerPhraseInput || !homeScreenError) return; // Exit if still missing
         }

         localPlayerName = playerNameInput.value.trim() || 'Anonymous';
         localPlayerPhrase = playerPhraseInput.value.trim() || '...';
         if (!localPlayerName){homeScreenError.textContent='Enter name';return;} if(localPlayerPhrase.length>20){homeScreenError.textContent='Phrase too long';return;} homeScreenError.textContent='';

         console.log(`Attempting Join as "${localPlayerName}" | Assets Ready: ${assetsReady}`); // Log check
         if(typeof stateMachine!=='undefined') stateMachine.transitionTo('joining',{waitingForAssets:!assetsReady}); else console.error("stateMachine missing!"); // Trigger joining state

         if(assetsReady){
             Network.sendJoinDetails(); // Call internal method if assets ready
         } else {
             console.log("Wait assets..."); // Else, checkAssetsReady will call sendJoinDetails
         }
     },

     sendJoinDetails: function() {
         console.log("--- sendJoinDetails called ---"); // Log start
         homeScreenError = homeScreenError || document.getElementById('homeScreenError');
         playerCountSpan = playerCountSpan || document.getElementById('playerCount'); // Ensure refs

         if(socket?.connected && stateMachine.is('joining')){
             console.log("Socket connected & joining state OK. Emitting setPlayerDetails..."); // Log emit
             socket.emit('setPlayerDetails',{name:localPlayerName,phrase:localPlayerPhrase});
         } else if (!stateMachine.is('joining')){
              console.warn("! Aborting sendDetails: No longer in 'joining' state.");
              if(typeof stateMachine !== 'undefined') stateMachine.transitionTo('homescreen',{playerCount:playerCountSpan?.textContent??'?'});
         } else { // Socket not connected
             console.error("! Aborting sendDetails: Socket not connected.");
             if(homeScreenError) homeScreenError.textContent = 'Connection lost.';
              if(typeof stateMachine !== 'undefined') stateMachine.transitionTo('homescreen',{playerCount:playerCountSpan?.textContent??'?'});
         }
     },

      sendPlayerUpdate: function(updateData) { if(socket?.connected && stateMachine.is('playing')) { socket.emit('playerUpdate', updateData); } },
      sendShoot: function(shootData) { if(socket?.connected && stateMachine.is('playing')) { socket.emit('shoot', shootData); } },
      sendHit: function(targetId, damage) { if(socket?.connected && stateMachine.is('playing')) { socket.emit('hit', {targetId: targetId, damage: damage}); } },
      sendVoidDeath: function() { if(socket?.connected && stateMachine.is('playing')) { socket.emit('fellIntoVoid'); } }
}; // End Network object

// Export Network object to global scope so game.js can call Network.init() etc.
window.Network = Network;

console.log("network.js loaded");

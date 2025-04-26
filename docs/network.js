// docs/network.js

// Needs access to globals and functions from other files
// Specifically needs CONFIG from config.js
// Accesses global UI element vars set by UIManager: playerNameInput, playerPhraseInput, homeScreenError, playerCountSpan, infoDiv
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
             if(typeof stateMachine !== 'undefined') stateMachine.transitionTo('loading',{message:"Network Config Error!",error:true});
             return;
        }
        console.log(`Connect: ${CONFIG.SERVER_URL}`);
        // Initialize the global socket variable
        socket = io(CONFIG.SERVER_URL, { transports: ['websocket'], autoConnect: true });

        // --- Socket Event Listeners ---
        socket.on('connect', function(){
            console.log('Socket OK! ID:',socket.id);
            // Check if assets are ready WHEN socket connects
            if (typeof checkAssetsReady === 'function') checkAssetsReady(); // checkAssetsReady now handles state transition
            else console.error("checkAssetsReady missing!");
        });
        socket.on('disconnect', function(reason){
            console.warn('Disconnected:',reason);
            if (typeof stateMachine !== 'undefined') stateMachine.transitionTo('homescreen',{playerCount:0});
            // Clean up game state on disconnect
            if (typeof infoDiv !== 'undefined' && infoDiv) infoDiv.textContent='Disconnected';
            for (const id in players) if (typeof removePlayerMesh === 'function') removePlayerMesh(id);
            players={}; bullets=[];
        });
        socket.on('connect_error', function(err){
            console.error('Connect Err:',err.message);
            // Signal asset manager? Assume assets fail if network fails.
            mapLoadState='error'; playerModelLoadState='error'; gunModelLoadState = 'error'; assetsReady=false;
            if (typeof stateMachine !== 'undefined') stateMachine.transitionTo('loading',{message:`Connect Fail!<br/>${err.message}`,error:true});
        });
        socket.on('playerCountUpdate', function(count){
            // Get element reference INSIDE the handler for safety
            const playerCountSpanElement = document.getElementById('playerCount');
            if (playerCountSpanElement) { playerCountSpanElement.textContent = count; }
            else { console.warn("playerCountSpan element not found when trying to update count!"); }
            // State transition handled elsewhere (on connect/asset ready)
        });

        // --- Game Specific Listeners ---
        socket.on('initialize',       function(data){ Network.handleInitialize(data); });
        socket.on('playerJoined',     function(d){ Network.handlePlayerJoined(d); });
        socket.on('playerLeft',       function(id){ Network.handlePlayerLeft(id); });
        socket.on('gameStateUpdate',  function(d){ Network.handleGameStateUpdate(d); });
        socket.on('shotFired',        function(d){ Network.handleShotFired(d); });
        socket.on('healthUpdate',     function(d){ Network.handleHealthUpdate(d); });
        socket.on('playerDied',       function(d){ Network.handlePlayerDied(d); });
        socket.on('playerRespawned',  function(d){ Network.handlePlayerRespawned(d); });

        // --- Debug Listeners ---
        socket.onAny(function(eventName, ...args) { if (eventName !== 'gameStateUpdate' && eventName !== 'playerMoved') console.log(`DEBUG Event: ${eventName}`); });
        socket.on('ping', function(data){ console.log(">>> NET: Received 'ping' from server!", data); });

        console.log("Socket listeners attached inside Network.setupSocketIO.");
    }, // End setupSocketIO


    // --- Handlers for Server Events (now methods of Network) ---
    handleGameStateUpdate: function(state) {
         if (!players || typeof addPlayer !== 'function' || typeof handlePlayerLeft !== 'function' || typeof updateRemotePlayerPosition !== 'function') return;
         if (typeof stateMachine === 'undefined' || !stateMachine.is('playing') || !localPlayerId) return;
         // Update players based on server state
         for (const id in state.players) {
             const pD=state.players[id];
             if (id===localPlayerId){ if(players[localPlayerId] && players[localPlayerId].health !== pD.h){ Network.handleHealthUpdate({id: localPlayerId, health: pD.h}); } }
             else { if (players[id]) { updateRemotePlayerPosition(pD); } else { console.warn(`GSU unknown remote: ${id}`);}} // Might need full data later
         }
         // Remove players who disconnected
         for (const lId in players) { if (lId !== localPlayerId && !state.players[lId]) { handlePlayerLeft(lId); }}
     },
    handleInitialize: function(data) {
         console.log('Initialize handling.'); localPlayerId = data.id;
         for(const id in players) if(typeof removePlayerMesh === 'function') removePlayerMesh(id); players = {}; bullets = [];
         let iPosX=0,iPosY=0,iZ=0;
         for(const id in data.players){ const pD=data.players[id]; if(id===localPlayerId){ players[id]={...pD,name:localPlayerName,phrase:localPlayerPhrase,mesh:null}; iPosX=pD.x;iPosY=pD.y;iZ=pD.z; const visY=iPosY+CONFIG.PLAYER_HEIGHT; if(controls?.getObject()){controls.getObject().position.set(iPosX,visY,iZ); } else { console.error("Controls missing!"); } velocityY=0;isOnGround=true; if(typeof UIManager!=='undefined') UIManager.updateHealthBar(pD.health); if(infoDiv) infoDiv.textContent=`Playing as ${localPlayerName}`; }else{ if(typeof addPlayer === 'function') addPlayer(pD);}}
         console.log("Initialized players:",Object.keys(players).length); if(typeof stateMachine!=='undefined') stateMachine.transitionTo('playing'); else console.error("stateMachine missing!");
    },
    handlePlayerJoined: function(pD) { if(typeof addPlayer === 'function' && pD.id!==localPlayerId&&!players[pD.id]){addPlayer(pD);}},
    handlePlayerLeft: function(pId) { if(typeof removePlayerMesh === 'function') removePlayerMesh(pId); delete players[pId];},
    handleHealthUpdate: function(data) { console.log(`>>> NET: RX HLTH ${data.id}: ${data.health}`); if(players[data.id]){ players[data.id].health=data.health; if(data.id===localPlayerId){ if(typeof UIManager !== 'undefined') UIManager.updateHealthBar(data.health); }} else { console.warn(`Health update unknown ${data.id}`); }},
    handlePlayerDied: function(data) { console.log(`>>> NET: RX DIED ${data.targetId}`); if(players[data.targetId]){ players[data.targetId].health=0; if(players[data.targetId].mesh) players[data.targetId].mesh.visible=false; } else { console.warn(`Died event unknown ${data.targetId}`); } if(data.targetId===localPlayerId){ if(typeof UIManager !== 'undefined'){ UIManager.updateHealthBar(0); const kN=data.killerName||'env';const kP=data.killerPhrase||'...'; let msg=`Got ${kP} by ${kN}.`; if(!data.killerId)msg=`Died.`; UIManager.showKillMessage(msg);} if(infoDiv) infoDiv.textContent=`DEAD`; }},
    handlePlayerRespawned: function(pD) { console.log(`>>> NET: RX RESPAWN ${pD.id}`); if(!players[pD.id]&&pD.id!==localPlayerId){if(typeof addPlayer==='function')addPlayer(pD);} else if(players[pD.id]||pD.id===localPlayerId){const p=players[pD.id]||players[localPlayerId];if(!p)return; p.health=pD.health;p.x=pD.x;p.y=pD.y;p.z=pD.z;p.rotationY=pD.rotationY;p.name=pD.name;p.phrase=pD.phrase; if(pD.id===localPlayerId){if(controls?.getObject())controls.getObject().position.set(p.x,p.y+CONFIG.PLAYER_HEIGHT,p.z);velocityY=0;isOnGround=true;if(typeof UIManager !== 'undefined')UIManager.updateHealthBar(p.health); if(infoDiv)infoDiv.textContent=`Playing as ${localPlayerName}`;if(typeof UIManager !== 'undefined')UIManager.clearKillMessage();}else{if(p.mesh){p.setVisible(true); let vY=p.mesh.geometry instanceof THREE.CylinderGeometry?p.y+(CONFIG.PLAYER_HEIGHT/2):p.y;p.mesh.position.set(p.x,vY,p.z);p.targetPosition.set(p.x,vY,p.z); p.targetRotationY=p.rotationY;}}} },
    handleShotFired: function(d){ if(typeof spawnBullet === 'function') spawnBullet(d); else console.error("spawnBullet missing!"); },


     // --- Actions Sent To Server ---
     attemptJoinGame: function() {
         console.log("--- attemptJoinGame called ---");
         // Use globally assigned element variables (checked in init)
         if (!playerNameInput || !playerPhraseInput || !homeScreenError) { console.error("! UI elements missing for attemptJoinGame!"); return; }

         localPlayerName = playerNameInput.value.trim() || 'Anonymous';
         localPlayerPhrase = playerPhraseInput.value.trim() || '...';
         if (!localPlayerName){homeScreenError.textContent='Enter name';return;} if(localPlayerPhrase.length>20){homeScreenError.textContent='Phrase too long';return;} homeScreenError.textContent='';

         // Check asset status directly via LoadManager
         let currentAssetsReady = false; let criticalAssetError = false;
         if (typeof loadManager !== 'undefined') {
             const mapOk=loadManager.assets.map?.state==='loaded'; const pModelOk=loadManager.assets.playerModel?.state==='loaded'; const gModelOk=loadManager.assets.gunModel?.state==='loaded';
             currentAssetsReady=mapOk&&pModelOk&&gModelOk; // Require all 3 defined assets
             criticalAssetError=loadManager.assets.map?.state==='error'||loadManager.assets.playerModel?.state==='error'||loadManager.assets.gunModel?.state==='error';
             console.log(`Attempting Join | Asset Check: Ready=${currentAssetsReady}, CritErr=${criticalAssetError}`);
         } else { console.error("LoadManager missing!"); criticalAssetError = true; }

         if (criticalAssetError) { homeScreenError.textContent = 'Asset error.'; return; }

         if(typeof stateMachine!=='undefined') stateMachine.transitionTo('joining',{waitingForAssets:!currentAssetsReady}); else console.error("stateMachine missing!");

         if(currentAssetsReady){ Network.sendJoinDetails(); }
         else console.log("Wait assets...");
     }, // End attemptJoinGame

     sendJoinDetails: function() {
         console.log("--- sendJoinDetails called ---");
         if(socket?.connected && typeof stateMachine !== 'undefined' && stateMachine.is('joining')){
             console.log("Sending setPlayerDetails...");
             socket.emit('setPlayerDetails',{name:localPlayerName,phrase:localPlayerPhrase});
         } else if (typeof stateMachine !== 'undefined' && !stateMachine.is('joining')){
              console.warn("! Not joining state."); if(typeof stateMachine!=='undefined') stateMachine.transitionTo('homescreen',{playerCount:playerCountSpan?.textContent??'?'});
         } else {
             console.error("! Socket disconnected."); homeScreenError = homeScreenError || document.getElementById('homeScreenError'); if(homeScreenError)homeScreenError.textContent='Connection lost.';
              if(typeof stateMachine !== 'undefined') stateMachine.transitionTo('homescreen',{playerCount:playerCountSpan?.textContent??'?'});
         }
     },
     sendPlayerUpdate: function(d) { if(socket?.connected&&stateMachine.is('playing'))socket.emit('playerUpdate',d);},
     sendShoot: function(d) { if(socket?.connected&&stateMachine.is('playing'))socket.emit('shoot',d);},
     sendHit: function(tId,dmg) { if(socket?.connected&&stateMachine.is('playing'))socket.emit('hit',{targetId:tId,damage:dmg});},
     sendVoidDeath: function() { if(socket?.connected&&stateMachine.is('playing'))socket.emit('fellIntoVoid');}

}; // End Network object
window.Network = Network; // Export globally
console.log("network.js loaded");

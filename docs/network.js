// docs/network.js

// Needs access to globals and functions from other files

const Network = {
    // Add properties or methods needed by other modules if any
    // socket: null // Could store the socket instance here? Handled globally for now.

    init: function() {
        // Call setupSocketIO during network initialization
        this.setupSocketIO();
        console.log("[Network] Initialized.");
    },

    isConnected: function() {
      return socket?.connected || false;
    },

    setupSocketIO: function() {
        console.log(`Connect: ${SERVER_URL}`); socket=io(SERVER_URL,{transports:['websocket'],autoConnect:true});

        socket.on('connect', function(){console.log('Socket OK! ID:',socket.id); if(typeof checkAssetsReady === 'function') checkAssetsReady();}); // Use global checkAssetsReady
        socket.on('disconnect', function(reason){console.warn('Disconnected:',reason); if(typeof stateMachine !== 'undefined') stateMachine.transitionTo('homescreen',{playerCount:0}); if(typeof infoDiv !== 'undefined' && infoDiv) infoDiv.textContent='Disconnected'; for(const id in players) if(typeof removePlayerMesh === 'function') removePlayerMesh(id); players={}; bullets=[];});
        socket.on('connect_error', function(err){console.error('Connect Err:',err.message); mapLoadState='error'; playerModelLoadState='error'; gunModelLoadState = 'error'; assetsReady=false; if(typeof stateMachine !== 'undefined') stateMachine.transitionTo('loading',{message:`Connect Fail!<br/>${err.message}`,error:true});});
        socket.on('playerCountUpdate', function(count){playerCountSpan=playerCountSpan||document.getElementById('playerCount'); if(playerCountSpan)playerCountSpan.textContent=count; /* Removed logic dependent on stateMachine/assetsReady here */});
        socket.on('initialize', function(data){ if(typeof Network.handleInitialize === 'function') Network.handleInitialize(data); else console.error("Network.handleInitialize missing!"); }); // Call using Network.method
        socket.on('playerJoined', function(d){ if(typeof Network.handlePlayerJoined === 'function') Network.handlePlayerJoined(d); else console.error("Network.handlePlayerJoined missing!"); });
        socket.on('playerLeft', function(id){ if(typeof Network.handlePlayerLeft === 'function') Network.handlePlayerLeft(id); else console.error("Network.handlePlayerLeft missing!"); });
        // Switch to listening for comprehensive game state updates from the server loop
        socket.on('gameStateUpdate', function(d){ if(typeof Network.handleGameStateUpdate === 'function') Network.handleGameStateUpdate(d); else console.error("Network.handleGameStateUpdate missing!"); });
        socket.on('shotFired', function(d){ if(typeof handleShotFired === 'function') handleShotFired(d); else console.error("handleShotFired from Network missing!"); }); // Assumes handler is global/imported
        socket.on('healthUpdate', function(d){ if(typeof Network.handleHealthUpdate === 'function') Network.handleHealthUpdate(d); else console.error("Network.handleHealthUpdate missing!"); });
        socket.on('playerDied', function(d){ if(typeof Network.handlePlayerDied === 'function') Network.handlePlayerDied(d); else console.error("Network.handlePlayerDied missing!"); });
        socket.on('playerRespawned', function(d){ if(typeof Network.handlePlayerRespawned === 'function') Network.handlePlayerRespawned(d); else console.error("Network.handlePlayerRespawned missing!"); });
        socket.onAny(function(eventName, ...args) { if (eventName !== 'gameStateUpdate') console.log(`DEBUG Event: ${eventName}`); }); // Exclude frequent gameStateUpdate
        socket.on('ping', function(data){ console.log(">>> NET: Received 'ping' from server!", data); });

        console.log("Socket listeners attached inside Network.setupSocketIO.");
    },

    // --- Handlers for Server Events (now methods of Network) ---
    handleGameStateUpdate: function(state) {
         if (!players || typeof addPlayer !== 'function' || typeof handlePlayerLeft !== 'function' || typeof updateRemotePlayerPosition !== 'function') return;
         if (stateMachine.is('playing') && localPlayerId) {
             for (const id in state.players) { const pD=state.players[id]; if (id===localPlayerId){ if(players[localPlayerId] && players[localPlayerId].health !== pD.h){ Network.handleHealthUpdate({id: localPlayerId, health: pD.h}); } } else { if (players[id]) { updateRemotePlayerPosition(pD); } else { console.warn(`GSU for unknown remote: ${id}`);}}}
             for (const lId in players) { if (lId !== localPlayerId && !state.players[lId]) { handlePlayerLeft(lId); }}
         }
     },
     handleInitialize: function(data) {
          console.log('Initialize handling.'); localPlayerId = data.id;
          for(const id in players) if(typeof removePlayerMesh === 'function') removePlayerMesh(id); players = {}; bullets = [];
          for(const id in data.players){ const pD=data.players[id]; if(id===localPlayerId){ players[id]={...pD,name:localPlayerName,phrase:localPlayerPhrase,mesh:null}; const vY=pD.y+PLAYER_HEIGHT; if(controls?.getObject()){controls.getObject().position.set(pD.x,vY,pD.z);} velocityY=0;isOnGround=true; if(typeof UIManager !== 'undefined') UIManager.updateHealthBar(pD.health); if(infoDiv) infoDiv.textContent=`Playing as ${localPlayerName}`; }else{ if(typeof addPlayer === 'function') addPlayer(pD);}}
          console.log("Initialized players:",Object.keys(players).length); if(typeof stateMachine !== 'undefined') stateMachine.transitionTo('playing');
     },
     handlePlayerJoined: function(pD) { if(typeof addPlayer === 'function' && pD.id!==localPlayerId&&!players[pD.id]){addPlayer(pD);}},
     handlePlayerLeft: function(pId) { if(typeof removePlayerMesh === 'function') removePlayerMesh(pId); delete players[pId];},
     handleHealthUpdate: function(data) { console.log(`NET: Received 'healthUpdate' for ${data.id}: ${data.health}`); if(players[data.id]){ players[data.id].health=data.health; if(data.id===localPlayerId){ if(typeof UIManager !== 'undefined') UIManager.updateHealthBar(data.health); }} else { console.warn(`Health update unknown player ${data.id}`); }},
     handlePlayerDied: function(data) { console.log(`NET: Received 'playerDied' for ${data.targetId}`); if(players[data.targetId]){ players[data.targetId].health=0; if(players[data.targetId].mesh) players[data.targetId].mesh.visible=false; } else { console.warn(`Died event unknown player ${data.targetId}`); } if(data.targetId===localPlayerId){ if(typeof UIManager !== 'undefined'){ UIManager.updateHealthBar(0); const kN=data.killerName||'env';const kP=data.killerPhrase||'...'; let msg=`Got ${kP} by ${kN}.`; if(!data.killerId)msg=`Died.`; UIManager.showKillMessage(msg);} if(infoDiv) infoDiv.textContent=`DEAD`; }},
     handlePlayerRespawned: function(pD) { console.log(`NET: Received 'playerRespawned' for ${pD.id}`); if(!players[pD.id]&&pD.id!==localPlayerId){if(typeof addPlayer==='function')addPlayer(pD);} else if(players[pD.id]||pD.id===localPlayerId){const p=players[pD.id]||players[localPlayerId];if(!p)return; p.health=pD.health;p.x=pD.x;p.y=pD.y;p.z=pD.z;p.rotationY=pD.rotationY;p.name=pD.name;p.phrase=pD.phrase; if(pD.id===localPlayerId){if(controls?.getObject())controls.getObject().position.set(p.x,p.y+PLAYER_HEIGHT,p.z);velocityY=0;isOnGround=true;if(typeof UIManager !== 'undefined')UIManager.updateHealthBar(p.health); if(infoDiv)infoDiv.textContent=`Playing as ${localPlayerName}`;if(typeof UIManager !== 'undefined')UIManager.clearKillMessage();}else{if(p.mesh){p.setVisible(true); let vY=p.mesh.geometry instanceof THREE.CylinderGeometry?p.y+(PLAYER_HEIGHT/2):p.y;p.mesh.position.set(p.x,vY,p.z);p.targetPosition.set(p.x,vY,p.z); p.targetRotationY=p.rotationY;}}} }, // End handlePlayerRespawned
    handleShotFired: function(d){ if(typeof spawnBullet === 'function') spawnBullet(d); else console.error("spawnBullet from Network missing!"); }, // Assumes spawnBullet is global/available


     // --- Actions Sent To Server ---
     attemptJoinGame: function() {
         if(!playerNameInput || !playerPhraseInput || !homeScreenError) getUIElements(); // Ensure UI refs
         localPlayerName = playerNameInput?.value.trim() || 'Anonymous';
         localPlayerPhrase = playerPhraseInput?.value.trim() || '...';
         if (!localPlayerName){if(homeScreenError)homeScreenError.textContent='Enter name';return;}
         if (localPlayerPhrase.length>20){if(homeScreenError)homeScreenError.textContent='Phrase too long';return;}
         if(homeScreenError)homeScreenError.textContent='';

         console.log(`Attempting Join as "${localPlayerName}" | Assets Ready: ${assetsReady}`);
         if(typeof stateMachine !== 'undefined') stateMachine.transitionTo('joining',{waitingForAssets:!assetsReady});

         if (assetsReady) { this.sendJoinDetails(); }
         else console.log("Wait assets...");
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
             if(homeScreenError) homeScreenError.textContent = 'Connection lost.';
              if(typeof stateMachine !== 'undefined') stateMachine.transitionTo('homescreen',{playerCount:playerCountSpan?.textContent??'?'});
         }
     },

      sendPlayerUpdate: function(updateData) {
          if(socket?.connected && stateMachine.is('playing')) {
               socket.emit('playerUpdate', updateData);
          }
     },

     sendShoot: function(shootData) {
         if(socket?.connected && stateMachine.is('playing')) {
              socket.emit('shoot', shootData);
         }
     },

     sendHit: function(targetId, damage) {
         if(socket?.connected && stateMachine.is('playing')) {
             socket.emit('hit', {targetId: targetId, damage: damage});
         }
     },
     sendVoidDeath: function() {
          if(socket?.connected && stateMachine.is('playing')) {
               socket.emit('fellIntoVoid');
          }
     }
     // sendCollectHealthPack: function(packId) { ... } // REMOVED
};

console.log("network.js loaded");

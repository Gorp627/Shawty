// docs/network.js

// Needs access to globals like socket, players, localPlayerId, localPlayerName, localPlayerPhrase, gameState, assetsReady, playerCountSpan etc.
// Needs access to constants like PLAYER_HEIGHT
// Needs access to functions like addPlayer, removePlayerMesh, spawnBullet, updateHealthBar, showKillMessage, setGameState, checkAssetsReady, sendJoinDetails, updateRemotePlayerPosition etc.

function setupSocketIO() {
    console.log(`Connect: ${SERVER_URL}`); socket=io(SERVER_URL,{transports:['websocket'],autoConnect:true});

    // Core Connection Events
    socket.on('connect', function(){
        console.log('Socket connected! ID:', socket.id);
        // Check if assets are ready IF checkAssetsReady exists
        if (typeof checkAssetsReady === 'function') checkAssetsReady();
        else console.error("checkAssetsReady function not found!");
    });

    socket.on('disconnect', function(reason){
        console.warn('Disconnected:', reason);
        // Ensure setGameState exists before calling
        if (typeof setGameState === 'function') setGameState('homescreen',{playerCount:0});
        else console.error("setGameState function not found!");

        if (typeof infoDiv !== 'undefined' && infoDiv) infoDiv.textContent='Disconnected';
        for(const id in players) if(typeof removePlayerMesh === 'function') removePlayerMesh(id); else console.error("removePlayerMesh function not found!");
        players={}; bullets=[]; // Clear state
        // No health packs to clear activeHealthPacks = {};
    });

    socket.on('connect_error', function(err){
        console.error('Connect Err:',err.message);
        // Signal asset manager about error (optional, could check socket state there)
        mapLoadState='error'; playerModelLoadState='error'; assetsReady=false; // Assume assets fail if network fails early
        if(typeof setGameState === 'function') setGameState('loading',{message:`Connect Fail!<br/>${err.message}`,error:true});
        else console.error("setGameState function not found!");
    });

    // Game Specific Event Handlers
    socket.on('playerCountUpdate', function(count){
        playerCountSpan=playerCountSpan||document.getElementById('playerCount');
        if(playerCountSpan)playerCountSpan.textContent=count;
        else console.warn("playerCountSpan element not found!");
        // This check might move solely to checkAssetsReady or connect handler
        if(assetsReady && socket.connected && gameState==='loading'){
             if(typeof setGameState === 'function') setGameState('homescreen',{playerCount:count});
        }
    });

    socket.on('initialize', function(d){ if(typeof handleInitialize === 'function') handleInitialize(d); else console.error("handleInitialize function not found!"); });
    socket.on('playerJoined', function(d){ if(typeof handlePlayerJoined === 'function') handlePlayerJoined(d); else console.error("handlePlayerJoined function not found!"); });
    socket.on('playerLeft', function(id){ if(typeof handlePlayerLeft === 'function') handlePlayerLeft(id); else console.error("handlePlayerLeft function not found!"); });
    // Switch to listening for comprehensive game state updates from the server loop
    // socket.on('playerMoved', function(d){ if(typeof updateRemotePlayerPosition === 'function') updateRemotePlayerPosition(d); else console.error("updateRemotePlayerPosition not found!"); }); // Might remove if using gameStateUpdate
    socket.on('gameStateUpdate', function(d){ if(typeof handleGameStateUpdate === 'function') handleGameStateUpdate(d); else console.error("handleGameStateUpdate not defined!"); });
    socket.on('shotFired', function(d){ if(typeof handleShotFired === 'function') handleShotFired(d); else console.error("handleShotFired not defined!"); }); // Renamed handler
    socket.on('healthUpdate', function(d){ if(typeof handleHealthUpdate === 'function') handleHealthUpdate(d); else console.error("handleHealthUpdate not defined!"); });
    socket.on('playerDied', function(d){ if(typeof handlePlayerDied === 'function') handlePlayerDied(d); else console.error("handlePlayerDied not defined!"); });
    socket.on('playerRespawned', function(d){ if(typeof handlePlayerRespawned === 'function') handlePlayerRespawned(d); else console.error("handlePlayerRespawned not defined!"); });

    // --- NO Health Pack Listeners ---
    // socket.on('spawnHealthPack', function(d){ handleSpawnHealthPack(d); });
    // socket.on('removeHealthPack', function(id){ handleRemoveHealthPack(id); });

    // Catch-All Debug Listener
    socket.onAny(function(eventName, ...args) {
        // Avoid logging frequent updates
        if (eventName !== 'gameStateUpdate') {
            console.log(`DEBUG: Received event: ${eventName}`, args);
        }
    });

    // Test Ping Listener
    socket.on('ping', function(data){ console.log(">>> NET: Received 'ping' from server!", data); });

    console.log("Socket listeners attached inside setupSocketIO.");

} // End setupSocketIO


// Central handler for regular server updates
function handleGameStateUpdate(state) {
    // Ensure players object and necessary functions exist
     if (!players || typeof addPlayer !== 'function' || typeof handlePlayerLeft !== 'function' || typeof updateRemotePlayerPosition !== 'function') {
         console.error("Missing player data structures or functions for GameState update");
         return;
     }

     if (stateMachine.is('playing') && localPlayerId) {
        // Update players based on server state
        for (const id in state.players) {
            const playerData = state.players[id];
            if (id === localPlayerId) {
                 // Server reconciliation could happen here - compare server state to client prediction
                 // For now, we mostly let the client predict its own state based on input
                 // but we might update health or other server-authoritative states
                 if(players[localPlayerId] && players[localPlayerId].health !== playerData.h) {
                      console.log(`Local health sync: ${players[localPlayerId].health} -> ${playerData.h}`);
                      players[localPlayerId].health = playerData.h;
                      handleHealthUpdate({ id: localPlayerId, health: playerData.h }); // Update UI too
                 }
            } else {
                 // Update or add remote players
                 if (players[id]) {
                     updateRemotePlayerPosition(playerData); // Update existing remote player
                 } else {
                     // Need full data if player joined between updates
                     // Server 'playerJoined' event is more reliable for this
                      console.warn(`Received gameStateUpdate for unknown remote player: ${id}. Waiting for playerJoined event.`);
                      // requestFullPlayerData(id); // Optional: Function to ask server for full data for this ID
                 }
            }
        }
        // Remove players who disconnected between updates
        for (const localId in players) {
             if (localId !== localPlayerId && !state.players[localId]) {
                  console.log(`Player ${localId} not in gameStateUpdate, removing.`);
                  handlePlayerLeft(localId);
             }
        }

        // No health packs to sync
    }
}

function handleInitialize(data) {
    console.log('Handling initialize...');
    localPlayerId = data.id;
    for(const id in players) if(typeof removePlayerMesh === 'function') removePlayerMesh(id); else console.error("removePlayerMesh missing!");
    players = {}; bullets = [];
    // Clear any leftover packs visually if applicable
    // for(const id in activeHealthPacks) activeHealthPacks[id]?.remove(); activeHealthPacks = {};

    let iPosX=0,iPosY=0,iZ=0;
    for(const id in data.players){ // Process players sent by server
        const pD=data.players[id];
        if(id===localPlayerId){
            players[id]={...pD,name:localPlayerName,phrase:localPlayerPhrase,mesh:null};
            iPosX=pD.x;iPosY=pD.y;iZ=pD.z; const visY=iPosY+PLAYER_HEIGHT;
            if(controls?.getObject()){ controls.getObject().position.set(iPosX,visY,iZ); }
            velocityY=0;isOnGround=true;
            if(typeof updateHealthBar==='function') updateHealthBar(pD.health);
            if(infoDiv) infoDiv.textContent=`Playing as ${localPlayerName}`;
        }else{
            if(typeof addPlayer === 'function') addPlayer(pD);
        }
    }
    // Handle initial health packs if they were sent (they aren't currently)
    // if (data.healthPacks) {
    //     for (const packId in data.healthPacks) {
    //         if (typeof handleSpawnHealthPack === 'function') handleSpawnHealthPack(data.healthPacks[packId]);
    //     }
    // }

    console.log("Initialized players:", Object.keys(players).length);
    if(typeof setGameState === 'function') setGameState('playing'); else console.error("setGameState missing!");
}

function attemptJoinGame() {
    playerNameInput = playerNameInput || document.getElementById('playerNameInput');
    playerPhraseInput = playerPhraseInput || document.getElementById('playerPhraseInput');
    homeScreenError = homeScreenError || document.getElementById('homeScreenError');
    if (!playerNameInput || !playerPhraseInput || !homeScreenError || typeof setGameState !== 'function') { console.error("Missing elements/funcs for attemptJoinGame!"); return; }

    localPlayerName = playerNameInput.value.trim() || 'Anonymous';
    localPlayerPhrase = playerPhraseInput.value.trim() || '...';
    if (!localPlayerName){homeScreenError.textContent='Enter name';return;} if(localPlayerPhrase.length>20){homeScreenError.textContent='Phrase too long';return;} homeScreenError.textContent='';

    console.log(`Attempting Join as "${localPlayerName}" | Assets Ready: ${assetsReady}`);
    setGameState('joining',{waitingForAssets:!assetsReady});
    if(assetsReady){ sendJoinDetails(); } else console.log("Wait assets...");
}

function sendJoinDetails() {
    console.log("--- sendJoinDetails called ---");
    homeScreenError = homeScreenError || document.getElementById('homeScreenError');
    playerCountSpan = playerCountSpan || document.getElementById('playerCount');

    if(socket?.connected && gameState==='joining'){
        console.log("Socket OK & joining state OK. Emitting setPlayerDetails...");
        socket.emit('setPlayerDetails',{name:localPlayerName,phrase:localPlayerPhrase});
    } else if (gameState!=='joining'){
         console.warn("! Aborting sendDetails: Not joining state.");
         if(typeof setGameState === 'function') setGameState('homescreen',{playerCount:playerCountSpan?.textContent??'?'});
    } else {
        console.error("! Aborting sendDetails: Socket not connected.");
        if(homeScreenError) homeScreenError.textContent = 'Connection issue. Cannot join.';
        if(typeof setGameState === 'function') setGameState('homescreen',{playerCount:playerCountSpan?.textContent??'?'});
    }
}

// Define handlers called by socket event listeners
function handlePlayerJoined(pD) { if(typeof addPlayer === 'function' && pD.id!==localPlayerId&&!players[pD.id]){addPlayer(pD);}}
function handlePlayerLeft(pId) { if(typeof removePlayerMesh === 'function') removePlayerMesh(pId); delete players[pId];}
function handleHealthUpdate(data) { // Added log previously
    console.log(`>>> NET: Received 'healthUpdate' for ${data.id}: ${data.health}`);
    if(players[data.id]){ players[data.id].health=data.health; if(data.id===localPlayerId){ if(typeof updateHealthBar === 'function') updateHealthBar(data.health); }}
    else { console.warn(`Health update for unknown player ${data.id}`); }
}
function handlePlayerDied(data) { // Added log previously + uses name/phrase
    console.log(`>>> NET: Received 'playerDied' for ${data.targetId}`, data);
    if(players[data.targetId]){ players[data.targetId].health=0; if(players[data.targetId].mesh) players[data.targetId].mesh.visible=false; }
    else { console.warn(`Died event for unknown player ${data.targetId}`); }
    if(data.targetId===localPlayerId){ if(typeof updateHealthBar === 'function') updateHealthBar(0); const kN=data.killerName||'environment';const kP=data.killerPhrase||'...'; let msg=`You just got ${kP} by ${kN}.`; if(!data.killerId)msg=`You died.`; if(typeof showKillMessage === 'function') showKillMessage(msg); if(infoDiv) infoDiv.textContent=`YOU DIED`; }
}
function handlePlayerRespawned(pD) { // Includes name/phrase sync
     if(!players[pD.id]&&pD.id!==localPlayerId){if(typeof addPlayer === 'function') addPlayer(pD);}
     else if(players[pD.id]||pD.id===localPlayerId){const p=players[pD.id]||players[localPlayerId];p.health=pD.health;p.x=pD.x;p.y=pD.y;p.z=pD.z;p.rotationY=pD.rotationY;p.name=pD.name;p.phrase=pD.phrase; if(pD.id===localPlayerId){if(controls?.getObject())controls.getObject().position.set(p.x,p.y+PLAYER_HEIGHT,p.z);velocityY=0;isOnGround=true;if(typeof updateHealthBar === 'function') updateHealthBar(p.health); if(infoDiv) infoDiv.textContent=`Playing as ${localPlayerName}`; if(typeof showKillMessage === 'function') showKillMessage(""); if(killMessageDiv) killMessageDiv.classList.remove('visible');if(killMessageTimeout)clearTimeout(killMessageTimeout);}else{if(p.mesh){p.mesh.visible=true;let vY=p.mesh.geometry instanceof THREE.CylinderGeometry?p.y+(PLAYER_HEIGHT/2):p.y;p.mesh.position.set(p.x,vY,p.z);p.targetPosition=new THREE.Vector3(p.x,vY,p.z);p.targetRotationY=p.rotationY;}}}
}
// Renamed handler
function handleShotFired(d){ if(typeof spawnBullet === 'function') spawnBullet(d); else console.error("spawnBullet missing!"); }
// NO Health Pack Handlers

console.log("network.js loaded");

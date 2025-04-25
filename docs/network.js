// docs/network.js

// Needs access to globals and functions from other files

function setupSocketIO() {
    console.log(`Connect: ${SERVER_URL}`); socket=io(SERVER_URL,{transports:['websocket'],autoConnect:true});
    socket.on('connect', function(){console.log('Socket OK! ID:',socket.id); checkAssetsReady();}); // Check assets on connect
    socket.on('disconnect', function(reason){console.warn('Disconnected:',reason); setGameState('homescreen',{playerCount:0}); if(typeof infoDiv !== 'undefined') infoDiv.textContent='Disconnected'; for(const id in players)removePlayerMesh(id); players={}; bullets=[];}); // Clear state
    socket.on('connect_error', function(err){console.error('Connect Err:',err.message); mapLoadState='error'; playerModelLoadState='error'; gunModelLoadState = 'error'; assetsReady=false; setGameState('loading',{message:`Connect Fail!<br/>${err.message}`,error:true});}); // Handle connection error
    socket.on('playerCountUpdate', function(count){playerCountSpan=playerCountSpan||document.getElementById('playerCount'); if(playerCountSpan)playerCountSpan.textContent=count; if(assetsReady&&socket.connected&&gameState==='loading')setGameState('homescreen',{playerCount:count});}); // Update count / show homescreen
    socket.on('initialize', function(data){handleInitialize(data);}); // Handle init data from server
    socket.on('playerJoined', function(d){handlePlayerJoined(d);}); // Handle other players joining
    socket.on('playerLeft', function(id){handlePlayerLeft(id);}); // Handle players leaving
    socket.on('playerMoved', function(d){updateRemotePlayerPosition(d);}); // Handle movement updates
    socket.on('shotFired', function(d){spawnBullet(d);}); // Handle bullets fired by others
    socket.on('healthUpdate', function(d){handleHealthUpdate(d);}); // Handle health changes
    socket.on('playerDied', function(d){handlePlayerDied(d);}); // Handle death events
    socket.on('playerRespawned', function(d){handlePlayerRespawned(d);}); // Handle respawn events
}

function handleInitialize(data) { // Handles server response after sending details
     console.log('Init handling.'); localPlayerId = data.id;
     for(const id in players)removePlayerMesh(id); players = {}; bullets = [];
     let iPosX=0,iPosY=0,iPosZ=0;
     for(const id in data.players){ const pD=data.players[id]; if(id===localPlayerId){ players[id]={...pD,name:localPlayerName,phrase:localPlayerPhrase,mesh:null}; iPosX=pD.x;iPosY=pD.y;iPosZ=pD.z; const visY=iPosY+PLAYER_HEIGHT; if(controls?.getObject()){controls.getObject().position.set(iPosX,visY,iPosZ);} velocityY=0;isOnGround=true; updateHealthBar(pD.health); infoDiv.textContent=`Playing as ${localPlayerName}`; }else{addPlayer(pD);}}
     console.log("Initialized players:",Object.keys(players).length); setGameState('playing'); // GO TO GAME
}
function attemptJoinGame() { // Triggered by button click
    localPlayerName = playerNameInput.value.trim() || 'Anonymous'; localPlayerPhrase = playerPhraseInput.value.trim() || '...'; if(!localPlayerName){homeScreenError.textContent='Enter name';return;} if(localPlayerPhrase.length>20){homeScreenError.textContent='Phrase too long';return;} homeScreenError.textContent='';
    console.log(`Joining as "${localPlayerName}"`); setGameState('joining',{waitingForAssets:!assetsReady}); // Enter joining state
    if(assetsReady){ sendJoinDetails(); }else console.log("Wait assets..."); // Send details if assets ready, else wait
}
function sendJoinDetails() { // Called when assets are ready AND joining state
    if(socket?.connected&&gameState==='joining'){ console.log("Sending details."); socket.emit('setPlayerDetails',{name:localPlayerName,phrase:localPlayerPhrase}); } // Send to server
    else if(gameState!=='joining'){ console.warn("Not joining state."); setGameState('homescreen',{playerCount:playerCountSpan?.textContent??'?'});} // Abort if state changed
    else{ console.error("Socket disconnected."); homeScreenError.textContent='Connection lost.'; setGameState('homescreen',{playerCount:playerCountSpan?.textContent??'?'});} // Abort on connection error
}

// Define handlers called by socket event listeners
function handlePlayerJoined(pD) { if(typeof addPlayer === 'function' && pD.id!==localPlayerId&&!players[pD.id]){addPlayer(pD);}}
function handlePlayerLeft(pId) { if(typeof removePlayerMesh === 'function') removePlayerMesh(pId); delete players[pId];}

function handleHealthUpdate(data) { // ADDED LOG
    console.log(`>>> NET: Received 'healthUpdate' for ${data.id}: ${data.health}`);
    if(players[data.id]){
        players[data.id].health=data.health;
        if(data.id===localPlayerId){
            if(typeof updateHealthBar === 'function') updateHealthBar(data.health); else console.error("updateHealthBar missing!");
        } else { /* console.log(`Remote player ${data.id} health set to ${data.health}`); */} // Reduce noise
    } else { console.warn(`Health update for unknown player ${data.id}`); }
}
function handlePlayerDied(data) { // ADDED LOG + uses name/phrase
    console.log(`>>> NET: Received 'playerDied' for ${data.targetId}`, data);
    if(players[data.targetId]){ players[data.targetId].health=0; if(players[data.targetId].mesh) players[data.targetId].mesh.visible=false; }
    else { console.warn(`Died event for unknown player ${data.targetId}`); }
    if(data.targetId===localPlayerId){ if(typeof updateHealthBar === 'function') updateHealthBar(0); const kN=data.killerName||'environment';const kP=data.killerPhrase||'...'; let msg=`You just got ${kP} by ${kN}.`; if(!data.killerId)msg=`You died.`; if(typeof showKillMessage === 'function') showKillMessage(msg); if(infoDiv) infoDiv.textContent=`YOU DIED`; }
}
function handlePlayerRespawned(pD) { // Includes name/phrase sync
     if(!players[pD.id]&&pD.id!==localPlayerId){if(typeof addPlayer === 'function') addPlayer(pD);}
     else if(players[pD.id]||pD.id===localPlayerId){const p=players[pD.id]||players[localPlayerId];p.health=pD.health;p.x=pD.x;p.y=pD.y;p.z=pD.z;p.rotationY=pD.rotationY;p.name=pD.name;p.phrase=pD.phrase; if(pD.id===localPlayerId){if(controls?.getObject())controls.getObject().position.set(p.x,p.y+PLAYER_HEIGHT,p.z);velocityY=0;isOnGround=true;if(typeof updateHealthBar === 'function') updateHealthBar(p.health); if(infoDiv) infoDiv.textContent=`Playing as ${localPlayerName}`; if(typeof showKillMessage === 'function') showKillMessage(""); if(killMessageDiv) killMessageDiv.classList.remove('visible');if(killMessageTimeout)clearTimeout(killMessageTimeout);}else{if(p.mesh){p.mesh.visible=true;let vY=p.mesh.geometry instanceof THREE.CylinderGeometry?p.y+(PLAYER_HEIGHT/2):p.y;p.mesh.position.set(p.x,vY,p.z);p.targetPosition=new THREE.Vector3(p.x,vY,p.z);p.targetRotationY=p.rotationY;}}}
}

console.log("network.js loaded");

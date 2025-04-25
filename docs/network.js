// docs/network.js

// Needs access to globals and functions from other files

function setupSocketIO() {
    console.log(`Connect: ${SERVER_URL}`); socket=io(SERVER_URL,{transports:['websocket'],autoConnect:true});

    socket.on('connect', function(){console.log('Socket OK! ID:',socket.id); if(typeof checkAssetsReady==='function') checkAssetsReady();});
    socket.on('disconnect', function(reason){console.warn('Disconnected:',reason); if(typeof setGameState==='function') setGameState('homescreen',{playerCount:0}); if(typeof infoDiv !== 'undefined' && infoDiv) infoDiv.textContent='Disconnected'; for(const id in players) if(typeof removePlayerMesh === 'function') removePlayerMesh(id); players={}; bullets=[];});
    socket.on('connect_error', function(err){console.error('Connect Err:',err.message); mapLoadState='error'; playerModelLoadState='error'; gunModelLoadState = 'error'; assetsReady=false; if(typeof setGameState === 'function') setGameState('loading',{message:`Connect Fail!<br/>${err.message}`,error:true});});
    socket.on('playerCountUpdate', function(count){playerCountSpan=playerCountSpan||document.getElementById('playerCount'); if(playerCountSpan)playerCountSpan.textContent=count; if(assetsReady&&socket.connected&&gameState==='loading'){ if(typeof setGameState === 'function') setGameState('homescreen',{playerCount:count});}});
    socket.on('initialize', function(data){if(typeof handleInitialize === 'function') handleInitialize(data);});
    socket.on('playerJoined', function(d){if(typeof handlePlayerJoined === 'function') handlePlayerJoined(d);});
    socket.on('playerLeft', function(id){if(typeof handlePlayerLeft === 'function') handlePlayerLeft(id);});
    socket.on('playerMoved', function(d){if(typeof updateRemotePlayerPosition === 'function') updateRemotePlayerPosition(d);});
    socket.on('shotFired', function(d){ console.log(">>> NET: Received 'shotFired'", d); if(typeof spawnBullet === 'function') spawnBullet(d); else console.error("spawnBullet missing!");});
    socket.on('healthUpdate', function(d){if(typeof handleHealthUpdate === 'function') handleHealthUpdate(d);});
    socket.on('playerDied', function(d){if(typeof handlePlayerDied === 'function') handlePlayerDied(d);});
    socket.on('playerRespawned', function(d){if(typeof handlePlayerRespawned === 'function') handlePlayerRespawned(d);});

    // --- Catch-All Debug Listener ---
    socket.onAny(function(eventName, ...args) { if (eventName !== 'playerMoved') console.log(`DEBUG: Received event: ${eventName}`, args); });
    // --- Test Ping Listener ---
    socket.on('ping', function(data){ console.log(">>> NET: Received 'ping' from server!", data); });

    console.log("Socket listeners attached inside setupSocketIO.");
} // End setupSocketIO


function handleInitialize(data) {
     console.log('Handling initialize data...'); localPlayerId = data.id;
     for(const id in players) if(typeof removePlayerMesh === 'function') removePlayerMesh(id); players = {}; bullets = [];
     let iPosX=0,iPosY=0,iPosZ=0;
     for(const id in data.players){ const pD=data.players[id]; if(id===localPlayerId){ players[id]={...pD,name:localPlayerName,phrase:localPlayerPhrase,mesh:null}; iPosX=pD.x;iPosY=pD.y;iPosZ=pD.z; const visY=iPosY+PLAYER_HEIGHT; if(controls?.getObject()){controls.getObject().position.set(iPosX,visY,iPosZ); console.log(`Set controls pos: X=${iPosX.toFixed(2)}, Y=${visY.toFixed(2)}, Z=${iPosZ.toFixed(2)}`);}else console.error("Controls missing!"); velocityY=0;isOnGround=true; if(typeof updateHealthBar==='function') updateHealthBar(pD.health); if(infoDiv) infoDiv.textContent=`Playing as ${localPlayerName}`; }else{ if(typeof addPlayer === 'function') addPlayer(pD);}}
     console.log("Initialized players:",Object.keys(players).length);
     if(typeof setGameState === 'function') setGameState('playing'); else console.error("setGameState missing!");
}

function attemptJoinGame() {
    console.log("--- attemptJoinGame called ---");
    playerNameInput = playerNameInput || document.getElementById('playerNameInput');
    playerPhraseInput = playerPhraseInput || document.getElementById('playerPhraseInput');
    homeScreenError = homeScreenError || document.getElementById('homeScreenError');
    if (!playerNameInput || !playerPhraseInput || !homeScreenError) { console.error("UI elements missing for attemptJoinGame!"); return; }
    localPlayerName = playerNameInput.value.trim() || 'Anonymous'; localPlayerPhrase = playerPhraseInput.value.trim() || '...';
    if (!localPlayerName){homeScreenError.textContent='Enter name';return;} if(localPlayerPhrase.length>20){homeScreenError.textContent='Phrase too long';return;} homeScreenError.textContent='';
    console.log(`Attempting Join as "${localPlayerName}" | Assets Ready: ${assetsReady}`);
    if(typeof setGameState==='function') setGameState('joining',{waitingForAssets:!assetsReady}); else console.error("setGameState missing!");
    if(assetsReady){ sendJoinDetails(); } else console.log("Wait assets...");
}

function sendJoinDetails() {
    console.log("--- sendJoinDetails called ---");
    homeScreenError = homeScreenError || document.getElementById('homeScreenError');
    playerCountSpan = playerCountSpan || document.getElementById('playerCount');
    if(socket?.connected && gameState==='joining'){ console.log("Socket connected & joining state OK. Emitting setPlayerDetails..."); socket.emit('setPlayerDetails',{name:localPlayerName,phrase:localPlayerPhrase}); }
    else if (gameState!=='joining'){ console.warn("! Aborting sendDetails: No longer in 'joining' state."); if(typeof setGameState==='function')setGameState('homescreen',{playerCount:playerCountSpan?.textContent??'?'}); }
    else{ console.error("! Aborting sendDetails: Socket not connected."); if(homeScreenError)homeScreenError.textContent='Connection lost.'; if(typeof setGameState==='function')setGameState('homescreen',{playerCount:playerCountSpan?.textContent??'?'}); }
}

// Define handlers called by socket event listeners
function handlePlayerJoined(pD) { if(typeof addPlayer === 'function' && pD.id!==localPlayerId&&!players[pD.id]){addPlayer(pD);}}
function handlePlayerLeft(pId) { if(typeof removePlayerMesh === 'function') removePlayerMesh(pId); delete players[pId];}
function handleHealthUpdate(data) {
    console.log(`>>> NET: Received 'healthUpdate' for ${data.id}: ${data.health}`);
    if(players[data.id]){ players[data.id].health=data.health; if(data.id===localPlayerId){ if(typeof updateHealthBar === 'function') updateHealthBar(data.health); }}
    else { console.warn(`Health update for unknown player ${data.id}`); }
}
function handlePlayerDied(data) {
    console.log(`>>> NET: Received 'playerDied' for ${data.targetId}`, data);
    if(players[data.targetId]){ players[data.targetId].health=0; if(players[data.targetId].mesh) players[data.targetId].mesh.visible=false; }
    else { console.warn(`Died event for unknown player ${data.targetId}`); }
    if(data.targetId===localPlayerId){ if(typeof updateHealthBar === 'function') updateHealthBar(0); const kN=data.killerName||'environment';const kP=data.killerPhrase||'...'; let msg=`You just got ${kP} by ${kN}.`; if(!data.killerId)msg=`You died.`; if(typeof showKillMessage === 'function') showKillMessage(msg); if(infoDiv) infoDiv.textContent=`YOU DIED`; }
}
function handlePlayerRespawned(pD) { if(!players[pD.id]&&pD.id!==localPlayerId){if(typeof addPlayer === 'function') addPlayer(pD);} else if(players[pD.id]||pD.id===localPlayerId){const p=players[pD.id]||players[localPlayerId];p.health=pD.health;p.x=pD.x;p.y=pD.y;p.z=pD.z;p.rotationY=pD.rotationY;p.name=pD.name;p.phrase=pD.phrase; if(pD.id===localPlayerId){if(controls?.getObject())controls.getObject().position.set(p.x,p.y+PLAYER_HEIGHT,p.z);velocityY=0;isOnGround=true;if(typeof updateHealthBar === 'function') updateHealthBar(p.health); if(infoDiv) infoDiv.textContent=`Playing as ${localPlayerName}`; if(typeof showKillMessage === 'function') showKillMessage(""); if(killMessageDiv) killMessageDiv.classList.remove('visible');if(killMessageTimeout)clearTimeout(killMessageTimeout);}else{if(p.mesh){p.mesh.visible=true;let vY=p.mesh.geometry instanceof THREE.CylinderGeometry?p.y+(PLAYER_HEIGHT/2):p.y;p.mesh.position.set(p.x,vY,p.z);p.targetPosition=new THREE.Vector3(p.x,vY,p.z);p.targetRotationY=p.rotationY;}}}}


console.log("network.js loaded");

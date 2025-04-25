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
    socket.on('shotFired', function(d){
        console.log(">>> NET: Received 'shotFired'", d); // Log receive
        if(typeof spawnBullet === 'function') spawnBullet(d); else console.error("spawnBullet missing!");
    }); // Handle bullets fired by others
    socket.on('healthUpdate', function(d){handleHealthUpdate(d);}); // Handle health changes
    socket.on('playerDied', function(d){handlePlayerDied(d);}); // Handle death events
    socket.on('playerRespawned', function(d){handlePlayerRespawned(d);}); // Handle respawn events
}

function handleInitialize(data) { /* ... Same ... */ }
function attemptJoinGame() { /* ... Same ... */ }
function sendJoinDetails() { /* ... Same ... */ }

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
function handlePlayerRespawned(pD) { /* ... Same ... */ }


console.log("network.js loaded");

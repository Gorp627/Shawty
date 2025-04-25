// docs/network.js

// <<< ADD LOG AT VERY TOP >>>
console.log("network.js file loaded, execution started");
// <<< ------------------- >>>


// Needs access to globals and functions from other files

function setupSocketIO() {
    // <<< ADD LOG AT START OF FUNCTION >>>
    console.log(">>> setupSocketIO function CALLED <<<");
    // <<< ---------------------------- >>>

    console.log(`Connect: ${SERVER_URL}`); // This attempts the connection
    socket=io(SERVER_URL,{transports:['websocket'],autoConnect:true});

    // --- Socket Event Listeners ---
    socket.on('connect', function(){console.log('Socket OK! ID:',socket.id); checkAssetsReady();});
    socket.on('disconnect', function(reason){console.warn('Disconnected:',reason); setGameState('homescreen',{playerCount:0}); if(typeof infoDiv !== 'undefined') infoDiv.textContent='Disconnected'; for(const id in players)removePlayerMesh(id); players={}; bullets=[];});
    socket.on('connect_error', function(err){console.error('Connect Err:',err.message); mapLoadState='error'; playerModelLoadState='error'; gunModelLoadState = 'error'; assetsReady=false; setGameState('loading',{message:`Connect Fail!<br/>${err.message}`,error:true});});
    socket.on('playerCountUpdate', function(count){playerCountSpan=playerCountSpan||document.getElementById('playerCount'); if(playerCountSpan)playerCountSpan.textContent=count; if(assetsReady&&socket.connected&&gameState==='loading')setGameState('homescreen',{playerCount:count});});
    socket.on('initialize', function(data){handleInitialize(data);});
    socket.on('playerJoined', function(d){handlePlayerJoined(d);});
    socket.on('playerLeft', function(id){handlePlayerLeft(id);});
    socket.on('playerMoved', function(d){updateRemotePlayerPosition(d);});
    socket.on('shotFired', function(d){ console.log(">>> NET: Received 'shotFired'", d); if(typeof spawnBullet === 'function') spawnBullet(d); else console.error("spawnBullet missing!");}); // Added log
    socket.on('healthUpdate', function(d){handleHealthUpdate(d);});
    socket.on('playerDied', function(d){handlePlayerDied(d);});
    socket.on('playerRespawned', function(d){handlePlayerRespawned(d);});

    console.log("[Minimal] Socket listeners attached inside setupSocketIO."); // Add confirmation log
}

function handleInitialize(data) { /* ... Same ... */ }
function attemptJoinGame() { /* ... Same ... */ }
function sendJoinDetails() { /* ... Same ... */ }

// Define handlers called by socket event listeners
function handlePlayerJoined(pD) { /* ... Same ... */ }
function handlePlayerLeft(pId) { /* ... Same ... */ }
function handleHealthUpdate(data) { /* ... Same (with logs) ... */ }
function handlePlayerDied(data) { /* ... Same (with logs) ... */ }
function handlePlayerRespawned(pD) { /* ... Same ... */ }


// console.log("network.js loaded"); // Already have log at top now

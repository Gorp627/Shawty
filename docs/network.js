// docs/network.js

// Needs access to globals and functions from other files

function setupSocketIO() {
    console.log(`Connect: ${SERVER_URL}`); socket=io(SERVER_URL,{transports:['websocket'],autoConnect:true});
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
}

function handleInitialize(data) { /* ... Same ... */ }

function attemptJoinGame() {
    // *** ADDED LOG AT VERY START ***
    console.log("--->>> attemptJoinGame START <<<---");
    // *******************************

    // Grab elements safely within the function call just in case
    playerNameInput = playerNameInput || document.getElementById('playerNameInput');
    playerPhraseInput = playerPhraseInput || document.getElementById('playerPhraseInput');
    homeScreenError = homeScreenError || document.getElementById('homeScreenError');
    if (!playerNameInput || !playerPhraseInput || !homeScreenError) {
        console.error("UI elements missing for attemptJoinGame!");
        return;
    }

    localPlayerName = playerNameInput.value.trim() || 'Anonymous';
    localPlayerPhrase = playerPhraseInput.value.trim() || '...';
    if (!localPlayerName){homeScreenError.textContent='Enter name';return;}
    if (localPlayerPhrase.length>20){homeScreenError.textContent='Phrase too long';return;}
    homeScreenError.textContent='';

    console.log(`Attempting Join as "${localPlayerName}" | Assets Ready: ${assetsReady}`); // Add log
    setGameState('joining',{waitingForAssets:!assetsReady});

    if(assetsReady){
        sendJoinDetails(); // Assets were already ready
    } else {
        console.log("Waiting for assets..."); // Will wait for checkAssetsReady
    }
}

function sendJoinDetails() {
    console.log("--- sendJoinDetails called ---"); // Add log
    if(socket?.connected && gameState==='joining'){
        console.log("Socket connected & joining state OK. Emitting setPlayerDetails..."); // Add log
        socket.emit('setPlayerDetails',{name:localPlayerName,phrase:localPlayerPhrase});
    } else if (gameState!=='joining'){
         console.warn("! Aborting sendDetails: No longer in 'joining' state.");
         setGameState('homescreen',{playerCount:playerCountSpan?.textContent??'?'});
    } else {
        console.error("! Aborting sendDetails: Socket not connected.");
        homeScreenError = homeScreenError || document.getElementById('homeScreenError'); // Ensure exists
        if (homeScreenError) homeScreenError.textContent = 'Connection issue. Cannot join.';
        setGameState('homescreen',{playerCount:playerCountSpan?.textContent??'?'});
    }
}

// Define handlers called by socket event listeners
function handlePlayerJoined(pD) { /* ... Same ... */ }
function handlePlayerLeft(pId) { /* ... Same ... */ }
function handleHealthUpdate(data) { /* ... Same (with logs) ... */ }
function handlePlayerDied(data) { /* ... Same (with logs) ... */ }
function handlePlayerRespawned(pD) { /* ... Same ... */ }


console.log("network.js loaded");

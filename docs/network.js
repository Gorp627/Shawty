// docs/network.js

function setupSocketIO() { /* ... Same ... */ }
function handleInitialize(data) { /* ... Same ... */ }

function attemptJoinGame() {
    console.log("--- attemptJoinGame called ---"); // <<< ADD LOG
    localPlayerName = playerNameInput.value.trim() || 'Anonymous';
    localPlayerPhrase = playerPhraseInput.value.trim() || '...';
    if (!localPlayerName){homeScreenError.textContent='Enter name';return;}
    if (localPlayerPhrase.length>20){homeScreenError.textContent='Phrase too long';return;}
    homeScreenError.textContent='';
    console.log(`Attempting Join as "${localPlayerName}" | Assets Ready: ${assetsReady}`); // <<< ADD LOG
    setGameState('joining',{waitingForAssets:!assetsReady});
    if(assetsReady){
        sendJoinDetails(); // Assets were already ready
    } else {
        console.log("Waiting for assets..."); // Will wait for checkAssetsReady
    }
}

function sendJoinDetails() {
    console.log("--- sendJoinDetails called ---"); // <<< ADD LOG
    if(socket?.connected && gameState==='joining'){
        console.log("Socket connected & joining state OK. Emitting setPlayerDetails..."); // <<< ADD LOG
        socket.emit('setPlayerDetails',{name:localPlayerName,phrase:localPlayerPhrase});
    } else if (gameState!=='joining'){
         console.warn("! Aborting sendDetails: No longer in 'joining' state.");
         setGameState('homescreen',{playerCount:playerCountSpan?.textContent??'?'});
    } else {
        console.error("! Aborting sendDetails: Socket not connected.");
        homeScreenError.textContent='Connection lost.';
        setGameState('homescreen',{playerCount:playerCountSpan?.textContent??'?'});
    }
}

// --- Event Handlers ---
function handlePlayerJoined(pD) { /* ... Same ... */ }
function handlePlayerLeft(pId) { /* ... Same ... */ }
function handleHealthUpdate(data) { /* ... Same (with logs) ... */ }
function handlePlayerDied(data) { /* ... Same (with logs) ... */ }
function handlePlayerRespawned(pD) { /* ... Same ... */ }

console.log("network.js loaded");

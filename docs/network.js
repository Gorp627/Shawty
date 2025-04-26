// docs/network.js

function setupSocketIO() {
    console.log(`Connect: ${SERVER_URL}`); socket=io(SERVER_URL,{transports:['websocket'],autoConnect:true});
    socket.on('connect', function(){console.log('Socket OK! ID:',socket.id); if(typeof checkAssetsReady==='function') checkAssetsReady();});
    socket.on('disconnect', function(reason){console.warn('Disconnected:',reason); if(typeof stateMachine !== 'undefined') stateMachine.transitionTo('homescreen',{playerCount:0}); if(typeof infoDiv !== 'undefined' && infoDiv) infoDiv.textContent='Disconnected'; for(const id in players) if(typeof removePlayerMesh === 'function') removePlayerMesh(id); players={}; bullets=[];});
    socket.on('connect_error', function(err){console.error('Connect Err:',err.message); mapLoadState='error'; playerModelLoadState='error'; gunModelLoadState = 'error'; assetsReady=false; if(typeof stateMachine !== 'undefined') stateMachine.transitionTo('loading',{message:`Connect Fail!<br/>${err.message}`,error:true});});

    // --- Player Count Update Handler ---
    socket.on('playerCountUpdate', function(count){
        console.log(`Player count update received: ${count}`); // Log received count
        // *** Get element reference INSIDE the handler ***
        const playerCountSpanElement = document.getElementById('playerCount');
        // **********************************************
        if (playerCountSpanElement) { // Check if element was found
            playerCountSpanElement.textContent = count; // Update text content
            console.log("Updated playerCountSpan content.");
        } else {
            console.warn("playerCountSpan element not found when trying to update count!");
        }
        // We no longer try to change state here, connect handler does that
        // if(assetsReady&&socket.connected&&gameState==='loading'){setGameState('homescreen',{playerCount:count});}
    });
    // ---------------------------------

    socket.on('initialize', function(data){ if(typeof handleInitialize === 'function') handleInitialize(data); else console.error("handleInitialize missing!"); });
    socket.on('playerJoined', function(d){ if(typeof handlePlayerJoined === 'function') handlePlayerJoined(d); else console.error("handlePlayerJoined missing!"); });
    socket.on('playerLeft', function(id){ if(typeof handlePlayerLeft === 'function') handlePlayerLeft(id); else console.error("handlePlayerLeft missing!"); });
    socket.on('gameStateUpdate', function(d){ if(typeof handleGameStateUpdate === 'function') handleGameStateUpdate(d); else console.error("handleGameStateUpdate missing!"); });
    socket.on('shotFired', function(d){ if(typeof handleShotFired === 'function') handleShotFired(d); else console.error("handleShotFired missing!"); });
    socket.on('healthUpdate', function(d){ if(typeof handleHealthUpdate === 'function') handleHealthUpdate(d); else console.error("handleHealthUpdate missing!"); });
    socket.on('playerDied', function(d){ if(typeof handlePlayerDied === 'function') handlePlayerDied(d); else console.error("handlePlayerDied missing!"); });
    socket.on('playerRespawned', function(d){ if(typeof handlePlayerRespawned === 'function') handlePlayerRespawned(d); else console.error("handlePlayerRespawned missing!"); });
    socket.onAny(function(eventName, ...args) { if (eventName !== 'gameStateUpdate') console.log(`DEBUG Event: ${eventName}`); });
    socket.on('ping', function(data){ console.log(">>> NET: Received 'ping' from server!", data); });

    console.log("Socket listeners attached inside Network.setupSocketIO.");
} // End setupSocketIO

function handleInitialize(data) { /* ... Same ... */ }
function attemptJoinGame() { /* ... Same ... */ }
function sendJoinDetails() { /* ... Same ... */ }
function handlePlayerJoined(pD) { /* ... Same ... */ }
function handlePlayerLeft(pId) { /* ... Same ... */ }
function handleHealthUpdate(data) { /* ... Same ... */ }
function handlePlayerDied(data) { /* ... Same ... */ }
function handlePlayerRespawned(pD) { /* ... Same ... */ }
function handleShotFired(d){ if(typeof spawnBullet === 'function') spawnBullet(d); else console.error("spawnBullet missing!"); } // Define globally accessible handler

// Make some network functions globally accessible IF THEY ARE CALLED EXTERNALLY
// For now, keep them within Network object if defined, otherwise global assumes loaded.
// const Network = { ... } // If using object structure from previous refactor idea

console.log("network.js loaded");

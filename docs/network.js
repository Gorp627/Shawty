// docs/network.js

// Needs access to globals and functions from other files

function setupSocketIO() {
    console.log(`Connect: ${SERVER_URL}`); socket=io(SERVER_URL,{transports:['websocket'],autoConnect:true});
    socket.on('connect', function(){console.log('Socket OK! ID:',socket.id); checkAssetsReady();}); // Check assets on connect
    socket.on('disconnect', function(reason){console.warn('Disconnected:',reason); setGameState('homescreen',{playerCount:0}); if(typeof infoDiv !== 'undefined') infoDiv.textContent='Disconnected'; for(const id in players)removePlayerMesh(id); players={}; bullets=[];}); // Clear state
    socket.on('connect_error', function(err){console.error('Connect Err:',err.message); mapLoadState='error'; playerModelLoadState='error'; gunModelLoadState = 'error'; assetsReady=false; setGameState('loading',{message:`Connect Fail!<br/>${err.message}`,error:true});}); // Handle connection error
    socket.on('playerCountUpdate', function(count){playerCountSpan=playerCountSpan||document.getElementById('playerCount'); if(playerCountSpan)playerCountSpan.textContent=count; if(assetsReady&&socket.connected&&gameState==='loading')setGameState('homescreen',{playerCount:count});}); // Update count / show homescreen
    socket.on('initialize', function(data){ handleInitialize(data); }); // Handle init data from server
    socket.on('playerJoined', function(d){handlePlayerJoined(d);}); // Handle other players joining
    socket.on('playerLeft', function(id){handlePlayerLeft(id);}); // Handle players leaving
    socket.on('playerMoved', function(d){updateRemotePlayerPosition(d);}); // Handle movement updates
    socket.on('shotFired', function(d){ console.log(">>> NET: Received 'shotFired'", d); if(typeof spawnBullet === 'function') spawnBullet(d); else console.error("spawnBullet missing!");}); // Added log
    socket.on('healthUpdate', function(d){handleHealthUpdate(d);}); // Handle health changes
    socket.on('playerDied', function(d){handlePlayerDied(d);}); // Handle death events
    socket.on('playerRespawned', function(d){handlePlayerRespawned(d);}); // Handle respawn events

    // --- Catch-All Debug Listener ---
    socket.onAny(function(eventName, ...args) { if (eventName !== 'playerMoved') console.log(`DEBUG: Received event: ${eventName}`, args); });
    // --- Test Ping Listener ---
    socket.on('ping', function(data){ console.log(">>> NET: Received 'ping' from server!", data); });

    console.log("[Minimal] Socket listeners attached inside setupSocketIO.");
} // End setupSocketIO

function handleInitialize(data) { // Separate initialization logic
     console.log('Initialize handling.'); localPlayerId = data.id;
     for(const id in players) if(typeof removePlayerMesh === 'function') removePlayerMesh(id); else console.error("removePlayerMesh missing!");
     players = {}; bullets = [];
     let iPosX=0,iPosY=0,iPosZ=0; // Defaults

     for(const id in data.players){
         const pD=data.players[id];
         if(id===localPlayerId){
             players[id]={...pD,name:localPlayerName,phrase:localPlayerPhrase,mesh:null};
             iPosX=pD.x;iPosY=pD.y;iZ=pD.z; // Get server position
             const visualY = iPosY + PLAYER_HEIGHT; // Calculate visual Y

             // *** ADDED LOGGING FOR POSITION ***
             console.log(`--- Initializing Player Position ---`);
             console.log(`Server Coords (x,y,z): ${iPosX.toFixed(2)}, ${iPosY.toFixed(2)}, ${iPosZ.toFixed(2)}`);
             console.log(`Calculated Visual Y for Controls Object: ${visualY.toFixed(2)}`);
             // **********************************

             if(controls?.getObject()){
                 controls.getObject().position.set(iPosX,visualY,iPosZ); // Set position
                 console.log(`Controls Object new position:`, controls.getObject().position.toArray().map(n => n.toFixed(2))); // Log after setting
                 velocityY=0;isOnGround=true; // Reset physics state
             } else {
                  console.error("!!! Controls object missing during initialize!");
             }
             // Ensure UI update functions exist before calling
             if(typeof updateHealthBar === 'function') updateHealthBar(pD.health); else console.error("updateHealthBar missing!");
             if(typeof infoDiv !== 'undefined' && infoDiv) infoDiv.textContent=`Playing as ${localPlayerName}`; else console.error("infoDiv missing!");

         } else {
            if(typeof addPlayer === 'function') addPlayer(pD); else console.error("addPlayer function missing!"); // Add OTHER players
         }
     }
     console.log("Player data processed. Initialized players:",Object.keys(players).length);

    // *** TEMP: FORCE CAMERA POSITION AFTER INIT ***
    if (controls?.getObject()) {
        controls.getObject().position.set(0, 5, 10); // Position: X=0, Y=5 (above ground), Z=10 (back from origin)
        camera.lookAt(0, 0, 0); // Make camera look towards origin
        // Update controls internal state after manually setting position (important!)
        // controls.update(); // PointerLockControls might not have a public update method like OrbitControls
        console.log("!!! TEMP: Forced camera position to [0, 5, 10] and lookAt(0,0,0)");
    } else {
        console.warn("!!! TEMP: Could not force camera position, controls object missing.");
    }
    // ******************************************


     console.log("--- Calling setGameState('playing') from Initialize ---"); // Log before switching state
     if(typeof setGameState === 'function') setGameState('playing'); else console.error("setGameState function missing!");// Switch to game view *after* setting position AND potentially forcing cam pos
}
function attemptJoinGame() { /* ... Same as response #55 ... */ }
function sendJoinDetails() { /* ... Same as response #55 ... */ }

// Define handlers called by socket event listeners
function handlePlayerJoined(pD) { /* ... Same as response #55 ... */ }
function handlePlayerLeft(pId) { /* ... Same as response #55 ... */ }
function handleHealthUpdate(data) { /* ... Same as response #63 (with logs) ... */ }
function handlePlayerDied(data) { /* ... Same as response #55 (with logs) ... */ }
function handlePlayerRespawned(pD) { /* ... Same as response #55 ... */ }


console.log("network.js loaded");

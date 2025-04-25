// docs/network.js

// Needs access to globals: socket, players, localPlayerId, localPlayerName, localPlayerPhrase, gameState, assetsReady
// Needs access to constants: SERVER_URL
// Needs access to functions: checkAssetsReady, setGameState, removePlayerMesh, handleInitialize, handlePlayerJoined, etc., addPlayer, updateRemotePlayerPosition, spawnBullet, handleHealthUpdate, handlePlayerDied, handlePlayerRespawned

function setupSocketIO() {
    console.log(`Connect: ${SERVER_URL}`); socket=io(SERVER_URL,{transports:['websocket'],autoConnect:true});
    socket.on('connect',function(){console.log('Socket OK! ID:',socket.id); checkAssetsReady();}); // Check assets on connect
    socket.on('disconnect',function(reason){console.warn('Disconnected:',reason); setGameState('homescreen',{playerCount:0}); infoDiv.textContent='Disconnected'; for(const id in players)removePlayerMesh(id); players={}; bullets=[];}); // Clear state
    socket.on('connect_error',function(err){console.error('Connect Err:',err.message); mapLoadState='error'; playerModelLoadState='error'; assetsReady=false; setGameState('loading',{message:`Connect Fail!<br/>${err.message}`,error:true});}); // Handle connection error
    socket.on('playerCountUpdate',function(count){playerCountSpan=playerCountSpan||document.getElementById('playerCount'); if(playerCountSpan)playerCountSpan.textContent=count; if(assetsReady&&socket.connected&&gameState==='loading')setGameState('homescreen',{playerCount:count});}); // Update count / show homescreen
    socket.on('initialize',function(data){handleInitialize(data);}); // Handle init data from server
    socket.on('playerJoined',function(d){handlePlayerJoined(d);}); // Handle other players joining
    socket.on('playerLeft',function(id){handlePlayerLeft(id);}); // Handle players leaving
    socket.on('playerMoved',function(d){updateRemotePlayerPosition(d);}); // Handle movement updates
    socket.on('shotFired',function(d){spawnBullet(d);}); // Handle bullets fired by others
    socket.on('healthUpdate',function(d){handleHealthUpdate(d);}); // Handle health changes
    socket.on('playerDied',function(d){handlePlayerDied(d);}); // Handle death events
    socket.on('playerRespawned',function(d){handlePlayerRespawned(d);}); // Handle respawn events
}

function handleInitialize(data) { // Separate initialization logic
     console.log('Initialize handling.'); localPlayerId = data.id;
     for(const id in players)removePlayerMesh(id); players = {}; bullets = [];
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
     console.log("--- Calling setGameState('playing') from Initialize ---"); // Log before switching state
     if(typeof setGameState === 'function') setGameState('playing'); else console.error("setGameState function missing!");// Switch to game view *after* setting position
}
function attemptJoinGame() {
    localPlayerName = playerNameInput.value.trim() || 'Anonymous'; localPlayerPhrase = playerPhraseInput.value.trim() || '...'; if(!localPlayerName){homeScreenError.textContent='Enter name';return;} if(localPlayerPhrase.length>20){homeScreenError.textContent='Phrase too long';return;} homeScreenError.textContent='';
    console.log(`Joining as "${localPlayerName}"`); setGameState('joining',{waitingForAssets:!assetsReady});
    if(assetsReady){ sendJoinDetails(); }else console.log("Wait assets...");
}
function sendJoinDetails() {
    if(socket?.connected&&gameState==='joining'){ console.log("Sending details."); socket.emit('setPlayerDetails',{name:localPlayerName,phrase:localPlayerPhrase}); }
    else if(gameState!=='joining'){ console.warn("Not joining state."); setGameState('homescreen',{playerCount:playerCountSpan?.textContent??'?'});}
    else{ console.error("Socket disconnected."); homeScreenError.textContent='Connection lost.'; setGameState('homescreen',{playerCount:playerCountSpan?.textContent??'?'});}
}

// Define handlers called by socket event listeners
function handlePlayerJoined(pD) { if(pD.id!==localPlayerId&&!players[pD.id]){ if(typeof addPlayer === 'function') addPlayer(pD); else console.error("addPlayer missing!"); } }
function handlePlayerLeft(pId) { if(typeof removePlayerMesh === 'function') removePlayerMesh(pId); else console.error("removePlayerMesh missing!"); delete players[pId];}
function handleHealthUpdate(d) { if(players[d.id]){players[d.id].health=d.health;if(d.id===localPlayerId){if(typeof updateHealthBar === 'function') updateHealthBar(d.health); else console.error("updateHealthBar missing!");}}}
function handlePlayerDied(data) { if(players[data.targetId]){players[data.targetId].health=0;if(players[data.targetId].mesh)players[data.targetId].mesh.visible=false;} if(data.targetId===localPlayerId){if(typeof updateHealthBar === 'function') updateHealthBar(0); else console.error("updateHealthBar missing!"); const kN=data.killerName||'environment';const kP=data.killerPhrase||'...';let msg=`You just got ${kP} by ${kN}.`;if(!data.killerId)msg=`You died.`;if(typeof showKillMessage === 'function') showKillMessage(msg); else console.error("showKillMessage missing!"); if(infoDiv) infoDiv.textContent=`YOU DIED`;} }
function handlePlayerRespawned(pD) { if(!players[pD.id]&&pD.id!==localPlayerId){if(typeof addPlayer === 'function') addPlayer(pD); else console.error("addPlayer missing!");}else if(players[pD.id]||pD.id===localPlayerId){const p=players[pD.id]||players[localPlayerId];p.health=pD.health;p.x=pD.x;p.y=pD.y;p.z=pD.z;p.rotationY=pD.rotationY;p.name=pD.name;p.phrase=pD.phrase; if(pD.id===localPlayerId){if(controls?.getObject())controls.getObject().position.set(p.x,p.y+PLAYER_HEIGHT,p.z);velocityY=0;isOnGround=true;if(typeof updateHealthBar === 'function') updateHealthBar(p.health); if(infoDiv) infoDiv.textContent=`Playing as ${localPlayerName}`; if(typeof showKillMessage === 'function') showKillMessage(""); else console.error("showKillMessage missing!"); killMessageDiv.classList.remove('visible');if(killMessageTimeout)clearTimeout(killMessageTimeout);}else{if(p.mesh){p.mesh.visible=true;let vY=p.mesh.geometry instanceof THREE.CylinderGeometry?p.y+(PLAYER_HEIGHT/2):p.y;p.mesh.position.set(p.x,vY,p.z);p.targetPosition=new THREE.Vector3(p.x,vY,p.z);p.targetRotationY=p.rotationY;}}}}


console.log("network.js loaded");

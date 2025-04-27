// docs/network.js (Manual Physics - Raycast on Respawn)

// Depends on: config.js, stateMachine.js, entities.js, input.js, uiManager.js, game.js
// Accesses globals: players, localPlayerId, socket, controls, CONFIG, THREE, stateMachine, UIManager, ClientPlayer, scene, infoDiv, currentGameInstance, assetsAreReady, velocityY, isOnGround, raycaster, mapMesh

var socket;

const Network = {
    init: function() { this.setupSocketIO(); console.log("[Network] Initialized."); },
    isConnected: function() { return typeof socket !== 'undefined' && socket && socket.connected; },

    setupSocketIO: function() {
        if (!CONFIG?.SERVER_URL) { console.error("CFG SERVER_URL missing!"); stateMachine?.transitionTo('loading',{message:"Net Cfg Err!",error:true}); return; } console.log(`Connecting to: ${CONFIG.SERVER_URL}`); try { if(!io) throw new Error("Socket.IO missing!"); socket = io(CONFIG.SERVER_URL, { transports: ['websocket'], autoConnect: true }); console.log("Socket init..."); } catch (e) { console.error("Socket.IO Err:", e); stateMachine?.transitionTo('loading',{message:`Net Init Err! ${e.message}`,error:true}); return; }
        socket.on('connect', () => { console.log('Socket Connected! ID:', socket.id); networkIsInitialized = true; currentGameInstance?.attemptProceedToGame(); }); socket.on('disconnect', (reason) => { console.warn('Disconnected:', reason); networkIsInitialized = false; initializationData = null; stateMachine?.transitionTo('homescreen', { playerCount: 0 }); if(UIManager) { UIManager.updatePlayerCount(0); UIManager.showError("Disconnected.", 'homescreen'); } if(infoDiv) infoDiv.textContent='Disc.'; if(controls?.isLocked) controls.unlock(); }); socket.on('connect_error', (err) => { console.error('Net Conn Err:', err.message); networkIsInitialized = false; if(stateMachine?.is('loading')||stateMachine?.is('joining')) stateMachine.transitionTo('loading',{message:`Conn Fail!<br/>${err.message}`,error:true}); else { stateMachine?.transitionTo('homescreen'); UIManager?.showError(`Conn Fail: ${err.message}`, 'homescreen');} }); socket.on('playerCountUpdate', (count) => { if (UIManager) UIManager.updatePlayerCount(count); });
        socket.on('initialize', (data) => Network.handleInitialize(data) ); socket.on('playerJoined', (data) => Network.handlePlayerJoined(data) ); socket.on('playerLeft', (id) => Network.handlePlayerLeft(id) ); socket.on('gameStateUpdate', (data) => Network.handleGameStateUpdate(data) ); socket.on('healthUpdate', (data) => Network.handleHealthUpdate(data) ); socket.on('playerDied', (data) => Network.handlePlayerDied(data) ); socket.on('playerRespawned', (data) => Network.handlePlayerRespawned(data) ); socket.on('serverFull', () => Network.handleServerFull() ); console.log("Network listeners attached.");
    },

    _getPlayer: function(id) { return players?.[id] || null; },
    _addPlayer: function(playerData) { if(!ClientPlayer || !players) return null; if(playerData?.id && !players[playerData.id]){ console.log(`Creating ClientPlayer visual: ${playerData.name || '??'}`); players[playerData.id] = new ClientPlayer(playerData); return players[playerData.id]; } return null; },
    _removePlayer: function(playerId) { const player = this._getPlayer(playerId); if (player) { console.log(`Removing player: ${player.name || playerId}`); if (player instanceof ClientPlayer) player.remove?.(); if (players?.[playerId]) delete players[playerId]; } },

    handleInitialize: function(data) { console.log('[Net] RX initialize'); if (!data?.id || !data.players) { console.error("Invalid init data"); stateMachine?.transitionTo('homescreen'); UIManager?.showError("Server Init Invalid", "homescreen"); return; } initializationData = data; networkIsInitialized = true; console.log("Net Initialized flag set TRUE."); currentGameInstance?.attemptProceedToGame(); },
    handlePlayerJoined: function(playerData) { if (playerData?.id !== localPlayerId && !this._getPlayer(playerData.id)) { const name = playerData.name || 'Player'; console.log(`Player joined event: ${name}`); const newPlayer = this._addPlayer(playerData); if(UIManager?.showKillMessage) UIManager.showKillMessage(`${name} joined.`); } },
    handlePlayerLeft: function(playerId) { if(playerId){ const pName=players?.[playerId]?.name||'Player'; console.log(`Player left event: ${pName}`); this._removePlayer(playerId); if(UIManager?.showKillMessage) UIManager.showKillMessage(`${pName} left.`);}},
    handleGameStateUpdate: function(state) { if(!players || !state?.players || !stateMachine?.is('playing') || !localPlayerId) return; for (const id in state.players) { const sPD = state.players[id]; if (id !== localPlayerId) { const rp = players[id]; if (rp instanceof ClientPlayer) { rp.updateData(sPD); } }} },
    handleHealthUpdate: function(data) { if(!data?.id||data.health===undefined) return; const p=this._getPlayer(data.id); if(p){p.health=data.health; if(data.id===localPlayerId&&UIManager)UIManager.updateHealthBar(p.health);} },
    handlePlayerDied: function(data) { if (!data?.targetId) return; console.log(`>>> Died: ${data.targetId}`); const targetP=this._getPlayer(data.targetId); if(targetP) targetP.health=0; if(data.targetId===localPlayerId){ if(UIManager){ UIManager.updateHealthBar(0); let m=data.killerId===null?"Fell out.":`${data.killerName||'P'} ${data.killerPhrase||'el.'} ${targetP?.name||'you'}`; UIManager.showKillMessage(m); } if(infoDiv) infoDiv.textContent=`DEAD`; if(controls?.isLocked) controls.unlock(); } else if(targetP instanceof ClientPlayer){ targetP.setVisible?.(false); if(UIManager){ let m=`${targetP.name||'P'} elim.`; if(data.killerName&&data.killerId!==null) m=`${data.killerName} ${data.killerPhrase||'el.'} ${targetP.name}`; else if(data.killerId===null) m=`${targetP.name||'P'} fell out.`; UIManager.showKillMessage(m);} } },

    // --- MODIFIED RESPAWN HANDLER ---
    handlePlayerRespawned: function(playerData) {
         if(!playerData?.id) return;
         console.log(`>>> Respawn Event: ${playerData.name}`);
         let player = this._getPlayer(playerData.id);
         const playerHeight = CONFIG?.PLAYER_HEIGHT||1.8;
         const cameraHeight = CONFIG?.CAMERA_Y_OFFSET || 1.6;

         if (playerData.id === localPlayerId) {
              console.log("Handling LOCAL player respawn.");
              if (!player){ player={isLocal: true}; players[localPlayerId]=player; }

              player.health=playerData.health; player.name=playerData.name; player.phrase=playerData.phrase;
              // Use server X/Z as starting point for raycast search
              let currentSpawnX = playerData.x; let currentSpawnZ = playerData.z;
              let foundGroundY = 0; let foundGround = false; let attempts = 0;
              const maxSpawnAttempts = 5; const spawnCheckHeight = 150.0;
              const spawnRayDir = new THREE.Vector3(0, -1, 0);

              console.log(`Attempting respawn raycast at server coords: X=${currentSpawnX.toFixed(1)}, Z=${currentSpawnZ.toFixed(1)}`);

              // --- Respawn Raycast Logic ---
              if (typeof mapMesh !== 'undefined' && mapMesh) {
                    while (!foundGround && attempts < maxSpawnAttempts) {
                        attempts++;
                        const spawnRayOrigin = new THREE.Vector3(currentSpawnX, spawnCheckHeight, currentSpawnZ);
                        if (!raycaster) raycaster = new THREE.Raycaster();
                        raycaster.set(spawnRayOrigin, spawnRayDir); raycaster.far = spawnCheckHeight + 100;
                        const intersects = raycaster.intersectObject(mapMesh, true);
                        if (intersects.length > 0) { foundGroundY = intersects[0].point.y; foundGround = true; console.log(`Respawn ray ${attempts} HIT! Y: ${foundGroundY.toFixed(2)} at X:${currentSpawnX.toFixed(1)}, Z:${currentSpawnZ.toFixed(1)}`); break; }
                        else { console.warn(`Respawn ray ${attempts} MISSED at X:${currentSpawnX.toFixed(1)}, Z:${currentSpawnZ.toFixed(1)}.`); if (attempts < maxSpawnAttempts) { const boundX = CONFIG?.MAP_BOUNDS_X || 50; const boundZ = CONFIG?.MAP_BOUNDS_Z || 50; currentSpawnX = Math.random()*(boundX*1.8)-(boundX*0.9); currentSpawnZ = Math.random()*(boundZ*1.8)-(boundZ*0.9); console.log(`Retrying at random XZ: ${currentSpawnX.toFixed(1)}, ${currentSpawnZ.toFixed(1)}`); } else { console.error(`Max respawn attempts! Default Y=0.`); foundGroundY = 0; } }
                    }
              } else { console.error("mapMesh missing during respawn! Default Y=0."); foundGroundY = 0; }
              // --- End Raycast Logic ---

              player.x=currentSpawnX; player.y=foundGroundY; player.z=currentSpawnZ; player.rotationY=playerData.rotationY; // Update cache with final coords

              const spawnBuffer = 0.1; const finalVisualY = foundGroundY + cameraHeight + spawnBuffer;
              if (controls?.getObject()){ controls.getObject().position.set(currentSpawnX, finalVisualY, currentSpawnZ); controls.getObject().rotation.set(0, playerData.rotationY || 0, 0); console.log(`Set FINAL respawn controls pos(${currentSpawnX.toFixed(1)}, ${finalVisualY.toFixed(1)}, ${currentSpawnZ.toFixed(1)})`); }

              velocityY = 0; isOnGround = true; // Reset manual physics state
              console.log("Reset local physics state on respawn.");
              if (UIManager){ UIManager.updateHealthBar(player.health); UIManager.updateInfo(`Playing as ${player.name}`); UIManager.clearKillMessage();}

         } else { // REMOTE player respawn
              console.log(`REMOTE respawn: ${playerData.name}.`); if(!player||!(player instanceof ClientPlayer)){ console.warn(`Respawn recreate ${playerData.id}...`); this._removePlayer(playerData.id); player=this._addPlayer(playerData); if(!player){console.error("Recreate fail!");return;}}
              player.updateData(playerData); player.setVisible?.(true);
              if (player.mesh) { let visualY = playerData.y; if (player.mesh.geometry instanceof THREE.CylinderGeometry) visualY += playerHeight / 2.0; player.mesh.position.set(playerData.x, visualY, playerData.z); player.mesh.rotation.y = playerData.rotationY || 0; }
              console.log("Reset remote player state/visuals.");
         }
    }, // --- END MODIFIED RESPAWN HANDLER ---

    handleServerFull: function() { console.warn("Server Full."); if(socket) socket.disconnect(); stateMachine?.transitionTo('loading',{message:`Server Full!`,error:true}); },
    attemptJoinGame: function() { console.log("Attempt Join..."); if (!UIManager?.playerNameInput || !UIManager.playerPhraseInput) {return;} localPlayerName=UIManager.playerNameInput.value.trim()||'Anon'; localPlayerPhrase=UIManager.playerPhraseInput.value.trim()||'...'; if(!localPlayerName){UIManager.showError('Need name.', 'homescreen');return;} UIManager.clearError('homescreen'); if (!assetsAreReady) {UIManager.showError('Loading...','homescreen');return;} stateMachine?.transitionTo('joining'); if(UIManager.joinButton){UIManager.joinButton.disabled=true; UIManager.joinButton.textContent="Joining...";} if (Network.isConnected()) {console.log("Connected -> sendDetails"); Network.sendJoinDetails();} else { console.log("Not Connected -> Wait"); if(UIManager.joinButton) UIManager.joinButton.textContent="Connecting..."; if (socket && !socket.active) { socket.connect(); } } },
    sendJoinDetails: function() { if(!stateMachine?.is('joining')){console.warn("Not joining state.");return;} if(!Network.isConnected()){console.error("Disconnected"); stateMachine?.transitionTo('homescreen'); UIManager?.showError('Lost connection.', 'homescreen'); return;} console.log(`TX setPlayerDetails Name: ${localPlayerName}`); socket.emit('setPlayerDetails', { name: localPlayerName, phrase: localPlayerPhrase }); },
    sendPlayerUpdate: function(data) { const p=this._getPlayer(localPlayerId); if(Network.isConnected() && stateMachine?.is('playing') && p?.health > 0) { socket.emit('playerUpdate', data); } },
    sendVoidDeath: function() { if(Network.isConnected() && stateMachine?.is('playing')){ console.log("TX fellIntoVoid"); socket.emit('fellIntoVoid'); } }

}; // End Network object

window.Network = Network;
console.log("network.js loaded (Manual Physics - Added Raycast to Respawn)");

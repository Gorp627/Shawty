// docs/network.js (Adapted for Rapier - Detailed Check Logging)

// Depends on: config.js, stateMachine.js, entities.js, input.js, uiManager.js, game.js
// Accesses globals: players, localPlayerId, socket, controls, CONFIG, RAPIER, rapierWorld,
//                   stateMachine, UIManager, ClientPlayer, scene, infoDiv, currentGameInstance, assetsAreReady

var socket; // Global socket variable

const Network = {
    init: function() { this.setupSocketIO(); console.log("[Network] Initialized."); },
    isConnected: function() { return typeof socket !== 'undefined' && socket && socket.connected; },

    setupSocketIO: function() {
        if (!CONFIG?.SERVER_URL) { console.error("CFG SERVER_URL missing!"); stateMachine?.transitionTo('loading',{message:"Net Cfg Err!",error:true}); return; }
        console.log(`Connecting to: ${CONFIG.SERVER_URL}`);
        try { if(!io) throw new Error("Socket.IO missing!"); socket = io(CONFIG.SERVER_URL, { transports: ['websocket'], autoConnect: true }); console.log("Socket init..."); }
        catch (e) { console.error("Socket.IO Err:", e); stateMachine?.transitionTo('loading',{message:`Net Init Err! ${e.message}`,error:true}); return; }

        socket.on('connect', () => {
            console.log('[Net] Socket Connected! ID:', socket.id); networkIsInitialized = true;
            if (typeof UIManager !== 'undefined') { UIManager.clearError('homescreen'); if (stateMachine?.is('homescreen') && UIManager.joinButton) { UIManager.joinButton.disabled = false; UIManager.joinButton.textContent = "Join Game"; console.log("[Net Connect] Reset Join Button."); } }
            currentGameInstance?.attemptProceedToGame();
        });
        socket.on('disconnect', (reason) => { console.warn('Disconnected:', reason); networkIsInitialized = false; initializationData = null; stateMachine?.transitionTo('homescreen', { playerCount: 0 }); if(UIManager) { UIManager.updatePlayerCount(0); UIManager.showError("Disconnected.", 'homescreen'); } if(infoDiv) infoDiv.textContent='Disc.'; if(controls?.isLocked) controls.unlock(); });
        socket.on('connect_error', (err) => { console.error('Net Conn Err:', err.message); networkIsInitialized = false; if(stateMachine?.is('loading')||stateMachine?.is('joining')) stateMachine.transitionTo('loading',{message:`Conn Fail!<br/>${err.message}`,error:true}); else { stateMachine?.transitionTo('homescreen'); UIManager?.showError(`Conn Fail: ${err.message}`, 'homescreen');} });
        socket.on('playerCountUpdate', (count) => { if (UIManager) UIManager.updatePlayerCount(count); });
        socket.on('initialize', (data) => Network.handleInitialize(data) ); socket.on('playerJoined', (data) => Network.handlePlayerJoined(data) ); socket.on('playerLeft', (id) => Network.handlePlayerLeft(id) ); socket.on('gameStateUpdate', (data) => Network.handleGameStateUpdate(data) ); socket.on('healthUpdate', (data) => Network.handleHealthUpdate(data) ); socket.on('playerDied', (data) => Network.handlePlayerDied(data) ); socket.on('playerRespawned', (data) => Network.handlePlayerRespawned(data) ); socket.on('serverFull', () => Network.handleServerFull() );
        console.log("Network listeners attached.");
    },

    _getPlayer: function(id) { return players?.[id] || null; },
    _addPlayer: function(playerData) { if(!ClientPlayer||!players) return null; if(playerData?.id && !players[playerData.id]){ console.log(`Creating ClientPlayer visual: ${playerData.name || '??'}`); players[playerData.id] = new ClientPlayer(playerData); return players[playerData.id]; } return null; },
    _removePlayer: function(playerId) { const player = this._getPlayer(playerId); const bodyHandle = currentGameInstance?.playerRigidBodyHandles?.[playerId]; if (player || bodyHandle !== undefined) { console.log(`Removing player/body: ${player?.name || playerId} (Handle: ${bodyHandle})`); if (player instanceof ClientPlayer) player.remove?.(); if (bodyHandle !== undefined && rapierWorld) { rapierWorld.removeRigidBody(bodyHandle); console.log(`Removed Rapier body handle ${bodyHandle}`); } if (players?.[playerId]) delete players[playerId]; if (currentGameInstance?.playerRigidBodyHandles) delete currentGameInstance.playerRigidBodyHandles[playerId]; } },
    handleInitialize: function(data) { console.log('[Net] RX initialize'); if (!data?.id || !data.players) { console.error("Invalid init data"); stateMachine?.transitionTo('homescreen'); UIManager?.showError("Server Init Invalid", "homescreen"); return; } initializationData = data; networkIsInitialized = true; console.log("Net Initialized flag set TRUE."); currentGameInstance?.attemptProceedToGame(); },
    handlePlayerJoined: function(playerData) { if (playerData?.id !== localPlayerId && !this._getPlayer(playerData.id)) { const name = playerData.name || 'Player'; console.log(`Player joined event: ${name}`); const newPlayer = this._addPlayer(playerData); if (newPlayer instanceof ClientPlayer && RAPIER && rapierWorld && currentGameInstance) { try { const h=CONFIG?.PLAYER_HEIGHT||1.8; const r=CONFIG?.PLAYER_RADIUS||0.4; const capH=Math.max(0.01, h/2.0-r); const bodyY=playerData.y+h/2.0; const collDesc=RAPIER.ColliderDesc.capsule(capH, r).setFriction(0.7).setRestitution(0.1); const rotY = playerData.rotationY || 0; const q = RAPIER.Quaternion.fromEulerAngles(0, rotY, 0); const rbDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(playerData.x, bodyCenterY, playerData.z).setRotation(q); const body = rapierWorld.createRigidBody(rbDesc); if (!body) throw new Error("Joined fail."); const coll = rapierWorld.createCollider(collDesc, body.handle); currentGameInstance.playerRigidBodyHandles[playerData.id] = body.handle; console.log(`Created KINEMATIC handle ${body.handle} for ${playerData.id}`); } catch (e) { console.error(`Failed physics body join ${playerData.id}: ${e}`); if(players?.[playerData.id]){ players[playerData.id].remove?.(); delete players[playerData.id]; } } } else { console.warn("Deps missing for joined physics?");} if(UIManager?.showKillMessage) UIManager.showKillMessage(`${name} joined.`); } },
    handlePlayerLeft: function(playerId) { if(playerId){ const pName=players?.[playerId]?.name||'Player'; console.log(`Left: ${pName}`); this._removePlayer(playerId); if(UIManager?.showKillMessage) UIManager.showKillMessage(`${pName} left.`);}},
    handleGameStateUpdate: function(state) { if(!players||!state?.players||!stateMachine?.is('playing')||!localPlayerId||!rapierWorld||!currentGameInstance?.playerRigidBodyHandles||!RAPIER) return; for (const id in state.players) { const sPD = state.players[id]; if (id !== localPlayerId) { const rbH = currentGameInstance.playerRigidBodyHandles[id]; const rb = rbH!==undefined?rapierWorld.getRigidBody(rbH):null; const rp=players[id]; if(rb){ const h=CONFIG?.PLAYER_HEIGHT||1.8; const y=sPD.y+h/2.0; rb.setNextKinematicTranslation({x:sPD.x,y:y,z:sPD.z},!0); const rotY=sPD.r||0; const q=RAPIER.Quaternion.fromEulerAngles(0,rotY,0); rb.setNextKinematicRotation(q,!0);} if(rp instanceof ClientPlayer&&sPD.h!==undefined) rp.health=sPD.h;}} },
    handleHealthUpdate: function(data) { if(!data?.id||data.health===undefined) return; const p=this._getPlayer(data.id); if(p){p.health=data.health; if(data.id===localPlayerId&&UIManager)UIManager.updateHealthBar(p.health);} },
    handlePlayerDied: function(data) { if (!data?.targetId) return; console.log(`Died: ${data.targetId}`); const p=this._getPlayer(data.targetId); const h=currentGameInstance?.playerRigidBodyHandles?.[data.targetId]; const b=h!==undefined?rapierWorld?.getRigidBody(h):null; if(p) p.health=0; if(data.targetId===localPlayerId){ if(UIManager){ UIManager.updateHealthBar(0); let m=data.killerId===null?"Fell out.":`${data.killerName||'P'} ${data.killerPhrase||'el.'} ${p?.name||'you'}`; UIManager.showKillMessage(m); } if(infoDiv) infoDiv.textContent=`DEAD`; if(controls?.isLocked) controls.unlock(); if(b){ b.setLinvel({x:0,y:0,z:0},true); b.setAngvel({x:0,y:0,z:0},true); } } else if(p instanceof ClientPlayer){ p.setVisible?.(false); if(UIManager){ let m=`${p.name||'P'} elim.`; if(data.killerName&&data.killerId!==null) m=`${data.killerName} ${data.killerPhrase||'el.'} ${p.name}`; else if(data.killerId===null) m=`${p.name||'P'} fell out.`; UIManager.showKillMessage(m);} } },
    handlePlayerRespawned: function(playerData) { if(!playerData?.id || !RAPIER || !rapierWorld || !currentGameInstance) return; console.log(`Respawn: ${playerData.name}`); let player=this._getPlayer(playerData.id); let playerBodyHandle = currentGameInstance.playerRigidBodyHandles?.[playerData.id]; let playerBody = playerBodyHandle !== undefined ? rapierWorld.getRigidBody(playerBodyHandle) : null; const playerHeight=CONFIG?.PLAYER_HEIGHT||1.8; const bodyCenterY=playerData.y + playerHeight / 2.0; const rotY = playerData.rotationY || 0; const q = RAPIER.Quaternion.fromEulerAngles(0, rotY, 0); if(!q){console.error("Respawn quat fail!"); return;} if (playerData.id === localPlayerId) { console.log("LOCAL respawn."); if (!player){player={isLocal: true}; players[localPlayerId]=player;} if (!playerBody){ console.error("Local body missing!"); return; } player.health=playerData.health; player.x=playerData.x; player.y=playerData.y; player.z=playerData.z; player.rotationY=rotY; player.name=playerData.name; player.phrase=playerData.phrase; playerBody.setTranslation({x:playerData.x, y:bodyCenterY, z:playerData.z}, true); playerBody.setRotation(q, true); playerBody.setLinvel({x:0,y:0,z:0}, true); playerBody.setAngvel({x:0,y:0,z:0}, true); console.log("Teleported local body."); if (UIManager){ UIManager.updateHealthBar(player.health); UIManager.updateInfo(`Playing as ${player.name}`); UIManager.clearKillMessage();} } else { console.log(`REMOTE respawn: ${playerData.name}.`); if(!player||!playerBody||!(player instanceof ClientPlayer)){ console.warn(`Respawn recreate ${playerData.id}...`); this._removePlayer(playerData.id); this.handlePlayerJoined(playerData); player=this._getPlayer(playerData.id); playerBodyHandle=currentGameInstance.playerRigidBodyHandles?.[playerData.id]; playerBody=playerBodyHandle!==undefined?rapierWorld.getRigidBody(playerBodyHandle):null; if(!player||!playerBody){console.error("Recreate fail!");return;}} player.updateData(playerData); player.setVisible?.(true); playerBody.setNextKinematicTranslation({x:playerData.x, y:bodyCenterY, z:playerData.z}, true); playerBody.setNextKinematicRotation(q, true); console.log("Teleported remote kinematic body."); } },
    handleServerFull: function() { console.warn("Server Full."); if(socket) socket.disconnect(); stateMachine?.transitionTo('loading',{message:`Server Full!`,error:true}); },

     // Actions
     attemptJoinGame: function() {
         console.log("Attempt Join...");
         if (!UIManager?.playerNameInput || !UIManager.playerPhraseInput) { return; }
         localPlayerName=UIManager.playerNameInput.value.trim()||'Anon';
         localPlayerPhrase=UIManager.playerPhraseInput.value.trim()||'...';
         if(!localPlayerName){UIManager.showError('Need name.', 'homescreen'); return;}

         UIManager.clearError('homescreen'); // Clear error state FIRST

         // ---<<< ADDED DETAILED LOGGING FOR PREREQUISITES >>>---
         console.log(`[Attempt Join] Checking prerequisites:`);
         console.log(`  - Assets Ready? ${assetsAreReady}`);
         console.log(`  - Rapier Ready? ${!!RAPIER}`);
         console.log(`  - World Exists? ${!!rapierWorld}`);
         console.log(`  - Map Collider Exists? ${currentGameInstance?.mapColliderHandle !== null}`);
         // ---<<< END LOGGING >>>---

         // Check prerequisites *before* changing state or UI
         const mapColliderExists = currentGameInstance?.mapColliderHandle !== null && currentGameInstance?.mapColliderHandle !== undefined;
         if (!assetsAreReady || !rapierWorld || !RAPIER || !mapColliderExists) {
             console.warn("Attempt Join blocked: Core components not ready.");
             // Use a DIFFERENT message to distinguish this from connection issues
             UIManager.showError('Game systems initializing...', 'homescreen');
             return; // Stop the join attempt
         }

         // Prerequisites met, proceed
         stateMachine?.transitionTo('joining');
         if(UIManager.joinButton){
             UIManager.joinButton.disabled=true; // Disable button
             // Button text set below based on connection
         }

         if (Network.isConnected()) {
             console.log("Connected -> sendDetails");
             if(UIManager.joinButton) UIManager.joinButton.textContent = "Joining...";
             Network.sendJoinDetails();
         } else {
             console.log("Not Connected -> Wait for connect event");
             if (UIManager.joinButton) UIManager.joinButton.textContent = "Connecting...";
             // NO error message here - button text is sufficient
             if (socket && !socket.active) { socket.connect(); }
         }
     },
     sendJoinDetails: function() { if(!stateMachine?.is('joining')){console.warn("Not joining.");return;} if(!Network.isConnected()){console.error("Disconnected"); stateMachine?.transitionTo('homescreen'); UIManager?.showError('Lost connection.', 'homescreen'); return;} console.log(`TX setPlayerDetails Name: ${localPlayerName}`); socket.emit('setPlayerDetails', { name: localPlayerName, phrase: localPlayerPhrase }); },
     sendPlayerUpdate: function(data) { const p=this._getPlayer(localPlayerId); if(Network.isConnected() && stateMachine?.is('playing') && p?.health > 0) { socket.emit('playerUpdate', data); } },
     sendVoidDeath: function() { if(Network.isConnected() && stateMachine?.is('playing')){ console.log("TX fellIntoVoid"); socket.emit('fellIntoVoid'); } }

}; // End Network object

window.Network = Network;
console.log("network.js loaded (Rapier - Detailed Join Check)");

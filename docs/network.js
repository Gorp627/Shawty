// docs/network.js (Adapted for Rapier)

// Depends on: config.js, stateMachine.js, entities.js, input.js, effects.js, uiManager.js, game.js
// Accesses globals: players, localPlayerId, socket, controls, CONFIG, RAPIER, rapierWorld,
//                   stateMachine, UIManager, ClientPlayer, scene, infoDiv, currentGameInstance, assetsAreReady

var socket; // Global socket variable

const Network = {
    init: function() { this.setupSocketIO(); console.log("[Network] Initialized."); },
    isConnected: function() { return typeof socket !== 'undefined' && socket && socket.connected; },

    setupSocketIO: function() {
        if (!CONFIG?.SERVER_URL) { console.error("CFG SERVER_URL missing!"); stateMachine?.transitionTo('loading',{message:"FATAL: Net Cfg Err!",error:true}); return; }
        console.log(`[Network] Connecting to: ${CONFIG.SERVER_URL}`);
        try { if(typeof io === 'undefined') throw new Error("Socket.IO missing!"); socket = io(CONFIG.SERVER_URL, { transports: ['websocket'], autoConnect: true }); console.log("Socket init..."); }
        catch (e) { console.error("Socket.IO Init Error:", e); stateMachine?.transitionTo('loading',{message:`FATAL: Net Init Err! ${e.message}`,error:true}); return; }

        // Event Listeners
        socket.on('connect', () => { console.log('[Net] Socket Connected! ID:', socket.id); networkIsInitialized = true; if (stateMachine?.is('joining') && assetsAreReady && rapierWorld) { console.log("Connected while Joining & Ready -> sendDetails"); Network.sendJoinDetails(); } else { console.log("Connected. Current state:", stateMachine?.currentState); /* game.js handlers cover other cases */ } });
        socket.on('disconnect', (reason) => { console.warn('[Net] Disconnected:', reason); networkIsInitialized = false; initializationData = null; stateMachine?.transitionTo('homescreen', { playerCount: 0 }); if(UIManager) { UIManager.updatePlayerCount(0); UIManager.showError("Disconnected.", 'homescreen'); } if(infoDiv) infoDiv.textContent='Disconnected'; if(controls?.isLocked) controls.unlock(); });
        socket.on('connect_error', (err) => { console.error('Net Conn Err:', err.message); networkIsInitialized = false; if(stateMachine?.is('loading')||stateMachine?.is('joining')) stateMachine.transitionTo('loading',{message:`Conn Fail!<br/>${err.message}`,error:true}); else { stateMachine?.transitionTo('homescreen'); UIManager?.showError(`Conn Fail: ${err.message}`, 'homescreen');} });
        socket.on('playerCountUpdate', (count) => { if (UIManager) UIManager.updatePlayerCount(count); });

        // Game Listeners
        socket.on('initialize', (data) => Network.handleInitialize(data) ); socket.on('playerJoined', (data) => Network.handlePlayerJoined(data) ); socket.on('playerLeft', (id) => Network.handlePlayerLeft(id) ); socket.on('gameStateUpdate', (data) => Network.handleGameStateUpdate(data) ); socket.on('healthUpdate', (data) => Network.handleHealthUpdate(data) ); socket.on('playerDied', (data) => Network.handlePlayerDied(data) ); socket.on('playerRespawned', (data) => Network.handlePlayerRespawned(data) ); socket.on('serverFull', () => Network.handleServerFull() );

        console.log("Network listeners attached.");
    }, // End setupSocketIO

    // Handlers
    _getPlayer: function(id) { return players[id] || null; },
    _addPlayer: function(playerData) { /* Creates visual only, physics done in game.js */ if(!ClientPlayer){ console.error("ClientPlayer undef"); return null; } if(!players) { console.warn("players missing"); return null; } if(playerData?.id && !players[playerData.id]){ console.log(`[Net] Creating ClientPlayer visual for: ${playerData.name || 'NoName'}`); players[playerData.id] = new ClientPlayer(playerData); return players[playerData.id]; } return null; },
    _removePlayer: function(playerId) {
        const player = this._getPlayer(playerId);
        // <<< ADDED Checks for Instance and Physics Body map >>>
        const bodyHandle = (typeof currentGameInstance !== 'undefined' && typeof currentGameInstance.physicsBodies !== 'undefined')
                           ? currentGameInstance.physicsBodies[playerId]
                           : undefined;

        if (player || bodyHandle !== undefined) { // Check if either visual player or body handle exists
            console.log(`[Net] Removing player/body for ID: ${playerId}`);
            if (player instanceof ClientPlayer) player.remove?.(); // Cleanup THREE mesh/materials

            // <<< ADDED world check >>>
            if (bodyHandle !== undefined && typeof rapierWorld !== 'undefined' && rapierWorld) {
                rapierWorld.removeRigidBody(bodyHandle); // Remove body using handle
                console.log(`[Net] Removed Rapier body handle ${bodyHandle}`);
            }
            // Cleanup references
            if (players && players[playerId]) delete players[playerId];
            if (currentGameInstance?.physicsBodies && currentGameInstance.physicsBodies[playerId]) delete currentGameInstance.physicsBodies[playerId];
        }
    },

    handleInitialize: function(data) {
         console.log('[Net] RX initialize'); if (!data?.id || !data.players) { console.error("Invalid init data"); stateMachine?.transitionTo('homescreen'); UIManager?.showError("Server Init Invalid", "homescreen"); return; }
         initializationData = data; networkIsInitialized = true; // Set flag here too for certainty
         // Let game instance check all readiness flags before starting
         if(currentGameInstance?.attemptProceedToGame) {currentGameInstance.attemptProceedToGame();} else { console.error("Missing attemptProceedToGame");}
    },

    handlePlayerJoined: function(playerData) {
        if (playerData?.id !== localPlayerId && !this._getPlayer(playerData.id)) {
            const name = playerData.name || 'Player'; console.log(`Player joined event: ${name} (${playerData.id})`);
            const newPlayer = this._addPlayer(playerData); // Adds visual
            // Create Physics Body - Reuse logic from startGamePlay essentially
            if (newPlayer instanceof ClientPlayer && typeof RAPIER !== 'undefined' && rapierWorld && typeof currentGameInstance !== 'undefined') {
                 try {
                     const playerHeight = CONFIG?.PLAYER_HEIGHT||1.8; const playerRadius = CONFIG?.PLAYER_RADIUS||0.4; const capsuleHalfHeight = Math.max(0.01, playerHeight / 2.0 - playerRadius); const bodyCenterY = playerData.y + playerHeight / 2.0;
                     const playerColliderDesc = RAPIER.ColliderDesc.capsule(capsuleHalfHeight, playerRadius).setFriction(0.5).setRestitution(0.1).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS); // Use corrected capsule
                     const q = RAPIER.Quaternion.fromAxisAngle({ x: 0, y: 1, z: 0 }, playerData.rotationY || 0);
                     const rigidBodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(playerData.x, bodyCenterY, playerData.z).setRotation(q);
                     const body = rapierWorld.createRigidBody(rigidBodyDesc); if (!body) throw new Error("Joined player body create fail.");
                     const collider = rapierWorld.createCollider(playerColliderDesc, body.handle); currentGameInstance.physicsBodies[playerData.id] = body.handle; // Store handle
                     console.log(`Created KINEMATIC body handle ${body.handle} for joined player ${playerData.id}`);
                 } catch (e) { console.error(`Failed to create physics body for joined player ${playerData.id}: ${e}`); }
             }
            if(UIManager?.showKillMessage) UIManager.showKillMessage(`${name} joined.`);
        }
    },

    handlePlayerLeft: function(playerId) { if (playerId) { const pName=players?.[playerId]?.name||'Player'; console.log(`Player left event: ${pName}`); this._removePlayer(playerId); if(UIManager?.showKillMessage) UIManager.showKillMessage(`${pName} left.`);}},

    handleGameStateUpdate: function(state) {
        if(!players || !state?.players || !stateMachine?.is('playing') || !localPlayerId || !rapierWorld || !currentGameInstance?.physicsBodies) return; // Check dependencies
        for (const id in state.players) { const sPD = state.players[id]; if (id !== localPlayerId) { // Only remote
             const rbHandle = currentGameInstance.physicsBodies[id]; const rb = rbHandle !== undefined ? rapierWorld.getRigidBody(rbHandle) : null; const rp = players[id]; // Visual player instance
             if (rb) { // Update kinematic body if exists
                 const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8; const bodyCenterY = sPD.y + playerHeight / 2.0; // Calculate center Y from feet Y
                 rb.setNextKinematicTranslation({ x: sPD.x, y: bodyCenterY, z: sPD.z }, true); // Set next position smoothly
                 const q = RAPIER.Quaternion.fromAxisAngle({ x: 0, y: 1, z: 0 }, sPD.r || 0); // Calculate rotation
                 rb.setNextKinematicRotation(q, true); // Set next rotation smoothly
             } if (rp instanceof ClientPlayer && sPD.h !== undefined) rp.health = sPD.h; // Update health if needed
        }}
    },

    handleHealthUpdate: function(data) { if(!data?.id || data.health===undefined) return; const p=this._getPlayer(data.id); if(p){p.health=data.health; if(data.id===localPlayerId && UIManager) UIManager.updateHealthBar(p.health);} },
    handlePlayerDied: function(data) { if(!data?.targetId) return; console.log(`>>> Died: ${data.targetId}`); const targetPlayer = this._getPlayer(data.targetId); const targetBodyHandle = currentGameInstance?.physicsBodies[data.targetId]; const targetBody = targetBodyHandle ? rapierWorld?.getRigidBody(targetBodyHandle) : null; if(targetPlayer) targetPlayer.health=0; if(data.targetId===localPlayerId){ if(UIManager){ UIManager.updateHealthBar(0); let msg=data.killerId===null?"Fell out.":`${data.killerName||'Someone'} ${data.killerPhrase||'eliminated'} ${targetPlayer?.name||'you'}`; UIManager.showKillMessage(msg); } if(infoDiv) infoDiv.textContent=`DEAD`; if(controls?.isLocked) controls.unlock(); if(targetBody) { targetBody.setLinvel({x:0,y:0,z:0},true); targetBody.setAngvel({x:0,y:0,z:0},true); /* Make body inactive? Or just rely on gameLogic isAlive */ } } else if(targetPlayer instanceof ClientPlayer){ targetPlayer.setVisible?.(false); if(UIManager){ let msg=`${targetPlayer.name||'Player'} eliminated.`; if(data.killerName&&data.killerId!==null) msg=`${data.killerName} ${data.killerPhrase||'el.'} ${targetPlayer.name}`; else if(data.killerId===null) msg=`${targetPlayer.name||'Player'} fell out.`; UIManager.showKillMessage(msg);} /* Kinematic body update stops via gameStateUpdate */ } },
    handlePlayerRespawned: function(playerData) {
        if(!playerData?.id || !RAPIER) return; console.log(`>>> Respawned: ${playerData.name}`); let player=this._getPlayer(playerData.id); let playerBodyHandle = currentGameInstance?.physicsBodies[playerData.id]; let playerBody = playerBodyHandle ? rapierWorld?.getRigidBody(playerBodyHandle) : null;
        if (playerData.id === localPlayerId) { console.log("Handling LOCAL respawn."); if (!player){ console.error("Local player object missing!"); player={isLocal: true}; players[localPlayerId]=player;} if (!playerBody){ console.error("Local physics body missing!"); return; /* Cannot proceed */ }
             player.health=playerData.health; player.x=playerData.x; player.y=playerData.y; player.z=playerData.z; player.rotationY=playerData.rotationY; player.name=playerData.name; player.phrase=playerData.phrase;
             const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8; const bodyCenterY = playerData.y + playerHeight / 2.0; const rotY = playerData.rotationY || 0; const q = RAPIER.Quaternion.fromAxisAngle({x:0,y:1,z:0}, rotY);
             playerBody.setTranslation({x:playerData.x, y:bodyCenterY, z:playerData.z}, true); playerBody.setRotation(q, true); playerBody.setLinvel({x:0,y:0,z:0}, true); playerBody.setAngvel({x:0,y:0,z:0}, true); console.log("Teleported local body."); if (UIManager){ UIManager.updateHealthBar(player.health); UIManager.updateInfo(`Playing as ${player.name}`); UIManager.clearKillMessage();}
        } else { console.log(`Handling REMOTE respawn for ${playerData.name}.`); if(!player||!playerBody||!(player instanceof ClientPlayer)){ console.warn(`Respawn missing remote player ${playerData.id}, recreating...`); this._removePlayer(playerData.id); this.handlePlayerJoined(playerData); player=this._getPlayer(playerData.id); playerBodyHandle=currentGameInstance?.physicsBodies[playerData.id]; playerBody=playerBodyHandle?rapierWorld?.getRigidBody(playerBodyHandle):null; if(!player||!playerBody){console.error("Failed remote recreation!");return;}}
             player.updateData(playerData); player.setVisible?.(true);
             const playerHeight=CONFIG?.PLAYER_HEIGHT||1.8; const bodyCenterY=playerData.y + playerHeight/2.0; const rotY = playerData.rotationY||0; const q=RAPIER.Quaternion.fromAxisAngle({x:0,y:1,z:0},rotY);
             playerBody.setNextKinematicTranslation({x:playerData.x, y:bodyCenterY, z:playerData.z}, true); playerBody.setNextKinematicRotation(q, true); console.log("Teleported remote kinematic body.");
        }
    },

    handleServerFull: function() { console.warn("Server Full."); if(socket) socket.disconnect(); stateMachine?.transitionTo('loading',{message:`Server Full!`,error:true}); },

     // Actions
     attemptJoinGame: function() { console.log("Attempt Join..."); if (!UIManager?.playerNameInput || !UIManager.playerPhraseInput) {return;} localPlayerName=UIManager.playerNameInput.value.trim()||'Anon'; localPlayerPhrase=UIManager.playerPhraseInput.value.trim()||'...'; if(!localPlayerName){UIManager.showError('Need name.', 'homescreen');return;} UIManager.clearError('homescreen'); if (!assetsAreReady || !rapierWorld) {UIManager.showError('Loading...','homescreen');return;} stateMachine?.transitionTo('joining'); if(UIManager.joinButton){UIManager.joinButton.disabled=true; UIManager.joinButton.textContent="Joining...";} if (Network.isConnected()) {console.log("Connected -> sendDetails"); Network.sendJoinDetails();} else { console.log("Not Connected -> Wait for connect"); if (socket && !socket.active) { socket.connect(); } } },
     sendJoinDetails: function() { if(!stateMachine?.is('joining')){console.warn("Not joining state.");return;} if(!Network.isConnected()){console.error("Disconnected"); stateMachine?.transitionTo('homescreen'); UIManager?.showError('Lost connection.', 'homescreen'); return;} console.log(`TX setPlayerDetails Name: ${localPlayerName}`); socket.emit('setPlayerDetails', { name: localPlayerName, phrase: localPlayerPhrase }); },
     sendPlayerUpdate: function(data) { const p=this._getPlayer(localPlayerId); if(Network.isConnected() && stateMachine?.is('playing') && p?.health > 0) { socket.emit('playerUpdate', data); } },
     sendVoidDeath: function() { if(Network.isConnected() && stateMachine?.is('playing')){ console.log("TX fellIntoVoid"); socket.emit('fellIntoVoid'); } }

}; // End Network object

window.Network = Network;
console.log("network.js loaded (Rapier Integration)");

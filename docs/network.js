// docs/network.js (v6 - Ensure Correct Rapier CapsuleDesc)

// Depends on: config.js, stateMachine.js, entities.js, input.js, uiManager.js, game.js
// Accesses globals: players, localPlayerId, socket, controls, CONFIG, RAPIER, rapierWorld,
//                   stateMachine, UIManager, ClientPlayer, scene, infoDiv, currentGameInstance, assetsAreReady

var socket; // Global socket variable

const Network = {
    init: function() {
        this.setupSocketIO();
        console.log("[Network] Initialized and requested socket connection.");
    },

    isConnected: function() {
        return typeof socket !== 'undefined' && socket && socket.connected;
    },

    setupSocketIO: function() {
        if (!CONFIG?.SERVER_URL) {
             console.error("!!! Network Error: CONFIG.SERVER_URL is not defined!");
             stateMachine?.transitionTo('loading',{message:"Network Config Error!",error:true});
             return;
        }
        console.log(`[Network] Attempting to connect to server: ${CONFIG.SERVER_URL}`);
        try {
             if (typeof io === 'undefined') throw new Error("Socket.IO client library (io) not found!");
             socket = io(CONFIG.SERVER_URL, {
                 transports: ['websocket'],
             });
             console.log("[Network] Socket.IO object created. Waiting for connection events...");
        }
        catch (e) {
             console.error("!!! Socket.IO Initialization Error:", e);
             stateMachine?.transitionTo('loading',{message:`Net Init Error!<br/>${e.message}`,error:true});
             return;
        }

        // --- Socket Event Listeners ---
        socket.on('connect', () => {
            console.log('[Network] Socket Connected! ID:', socket.id);
            networkIsInitialized = true; // Set flag

            if (typeof UIManager !== 'undefined') {
                 UIManager.clearError('homescreen'); // Clear previous connection errors

                 if (stateMachine?.is('homescreen') && UIManager.joinButton) {
                     UIManager.joinButton.disabled = false;
                     UIManager.joinButton.textContent = "Join Game";
                     console.log("[Network Connect] Enabled Join Button on homescreen.");
                 }
                 else if (stateMachine?.is('joining')) {
                     console.log("[Network Connect] Was in 'joining' state, re-sending details now.");
                      if (UIManager.joinButton) UIManager.joinButton.textContent = "Joining...";
                     Network.sendJoinDetails(); // Try sending details again
                 }
            }
             if (assetsAreReady && window.isRapierReady && !stateMachine?.is('playing')) {
                if(!stateMachine?.is('homescreen')) { // Avoid redundant transitions
                    console.log("[Network Connect] Assets/Physics ready, transitioning to homescreen.");
                    const currentCount = UIManager?.playerCountSpan?.textContent;
                    stateMachine?.transitionTo('homescreen', {playerCount: currentCount === '?' ? undefined : currentCount});
                }
             }
        });

        socket.on('disconnect', (reason) => {
            console.warn('[Network] Socket Disconnected. Reason:', reason);
            networkIsInitialized = false;
            initializationData = null; // Clear server init data

            if (stateMachine?.is('playing') || stateMachine?.is('joining')) {
                let errorMsg = "Disconnected.";
                 if (reason === 'io server disconnect') errorMsg = "Kicked or server shut down.";
                 else if (reason === 'io client disconnect') errorMsg = "Left the game.";
                 else if (reason === 'ping timeout' || reason === 'transport close' || reason === 'transport error') errorMsg = "Connection lost.";

                stateMachine?.transitionTo('homescreen', {
                    playerCount: 0,
                    errorMessage: errorMsg
                });

                 if(infoDiv) infoDiv.textContent='Disconnected';
                 if(controls?.isLocked) controls.unlock();
             } else {
                  console.log("[Network] Disconnected while not in playing/joining state.");
                  if (stateMachine?.is('homescreen') && UIManager?.joinButton) {
                      UIManager.joinButton.disabled = true;
                      UIManager.joinButton.textContent = "Disconnected";
                  }
             }
        });

        socket.on('connect_error', (err) => {
            console.error('[Network] Connection Error:', err.message, err);
            networkIsInitialized = false;
            const errorMsg = `Connection Failed!<br/>${err.message}`;
            stateMachine?.transitionTo('homescreen', { errorMessage: errorMsg });
        });

        socket.on('playerCountUpdate', (count) => {
            if (UIManager) UIManager.updatePlayerCount(count);
        });

        // Game-specific events
        socket.on('initialize', (data) => Network.handleInitialize(data) );
        socket.on('playerJoined', (data) => Network.handlePlayerJoined(data) );
        socket.on('playerLeft', (id) => Network.handlePlayerLeft(id) );
        socket.on('gameStateUpdate', (data) => Network.handleGameStateUpdate(data) );
        socket.on('healthUpdate', (data) => Network.handleHealthUpdate(data) );
        socket.on('playerDied', (data) => Network.handlePlayerDied(data) );
        socket.on('playerRespawned', (data) => Network.handlePlayerRespawned(data) );
        socket.on('serverFull', () => Network.handleServerFull() );

        console.log("[Network] Core socket event listeners attached.");
    }, // End setupSocketIO

    // --- Helper Functions ---
    _getPlayer: function(id) { return window.players?.[id] || null; },

    _addPlayer: function(playerData) {
        if (typeof window.ClientPlayer !== 'function' || !window.players) {
             console.error(`!!! Cannot add player: ClientPlayer class (type: ${typeof window.ClientPlayer}) or global players object (type: ${typeof window.players}) missing.`);
             return null;
        }
        if (playerData?.id && !window.players[playerData.id]) {
            console.log(`[Network] Creating ClientPlayer visual instance for: ${playerData.name || '??'} (ID: ${playerData.id})`);
            try {
                 window.players[playerData.id] = new ClientPlayer(playerData);
                 return window.players[playerData.id];
            } catch (e) {
                 console.error(`!!! Error creating ClientPlayer instance for ${playerData.id}:`, e);
                 return null;
            }
        } else if (window.players[playerData.id]) {
            return window.players[playerData.id];
        } else {
            console.warn(`[Network] Attempted to add player with invalid data or missing ID:`, playerData);
            return null;
        }
    },

    // Helper to create Kinematic Body (used for remote players)
    _createKinematicBody: function(playerData) {
         if (!playerData?.id || !RAPIER || !rapierWorld || !currentGameInstance) {
             console.error(`[Network] Cannot create kinematic body for ${playerData?.id}: Missing data, Rapier, World, or GameInstance.`);
             return null;
         }
         if (currentGameInstance.playerRigidBodyHandles[playerData.id] !== undefined) {
            try {
                return rapierWorld.getRigidBody(currentGameInstance.playerRigidBodyHandles[playerData.id]);
            } catch (e) {
                console.error(`[Network] Error getting existing kinematic body ${playerData.id}:`, e);
                delete currentGameInstance.playerRigidBodyHandles[playerData.id];
            }
         }

         try {
             const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
             const playerRadius = CONFIG?.PLAYER_RADIUS || 0.4;
             const capsuleHalfHeight = Math.max(0.01, playerHeight / 2.0 - playerRadius); // Cylinder part half-height
             const bodyCenterY = playerData.y + playerHeight / 2.0; // Calculate center Y

             // Use RAPIER.ColliderDesc.capsule(halfHeight, radius)
             const collDesc = RAPIER.ColliderDesc.capsule(capsuleHalfHeight, playerRadius)
                 .setFriction(0.7)
                 .setRestitution(0.1)
                 .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);

             const rotY = playerData.rotationY || 0;
             const q = new RAPIER.Quaternion(0, Math.sin(rotY / 2.0), 0, Math.cos(rotY / 2.0));
             q.normalize();

             const rbDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
                 .setTranslation(playerData.x, bodyCenterY, playerData.z)
                 .setRotation(q);

             const body = rapierWorld.createRigidBody(rbDesc);
             if (!body) throw new Error("Failed to create kinematic rigid body.");

             rapierWorld.createCollider(collDesc, body); // Attach collider

             currentGameInstance.playerRigidBodyHandles[playerData.id] = body.handle; // Store handle
             console.log(`[Network] Created KINEMATIC Rapier body for player ${playerData.id}. Handle: ${body.handle}`);
             return body;

         } catch (e) {
             console.error(`!!! Failed to create KINEMATIC physics body for player ${playerData.id}:`, e);
             delete currentGameInstance.playerRigidBodyHandles[playerData.id];
             return null;
         }
     },


    _removePlayer: function(playerId) {
        const player = this._getPlayer(playerId);
        const bodyHandle = currentGameInstance?.playerRigidBodyHandles?.[playerId];
        if (!player && bodyHandle === undefined) { return; }
        console.log(`[Network] Removing player ${player?.name || playerId} (H: ${bodyHandle ?? 'N/A'})`);
        if (player instanceof ClientPlayer) {
            try { player.remove?.(); } catch(e) { console.error(`Err removing mesh ${playerId}:`, e); }
        }
        if (bodyHandle !== undefined && bodyHandle !== null && rapierWorld) {
            try {
                 let body = rapierWorld.getRigidBody(bodyHandle);
                 if (body) { rapierWorld.removeRigidBody(body); }
            } catch (e) { console.error(`Err removing body ${playerId} (H: ${bodyHandle}):`, e); }
        }
        if (window.players?.[playerId]) { delete window.players[playerId]; }
        if (currentGameInstance?.playerRigidBodyHandles?.[playerId] !== undefined) {
             delete currentGameInstance.playerRigidBodyHandles[playerId];
        }
         console.log(`[Network] Finished removing ${playerId}.`);
    },

    // --- Event Handlers ---
    handleInitialize: function(data) {
        console.log('[Network] RX initialize');
        if (!data?.id || typeof data.players !== 'object') {
             console.error("!!! Invalid init data:", data);
             stateMachine?.transitionTo('homescreen',{errorMessage:"Server Init Invalid!"});
             return;
        }
        initializationData = data;
        networkIsInitialized = true;
        console.log("[Network] Init data stored. Attempting proceed...");
        currentGameInstance?.attemptProceedToGame();
    },

     handlePlayerJoined: function(playerData) {
        if (playerData?.id === localPlayerId) return;
        if (playerData?.id && stateMachine?.is('playing')) {
             const name = playerData.name || 'Player';
             console.log(`[Network] RX playerJoined: ${name} (${playerData.id})`);
             if (this._getPlayer(playerData.id) || currentGameInstance?.playerRigidBodyHandles[playerData.id] !== undefined) {
                 console.warn(`Player ${playerData.id} exists. Ignoring join.`); return;
             }
             const newPlayer = this._addPlayer(playerData);
             if (newPlayer instanceof ClientPlayer) { this._createKinematicBody(playerData); }
             else { console.warn(`Skipping physics: ClientPlayer fail ${playerData.id}.`); }
             if (UIManager?.showKillMessage) UIManager.showKillMessage(`${name} joined.`);
        }
    },

    handlePlayerLeft: function(playerId) {
        if (playerId) {
            const playerName = window.players?.[playerId]?.name || 'Player';
            console.log(`[Network] RX playerLeft: ${playerName} (${playerId})`);
            this._removePlayer(playerId);
            if (UIManager?.showKillMessage) UIManager.showKillMessage(`${playerName} left.`);
        }
    },

    handleGameStateUpdate: function(state) {
        if (!window.players || !state?.players || !stateMachine?.is('playing') || !localPlayerId || !rapierWorld || !currentGameInstance?.playerRigidBodyHandles || !RAPIER) { return; }
        for (const id in state.players) {
            if (id === localPlayerId) continue;
            const serverData = state.players[id];
            const remotePlayer = window.players[id];
            const remoteBodyHandle = currentGameInstance.playerRigidBodyHandles[id];
            if (remotePlayer instanceof ClientPlayer && remoteBodyHandle !== undefined && remoteBodyHandle !== null) {
                 try {
                    const remoteBody = rapierWorld.getRigidBody(remoteBodyHandle);
                    if (!remoteBody) { continue; }
                    const h = CONFIG?.PLAYER_HEIGHT || 1.8;
                    const targetY = serverData.y + h / 2.0;
                    const targetPos = { x: serverData.x, y: targetY, z: serverData.z };
                    const targetRotY = serverData.r || 0;
                    const targetQuat = new RAPIER.Quaternion(0, Math.sin(targetRotY/2), 0, Math.cos(targetRotY/2)); targetQuat.normalize();
                    remoteBody.setNextKinematicTranslation(targetPos, true);
                    remoteBody.setNextKinematicRotation(targetQuat, true);
                    if (serverData.h !== undefined && remotePlayer.health !== serverData.h) { remotePlayer.health = serverData.h; }
                } catch (e) { console.error(`Err updating kinematic ${id} (H: ${remoteBodyHandle}):`, e); }
            }
        }
    },

    handleHealthUpdate: function(data) {
        if (!data?.id || data.health === undefined) { console.warn("Invalid healthUpdate:", data); return; }
        const player = this._getPlayer(data.id);
        if (player) {
             player.health = data.health;
             if (data.id === localPlayerId && UIManager) { UIManager.updateHealthBar(player.health); }
        }
    },

    handlePlayerDied: function(data) {
        if (!data?.targetId) { console.warn("Invalid playerDied:", data); return; }
        const targetPlayer = this._getPlayer(data.targetId);
        const targetName = data.targetName || targetPlayer?.name || 'Player';
        const killerName = data.killerName || 'Unknown';
        const killerPhrase = data.killerPhrase || 'eliminated';
        console.log(`RX playerDied: ${targetName}(${data.targetId}) by ${killerName}(${data.killerId ?? 'N/A'})`);
        if (data.targetId === localPlayerId) {
             if (targetPlayer) targetPlayer.health = 0;
             if (UIManager) {
                 UIManager.updateHealthBar(0);
                 let msg = (data.killerId === null) ? "Fell out of world." : (data.killerId === data.targetId) ? "Self-eliminated." : `${killerName} ${killerPhrase} you.`;
                 UIManager.showKillMessage(msg);
                 if (infoDiv) infoDiv.textContent = `DEAD - Respawning...`;
             }
             if (controls?.isLocked) controls.unlock();
        } else {
             if (targetPlayer instanceof ClientPlayer) {
                 targetPlayer.health = 0;
                 targetPlayer.setVisible?.(false);
                 const bodyHandle = currentGameInstance?.playerRigidBodyHandles?.[data.targetId];
                 if (bodyHandle && rapierWorld) {
                      try {
                           let body = rapierWorld.getRigidBody(bodyHandle);
                           let collider = body?.collider(0); // Get first collider
                           collider?.setEnabled(false);
                           console.log(`Disabled collider for dead remote ${data.targetId}.`);
                      } catch(e) { console.error(`Err modifying physics remote death ${data.targetId}:`, e); }
                 }
             }
             if (UIManager) {
                 let msg = (data.killerId === null) ? `${targetName} fell.` : (data.killerId === data.targetId) ? `${targetName} self-destructed.` : `${killerName} ${killerPhrase} ${targetName}.`;
                 UIManager.showKillMessage(msg);
             }
        }
    },

    handlePlayerRespawned: function(playerData) {
        if (!playerData?.id || !RAPIER || !rapierWorld || !currentGameInstance) { console.warn("Invalid respawn data/state:", playerData); return; }
        const playerName = playerData.name || 'Player';
        console.log(`RX playerRespawned: ${playerName} (${playerData.id})`);
        let player = this._getPlayer(playerData.id);
        let bodyHandle = currentGameInstance.playerRigidBodyHandles?.[playerData.id];
        let body = null;
        if (bodyHandle !== undefined && bodyHandle !== null) { try { body = rapierWorld.getRigidBody(bodyHandle); } catch(e){ console.error(`Err get body ${bodyHandle} respawn:`, e); } }
        const h = CONFIG?.PLAYER_HEIGHT || 1.8;
        const centerY = playerData.y + h / 2.0;
        const rotY = playerData.rotationY || 0;
        const q = new RAPIER.Quaternion(0, Math.sin(rotY/2), 0, Math.cos(rotY/2)); q.normalize();

        if (playerData.id === localPlayerId) {
            console.log("Processing LOCAL respawn.");
            if (!player) { console.warn("Local player obj missing, creating..."); window.players[localPlayerId] = { id: localPlayerId, health: 0 }; player = window.players[localPlayerId]; }
            if (!body) {
                 console.error("!!! Local body missing! Recreating...");
                 currentGameInstance.createPlayerPhysicsBody(localPlayerId, {x: playerData.x, y: playerData.y, z: playerData.z });
                 bodyHandle = currentGameInstance.playerRigidBodyHandles?.[localPlayerId];
                 try { body = rapierWorld.getRigidBody(bodyHandle); } catch(e){ console.error("Err get recreated body:", e); }
                 if (!body) { console.error("!!! CRITICAL: Recreate failed!"); UIManager?.showError("Respawn Fail!", 'homescreen'); stateMachine?.transitionTo('homescreen'); return; }
            }
            player.health = playerData.health; player.x = playerData.x; player.y = playerData.y; player.z = playerData.z;
            player.rotationY = rotY; player.name = playerData.name; player.phrase = playerData.phrase;
            player.lastSentX = null; player.lastSentY = null; player.lastSentZ = null; player.lastSentRotationY = null;
            try {
                body.setTranslation({ x: playerData.x, y: centerY, z: playerData.z }, true); body.setRotation(q, true);
                body.setLinvel({ x: 0, y: 0, z: 0 }, true); body.setAngvel({ x: 0, y: 0, z: 0 }, true);
                console.log(`Teleported local body to ~(${playerData.x.toFixed(1)}, ${centerY.toFixed(1)}, ${playerData.z.toFixed(1)})`);
            } catch (e) { console.error("!!! Err teleport local body:", e); }
            if (UIManager) { UIManager.updateHealthBar(player.health); UIManager.updateInfo(`Playing as ${player.name}`); UIManager.clearKillMessage(); }
             if(controls && !controls.isLocked) { console.log("Attempt lock post-respawn."); controls.lock(); }
        } else { // Remote Player Respawn
            console.log(`Processing REMOTE respawn: ${playerName}`);
            if (!player || !(player instanceof ClientPlayer)) { console.warn(`Remote obj miss ${playerData.id}. Recreate visual...`); player = this._addPlayer(playerData); if (!player) { console.error(`Fail recreate visual ${playerData.id}!`); return; } }
            if (!body) { console.warn(`Remote body miss ${playerData.id}. Recreate kinematic...`); body = this._createKinematicBody(playerData); if (!body) { console.error(`Fail recreate kinematic ${playerData.id}!`); return; } bodyHandle = currentGameInstance.playerRigidBodyHandles?.[playerData.id]; }
            player.updateData(playerData); player.setVisible?.(true);
             try {
                 let collider = body?.collider(0);
                 if (collider && !collider.isEnabled()) { collider.setEnabled(true); console.log(`Re-enabled collider remote ${playerData.id}.`); }
             } catch(e) { console.error(`Err re-enable collider remote ${playerData.id}:`, e); }
            try { body.setNextKinematicTranslation({ x: playerData.x, y: centerY, z: playerData.z }, true); body.setNextKinematicRotation(q, true); console.log(`Teleported remote kinematic ${playerData.id} ~(${playerData.x.toFixed(1)}, ${centerY.toFixed(1)}, ${playerData.z.toFixed(1)})`); }
            catch(e) { console.error(`Err teleport remote kinematic ${playerData.id}:`, e); }
        }
    },

    handleServerFull: function() {
        console.warn("RX 'serverFull'.");
        if (socket) socket.disconnect();
        stateMachine?.transitionTo('homescreen', { errorMessage: `Server is Full!` });
    },


    // --- Actions ---
    attemptJoinGame: function() {
         console.log("Attempting join...");
         if (!UIManager?.playerNameInput || !UIManager.playerPhraseInput) { console.error("!!! Join fail: UI missing."); return; }
         window.localPlayerName = UIManager.playerNameInput.value.trim() || 'Anon';
         window.localPlayerPhrase = UIManager.playerPhraseInput.value.trim() || '...';
         if (!window.localPlayerName) window.localPlayerName = 'Anon';
         if (!window.localPlayerPhrase) window.localPlayerPhrase = '...';
         UIManager.playerNameInput.value = window.localPlayerName;
         UIManager.playerPhraseInput.value = window.localPlayerPhrase;
         UIManager.clearError('homescreen');
         console.log(`Checking prerequisites...`);
         const rapierOk = !!RAPIER && !!rapierWorld;
         const mapOk = currentGameInstance?.mapColliderCreated || false;
         console.log(`  Assets: ${assetsAreReady}, Rapier: ${rapierOk}, Map Collider Attempted: ${mapOk}`);
         if (!assetsAreReady || !rapierOk || !mapOk) { console.warn("Blocked: Core components not ready."); UIManager.showError('Initializing, please wait...', 'homescreen'); return; }
         console.log("Prerequisites met.");
         stateMachine?.transitionTo('joining');
         if (Network.isConnected()) { console.log("Connected -> Sending details..."); Network.sendJoinDetails(); }
         else {
             console.log("Not connected -> Triggering connection...");
             if (socket && !socket.active) { console.log("Manual socket.connect()."); socket.connect(); }
             else if (!socket) { console.error("!!! No socket! Init fail?"); UIManager.showError("Network Init Failed!", 'homescreen'); stateMachine?.transitionTo('homescreen'); }
         }
     },

     sendJoinDetails: function() {
         if (!stateMachine?.is('joining')) { console.warn("Not joining state. Abort sendDetails."); if (!stateMachine?.is('playing')) { stateMachine?.transitionTo('homescreen'); } return; }
         if (!Network.isConnected()) { console.error("Disconnected. Cannot send details."); stateMachine?.transitionTo('homescreen', {errorMessage:'Connection lost.'}); return; }
         console.log(`TX setPlayerDetails | Name: ${window.localPlayerName}, Phrase: ${window.localPlayerPhrase}`);
         socket.emit('setPlayerDetails', { name: window.localPlayerName, phrase: window.localPlayerPhrase });
     },

     sendPlayerUpdate: function(data) {
         const player = this._getPlayer(localPlayerId);
         if (Network.isConnected() && stateMachine?.is('playing') && player?.health > 0) {
             try { socket.emit('playerUpdate', data); } catch(e) { console.error("!!! Err sending playerUpdate:", e); }
         }
     },

     sendVoidDeath: function() {
         if (Network.isConnected() && stateMachine?.is('playing')) {
             console.log("TX fellIntoVoid");
              try { socket.emit('fellIntoVoid'); } catch(e) { console.error("!!! Err sending fellIntoVoid:", e); }
         }
     }
}; // End Network object

window.Network = Network;
console.log("network.js loaded (v6 - Ensure Correct Rapier CapsuleDesc)");

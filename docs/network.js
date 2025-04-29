// docs/network.js (v5 - Fix Rapier CapsuleDesc)

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
        // ---> Check for ClientPlayer class existence <---
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
             const bodyCenterY = playerData.y + playerHeight / 2.0;

             // ---> Use RAPIER.ColliderDesc.capsule() <---
             const collDesc = RAPIER.ColliderDesc.capsule(capsuleHalfHeight, playerRadius)
                 .setFriction(0.7)
                 .setRestitution(0.1)
                 .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
             // ---> END CHANGE <---

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

        if (!player && bodyHandle === undefined) {
             return; // Nothing to remove
        }

        console.log(`[Network] Removing player data and physics body for: ${player?.name || playerId} (Handle: ${bodyHandle ?? 'N/A'})`);

        if (player instanceof ClientPlayer) {
            try { player.remove?.(); } catch(e) { console.error(`[Network] Error removing player mesh for ${playerId}:`, e); }
        }

        if (bodyHandle !== undefined && bodyHandle !== null && rapierWorld) {
            try {
                 let body = rapierWorld.getRigidBody(bodyHandle);
                 if (body) { rapierWorld.removeRigidBody(body); }
            } catch (e) { console.error(`!!! Error removing Rapier body handle ${bodyHandle} for ${playerId}:`, e); }
        }

        if (window.players?.[playerId]) { delete window.players[playerId]; }
        if (currentGameInstance?.playerRigidBodyHandles && currentGameInstance.playerRigidBodyHandles[playerId] !== undefined) {
             delete currentGameInstance.playerRigidBodyHandles[playerId];
        }
         console.log(`[Network] Finished removing player ${playerId}.`);
    },

    // --- Event Handlers ---
    handleInitialize: function(data) {
        console.log('[Network] RX initialize');
        if (!data?.id || typeof data.players !== 'object') {
             console.error("!!! Invalid initialization data received from server:", data);
             stateMachine?.transitionTo('homescreen',{errorMessage:"Server Init Invalid!"}); // Go back home
             return;
        }
        initializationData = data; // Store the data
        networkIsInitialized = true; // Ensure flag is set
        console.log("[Network] Initialization data stored. Attempting to proceed to game...");
        currentGameInstance?.attemptProceedToGame(); // Call game logic to potentially start
    },

     handlePlayerJoined: function(playerData) {
        if (playerData?.id === localPlayerId) return; // Ignore self-join event

        if (playerData?.id && stateMachine?.is('playing')) {
             const name = playerData.name || 'Player';
             console.log(`[Network] RX playerJoined: ${name} (ID: ${playerData.id})`);

             if (this._getPlayer(playerData.id) || currentGameInstance?.playerRigidBodyHandles[playerData.id] !== undefined) {
                 console.warn(`[Network] Player ${playerData.id} already exists. Ignoring join event.`);
                 return;
             }

             const newPlayer = this._addPlayer(playerData); // Adds to window.players object

             if (newPlayer instanceof ClientPlayer) {
                  this._createKinematicBody(playerData); // Use helper to create body and store handle
             } else {
                 console.warn(`[Network] Skipping physics body for joined player ${playerData.id} because ClientPlayer instance failed.`);
             }

             if (UIManager?.showKillMessage) UIManager.showKillMessage(`${name} joined the game.`);

        } else if (!stateMachine?.is('playing')) {
             // console.log(`[Network] Ignored playerJoined event for ${playerData.id} because not in 'playing' state.`);
        }
    },

    handlePlayerLeft: function(playerId) {
        if (playerId) {
            const playerName = window.players?.[playerId]?.name || 'Player'; // Check global players
            console.log(`[Network] RX playerLeft: ${playerName} (ID: ${playerId})`);
            this._removePlayer(playerId); // Use helper to remove mesh, body, and state entries
            if (UIManager?.showKillMessage) UIManager.showKillMessage(`${playerName} left the game.`);
        }
    },

    handleGameStateUpdate: function(state) {
        if (!window.players || !state?.players || !stateMachine?.is('playing') || !localPlayerId || !rapierWorld || !currentGameInstance?.playerRigidBodyHandles || !RAPIER) {
            return; // Not ready or not relevant state
        }

        for (const id in state.players) {
            if (id === localPlayerId) continue; // Ignore updates for the local player

            const serverPlayerData = state.players[id];
            const remotePlayer = window.players[id];
            const remoteBodyHandle = currentGameInstance.playerRigidBodyHandles[id];

            if (remotePlayer instanceof ClientPlayer && remoteBodyHandle !== undefined && remoteBodyHandle !== null) {
                 try {
                    const remoteBody = rapierWorld.getRigidBody(remoteBodyHandle);
                    if (!remoteBody) { continue; }

                    const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
                    const targetCenterY = serverPlayerData.y + playerHeight / 2.0;
                    const targetPosition = { x: serverPlayerData.x, y: targetCenterY, z: serverPlayerData.z };

                    const targetRotationY = serverPlayerData.r || 0;
                    const targetQuaternion = new RAPIER.Quaternion(0, Math.sin(targetRotationY / 2.0), 0, Math.cos(targetRotationY / 2.0));
                    targetQuaternion.normalize();

                    remoteBody.setNextKinematicTranslation(targetPosition, true);
                    remoteBody.setNextKinematicRotation(targetQuaternion, true);

                    if (serverPlayerData.h !== undefined && remotePlayer.health !== serverPlayerData.h) {
                         remotePlayer.health = serverPlayerData.h;
                    }

                } catch (e) {
                     console.error(`!!! Error updating kinematic body for remote player ${id} (handle ${remoteBodyHandle}):`, e);
                }
            }
        }
    },

    handleHealthUpdate: function(data) {
        if (!data?.id || data.health === undefined) { console.warn("Invalid healthUpdate data received:", data); return; }
        const player = this._getPlayer(data.id);
        if (player) {
             player.health = data.health;
             if (data.id === localPlayerId && UIManager) {
                 UIManager.updateHealthBar(player.health);
             }
        }
    },

    handlePlayerDied: function(data) {
        if (!data?.targetId) { console.warn("Invalid playerDied data received:", data); return; }

        const targetPlayer = this._getPlayer(data.targetId);
        const targetName = data.targetName || targetPlayer?.name || 'Player';
        const killerName = data.killerName || 'Unknown';
        const killerPhrase = data.killerPhrase || 'eliminated';

        console.log(`[Network] RX playerDied: Target=${targetName}(${data.targetId}), Killer=${killerName}(${data.killerId ?? 'N/A'})`);

        if (data.targetId === localPlayerId) {
             if (targetPlayer) targetPlayer.health = 0;
             if (UIManager) {
                 UIManager.updateHealthBar(0);
                 let message = (data.killerId === null) ? "You fell out of the world."
                           : (data.killerId === data.targetId) ? "You eliminated yourself."
                           : `${killerName} ${killerPhrase} you.`;
                 UIManager.showKillMessage(message);
                 if (infoDiv) infoDiv.textContent = `DEAD - Respawning soon...`;
             }
             if (controls?.isLocked) controls.unlock();

        }
        else {
             if (targetPlayer instanceof ClientPlayer) {
                 targetPlayer.health = 0;
                 targetPlayer.setVisible?.(false);

                 const bodyHandle = currentGameInstance?.playerRigidBodyHandles?.[data.targetId];
                 if (bodyHandle && rapierWorld) {
                      try {
                           let body = rapierWorld.getRigidBody(bodyHandle);
                           let colliderHandle = body?.collider(0);
                           if (colliderHandle !== undefined && colliderHandle !== null) {
                               let collider = rapierWorld.getCollider(colliderHandle);
                               collider?.setEnabled(false);
                               console.log(`[Network] Disabled collider for dead remote player ${data.targetId}.`);
                           }
                      } catch(e) { console.error(`Error modifying physics for remote death (${data.targetId}):`, e); }
                 }
             }
             if (UIManager) {
                 let message = (data.killerId === null) ? `${targetName} fell out of the world.`
                           : (data.killerId === data.targetId) ? `${targetName} self-destructed.`
                           : `${killerName} ${killerPhrase} ${targetName}.`;
                 UIManager.showKillMessage(message);
             }
        }
    },

    handlePlayerRespawned: function(playerData) {
        if (!playerData?.id || !RAPIER || !rapierWorld || !currentGameInstance) {
            console.warn("Invalid playerRespawned data or missing physics/game objects:", playerData);
            return;
        }

        const playerName = playerData.name || 'Player';
        console.log(`[Network] RX playerRespawned: ${playerName} (ID: ${playerData.id})`);

        let player = this._getPlayer(playerData.id);
        let playerBodyHandle = currentGameInstance.playerRigidBodyHandles?.[playerData.id];
        let playerBody = null;
        if (playerBodyHandle !== undefined && playerBodyHandle !== null) {
             try { playerBody = rapierWorld.getRigidBody(playerBodyHandle); } catch(e) { console.error(`Error getting body ${playerBodyHandle} on respawn:`,e); }
        }

        const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
        const bodyCenterY = playerData.y + playerHeight / 2.0;
        const rotY = playerData.rotationY || 0;
        const q = new RAPIER.Quaternion(0, Math.sin(rotY / 2.0), 0, Math.cos(rotY / 2.0));
        q.normalize();

        if (playerData.id === localPlayerId) {
            console.log("[Network] Processing LOCAL player respawn.");
            if (!player) {
                console.warn("Local player object missing during respawn, creating placeholder.");
                window.players[localPlayerId] = { id: localPlayerId, health: 0, name: 'Player', phrase: '...' };
                player = window.players[localPlayerId];
            }
            if (!playerBody) {
                 console.error("!!! Local player physics body missing during respawn! Attempting to recreate...");
                 currentGameInstance.createPlayerPhysicsBody(localPlayerId, {x: playerData.x, y: playerData.y, z: playerData.z }); // Pass feet pos
                 playerBodyHandle = currentGameInstance.playerRigidBodyHandles?.[localPlayerId];
                 try { playerBody = rapierWorld.getRigidBody(playerBodyHandle); } catch(e){ console.error("Error getting recreated body:", e); }
                 if (!playerBody) {
                    console.error("!!! CRITICAL: Failed to recreate local player physics body! Aborting respawn.");
                    UIManager?.showError("Respawn Failed (No Physics Body)!", 'homescreen');
                    if (stateMachine && !stateMachine.is('homescreen')) stateMachine.transitionTo('homescreen');
                    return;
                 }
            }

            player.health = playerData.health;
            player.x = playerData.x; player.y = playerData.y; player.z = playerData.z;
            player.rotationY = rotY;
            player.name = playerData.name; player.phrase = playerData.phrase;
            player.lastSentX = null; player.lastSentY = null; player.lastSentZ = null; player.lastSentRotationY = null;

            try {
                playerBody.setTranslation({ x: playerData.x, y: bodyCenterY, z: playerData.z }, true);
                playerBody.setRotation(q, true);
                playerBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
                playerBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
                console.log(`[Network] Teleported local player body to server coords ~(${playerData.x.toFixed(1)}, ${bodyCenterY.toFixed(1)}, ${playerData.z.toFixed(1)})`);
            } catch (e) {
                 console.error("!!! Error teleporting local player body:", e);
            }

            if (UIManager) {
                UIManager.updateHealthBar(player.health);
                UIManager.updateInfo(`Playing as ${player.name}`);
                UIManager.clearKillMessage();
            }
             if(controls && !controls.isLocked) {
                 console.log("[Network] Attempting pointer lock after local respawn.");
                 controls.lock();
             }

        }
        else { // Remote Player Respawn
            console.log(`[Network] Processing REMOTE player respawn: ${playerName}`);
            if (!player || !(player instanceof ClientPlayer)) {
                 console.warn(`Remote player object missing for respawn ID ${playerData.id}. Recreating visual...`);
                 player = this._addPlayer(playerData);
                 if (!player) { console.error(`Failed to recreate visual for remote player ${playerData.id}!`); return; }
            }
            if (!playerBody) {
                 console.warn(`Remote player physics body missing for respawn ID ${playerData.id}. Recreating kinematic body...`);
                 playerBody = this._createKinematicBody(playerData);
                 if (!playerBody) { console.error(`Failed to recreate kinematic body for remote player ${playerData.id}!`); return; }
                 playerBodyHandle = currentGameInstance.playerRigidBodyHandles?.[playerData.id];
            }

            player.updateData(playerData);
            player.setVisible?.(true);

             try {
                 let colliderHandle = playerBody?.collider(0);
                 if (colliderHandle !== undefined && colliderHandle !== null) {
                     let collider = rapierWorld.getCollider(colliderHandle);
                     if (collider && !collider.isEnabled()) {
                          collider.setEnabled(true);
                          console.log(`[Network] Re-enabled collider for respawned remote player ${playerData.id}.`);
                     }
                 }
             } catch(e) { console.error(`Error re-enabling collider for remote respawn ${playerData.id}:`, e); }

            try {
                 playerBody.setNextKinematicTranslation({ x: playerData.x, y: bodyCenterY, z: playerData.z }, true);
                 playerBody.setNextKinematicRotation(q, true);
                 console.log(`[Network] Teleported remote kinematic body ${playerData.id} to server coords ~(${playerData.x.toFixed(1)}, ${bodyCenterY.toFixed(1)}, ${playerData.z.toFixed(1)})`);
            } catch(e) {
                 console.error(`Error teleporting remote kinematic body ${playerData.id}:`, e);
            }
        }
    },

    handleServerFull: function() {
        console.warn("[Network] Received 'serverFull' message from server.");
        if (socket) socket.disconnect(); // Disconnect the client
        stateMachine?.transitionTo('homescreen', { errorMessage: `Server is Full!` });
    },


    // --- Actions ---
    attemptJoinGame: function() {
         console.log("[Network] Attempting to join game...");

         if (!UIManager?.playerNameInput || !UIManager.playerPhraseInput) {
             console.error("!!! Cannot attempt join: Name or Phrase input element missing.");
             return;
         }
         window.localPlayerName = UIManager.playerNameInput.value.trim() || 'Anon';
         window.localPlayerPhrase = UIManager.playerPhraseInput.value.trim() || '...';
         if (!window.localPlayerName) window.localPlayerName = 'Anon';
         if (!window.localPlayerPhrase) window.localPlayerPhrase = '...';
         UIManager.playerNameInput.value = window.localPlayerName;
         UIManager.playerPhraseInput.value = window.localPlayerPhrase;

         UIManager.clearError('homescreen');

         console.log(`[Network Attempt Join] Checking prerequisites:`);
         const rapierIsSetup = !!RAPIER && !!rapierWorld;
         const mapColliderSetupAttempted = currentGameInstance?.mapColliderCreated || false;

         console.log(`  - Assets Ready? ${assetsAreReady}`);
         console.log(`  - Rapier Ready? ${rapierIsSetup}`);
         console.log(`  - Map Collider Setup Attempted? ${mapColliderSetupAttempted}`);

         if (!assetsAreReady || !rapierIsSetup || !mapColliderSetupAttempted) {
             console.warn("[Network Attempt Join] Blocked: Core components (Assets/Physics/Map Collider Setup) not ready yet.");
             UIManager.showError('Game systems initializing, please wait...', 'homescreen');
             return;
         }
         console.log("[Network Attempt Join] Prerequisites met.");

         stateMachine?.transitionTo('joining');

         if (Network.isConnected()) {
             console.log("[Network Attempt Join] Already connected -> Sending player details...");
             Network.sendJoinDetails();
         } else {
             console.log("[Network Attempt Join] Not connected -> Triggering connection...");
             if (socket && !socket.active) {
                  console.log("[Network Attempt Join] Manually calling socket.connect().");
                  socket.connect();
             } else if (!socket) {
                  console.error("!!! Cannot connect: Socket object doesn't exist! Network init likely failed.");
                  UIManager.showError("Network Init Failed!", 'homescreen');
                  stateMachine?.transitionTo('homescreen');
             }
         }
     }, // End attemptJoinGame

     sendJoinDetails: function() {
         if (!stateMachine?.is('joining')) {
             console.warn("[Network] Tried to send join details but not in 'joining' state. Aborting.");
              if (!stateMachine?.is('playing')) { stateMachine?.transitionTo('homescreen'); }
             return;
         }
         if (!Network.isConnected()) {
             console.error("[Network] Cannot send join details: Disconnected.");
             stateMachine?.transitionTo('homescreen', {errorMessage:'Connection lost.'});
             return;
         }
         console.log(`[Network] TX setPlayerDetails | Name: ${window.localPlayerName}, Phrase: ${window.localPlayerPhrase}`);
         socket.emit('setPlayerDetails', { name: window.localPlayerName, phrase: window.localPlayerPhrase });
     },

     sendPlayerUpdate: function(data) {
         const player = this._getPlayer(localPlayerId);
         if (Network.isConnected() && stateMachine?.is('playing') && player?.health > 0) {
             try { socket.emit('playerUpdate', data); }
             catch(e) { console.error("!!! Error sending playerUpdate via socket:", e); }
         }
     },

     sendVoidDeath: function() {
         if (Network.isConnected() && stateMachine?.is('playing')) {
             console.log("[Network] TX fellIntoVoid");
              try { socket.emit('fellIntoVoid'); }
              catch(e) { console.error("!!! Error sending fellIntoVoid via socket:", e); }
         }
     }

}; // End Network object

window.Network = Network; // Export globally
console.log("network.js loaded (v5 - Fix Rapier CapsuleDesc)");

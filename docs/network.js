// docs/network.js (REGENERATED with Debug Logs & Robustness Checks v4 - Fixed Auto-Proceed)

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
             // Explicitly enable WebSocket transport, adjust options if needed
             socket = io(CONFIG.SERVER_URL, {
                 transports: ['websocket'], // Prioritize websocket for Render
                 // reconnection: true,          // Default: true
                 // reconnectionAttempts: Infinity, // Default: Infinity
                 // reconnectionDelay: 1000,      // Default: 1000
                 // timeout: 20000,              // Default: 20000
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

            // --- !!! CHANGE HERE !!! ---
            // DO NOT automatically try to proceed to game on connect.
            // Instead, ensure the UI reflects the connected state, likely on the homescreen.
            // currentGameInstance?.attemptProceedToGame(); // <<< REMOVED THIS LINE

            // Update UI state on successful connection
            if (typeof UIManager !== 'undefined') {
                 UIManager.clearError('homescreen'); // Clear previous connection errors

                 // If we are on the homescreen, update the join button state
                 if (stateMachine?.is('homescreen') && UIManager.joinButton) {
                     UIManager.joinButton.disabled = false;
                     UIManager.joinButton.textContent = "Join Game";
                     console.log("[Network Connect] Enabled Join Button on homescreen.");
                 }
                 // If we were trying to join when connection (re)succeeded
                 else if (stateMachine?.is('joining')) {
                     console.log("[Network Connect] Was in 'joining' state, re-sending details now.");
                      if (UIManager.joinButton) UIManager.joinButton.textContent = "Joining..."; // Ensure text is correct
                     Network.sendJoinDetails(); // Try sending details again
                 }
            }
             // If assets/physics are ready, transition to homescreen state
             // This should ideally be handled after asset loading promise resolves in game.js
             if (assetsAreReady && window.isRapierReady && !stateMachine?.is('playing')) {
                if(!stateMachine?.is('homescreen')) { // Avoid redundant transitions
                    console.log("[Network Connect] Assets/Physics ready, transitioning to homescreen.");
                    // Pass current player count from UI if available
                    const currentCount = UIManager?.playerCountSpan?.textContent;
                    stateMachine?.transitionTo('homescreen', {playerCount: currentCount === '?' ? undefined : currentCount});
                }
             }
        });

        socket.on('disconnect', (reason) => {
            console.warn('[Network] Socket Disconnected. Reason:', reason);
            networkIsInitialized = false;
            initializationData = null; // Clear server init data

            // Only transition back to homescreen if currently playing or joining
            if (stateMachine?.is('playing') || stateMachine?.is('joining')) {
                // Pass error message option for UIManager listener
                let errorMsg = "Disconnected.";
                 if (reason === 'io server disconnect') errorMsg = "Kicked or server shut down.";
                 else if (reason === 'io client disconnect') errorMsg = "Left the game."; // Manual disconnect
                 else if (reason === 'ping timeout' || reason === 'transport close' || reason === 'transport error') errorMsg = "Connection lost.";

                stateMachine?.transitionTo('homescreen', {
                    playerCount: 0,
                    errorMessage: errorMsg // Pass error message
                }); // UIManager listener will handle showing error

                 if(infoDiv) infoDiv.textContent='Disconnected';
                 if(controls?.isLocked) controls.unlock();
                 // Cleanup game state (bodies, players) is handled by the state transition listener in game.js
             } else {
                  console.log("[Network] Disconnected while not in playing/joining state.");
                  // If on homescreen, update button state
                  if (stateMachine?.is('homescreen') && UIManager?.joinButton) {
                      UIManager.joinButton.disabled = true;
                      UIManager.joinButton.textContent = "Disconnected";
                  }
             }
        });

        socket.on('connect_error', (err) => {
            console.error('[Network] Connection Error:', err.message, err); // Log full error object
            networkIsInitialized = false;
            // Transition back to loading/homescreen with error message
            const errorMsg = `Connection Failed!<br/>${err.message}`;
            // Transition to homescreen and let its handler show the error
            stateMachine?.transitionTo('homescreen', {
                 errorMessage: errorMsg
            });
            // UIManager handles button state in showHomescreen based on connection status
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
    _getPlayer: function(id) { return window.players?.[id] || null; }, // Access global players

    _addPlayer: function(playerData) {
        // Ensure necessary globals/classes exist
        if (!window.ClientPlayer || !window.players) {
             console.error("!!! Cannot add player: ClientPlayer class or global players object missing.");
             return null;
        }
        if (playerData?.id && !window.players[playerData.id]) {
            console.log(`[Network] Creating ClientPlayer visual instance for: ${playerData.name || '??'} (ID: ${playerData.id})`);
            try {
                 // Create the visual representation and add to global players object
                 window.players[playerData.id] = new ClientPlayer(playerData);
                 return window.players[playerData.id];
            } catch (e) {
                 console.error(`!!! Error creating ClientPlayer instance for ${playerData.id}:`, e);
                 return null;
            }
        } else if (window.players[playerData.id]) {
            // console.warn(`[Network] Attempted to add player ${playerData.id} but they already exist in global players.`);
            return window.players[playerData.id]; // Return existing player
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
         // Avoid creating if handle already exists
         if (currentGameInstance.playerRigidBodyHandles[playerData.id] !== undefined) {
            // console.warn(`[Network] Kinematic body handle already exists for ${playerData.id}. Skipping creation.`);
            try { // Still try to return the existing body if handle exists
                return rapierWorld.getRigidBody(currentGameInstance.playerRigidBodyHandles[playerData.id]);
            } catch (e) {
                console.error(`[Network] Error getting existing kinematic body ${playerData.id}:`, e);
                delete currentGameInstance.playerRigidBodyHandles[playerData.id]; // Clear potentially invalid handle
            }
         }

         try {
             const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
             const playerRadius = CONFIG?.PLAYER_RADIUS || 0.4;
             const capsuleHalfHeight = Math.max(0.01, playerHeight / 2.0 - playerRadius);
             // Server sends Y at feet, calculate center Y for body creation
             const bodyCenterY = playerData.y + playerHeight / 2.0;

             const collDesc = RAPIER.ColliderDesc.capsuleY(capsuleHalfHeight, playerRadius) // Use capsuleY
                 .setFriction(0.7)
                 .setRestitution(0.1)
                 .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS); // Enable collision events

             const rotY = playerData.rotationY || 0;
             // Need to create quaternion using Rapier's methods
             const q = new RAPIER.Quaternion(0, Math.sin(rotY / 2.0), 0, Math.cos(rotY / 2.0)); // Assuming Y-axis rotation
             q.normalize(); // Ensure it's a unit quaternion

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
             // Clean up handle if partially created?
             delete currentGameInstance.playerRigidBodyHandles[playerData.id];
             return null;
         }
     },


    _removePlayer: function(playerId) {
        const player = this._getPlayer(playerId);
        const bodyHandle = currentGameInstance?.playerRigidBodyHandles?.[playerId]; // Check game instance handles

        if (!player && bodyHandle === undefined) {
             // console.warn(`[Network] Attempted to remove player ${playerId}, but no visual or physics object found.`);
             return; // Nothing to remove
        }

        console.log(`[Network] Removing player data and physics body for: ${player?.name || playerId} (Handle: ${bodyHandle ?? 'N/A'})`);

        // 1. Remove visual mesh (calls scene.remove, disposes geometry/material)
        if (player instanceof ClientPlayer) {
            try { player.remove?.(); } catch(e) { console.error(`[Network] Error removing player mesh for ${playerId}:`, e); }
        }

        // 2. Remove Rapier rigid body
        if (bodyHandle !== undefined && bodyHandle !== null && rapierWorld) {
            try {
                 let body = rapierWorld.getRigidBody(bodyHandle);
                 if (body) {
                    rapierWorld.removeRigidBody(body); // This also removes associated colliders
                    // console.log(`[Network] Removed Rapier body handle ${bodyHandle} for player ${playerId}`);
                 } else {
                    // console.warn(`[Network] Body for handle ${bodyHandle} (player ${playerId}) not found during removal attempt.`);
                 }
            } catch (e) { console.error(`!!! Error removing Rapier body handle ${bodyHandle} for ${playerId}:`, e); }
        }

        // 3. Delete from client state maps
        if (window.players?.[playerId]) {
             delete window.players[playerId];
        }
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
        // This triggers the check in game.js which calls startGamePlay if all ready
        currentGameInstance?.attemptProceedToGame(); // <<< THIS IS THE CORRECT PLACE TO CALL IT
    },

     handlePlayerJoined: function(playerData) {
        if (playerData?.id === localPlayerId) return; // Ignore self-join event

        // Only add player if we are currently in the 'playing' state
        if (playerData?.id && stateMachine?.is('playing')) {
             const name = playerData.name || 'Player';
             console.log(`[Network] RX playerJoined: ${name} (ID: ${playerData.id})`);

             // Prevent adding if already exists
             if (this._getPlayer(playerData.id) || currentGameInstance?.playerRigidBodyHandles[playerData.id] !== undefined) {
                 console.warn(`[Network] Player ${playerData.id} already exists. Ignoring join event.`);
                 return;
             }

             // 1. Create ClientPlayer (Visual Mesh) using the helper
             const newPlayer = this._addPlayer(playerData); // Adds to window.players object

             // 2. Create Rapier Kinematic Body (only if ClientPlayer creation succeeded)
             if (newPlayer instanceof ClientPlayer) {
                  this._createKinematicBody(playerData); // Use helper to create body and store handle
             } else {
                 console.warn(`[Network] Skipping physics body for joined player ${playerData.id} because ClientPlayer instance failed.`);
             }

             // Show join message notification
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
        // Ensure all prerequisites are met before processing updates
        if (!window.players || !state?.players || !stateMachine?.is('playing') || !localPlayerId || !rapierWorld || !currentGameInstance?.playerRigidBodyHandles || !RAPIER) {
            return; // Not ready or not relevant state
        }
        // console.log("RX gameStateUpdate", state); // DEBUG: Very spammy

        for (const id in state.players) {
            if (id === localPlayerId) continue; // Ignore updates for the local player

            const serverPlayerData = state.players[id]; // Data for one remote player from server
            const remotePlayer = window.players[id]; // Get ClientPlayer instance from global map
            const remoteBodyHandle = currentGameInstance.playerRigidBodyHandles[id];

            // Check if body handle exists before trying to get body
            if (remotePlayer instanceof ClientPlayer && remoteBodyHandle !== undefined && remoteBodyHandle !== null) {
                 try {
                    const remoteBody = rapierWorld.getRigidBody(remoteBodyHandle);
                    if (!remoteBody) {
                         // console.warn(`[Network Update] Kinematic body for ${id} (handle ${remoteBodyHandle}) not found.`);
                         continue; // Skip if body doesn't exist (maybe removed?)
                    }

                    // --- Update Kinematic Body Target ---
                    const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
                    // Server sends Y at feet, calculate target center Y for Rapier body
                    const targetCenterY = serverPlayerData.y + playerHeight / 2.0;
                    const targetPosition = { x: serverPlayerData.x, y: targetCenterY, z: serverPlayerData.z };

                    const targetRotationY = serverPlayerData.r || 0; // Server uses 'r' for rotationY
                    // Create quaternion from Y rotation
                    const targetQuaternion = new RAPIER.Quaternion(0, Math.sin(targetRotationY / 2.0), 0, Math.cos(targetRotationY / 2.0));
                    targetQuaternion.normalize();

                    // Set the *next* kinematic state. Rapier interpolates towards this based on physics steps.
                    remoteBody.setNextKinematicTranslation(targetPosition, true); // `true` = wake body if sleeping
                    remoteBody.setNextKinematicRotation(targetQuaternion, true);

                    // --- Update Non-Physics Data (e.g., Health) ---
                    if (serverPlayerData.h !== undefined && remotePlayer.health !== serverPlayerData.h) {
                         // console.log(`Updating remote player ${id} health to ${serverPlayerData.h}`); // DEBUG
                         remotePlayer.health = serverPlayerData.h;
                         // Optionally update visual cues based on remote player health here
                    }
                     // Update name/phrase if they were included? (Usually not in gameStateUpdate)
                     // remotePlayer.updateData(serverPlayerData); // If name/phrase could change

                } catch (e) {
                     console.error(`!!! Error updating kinematic body for remote player ${id} (handle ${remoteBodyHandle}):`, e);
                }
            }
            // else: Player or body might not exist locally yet (join/leave timing) - ignore update for this player
        }
    },

    handleHealthUpdate: function(data) {
        if (!data?.id || data.health === undefined) { console.warn("Invalid healthUpdate data received:", data); return; }
        // console.log(`[Net] RX healthUpdate for ${data.id}: ${data.health}`); // DEBUG

        const player = this._getPlayer(data.id); // Check global players
        if (player) {
             player.health = data.health;
             // If it's the local player, update the UI health bar
             if (data.id === localPlayerId && UIManager) {
                 UIManager.updateHealthBar(player.health);
             }
        }
    },

    handlePlayerDied: function(data) {
        if (!data?.targetId) { console.warn("Invalid playerDied data received:", data); return; }

        const targetPlayer = this._getPlayer(data.targetId); // Check global players
        const targetName = data.targetName || targetPlayer?.name || 'Player'; // Use name from data if available
        const killerName = data.killerName || 'Unknown';
        const killerPhrase = data.killerPhrase || 'eliminated';

        console.log(`[Network] RX playerDied: Target=${targetName}(${data.targetId}), Killer=${killerName}(${data.killerId ?? 'N/A'})`);

        // --- Handle Local Player Death ---
        if (data.targetId === localPlayerId) {
             if (targetPlayer) targetPlayer.health = 0; // Ensure local health state matches
             if (UIManager) {
                 UIManager.updateHealthBar(0);
                 let message = (data.killerId === null) ? "You fell out of the world."
                           : (data.killerId === data.targetId) ? "You eliminated yourself."
                           : `${killerName} ${killerPhrase} you.`;
                 UIManager.showKillMessage(message);
                 if (infoDiv) infoDiv.textContent = `DEAD - Respawning soon...`;
             }
             if (controls?.isLocked) controls.unlock(); // Unlock mouse
             // Optional: Make local player body kinematic temporarily? Or just let gravity act?
             // gameLogic.js already checks health > 0 for applying input forces.

        }
        // --- Handle Remote Player Death ---
        else {
             if (targetPlayer instanceof ClientPlayer) {
                 targetPlayer.health = 0;
                 targetPlayer.setVisible?.(false); // Hide the player mesh

                 // Consider disabling physics interaction for dead remote players?
                 // Kinematic bodies don't react anyway, hiding might be enough.
                 // If you wanted them to fall through floor, you'd need to remove/disable body/collider.
                 const bodyHandle = currentGameInstance?.playerRigidBodyHandles?.[data.targetId];
                 if (bodyHandle && rapierWorld) {
                      try {
                           let body = rapierWorld.getRigidBody(bodyHandle);
                           let colliderHandle = body?.collider(0); // Assuming one collider per body
                           if (colliderHandle !== undefined && colliderHandle !== null) {
                               let collider = rapierWorld.getCollider(colliderHandle);
                               collider?.setEnabled(false); // Disable collision checks and responses
                               console.log(`[Network] Disabled collider for dead remote player ${data.targetId}.`);
                           }
                      } catch(e) { console.error(`Error modifying physics for remote death (${data.targetId}):`, e); }
                 }
             }
             // Show kill message involving the remote player
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

        let player = this._getPlayer(playerData.id); // Check global players
        let playerBodyHandle = currentGameInstance.playerRigidBodyHandles?.[playerData.id];
        let playerBody = null;
        if (playerBodyHandle !== undefined && playerBodyHandle !== null) {
             try { playerBody = rapierWorld.getRigidBody(playerBodyHandle); } catch(e) { console.error(`Error getting body ${playerBodyHandle} on respawn:`,e); }
        }


        const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
        const bodyCenterY = playerData.y + playerHeight / 2.0; // Calculate center Y for body
        const rotY = playerData.rotationY || 0;
        const q = new RAPIER.Quaternion(0, Math.sin(rotY / 2.0), 0, Math.cos(rotY / 2.0));
        q.normalize();

        // --- Handle Local Player Respawn ---
        if (playerData.id === localPlayerId) {
            console.log("[Network] Processing LOCAL player respawn.");
            if (!player) { // Should exist, but handle potential race condition
                console.warn("Local player object missing during respawn, creating placeholder.");
                // Need to re-add basic structure if missing
                window.players[localPlayerId] = { id: localPlayerId, health: 0, name: 'Player', phrase: '...' };
                player = window.players[localPlayerId];
            }
            if (!playerBody) {
                 // Attempt to recreate the physics body if missing
                 console.error("!!! Local player physics body missing during respawn! Attempting to recreate...");
                 currentGameInstance.createPlayerPhysicsBody(localPlayerId, {x: playerData.x, y: playerData.y, z: playerData.z }); // Pass feet pos to helper
                 playerBodyHandle = currentGameInstance.playerRigidBodyHandles?.[localPlayerId];
                 try { playerBody = rapierWorld.getRigidBody(playerBodyHandle); } catch(e){ console.error("Error getting recreated body:", e); }
                 if (!playerBody) {
                    console.error("!!! CRITICAL: Failed to recreate local player physics body! Aborting respawn.");
                    UIManager?.showError("Respawn Failed (No Physics Body)!", 'homescreen');
                    if (stateMachine && !stateMachine.is('homescreen')) stateMachine.transitionTo('homescreen');
                    return;
                 }
            }

            // Update local data cache from respawn data
            player.health = playerData.health;
            player.x = playerData.x; player.y = playerData.y; player.z = playerData.z; // Feet position cache
            player.rotationY = rotY;
            player.name = playerData.name; player.phrase = playerData.phrase;
            // Reset last sent data
            player.lastSentX = null; player.lastSentY = null; player.lastSentZ = null; player.lastSentRotationY = null;


            // Teleport the physics body AND reset velocities
            try {
                playerBody.setTranslation({ x: playerData.x, y: bodyCenterY, z: playerData.z }, true);
                playerBody.setRotation(q, true);
                playerBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
                playerBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
                console.log(`[Network] Teleported local player body to server coords ~(${playerData.x.toFixed(1)}, ${bodyCenterY.toFixed(1)}, ${playerData.z.toFixed(1)})`);
            } catch (e) {
                 console.error("!!! Error teleporting local player body:", e);
            }

            // Update UI
            if (UIManager) {
                UIManager.updateHealthBar(player.health);
                UIManager.updateInfo(`Playing as ${player.name}`);
                UIManager.clearKillMessage(); // Clear death message
            }
             // Attempt to re-lock pointer if controls exist
             if(controls && !controls.isLocked) {
                 console.log("[Network] Attempting pointer lock after local respawn.");
                 controls.lock();
             }
            // Re-enable input processing by setting health > 0 (handled by gameLogic.js)

        }
        // --- Handle Remote Player Respawn ---
        else {
            console.log(`[Network] Processing REMOTE player respawn: ${playerName}`);
            // Ensure player object and body exist, recreate if necessary
            if (!player || !(player instanceof ClientPlayer)) {
                 console.warn(`Remote player object missing for respawn ID ${playerData.id}. Recreating visual...`);
                 player = this._addPlayer(playerData); // Recreate visual instance
                 if (!player) { console.error(`Failed to recreate visual for remote player ${playerData.id}!`); return; }
            }
            if (!playerBody) {
                 console.warn(`Remote player physics body missing for respawn ID ${playerData.id}. Recreating kinematic body...`);
                 playerBody = this._createKinematicBody(playerData); // Recreate kinematic body
                 if (!playerBody) { console.error(`Failed to recreate kinematic body for remote player ${playerData.id}!`); return; }
                 playerBodyHandle = currentGameInstance.playerRigidBodyHandles?.[playerData.id]; // Update handle ref
            }

            // Update ClientPlayer data cache
            player.updateData(playerData); // Updates health, name, phrase
            player.setVisible?.(true); // Make mesh visible again

            // Re-enable collider if it was disabled on death
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


            // Teleport the kinematic body using setNext... for smooth transition
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
        // Transition to homescreen with error
        stateMachine?.transitionTo('homescreen', { errorMessage: `Server is Full!` });
    },


    // --- Actions ---
    attemptJoinGame: function() {
         console.log("[Network] Attempting to join game...");

         // 1. Get Player Details from UI
         if (!UIManager?.playerNameInput || !UIManager.playerPhraseInput) {
             console.error("!!! Cannot attempt join: Name or Phrase input element missing.");
             return;
         }
         // Use global variables from config.js scope
         window.localPlayerName = UIManager.playerNameInput.value.trim() || 'Anon';
         window.localPlayerPhrase = UIManager.playerPhraseInput.value.trim() || '...';
         if (!window.localPlayerName) window.localPlayerName = 'Anon'; // Fallback if empty after trim
         if (!window.localPlayerPhrase) window.localPlayerPhrase = '...';
         // Update UI fields if defaults were used
         UIManager.playerNameInput.value = window.localPlayerName;
         UIManager.playerPhraseInput.value = window.localPlayerPhrase;

         // 2. Clear Previous Errors (Important before checking prerequisites)
         UIManager.clearError('homescreen');

         // 3. *** Check Core Game Prerequisites ***
         console.log(`[Network Attempt Join] Checking prerequisites:`);
         const rapierIsSetup = !!RAPIER && !!rapierWorld;
         // Check if map collider creation was attempted and maybe succeeded (or fallback simple ground exists)
         const mapColliderSetupAttempted = currentGameInstance?.mapColliderCreated || false; // Use flag from game.js

         console.log(`  - Assets Ready? ${assetsAreReady}`);
         console.log(`  - Rapier Ready? ${rapierIsSetup}`);
         console.log(`  - Map Collider Setup Attempted? ${mapColliderSetupAttempted}`); // Check if creation logic ran

         // If any core component is missing, show "initializing" message and stop
         // Note: We check mapColliderSetupAttempted because creation might fail and fallback, which is okay for joining.
         if (!assetsAreReady || !rapierIsSetup || !mapColliderSetupAttempted) {
             console.warn("[Network Attempt Join] Blocked: Core components (Assets/Physics/Map Collider Setup) not ready yet.");
             UIManager.showError('Game systems initializing, please wait...', 'homescreen');
             return; // Stop the join attempt here
         }
         console.log("[Network Attempt Join] Prerequisites met.");

         // 4. Transition to 'Joining' State & Update UI Button
         stateMachine?.transitionTo('joining'); // UIManager listener updates button text/state

         // 5. Handle Connection & Send Details
         if (Network.isConnected()) {
             // Already connected, just send details
             console.log("[Network Attempt Join] Already connected -> Sending player details...");
             Network.sendJoinDetails();
         } else {
             // Not connected, initiate connection (or wait for existing attempt)
             console.log("[Network Attempt Join] Not connected -> Triggering connection...");
             // UI already updated to "Connecting..." by UIManager listener for 'joining' state
             if (socket && !socket.active) { // If socket exists but isn't trying to connect/connected
                  console.log("[Network Attempt Join] Manually calling socket.connect().");
                  socket.connect();
             } else if (!socket) {
                  console.error("!!! Cannot connect: Socket object doesn't exist! Network init likely failed.");
                  UIManager.showError("Network Init Failed!", 'homescreen');
                  stateMachine?.transitionTo('homescreen'); // Go back if connection can't even start
             }
             // If socket.active is true, it means it's already trying to connect, just wait.
             // The 'connect' event handler will call sendJoinDetails if state is 'joining'
         }
     }, // End attemptJoinGame

     sendJoinDetails: function() {
         // Double-check state and connection before sending
         if (!stateMachine?.is('joining')) {
             console.warn("[Network] Tried to send join details but not in 'joining' state. Aborting.");
             // If not joining, maybe go back to homescreen?
              if (!stateMachine?.is('playing')) {
                 stateMachine?.transitionTo('homescreen');
              }
             return;
         }
         if (!Network.isConnected()) {
             console.error("[Network] Cannot send join details: Disconnected.");
             // Don't transition here, disconnect handler should manage state
             stateMachine?.transitionTo('homescreen', {errorMessage:'Connection lost.'}); // Go back home with error
             return;
         }
         console.log(`[Network] TX setPlayerDetails | Name: ${window.localPlayerName}, Phrase: ${window.localPlayerPhrase}`);
         socket.emit('setPlayerDetails', { name: window.localPlayerName, phrase: window.localPlayerPhrase });
         // Server will respond with 'initialize' event if successful
     },

     sendPlayerUpdate: function(data) {
         // Only send if connected, playing, and alive (check local player state)
         const player = this._getPlayer(localPlayerId);
         if (Network.isConnected() && stateMachine?.is('playing') && player?.health > 0) {
             // console.log("TX playerUpdate", data); // DEBUG: Very spammy
             try {
                socket.emit('playerUpdate', data);
             } catch(e) {
                console.error("!!! Error sending playerUpdate via socket:", e);
             }
         }
     },

     sendVoidDeath: function() {
         // Only send if connected and playing (server verifies health server-side)
         if (Network.isConnected() && stateMachine?.is('playing')) {
             console.log("[Network] TX fellIntoVoid");
              try {
                 socket.emit('fellIntoVoid');
              } catch(e) {
                 console.error("!!! Error sending fellIntoVoid via socket:", e);
              }
         }
     }

}; // End Network object

window.Network = Network; // Export globally
console.log("network.js loaded (REGENERATED v4 - Fixed Auto-Proceed)");

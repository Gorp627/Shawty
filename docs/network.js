// docs/network.js (Handle Hits, Death Effects - REGENERATED v3)

// Depends on: config.js, stateMachine.js, entities.js, input.js, uiManager.js, game.js, gameLogic.js, effects.js
// Accesses globals: players, localPlayerId, socket, controls, CONFIG, RAPIER, rapierWorld,
//                   stateMachine, UIManager, ClientPlayer, scene, infoDiv, currentGameInstance, assetsAreReady, Effects, applyShockwave

var socket; // Global socket variable

const Network = {
    init: function() {
        this.setupSocketIO();
        console.log("[Network] Initialized and requested socket connection.");
    },

    isConnected: function() {
        // Ensure socket exists and has the connected property true
        return typeof socket !== 'undefined' && socket && socket.connected === true;
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
             // Prioritize websocket, allow polling as fallback
             socket = io(CONFIG.SERVER_URL, {
                 transports: ['websocket', 'polling'],
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

            // Update UI state on successful connection
            if (typeof UIManager !== 'undefined') {
                 UIManager.clearError('homescreen'); // Clear previous connection errors
                 // If we were trying to join when connection succeeded
                 if (stateMachine?.is('joining')) {
                     console.log("[Network Connect] Was in 'joining' state, sending details now.");
                      if (UIManager.joinButton) UIManager.joinButton.textContent = "Joining..."; // Ensure text is correct
                     Network.sendJoinDetails();
                 } else if (stateMachine?.is('homescreen') && UIManager.joinButton) {
                     // If just connected while on homescreen, enable join button
                     UIManager.joinButton.disabled = false;
                     UIManager.joinButton.textContent = "Join Game";
                     console.log("[Network Connect] Reset Join Button state on homescreen.");
                 }
            }
            // Check if ready to proceed (e.g., if assets/physics finished while disconnected)
            currentGameInstance?.attemptProceedToGame();
        });

        socket.on('disconnect', (reason) => {
            console.warn('[Network] Socket Disconnected. Reason:', reason);
            networkIsInitialized = false;
            initializationData = null; // Clear server init data

            // Only transition back to homescreen if currently playing or joining
            if (stateMachine?.is('playing') || stateMachine?.is('joining')) {
                // *** CRITICAL: Cleanup ALL player objects and bodies on disconnect ***
                currentGameInstance?.cleanupAllPlayers(); // Use game's cleanup method
                console.log("[Network Disconnect] Cleaned up player objects after disconnect.");
                // *** END CRITICAL Cleanup ***

                stateMachine?.transitionTo('homescreen', { playerCount: 0 }); // Reset player count
                 if(UIManager) {
                     UIManager.updatePlayerCount(0);
                     let errorMsg = "Disconnected.";
                     if (reason === 'io server disconnect') errorMsg = "Kicked or server shut down.";
                     else if (reason === 'io client disconnect') errorMsg = "Left the game."; // Manual disconnect
                     else if (reason === 'ping timeout' || reason === 'transport close' || reason === 'transport error') errorMsg = "Connection lost.";
                     UIManager.showError(errorMsg, 'homescreen');
                 }
                 // Use global references safely
                 const globalInfoDiv = window.infoDiv; // Get from global scope if needed
                 if(globalInfoDiv) globalInfoDiv.textContent='Disconnected';
                 const globalControls = window.controls;
                 if(globalControls?.isLocked) globalControls.unlock();

             } else {
                  console.log("[Network] Disconnected while not in playing/joining state.");
                  // If on homescreen, maybe disable join button until reconnected
                  if (stateMachine?.is('homescreen') && UIManager?.joinButton) {
                      UIManager.joinButton.disabled = true;
                      UIManager.joinButton.textContent = "Disconnected";
                  }
             }
             // Cleanup game state (bodies, players) is handled by the state transition listener in game.js OR explicitly above
        });

        socket.on('connect_error', (err) => {
            console.error('[Network] Connection Error:', err.message, err); // Log full error object
            networkIsInitialized = false;
            // Transition back to loading/homescreen with error message
            const errorMsg = `Connection Failed!<br/>Check Console (F12).`; // Simpler message for UI
            if (stateMachine?.is('loading') || stateMachine?.is('joining')) {
                 stateMachine.transitionTo('loading', { message: errorMsg, error: true });
            } else {
                 stateMachine?.transitionTo('homescreen'); // Ensure on homescreen
                 UIManager?.showError(errorMsg, 'homescreen');
                 if (UIManager?.joinButton) { // Disable join on connection failure
                      UIManager.joinButton.disabled = true;
                      UIManager.joinButton.textContent = "Connection Failed";
                 }
            }
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
        socket.on('playerDied', (data) => Network.handlePlayerDied(data) ); // Now triggers effects
        socket.on('playerRespawned', (data) => Network.handlePlayerRespawned(data) );
        socket.on('serverFull', () => Network.handleServerFull() );
        // Optional: Listener for server confirming hit? Or shot fired by others?
        // socket.on('shotFiredByOther', (data) => Network.handleRemoteShot(data));

        console.log("[Network] Core socket event listeners attached.");
    },

    // --- Helper Functions ---
    // Use global 'players' object safely
    _getPlayer: function(id) { return (typeof window !== 'undefined' && window.players) ? window.players[id] || null : null; },

    _addPlayer: function(playerData) {
        // Ensure necessary globals/classes exist
        if (typeof window === 'undefined' || !window.ClientPlayer || !window.players) {
             console.error("!!! Cannot add player: ClientPlayer class or global players object missing.");
             return null;
        }
        if (playerData?.id && !window.players[playerData.id]) {
            console.log(`[Network] Creating ClientPlayer visual instance for: ${playerData.name || '??'} (ID: ${playerData.id})`);
            try {
                 // Create the visual representation and add to global players object
                 window.players[playerData.id] = new ClientPlayer(playerData); // Assumes ClientPlayer is defined globally or imported
                 return window.players[playerData.id];
            } catch (e) {
                 console.error(`!!! Error creating ClientPlayer instance for ${playerData.id}:`, e);
                 return null;
            }
        } else if (window.players[playerData.id]) {
            console.warn(`[Network] Attempted to add player ${playerData.id} but they already exist in global players.`);
            return window.players[playerData.id]; // Return existing player
        } else {
            console.warn(`[Network] Attempted to add player with invalid data or missing ID:`, playerData);
            return null;
        }
    },

    _removePlayer: function(playerId) {
         // Delegate cleanup to the Game instance
         if (currentGameInstance && typeof currentGameInstance.cleanupPlayer === 'function') {
             currentGameInstance.cleanupPlayer(playerId);
             console.log(`[Network] Requested cleanup for player ${playerId} via Game instance.`);
         } else {
              console.warn(`[Network] Cannot remove player ${playerId}: Game instance or cleanupPlayer method missing.`);
              // Manual fallback cleanup (less ideal as it duplicates logic)
              const player = this._getPlayer(playerId);
              if (player instanceof ClientPlayer) {
                   player.remove?.(); // Remove mesh if method exists
                   if (window.players) delete window.players[playerId];
              }
              // Cannot easily remove physics body without game instance reference
         }
    },

    // --- Event Handlers ---
    handleInitialize: function(data) {
        console.log('[Network] RX initialize');
        if (!data?.id || typeof data.players !== 'object') {
             console.error("!!! Invalid initialization data received from server:", data);
             // Attempt to go back to homescreen safely
             if(stateMachine && !stateMachine.is('homescreen')) stateMachine.transitionTo('homescreen');
             UIManager?.showError("Server Init Invalid!", "homescreen");
             return;
        }
        initializationData = data; // Store the data
        networkIsInitialized = true; // Ensure flag is set
        console.log("[Network] Initialization data stored. Attempting to proceed to game...");
        // This triggers the check in game.js which calls startGamePlay if all ready
        currentGameInstance?.attemptProceedToGame();
    },

    handlePlayerJoined: function(playerData) {
        if (playerData?.id === localPlayerId) return; // Ignore self-join event

        // Only add player if we are currently in the 'playing' state
        if (playerData?.id && !this._getPlayer(playerData.id) && stateMachine?.is('playing')) {
             const name = playerData.name || 'Player';
             console.log(`[Network] RX playerJoined: ${name} (ID: ${playerData.id})`);

             // 1. Create ClientPlayer (Visual Mesh) using the helper
             const newPlayer = this._addPlayer(playerData); // Adds to window.players object

             // 2. Create Rapier Kinematic Body (only if ClientPlayer creation succeeded)
             // Ensure Rapier and physics world are ready (use globals)
             const globalRapier = window.RAPIER;
             const globalRapierWorld = window.rapierWorld;

             if (newPlayer instanceof ClientPlayer && newPlayer.mesh && globalRapier && globalRapierWorld && currentGameInstance && typeof currentGameInstance.createPlayerPhysicsBody === 'function') {
                 try {
                     const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
                     // Server sends Y at feet, calculate center Y for physics body
                     const bodyCenterY = playerData.y + playerHeight / 2.0;
                     const startPos = { x: playerData.x, y: bodyCenterY, z: playerData.z };
                     // Use Game instance method to create body
                     currentGameInstance.createPlayerPhysicsBody(playerData.id, startPos, playerData.rotationY || 0, false); // false = remote player
                 } catch (e) {
                     console.error(`!!! Failed to create physics body for joined player ${playerData.id}:`, e);
                     // Cleanup if physics failed: remove ClientPlayer instance if it exists
                     this._removePlayer(playerData.id); // Use helper to remove mesh and player entry
                 }
             } else if (!(newPlayer instanceof ClientPlayer)) {
                 console.warn(`[Network] Skipping physics body for joined player ${playerData.id} because ClientPlayer instance failed.`);
             } else {
                  console.warn(`[Network] Skipping physics body creation for joined player ${playerData.id}. Missing RAPIER/World/GameInstance or Method?`);
             }

             // Show join message notification
             if (UIManager?.showKillMessage) UIManager.showKillMessage(`${name} joined the game.`);

        } else if (!stateMachine?.is('playing')) {
             // console.log(`[Network] Ignored playerJoined event for ${playerData.id} because not in 'playing' state.`);
        }
    },

    handlePlayerLeft: function(playerId) {
        if (playerId) {
            const player = this._getPlayer(playerId); // Check global players
            const playerName = player?.name || 'Player';
            console.log(`[Network] RX playerLeft: ${playerName} (ID: ${playerId})`);
            this._removePlayer(playerId); // Use helper which calls game cleanup method
            if (UIManager?.showKillMessage) UIManager.showKillMessage(`${playerName} left the game.`);
        }
    },

    handleGameStateUpdate: function(state) {
        // Use global references safely
        const globalPlayers = window.players;
        const globalRapierWorld = window.rapierWorld;
        const globalRapier = window.RAPIER;

        // Ensure all prerequisites are met before processing updates
        if (!globalPlayers || !state?.players || !stateMachine?.is('playing') || !localPlayerId || !globalRapierWorld || !currentGameInstance?.playerRigidBodyHandles || !globalRapier) {
            return; // Not ready or not relevant state
        }
        // console.log("RX gameStateUpdate", state); // DEBUG: Very spammy

        for (const id in state.players) {
            if (id === localPlayerId) continue; // Ignore updates for the local player

            const serverPlayerData = state.players[id]; // Data for one remote player from server
            const remotePlayer = globalPlayers[id]; // Get ClientPlayer instance from global map
            const remoteBodyHandle = currentGameInstance.playerRigidBodyHandles[id];

            // Check if both visual player and physics body handle exist
            if (remotePlayer instanceof ClientPlayer && remoteBodyHandle !== undefined && remoteBodyHandle !== null) {
                try {
                    const remoteBody = globalRapierWorld.getRigidBody(remoteBodyHandle);
                    // IMPORTANT: Ensure the body is kinematic before setting kinematic targets
                    if(remoteBody && remoteBody.isKinematic()) {
                        const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
                        // Server sends Y at feet, calculate target center Y for Rapier body
                        const targetCenterY = serverPlayerData.y + playerHeight / 2.0;
                        const targetPosition = { x: serverPlayerData.x, y: targetCenterY, z: serverPlayerData.z };

                        const targetRotationY = serverPlayerData.r || 0; // Server uses 'r' for rotationY
                        const targetQuaternion = globalRapier.Quaternion.fromAxisAngle({ x: 0, y: 1, z: 0 }, targetRotationY);

                        // Set the *next* kinematic state. Rapier interpolates towards this.
                        remoteBody.setNextKinematicTranslation(targetPosition, true); // `true` = wake body if sleeping
                        if (targetQuaternion) {
                            remoteBody.setNextKinematicRotation(targetQuaternion, true);
                        } else { console.warn(`Failed to create quaternion for remote player ${id} update.`); }

                        // --- Update Non-Physics Data (e.g., Health) ---
                        // Check if health data 'h' is present and different
                        if (serverPlayerData.h !== undefined && remotePlayer.health !== serverPlayerData.h) {
                             // console.log(`Updating remote player ${id} health to ${serverPlayerData.h}`); // DEBUG
                             remotePlayer.health = serverPlayerData.h;
                             // Optionally update visual cues based on remote player health here
                        }
                        // Update name/phrase if they were included (usually not in gameStateUpdate)
                        remotePlayer.updateData(serverPlayerData); // Syncs position cache and other fields if present

                    } else if (remoteBody && !remoteBody.isKinematic()) {
                         console.warn(`[Network Update] Body for remote player ${id} exists but is not kinematic!`);
                    }
                } catch (e) {
                     console.error(`!!! Error updating kinematic body for remote player ${id}:`, e);
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
        const targetName = targetPlayer?.name || 'Player';
        const killerName = data.killerName || 'Unknown';
        const killerPhrase = data.killerPhrase || 'eliminated';

        console.log(`[Network] RX playerDied: Target=${targetName}(${data.targetId}), Killer=${killerName}(${data.killerId ?? 'N/A'})`);

        // --- Get Death Position ---
        let deathPosition = new THREE.Vector3(0, 5, 0); // Default fallback
        if (targetPlayer) {
             // Prefer physics body position if available and valid
             const bodyHandle = currentGameInstance?.playerRigidBodyHandles?.[data.targetId];
             const globalRapierWorld = window.rapierWorld;
             if (bodyHandle !== undefined && bodyHandle !== null && globalRapierWorld) {
                  try {
                       const body = globalRapierWorld.getRigidBody(bodyHandle);
                       if (body) {
                            const bodyPos = body.translation();
                            deathPosition.set(bodyPos.x, bodyPos.y, bodyPos.z); // Use body center
                       }
                  } catch(e) { console.warn("Error getting physics body pos for death effect:", e); }
             }
             // Fallback to mesh or server coords if body failed
             if (deathPosition.y < (CONFIG.VOID_Y_LEVEL || -90)) { // Check if fallback needed
                  if (targetPlayer.mesh) {
                      deathPosition.copy(targetPlayer.mesh.position);
                      // Adjust Y if mesh is at feet but effect needs center
                      // deathPosition.y += (CONFIG.PLAYER_HEIGHT || 1.8) / 2.0;
                  } else {
                      deathPosition.set(targetPlayer.serverX || 0, (targetPlayer.serverY || 0) + (CONFIG.PLAYER_HEIGHT || 1.8) / 2.0, targetPlayer.serverZ || 0); // Estimate center from server feet pos
                  }
             }
        }
         console.log("[Network] Death Position for effects:", deathPosition);

        // --- Trigger Effects (Explosion + Shockwave) ---
        if (typeof Effects?.createExplosionEffect === 'function') {
             Effects.createExplosionEffect(deathPosition);
        }
        // Ensure applyShockwave is accessible (defined globally or imported if modules used)
        if (typeof applyShockwave === 'function') {
             applyShockwave(deathPosition, data.targetId); // Pass origin and dead player ID
        } else {
             console.warn("applyShockwave function not found, cannot apply death impulse.");
        }

        // --- Handle Player State Change (Local vs Remote) ---
        if (data.targetId === localPlayerId) {
             // Local player died
             if (targetPlayer) targetPlayer.health = 0; // Ensure local health state matches
             if (UIManager) {
                 UIManager.updateHealthBar(0);
                 let message = (data.killerId === null) ? "You fell out of the world."
                           : (data.killerId === data.targetId) ? "You eliminated yourself."
                           : `${killerName} ${killerPhrase} you.`;
                 UIManager.showKillMessage(message);
                 // Use global reference safely
                 const globalInfoDiv = window.infoDiv;
                 if (globalInfoDiv) globalInfoDiv.textContent = `DEAD - Respawning soon...`;
             }
             // Use global reference safely
             const globalControls = window.controls;
             if (globalControls?.isLocked) globalControls.unlock(); // Unlock mouse

        } else { // Remote player died
             if (targetPlayer instanceof ClientPlayer) {
                 targetPlayer.health = 0;
                 targetPlayer.setVisible?.(false); // Hide the player mesh

                 // Consider disabling physics interaction for dead remote players (optional)
                 const bodyHandle = currentGameInstance?.playerRigidBodyHandles?.[data.targetId];
                 const globalRapierWorld = window.rapierWorld;
                 if (bodyHandle !== undefined && bodyHandle !== null && globalRapierWorld) {
                      try {
                          let body = globalRapierWorld.getRigidBody(bodyHandle);
                          // Just hiding mesh might be sufficient, server respawn handles teleporting body
                          console.log(`[Network] Remote player ${data.targetId} died, mesh hidden.`);
                      } catch(e) { console.error("Error accessing remote body on death:", e); }
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
        // Use global references safely
        const globalRapier = window.RAPIER;
        const globalRapierWorld = window.rapierWorld;

        if (!playerData?.id || !globalRapier || !globalRapierWorld || !currentGameInstance) {
            console.warn("Invalid playerRespawned data or missing physics/game objects:", playerData);
            return;
        }

        const playerName = playerData.name || 'Player';
        console.log(`[Network] RX playerRespawned: ${playerName} (ID: ${playerData.id})`);

        let player = this._getPlayer(playerData.id); // Check global players
        let playerBodyHandle = currentGameInstance.playerRigidBodyHandles?.[playerData.id];
        let playerBody = playerBodyHandle !== undefined && playerBodyHandle !== null ? globalRapierWorld.getRigidBody(playerBodyHandle) : null;

        const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
        const bodyCenterY = playerData.y + playerHeight / 2.0; // Calculate center Y for body
        const targetPos = { x: playerData.x, y: bodyCenterY, z: playerData.z };
        const rotY = playerData.rotationY || 0;
        const targetQuat = globalRapier.Quaternion.fromAxisAngle({ x: 0, y: 1, z: 0 }, rotY);
        if (!targetQuat) { console.error(`!!! Failed to create respawn quaternion for ${playerData.id}!`); return; }

        // --- Handle Local Player Respawn ---
        if (playerData.id === localPlayerId) {
            console.log("[Network] Processing LOCAL player respawn.");
            if (!player) { // Should exist, but handle potential race condition
                console.error("!!! CRITICAL: Local player data object missing during respawn!"); return;
            }
            if (!playerBody || !playerBody.isDynamic()) { // Check if dynamic body exists
                console.error("!!! CRITICAL: Local player physics body missing or not dynamic during respawn! Cannot teleport.");
                UIManager?.showError("Respawn Failed (No Physics Body)!", 'homescreen');
                if (stateMachine && !stateMachine.is('homescreen')) stateMachine.transitionTo('homescreen');
                return;
            }
            // Update local data cache from respawn data
            player.health = playerData.health;
            player.x = playerData.x; player.y = playerData.y; player.z = playerData.z; // Feet position cache
            player.rotationY = rotY;
            player.name = playerData.name; player.phrase = playerData.phrase;
            // Update global name/phrase if they exist
            if (typeof window !== 'undefined') {
                window.localPlayerName = player.name;
                window.localPlayerPhrase = player.phrase;
            }


            // Teleport the physics body AND reset velocities
            playerBody.setTranslation(targetPos, true);
            playerBody.setRotation(targetQuat, true);
            playerBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
            playerBody.setAngvel({ x: 0, y: 0, z: 0 }, true);

            console.log(`[Network] Teleported local player body to server coords ~(${playerData.x.toFixed(1)}, ${bodyCenterY.toFixed(1)}, ${playerData.z.toFixed(1)})`);

            // Update UI
            if (UIManager) {
                UIManager.updateHealthBar(player.health);
                UIManager.updateInfo(`Playing as ${player.name}`);
                UIManager.clearKillMessage(); // Clear death message
            }
            // Re-enable input processing if it was disabled on death? (Handled by isAlive check in gameLogic)
            // Controls might need a click to re-lock if unlocked on death
            console.log("[Network] Local player respawn complete. Click game window to re-lock controls if needed.")

        }
        // --- Handle Remote Player Respawn ---
        else {
            console.log(`[Network] Processing REMOTE player respawn: ${playerName}`);
            // Ensure player object and body exist, recreate if necessary
            if (!player || !(player instanceof ClientPlayer)) {
                console.warn(`Remote player object missing for respawn ID ${playerData.id}. Attempting full player recreate...`);
                this._removePlayer(playerData.id); // Clean up potential remnants first
                this.handlePlayerJoined(playerData); // Re-run the join logic
                // Re-fetch references after recreate attempt
                player = this._getPlayer(playerData.id);
            }
             // Fetch body again after potential recreate
             playerBodyHandle = currentGameInstance?.playerRigidBodyHandles?.[playerData.id];
             playerBody = playerBodyHandle !== undefined && playerBodyHandle !== null ? globalRapierWorld.getRigidBody(playerBodyHandle) : null;

             // Check again after potential recreate
             if (!player || !(player instanceof ClientPlayer)) {
                  console.error(`!!! Failed to recreate remote player ${playerData.id} during respawn! Aborting respawn.`);
                  return; // Give up if recreate failed
             }
            if (!playerBody || !playerBody.isKinematic()) {
                 console.error(`!!! Remote player body missing or not kinematic for respawn ID ${playerData.id}! Aborting respawn.`);
                 // Potential issue: Body might have been removed incorrectly.
                 return; // Give up if body is wrong
            }

            // Update ClientPlayer data cache
            player.updateData(playerData); // Updates health, name, phrase, server pos cache
            player.setVisible?.(true); // Make mesh visible again

            // Teleport the kinematic body using setNext... for smooth transition
            playerBody.setNextKinematicTranslation(targetPos, true);
            playerBody.setNextKinematicRotation(targetQuat, true);
            console.log(`[Network] Teleported remote kinematic body ${playerData.id} to server coords ~(${playerData.x.toFixed(1)}, ${bodyCenterY.toFixed(1)}, ${playerData.z.toFixed(1)})`);
        }
    },

    handleServerFull: function() {
        console.warn("[Network] Received 'serverFull' message from server.");
        if (socket) socket.disconnect(); // Disconnect the client
        // Transition to loading screen with error OR homescreen with error
        stateMachine?.transitionTo('loading', { message: `Server is Full!`, error: true });
        // Alternatively, show error on homescreen:
        // if(stateMachine && !stateMachine.is('homescreen')) stateMachine.transitionTo('homescreen');
        // UIManager?.showError("Server is full!", 'homescreen');
    },

     // --- Actions ---
     attemptJoinGame: function() {
        console.log("[Network] Attempting to join game...");

        // 1. Get Player Details from UI
        if (!UIManager?.playerNameInput || !UIManager.playerPhraseInput) {
            console.error("!!! Cannot attempt join: Name or Phrase input element missing.");
            return;
        }
        // Use global variables safely
        if (typeof window !== 'undefined') {
             window.localPlayerName = UIManager.playerNameInput.value.trim() || 'Anon';
             window.localPlayerPhrase = UIManager.playerPhraseInput.value.trim() || '...';
             if (!window.localPlayerName) window.localPlayerName = 'Anon';
             if (!window.localPlayerPhrase) window.localPlayerPhrase = '...';
             // Update UI fields if defaults were used
             UIManager.playerNameInput.value = window.localPlayerName;
             UIManager.playerPhraseInput.value = window.localPlayerPhrase;
        } else { console.error("Window object not available for player name/phrase."); return; }


        // 2. Clear Previous Errors (Important before checking prerequisites)
        UIManager.clearError('homescreen');

        // 3. *** Check Core Game Prerequisites ***
        console.log(`[Network Attempt Join] Checking prerequisites:`);
        // Use global flags/objects safely
        const rapierIsSetup = !!window.RAPIER && !!window.rapierWorld && !!currentGameInstance?.mapColliderHandle; // Check map collider too
        const areAssetsReady = typeof window !== 'undefined' && window.assetsAreReady === true;
        console.log(`  - Assets Ready? ${areAssetsReady}`);
        console.log(`  - Physics/Map Ready? ${rapierIsSetup}`);

        // If any core component is missing, show "initializing" message and stop
        if (!areAssetsReady || !rapierIsSetup) {
            console.warn("[Network Attempt Join] Blocked: Core components (Assets/Physics/MapCollider) not ready yet.");
            UIManager.showError('Game systems initializing, please wait...', 'homescreen');
            return; // Stop the join attempt here
        }
        console.log("[Network Attempt Join] Prerequisites met.");

        // 4. Transition to 'Joining' State & Update UI Button
        stateMachine?.transitionTo('joining');
        if (UIManager.joinButton) {
            UIManager.joinButton.disabled = true; // Disable button immediately
            // Text will be set based on connection status below
        }

        // 5. Handle Connection & Send Details
        if (Network.isConnected()) {
            // Already connected, just send details
            console.log("[Network Attempt Join] Already connected -> Sending player details...");
            if (UIManager.joinButton) UIManager.joinButton.textContent = "Joining...";
            Network.sendJoinDetails();
        } else {
            // Not connected, initiate connection (or wait for existing attempt)
            console.log("[Network Attempt Join] Not connected -> Triggering connection...");
            if (UIManager.joinButton) UIManager.joinButton.textContent = "Connecting...";
            // The 'connect' event handler will call sendJoinDetails if state is 'joining'
            if (socket && typeof socket.connect === 'function' && !socket.active) { // If socket exists but isn't trying to connect/connected
                 console.log("[Network Attempt Join] Manually calling socket.connect().");
                 socket.connect();
            } else if (!socket) {
                 console.error("!!! Cannot connect: Socket object doesn't exist! Network init likely failed.");
                 UIManager.showError("Network Init Failed!", 'homescreen');
                 stateMachine?.transitionTo('homescreen'); // Go back if connection can't even start
                 if (UIManager.joinButton) UIManager.joinButton.disabled = false; // Re-enable button? Or keep disabled?
            }
            // If socket.active is true, it means it's already trying to connect, just wait.
        }
     }, // End attemptJoinGame

     sendJoinDetails: function() {
         // Double-check state and connection before sending
         if (!stateMachine?.is('joining')) {
             console.warn("[Network] Tried to send join details but not in 'joining' state. Aborting.");
             return;
         }
         if (!Network.isConnected()) {
             console.error("[Network] Cannot send join details: Disconnected.");
             // Don't transition here, disconnect handler should manage state
             UIManager?.showError('Connection lost.', 'homescreen'); // Show error if possible
             if(UIManager.joinButton){ UIManager.joinButton.disabled=false; UIManager.joinButton.textContent="Join Game"; }
             return;
         }
         // Use global name/phrase safely
         const nameToSend = (typeof window !== 'undefined' ? window.localPlayerName : 'Anon');
         const phraseToSend = (typeof window !== 'undefined' ? window.localPlayerPhrase : '...');
         console.log(`[Network] TX setPlayerDetails | Name: ${nameToSend}, Phrase: ${phraseToSend}`);
         socket.emit('setPlayerDetails', { name: nameToSend, phrase: phraseToSend });
         // Server will respond with 'initialize' event if successful
     },

     sendPlayerUpdate: function(data) {
         // Only send if connected, playing, and alive (check local player state)
         const player = this._getPlayer(localPlayerId);
         if (Network.isConnected() && stateMachine?.is('playing') && player?.health > 0) {
             // console.log("TX playerUpdate", data); // DEBUG: Very spammy
             socket.emit('playerUpdate', data);
         }
     },

     sendVoidDeath: function() {
         // Only send if connected and playing (server verifies health server-side)
         if (Network.isConnected() && stateMachine?.is('playing')) {
             console.log("[Network] TX fellIntoVoid");
             socket.emit('fellIntoVoid');
         }
     },

     // --- NEW: Send Player Hit ---
     sendPlayerHit: function(hitData) {
         // hitData = { targetId: string, damage: number }
         const player = this._getPlayer(localPlayerId);
         if (Network.isConnected() && stateMachine?.is('playing') && player?.health > 0) {
              console.log(`[Network] TX playerHit -> Target: ${hitData.targetId}, Damage: ${hitData.damage}`);
              socket.emit('playerHit', hitData);
         }
     }

}; // End Network object

// Export globally if not using modules
if (typeof window !== 'undefined') {
    window.Network = Network;
}
console.log("network.js loaded (Handle Hits, Death Effects - v3 REGEN)");

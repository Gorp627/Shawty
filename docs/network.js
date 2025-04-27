// docs/network.js

// Depends on: config.js, stateMachine.js, entities.js, input.js, effects.js, uiManager.js, game.js
// Accesses globals: players, localPlayerId, socket, controls, CONFIG,
//                   stateMachine, UIManager, ClientPlayer, scene, infoDiv, currentGameInstance, assetsAreReady
// Calls globals:    initializationData, networkIsInitialized

var socket; // Global socket variable

const Network = {
    init: function() {
        this.setupSocketIO();
        console.log("[Network] Initialized.");
    },

    isConnected: function() {
        return typeof socket !== 'undefined' && socket && socket.connected;
    },

    setupSocketIO: function() {
        if (!CONFIG?.SERVER_URL) {
             console.error("!!! CRITICAL: CONFIG.SERVER_URL missing!");
             if(stateMachine) stateMachine.transitionTo('loading',{message:"FATAL: Net Config Error!",error:true});
             return;
        }
        console.log(`[Network] Connecting to: ${CONFIG.SERVER_URL}`);
        try {
            if(typeof io === 'undefined') throw new Error("Socket.IO missing!");
            socket = io(CONFIG.SERVER_URL, { transports: ['websocket'], autoConnect: true });
            console.log("[Network] Socket initialized...");
        } catch (e) {
            console.error("!!! Socket.IO Init Error:", e);
            if(stateMachine) stateMachine.transitionTo('loading',{message:`FATAL: Net Init Error!`,error:true});
            return;
        }

        // --- Socket Event Listeners ---
        socket.on('connect', () => {
            console.log('[Net] Socket Connected! ID:', socket.id);
            networkIsInitialized = true; // Set flag now connection is established

            // If we were in the 'joining' state (meaning user clicked Join before connecting)
            // AND assets are ready, send the join details now.
            if (stateMachine?.is('joining') && typeof assetsAreReady !== 'undefined' && assetsAreReady) {
                 console.log("[Net Connect Handler] State is 'joining' and assets ready. Sending join details...");
                 Network.sendJoinDetails();
            } else if (stateMachine?.is('joining') && (typeof assetsAreReady === 'undefined' || !assetsAreReady)) {
                 console.log("[Net Connect Handler] State is 'joining' but assets not ready. Waiting for assets...");
                 // LoadManager 'ready' event will handle sending details later
                 if(typeof UIManager !== 'undefined' && UIManager.joinButton) { UIManager.joinButton.disabled = true; UIManager.joinButton.textContent = "Loading Assets..."; }
            }
        });

        socket.on('disconnect', (reason) => {
            console.warn('[Net] Disconnected:', reason);
            networkIsInitialized = false; // Reset flag
            initializationData = null; // Clear stored data
            if (typeof stateMachine !== 'undefined') {
                 stateMachine.transitionTo('homescreen', { playerCount: 0 });
                 if (typeof UIManager !== 'undefined') {
                     UIManager.updatePlayerCount(0);
                     UIManager.showError("Disconnected from server.", 'homescreen');
                 }
            }
            if (typeof infoDiv !== 'undefined' && infoDiv) infoDiv.textContent = 'Disconnected';
            if (typeof controls !== 'undefined' && controls?.isLocked) controls.unlock();
        });

        socket.on('connect_error', (err) => {
            console.error('!!! [Net] Connect Error:', err.message);
            networkIsInitialized = false; // Ensure flag is false on error
             if (typeof stateMachine !== 'undefined') {
                 if (stateMachine.is('loading') || stateMachine.is('joining')) {
                    stateMachine.transitionTo('loading',{message:`Connection Failed!<br/>${err.message}`,error:true});
                 } else {
                     stateMachine.transitionTo('homescreen');
                     if(typeof UIManager !== 'undefined') UIManager.showError(`Connection Failed: ${err.message}`, 'homescreen');
                 }
             }
        });

        socket.on('playerCountUpdate', (count) => {
             if (typeof UIManager !== 'undefined') UIManager.updatePlayerCount(count);
        });

        // --- Game Specific Listeners ---
        socket.on('initialize',       (data) => { Network.handleInitialize(data); });
        socket.on('playerJoined',     (data) => { Network.handlePlayerJoined(data); });
        socket.on('playerLeft',       (id)   => { Network.handlePlayerLeft(id); });
        socket.on('gameStateUpdate',  (data) => { Network.handleGameStateUpdate(data); });
        socket.on('healthUpdate',     (data) => { Network.handleHealthUpdate(data); });
        socket.on('playerDied',       (data) => { Network.handlePlayerDied(data); });
        socket.on('playerRespawned',  (data) => { Network.handlePlayerRespawned(data); });
        socket.on('serverFull',       ()     => { Network.handleServerFull(); });

        // --- Debug Listeners ---
        const DEBUG_NETWORK = false;
        if(DEBUG_NETWORK) socket.onAny((ev, ...args) => { if(ev !== 'gameStateUpdate') { console.log(`[DEBUG RX] ${ev}`, args); } });
        socket.on('ping', (data) => { console.log(">>> [Net] Ping:", data); });

        console.log("[Network] Listeners attached.");
    }, // End setupSocketIO


    // --- Handlers for Server Events ---

    _getPlayer: function(id) { return players[id] || null; },

    _addPlayer: function(playerData) {
        if(typeof ClientPlayer === 'undefined'){ console.error("ClientPlayer class missing"); return null; }
        if(typeof players === 'undefined') { console.warn("players global object missing"); return null; }
        if(playerData?.id && !players[playerData.id]){ // Check ID and if not already present
            console.log(`[Net] Creating ClientPlayer for: ${playerData.name || 'NoName'} (${playerData.id})`);
            players[playerData.id] = new ClientPlayer(playerData); // Create instance
            return players[playerData.id];
        }
        return null; // Return null if already exists or data invalid
    },

    _removePlayer: function(playerId) {
        const player = this._getPlayer(playerId);
        if (player) {
            console.log(`[Net] Removing player: ${player.name || playerId}`);
            if (player instanceof ClientPlayer) {
                player.remove?.(); // Call ClientPlayer remove method if exists
            }
            delete players[playerId];
        } else {
            // console.warn(`[Net] Attempted to remove non-existent player: ${playerId}`);
        }
    },


    // Initialize: Store data, set flag, START THE GAME if assets ready
    handleInitialize: function(data) {
         console.log('[Net] RX initialize');
         if (!data?.id || !data.players) {
             console.error("Invalid initialize data received from server.");
             stateMachine?.transitionTo('homescreen');
             UIManager?.showError("Server Init Data Invalid", "homescreen");
             return;
         }

         initializationData = data; // Store data globally
         // networkIsInitialized = true; // Flag is already set on 'connect'

         // THIS is the point where we should start the game play, IF assets are ready.
         if (typeof assetsAreReady !== 'undefined' && assetsAreReady) {
             console.log("[Net Initialize Handler] Assets ready. Starting game play...");
             if (typeof currentGameInstance !== 'undefined' && currentGameInstance?.startGamePlay) {
                 currentGameInstance.startGamePlay(initializationData); // This transitions state to 'playing'
             } else {
                  console.error("[Net Initialize Handler] Game instance missing! Cannot start game.");
                  stateMachine?.transitionTo('homescreen');
                  UIManager?.showError("Client Startup Error", "homescreen");
             }
         } else {
             console.log("[Net Initialize Handler] Received initialize, but assets not ready. Waiting for assets...");
             // The loadManager 'ready' event handler will call startGamePlay later.
             if (stateMachine?.is('joining') && typeof UIManager !== 'undefined' && UIManager?.showLoading) {
                  UIManager.showLoading("Finalizing Assets..."); // Update status message
             }
         }
    }, // End handleInitialize

    handlePlayerJoined: function(playerData) {
        // Add player only if it's a remote player and not already added
        if (playerData?.id !== localPlayerId && !this._getPlayer(playerData.id)) {
             const name = playerData.name || 'A player'; // Use name or default
             console.log(`[Network] Player joined event: ${name} (${playerData.id})`);
             this._addPlayer(playerData); // Add player representation using helper
             // Show join message in UI
             if (typeof UIManager !== 'undefined' && UIManager.showKillMessage) {
                 UIManager.showKillMessage(`${name} joined the game.`);
             }
        }
    },

    handlePlayerLeft: function(playerId) {
        if (playerId) {
            const pName = players[playerId]?.name || 'A player'; // Get name before removing
            console.log(`[Network] Player left event: ${pName} (${playerId})`);
            this._removePlayer(playerId); // Remove player using helper
             // Show leave message in UI
             if (typeof UIManager !== 'undefined' && UIManager.showKillMessage) {
                 UIManager.showKillMessage(`${pName} left the game.`);
             }
        }
    },

    handleGameStateUpdate: function(state) {
        // Basic checks
        if(!players || !state?.players || !stateMachine?.is('playing') || !localPlayerId) return;
        // Iterate through players in the update
        for (const id in state.players) {
            const serverPlayerData = state.players[id]; // Lean data {id, x, y, z, r, h}
            const localRepresentation = this._getPlayer(id); // Get local representation (ClientPlayer or plain object)

            // Update only REMOTE players from GSU
            if (id !== localPlayerId) {
                 if (localRepresentation instanceof ClientPlayer) {
                     localRepresentation.updateData?.(serverPlayerData); // Update ClientPlayer instance
                 } else if (!localRepresentation) {
                     // Player exists in GSU but not locally? Maybe they joined while we were loading?
                     // Add them now, using the lean data. They might pop in.
                     // We need more than lean data ideally (name, phrase). This is a fallback.
                     console.warn(`[Net GSU] Player ${id} found in update but not locally. Adding with lean data.`);
                     // Need to fetch full data or wait for next 'playerJoined' ideally.
                     // For now, let's just update if they *do* exist locally.
                 }
            }
            // Local player health/state is NOT updated from GSU.
            // It's updated via 'healthUpdate'/'playerDied'/'playerRespawned' events directly.
        }
        // Optional: Could prune local players not in GSU, but riskier if packets drop.
    },

    handleHealthUpdate: function(data) {
        if (!data?.id || data.health === undefined) return;
        const player = this._getPlayer(data.id);
        if (player) {
            player.health = data.health;
            // console.log(`[Net] Health update for ${player.name || data.id}: ${player.health}`); // Less verbose
            if (data.id === localPlayerId && typeof UIManager !== 'undefined') {
                UIManager.updateHealthBar(player.health);
            }
            // Could potentially update ClientPlayer health bar here too if needed visually
        }
    },

    handlePlayerDied: function(data) {
        if (!data?.targetId) return;
        console.log(`>>> [Net RX] Player Died: ${data.targetId}`);
        const targetPlayer = this._getPlayer(data.targetId);

        if (targetPlayer) {
            targetPlayer.health = 0; // Set health to 0 (for both local obj and ClientPlayer instance)

            // Handle visual/UI updates based on whether it's local or remote player
            if (data.targetId === localPlayerId) {
                // Local player died
                if (typeof UIManager !== 'undefined') {
                    UIManager.updateHealthBar(0);
                    // Simple message based on if killerId was explicitly null (environment/void)
                    let message = data.killerId === null ? "Fell out." : "Eliminated."; // Simplified message
                    if (data.killerName && data.killerId !== null) {
                        message = `${data.killerName} ${data.killerPhrase || 'eliminated'} ${targetPlayer.name}`;
                    }
                    UIManager.showKillMessage(message);
                }
                if (typeof infoDiv !== 'undefined' && infoDiv) infoDiv.textContent = `DEAD`;
                if (typeof controls !== 'undefined' && controls?.isLocked) controls.unlock(); // Unlock controls on death

            } else if (targetPlayer instanceof ClientPlayer) {
                // Remote player died
                targetPlayer.setVisible?.(false); // Hide remote player mesh
                 // Show elimination message
                 if (typeof UIManager !== 'undefined') {
                     let message = `${targetPlayer.name || 'A player'} was eliminated.`;
                     if (data.killerName && data.killerId !== null) {
                         message = `${data.killerName} ${data.killerPhrase || 'eliminated'} ${targetPlayer.name}`;
                     } else if (data.killerId === null) {
                          message = `${targetPlayer.name || 'A player'} fell out.`;
                     }
                     UIManager.showKillMessage(message);
                 }
            }
        } else {
            console.warn(`[Net] Received playerDied for unknown target: ${data.targetId}`);
        }
    },

    handlePlayerRespawned: function(playerData) {
        if (!playerData?.id) return; // Basic validation
        console.log(`>>> [Net RX] Player Respawned: ${playerData.name} (${playerData.id})`);
        let player = this._getPlayer(playerData.id); // Get local representation

        // --- Separate logic: Local Player Object vs Remote ClientPlayer Instance ---
        if (playerData.id === localPlayerId) {
             console.log("[Net] Handling LOCAL player respawn.");
             // Ensure local player object exists (should always unless error)
             if (!player) {
                 console.error("[Net] CRITICAL: Local player object missing on respawn!");
                 players[localPlayerId] = { isLocal: true }; // Recreate basic object
                 player = players[localPlayerId];
             }
             // --- Directly update properties of the plain local player data object ---
             player.health = playerData.health;
             player.x = playerData.x;
             player.y = playerData.y; // Server sends feet Y (should be 0)
             player.z = playerData.z;
             player.rotationY = playerData.rotationY;
             player.name = playerData.name; // Update name/phrase in case of change
             player.phrase = playerData.phrase;
             // --- END direct property updates ---

             // Reset local controls position using the CAMERA_Y_OFFSET
             const cameraOffset = CONFIG?.CAMERA_Y_OFFSET || (CONFIG?.PLAYER_HEIGHT || 1.8); // Use new offset
             const visualY = player.y + cameraOffset; // <<< CHANGED Use camera offset
             if (typeof controls !== 'undefined' && controls?.getObject()) {
                 controls.getObject().position.set(player.x, visualY, player.z);
                 const targetRotation = new THREE.Euler(0, player.rotationY, 0, 'YXZ');
                 controls.getObject().rotation.copy(targetRotation);
                 console.log(`[Net] Set local controls pos/rot on respawn using camera offset.`);
             }

             // Update UI
             if (typeof UIManager !== 'undefined') {
                 UIManager.updateHealthBar(player.health);
                 UIManager.updateInfo(`Playing as ${player.name}`);
                 UIManager.clearKillMessage();
             }

        } else { // Handling a remote player
             console.log(`[Net] Handling REMOTE player respawn for ${playerData.name}.`);
             // If player doesn't exist locally (e.g., joined while dead), add them now.
             if (!player || !(player instanceof ClientPlayer)) {
                console.warn(`Respawn for unknown/invalid remote player ${playerData.id}, adding/replacing now.`);
                player = this._addPlayer(playerData); // Returns the new ClientPlayer or null
                if (!player) {
                    console.error(`Failed to create ClientPlayer for respawn ID: ${playerData.id}`);
                    return; // Cannot proceed if creation failed
                }
             }

             // Now we definitely have a ClientPlayer instance
             player.updateData(playerData); // Updates internal state AND calls setInterpolationTargets

             // Make visible and snap position/rotation instantly
             player.setVisible?.(true);
             if (player.mesh) { // Snap visuals instantly
                  const pH=CONFIG?.PLAYER_HEIGHT||1.8;
                  let visualY=player.y;
                  if(player.mesh.geometry instanceof THREE.CylinderGeometry) visualY = player.y + pH/2;
                  else visualY = player.y; // Assume model origin at feet

                  player.mesh.position.set(player.x, visualY, player.z);
                  player.mesh.rotation.y = player.rotationY;
                  player.mesh.quaternion.setFromEuler(new THREE.Euler(0, player.rotationY, 0, 'YXZ'));
                  console.log(`[Net] Snapped remote player ${player.id} visuals on respawn.`);
             }
        }
    }, // End handlePlayerRespawned

    handleServerFull: function() {
        console.warn("[Net] Server Full.");
        if(socket) socket.disconnect();
        // Transitioning to loading with error message is clearer than just homescreen
        if(typeof stateMachine !== 'undefined') stateMachine.transitionTo('loading',{message:`Server is Full!`,error:true});
    },


     // --- Actions Sent To Server ---

     attemptJoinGame: function() {
        console.log("--- [Net] attemptJoinGame ---");
        if (typeof UIManager === 'undefined' || !UIManager?.playerNameInput || !UIManager.playerPhraseInput) { console.error("UI Inputs missing!"); return; }
        localPlayerName = UIManager.playerNameInput.value.trim() || 'Anon';
        localPlayerPhrase = UIManager.playerPhraseInput.value.trim() || '...';

        if (!localPlayerName) { UIManager.showError('Please enter a name.', 'homescreen'); return; }
        UIManager.clearError('homescreen');

        // Check Asset Status (should be ready if button is clickable via game.js logic)
        if (typeof assetsAreReady === 'undefined' || !assetsAreReady) {
            console.warn("[Net] Assets not ready, cannot attempt join yet.");
            UIManager.showError('Assets still loading...', 'homescreen');
            return; // Should ideally not happen if button click logic is correct
        }

        // Transition to 'joining' state FIRST
        if (typeof stateMachine !== 'undefined') stateMachine?.transitionTo('joining');
        if (UIManager.joinButton) { UIManager.joinButton.disabled = true; UIManager.joinButton.textContent = "Joining..."; }

        // Now check network connection
        if (Network.isConnected()) {
            console.log("[Net] Already connected. Sending join details...");
            Network.sendJoinDetails(); // Assets are ready, network connected -> send details
        } else {
            console.log("[Net] Not connected. Waiting for connection...");
            // Update button text maybe
            if (UIManager.joinButton) { UIManager.joinButton.textContent = "Connecting..."; }
            // The 'connect' event handler will trigger sendJoinDetails if state is still 'joining'
            if (socket && !socket.active) { socket.connect(); } // Ensure connection attempt is active
        }
     },

     sendJoinDetails: function() {
         // Make sure we are actually supposed to be joining and are connected
         if (typeof stateMachine === 'undefined' || !stateMachine?.is('joining')) {
             console.warn("sendJoinDetails called but not in 'joining' state. Aborting.");
             return; // Avoid sending multiple times if state changed unexpectedly
         }
         if (!Network.isConnected()) {
             console.error("sendJoinDetails called but socket disconnected. Aborting.");
             stateMachine?.transitionTo('homescreen', { playerCount: UIManager?.playerCountSpan?.textContent ?? '?' });
             UIManager?.showError('Connection lost.', 'homescreen');
             return;
         }

         console.log(`[Net TX] setPlayerDetails Name: ${localPlayerName}, Phrase: ${localPlayerPhrase}`);
         socket.emit('setPlayerDetails', { name: localPlayerName, phrase: localPlayerPhrase });
         // Keep button disabled, text "Joining..." is fine.
     },

     sendPlayerUpdate: function(data) {
         // Added check for being alive locally - optional optimization
         const localPlayer = this._getPlayer(localPlayerId);
         if(Network.isConnected() && stateMachine?.is('playing') && localPlayer?.health > 0) {
             socket.emit('playerUpdate', data);
         }
    },

}; // End Network object

window.Network = Network;
console.log("network.js loaded (Simplified Join Logic)");

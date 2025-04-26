// docs/network.js

// Depends on: config.js, stateMachine.js, entities.js, input.js, effects.js, uiManager.js, game.js
// Accesses globals: players, localPlayerId, socket, controls, CONFIG,
//                   stateMachine, UIManager, ClientPlayer, scene, infoDiv
// Calls globals:    attemptEnterPlayingState, initializationData, networkIsInitialized

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
            // Trigger state check when connected
             if (typeof window.attemptEnterPlayingState === 'function') {
                 window.attemptEnterPlayingState();
             } else { console.error("attemptEnterPlayingState missing on connect!"); }
        });

        socket.on('disconnect', (reason) => {
            console.warn('[Net] Disconnected:', reason);
            networkIsInitialized = false; // Reset flag
            initializationData = null; // Clear stored data
            if (typeof stateMachine !== 'undefined') {
                 // Transitioning to homescreen now handles player list cleanup via game.js listener
                 stateMachine.transitionTo('homescreen', { playerCount: 0 });
                 if (typeof UIManager !== 'undefined') {
                     UIManager.updatePlayerCount(0);
                     UIManager.showError("Disconnected from server.", 'homescreen');
                 }
            }
            if (typeof infoDiv !== 'undefined' && infoDiv) infoDiv.textContent = 'Disconnected';
            if (controls?.isLocked) controls.unlock(); // Ensure cursor is unlocked
        });

        socket.on('connect_error', (err) => {
            console.error('!!! [Net] Connect Error:', err.message);
             if (typeof stateMachine !== 'undefined') {
                 // Show error on loading screen if connection fails initially
                 if (stateMachine.is('loading') || stateMachine.is('joining')) {
                    stateMachine.transitionTo('loading',{message:`Connection Failed!<br/>${err.message}`,error:true});
                 } else {
                     // Show error on homescreen if disconnected later
                     stateMachine.transitionTo('homescreen');
                     if(UIManager) UIManager.showError(`Connection Failed: ${err.message}`, 'homescreen');
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
        // REMOVED socket.on('shotFired', ...
        socket.on('healthUpdate',     (data) => { Network.handleHealthUpdate(data); });
        socket.on('playerDied',       (data) => { Network.handlePlayerDied(data); });
        socket.on('playerRespawned',  (data) => { Network.handlePlayerRespawned(data); });
        socket.on('serverFull',       ()     => { Network.handleServerFull(); });

        // --- Debug Listeners ---
        const DEBUG_NETWORK = false; // Set to true for more verbose network logging
        if(DEBUG_NETWORK) socket.onAny((ev, ...args) => {
            // Avoid logging extremely frequent events unless necessary
            if(ev !== 'gameStateUpdate') {
                console.log(`[DEBUG RX] ${ev}`, args);
            }
        });
        socket.on('ping', (data) => { console.log(">>> [Net] Ping:", data); });

        console.log("[Network] Listeners attached.");
    }, // End setupSocketIO


    // --- Handlers for Server Events ---

    // Utility functions to get/add/remove player representations
    _getPlayer: function(id) { return players[id] || null; },
    _addPlayer: function(playerData) {
        if(typeof ClientPlayer === 'undefined'){ console.error("ClientPlayer class missing"); return null; }
        if(!players) { console.warn("players global object missing"); return null; }
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
            // console.warn(`[Net] Attempted to remove non-existent player: ${playerId}`); // Less verbose
        }
    },

    // Initialize: Store data, set flag, attempt game entry
    handleInitialize: function(data) {
         console.log('[Net] RX initialize');
         if (!data?.id || !data.players) { // Basic validation
             console.error("Invalid initialize data received");
             stateMachine?.transitionTo('homescreen'); // Revert state
             UIManager?.showError("Server Init Data Invalid", "homescreen");
             return;
         }
         console.log("[Net] Storing init data, networkReady=true.");
         initializationData = data; // Store data globally
         networkIsInitialized = true; // Set flag globally
         // Call the central function to check readiness and potentially start the game
         if(typeof window.attemptEnterPlayingState === 'function'){
             window.attemptEnterPlayingState();
         } else {
             console.error("attemptEnterPlayingState function is missing!");
             stateMachine?.transitionTo('homescreen');
             UIManager?.showError("Client Startup Error","homescreen");
         }
    }, // End handleInitialize

    // Player Joined: Add player representation and show UI message
    handlePlayerJoined: function(playerData) {
        // Add player only if it's a remote player and not already added
        if (playerData?.id !== localPlayerId && !this._getPlayer(playerData.id)) {
             const name = playerData.name || 'A player'; // Use name or default
             console.log(`[Network] Player joined event: ${name} (${playerData.id})`);
             this._addPlayer(playerData); // Add player representation using helper
             // Show join message in UI
             if (UIManager && UIManager.showKillMessage) {
                 UIManager.showKillMessage(`${name} joined the game.`);
             }
        }
    },

    // Player Left: Remove player representation and show UI message
    handlePlayerLeft: function(playerId) {
        if (playerId) {
            const pName = players[playerId]?.name || 'A player'; // Get name before removing
            console.log(`[Network] Player left event: ${pName} (${playerId})`);
            this._removePlayer(playerId); // Remove player using helper
             // Show leave message in UI
             if (UIManager && UIManager.showKillMessage) {
                 UIManager.showKillMessage(`${pName} left the game.`);
             }
        }
    },

    // Game State Update: Primarily updates remote players based on lean server state
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

    // Health Update: Update player health, update local player UI
    handleHealthUpdate: function(data) {
        if (!data?.id || data.health === undefined) return;
        const player = this._getPlayer(data.id);
        if (player) {
            player.health = data.health;
            // console.log(`[Net] Health update for ${player.name || data.id}: ${player.health}`); // Less verbose
            if (data.id === localPlayerId && UIManager) {
                UIManager.updateHealthBar(player.health);
            }
            // Could potentially update ClientPlayer health bar here too if needed visually
        }
    },

    // Player Died: Update state, show message, hide remote mesh
    handlePlayerDied: function(data) {
        if (!data?.targetId) return;
        console.log(`>>> [Net RX] Player Died: ${data.targetId}`);
        const targetPlayer = this._getPlayer(data.targetId);

        if (targetPlayer) {
            targetPlayer.health = 0; // Set health to 0 (for both local obj and ClientPlayer instance)

            // Handle visual/UI updates based on whether it's local or remote player
            if (data.targetId === localPlayerId) {
                // Local player died
                if (UIManager) {
                    UIManager.updateHealthBar(0);
                    // Simple message based on if killerId was explicitly null (environment/void)
                    let message = data.killerId === null ? "Fell out." : "Eliminated."; // Simplified message
                    if (data.killerName && data.killerId !== null) {
                        message = `${data.killerName} ${data.killerPhrase || 'eliminated'} ${targetPlayer.name}`;
                    }
                    UIManager.showKillMessage(message);
                }
                if (infoDiv) infoDiv.textContent = `DEAD`;
                if (controls?.isLocked) controls.unlock(); // Unlock controls on death

            } else if (targetPlayer instanceof ClientPlayer) {
                // Remote player died
                targetPlayer.setVisible?.(false); // Hide remote player mesh
                 // Show elimination message
                 if (UIManager) {
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

    // Player Respawned: Update player data, show remote mesh, update local state/UI
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
             player.y = playerData.y;
             player.z = playerData.z;
             player.rotationY = playerData.rotationY;
             player.name = playerData.name; // Update name/phrase in case of change
             player.phrase = playerData.phrase;
             // --- END direct property updates ---

             // Reset local controls position and view rotation
             const visualY = player.y + (CONFIG?.PLAYER_HEIGHT || 1.8);
             if (controls?.getObject()) {
                 controls.getObject().position.set(player.x, visualY, player.z);
                 // Reset view rotation on respawn
                 const targetRotation = new THREE.Euler(0, player.rotationY, 0, 'YXZ');
                 controls.getObject().rotation.copy(targetRotation);
                 // If using PointerLockControls, direct rotation setting might be tricky.
                 // Might need to re-lock or handle internally if PLC resets pitch/yaw on lock.
                 console.log(`[Net] Set local controls pos/rot on respawn.`);
             }
             // No physics state (velocityY/isOnGround) to reset

             // Update UI
             if (UIManager) {
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
                  // Use the logic from setInterpolationTargets to get correct visual Y
                  const pH=CONFIG?.PLAYER_HEIGHT||1.8;
                  let visualY=player.y;
                  if(player.mesh.geometry instanceof THREE.CylinderGeometry) visualY = player.y + pH/2;
                  else visualY = player.y; // Assume model origin at feet

                  player.mesh.position.set(player.x, visualY, player.z);
                  player.mesh.rotation.y = player.rotationY; // Set rotation directly
                  player.mesh.quaternion.setFromEuler(new THREE.Euler(0, player.rotationY, 0, 'YXZ')); // Ensure quaternion matches
                  console.log(`[Net] Snapped remote player ${player.id} visuals on respawn.`);
             }
        }
    }, // End handlePlayerRespawned

    // Server Full: Disconnect and show message
    handleServerFull: function() {
        console.warn("[Net] Server Full.");
        if(socket) socket.disconnect();
        // Transitioning to loading with error message is clearer than just homescreen
        if(stateMachine) stateMachine.transitionTo('loading',{message:`Server is Full!`,error:true});
    },


     // --- Actions Sent To Server ---
     attemptJoinGame: function() {
        console.log("--- [Net] attemptJoinGame ---");
        if (!UIManager?.playerNameInput || !UIManager.playerPhraseInput) { console.error("UI Inputs missing!"); return; }
        localPlayerName = UIManager.playerNameInput.value.trim() || 'Anon';
        localPlayerPhrase = UIManager.playerPhraseInput.value.trim() || '...';

        if (!localPlayerName) { UIManager.showError('Please enter a name.', 'homescreen'); return; }
        UIManager.clearError('homescreen'); // Clear previous errors

        // Check Asset Status
        let assetsRdy = false; let critErr = false;
        if (loadManager?.assets) {
            assetsRdy = loadManager.requiredForGame.every(k => loadManager.isAssetReady(k));
            critErr = loadManager.requiredForGame.some(k => !loadManager.assets[k] || loadManager.assets[k].state === 'error');
        } else { critErr = true; } // LoadManager itself is missing

        if (critErr) { UIManager.showError('Required assets failed to load. Cannot join.', 'homescreen'); return; }

        // Check Network Status and Join/Wait
        if (!Network.isConnected()) {
            console.warn("[Net] Not connected, attempting connection...");
            UIManager.showError('Connecting...', 'homescreen'); // Show connecting status
            if (UIManager.joinButton) { UIManager.joinButton.disabled = true; UIManager.joinButton.textContent = "Connecting..."; }
            // Transition to joining, let connect handler trigger next step
            stateMachine?.transitionTo('joining', { waitingForAssets: !assetsRdy });
            // Ensure socket attempts to connect if not already connecting
            if (socket && !socket.active) { socket.connect(); }
            return; // Wait for 'connect' event
        }

        // Network is connected
        console.log("[Net] Already connected.");
        stateMachine?.transitionTo('joining', { waitingForAssets: !assetsRdy });
        if (assetsRdy) {
            Network.sendJoinDetails(); // Assets ready, send details immediately
        } else {
            console.log("[Net] Connected, but waiting for assets...");
            // The 'ready' event handler in game.js will call attemptEnterPlayingState,
            // which will eventually lead to sendJoinDetails if state is still 'joining'
             if(UIManager.joinButton) { UIManager.joinButton.disabled = true; UIManager.joinButton.textContent = "Loading Assets..."; }
             // Optionally show loading screen here? Depends on desired UX
             // UIManager.showLoading("Loading Assets...", false, true);
        }
     },

     sendJoinDetails: function() {
         console.log("--- [Net] sendJoinDetails ---");
         if (!stateMachine?.is('joining')) {
             console.warn("Not in 'joining' state when sending details. Aborting.");
             // Might happen if disconnected between attemptJoin and assets finishing. Revert to home.
             stateMachine?.transitionTo('homescreen', { playerCount: UIManager?.playerCountSpan?.textContent ?? '?' });
             UIManager?.showError("Join cancelled.", "homescreen");
             return;
         }
         if (!Network.isConnected()) {
             console.error("Socket disconnected before sending join details.");
             UIManager?.showError('Connection lost.', 'homescreen');
             stateMachine?.transitionTo('homescreen', { playerCount: UIManager?.playerCountSpan?.textContent ?? '?' });
             return;
         }
         console.log(`[Net TX] setPlayerDetails Name: ${localPlayerName}, Phrase: ${localPlayerPhrase}`);
         socket.emit('setPlayerDetails', { name: localPlayerName, phrase: localPlayerPhrase });
         if (UIManager?.joinButton) { UIManager.joinButton.disabled = true; UIManager.joinButton.textContent = "Joining..."; }
     },

     sendPlayerUpdate: function(data) {
         // Added check for being alive locally - optional optimization
         const localPlayer = this._getPlayer(localPlayerId);
         if(Network.isConnected() && stateMachine?.is('playing') && localPlayer?.health > 0) {
             socket.emit('playerUpdate', data);
         }
    },

     // --- REMOVED sendShoot ---
     // --- REMOVED sendHit ---
     // --- REMOVED sendVoidDeath (Server handles detection) ---

}; // End Network object

window.Network = Network;
console.log("network.js loaded (Simplified - No Shooting, Client Void Check)");

// --- START OF FULL network.js FILE ---
// docs/network.js (Manual Raycasting v1)

// Depends on: config.js, stateMachine.js, entities.js, input.js, uiManager.js, game.js, gameLogic.js, effects.js
// Accesses globals: players, localPlayerId, socket, controls, CONFIG, THREE,
//                   stateMachine, UIManager, ClientPlayer, scene, infoDiv, currentGameInstance, assetsAreReady, mapMesh, Effects, applyShockwave

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
            window.networkIsInitialized = true; // Set global flag

            // Update UI state on successful connection
            if (typeof UIManager !== 'undefined') {
                 UIManager.clearError('homescreen'); // Clear previous connection errors
                 UIManager.clearError('characterSelect');

                 // If we were trying to join when connection succeeded
                 if (stateMachine?.is('joining')) {
                     console.log("[Network Connect] Was in 'joining' state, sending details now.");
                     UIManager.showLoading("Joining..."); // Ensure loading screen shows joining status
                     Network.sendJoinDetails();
                 } else if (stateMachine?.is('homescreen') && UIManager.nextButton) {
                     // If just connected while on homescreen, enable next button
                     UIManager.nextButton.disabled = false;
                     UIManager.nextButton.textContent = "NEXT";
                 } else if (stateMachine?.is('characterSelect') && UIManager.confirmDeployButton) {
                     // If just connected while on char select, enable deploy button
                     UIManager.confirmDeployButton.disabled = false;
                     UIManager.confirmDeployButton.textContent = "DEPLOY";
                 }
            }
            // Check if ready to proceed (e.g., if assets finished while disconnected)
            currentGameInstance?.attemptProceedToGame();
        });

        socket.on('disconnect', (reason) => {
            console.warn('[Network] Socket Disconnected. Reason:', reason);
            window.networkIsInitialized = false;
            window.initializationData = null;

            // Only transition back to homescreen if currently playing or joining
            if (stateMachine?.is('playing') || stateMachine?.is('joining')) {
                // *** CRITICAL: Cleanup ALL player objects and physics state on disconnect ***
                currentGameInstance?.cleanupAllPlayers();
                console.log("[Network Disconnect] Cleaned up player objects after disconnect.");
                // *** END CRITICAL Cleanup ***

                stateMachine?.transitionTo('homescreen', { playerCount: 0 }); // Go back to start
                 if(UIManager) {
                     UIManager.updatePlayerCount(0);
                     let errorMsg = "Disconnected.";
                     if (reason === 'io server disconnect') errorMsg = "Kicked or server shut down.";
                     else if (reason === 'io client disconnect') errorMsg = "Left the game."; // Manual disconnect
                     else if (reason === 'ping timeout' || reason === 'transport close' || reason === 'transport error') errorMsg = "Connection lost.";
                     UIManager.showError(errorMsg, 'homescreen');
                 }
                 if(window.infoDiv) window.infoDiv.textContent='Disconnected'; // Use global scope safely
                 if(window.controls?.isLocked) window.controls.unlock();

             } else {
                  console.log("[Network] Disconnected while not in playing/joining state.");
                  // If on homescreen/char select, disable appropriate button
                  if (stateMachine?.is('homescreen') && UIManager?.nextButton) {
                      UIManager.nextButton.disabled = true;
                      UIManager.nextButton.textContent = "Disconnected";
                  } else if (stateMachine?.is('characterSelect') && UIManager?.confirmDeployButton) {
                     UIManager.confirmDeployButton.disabled = true;
                     UIManager.confirmDeployButton.textContent = "Disconnected";
                  }
             }
        });

        socket.on('connect_error', (err) => {
            console.error('[Network] Connection Error:', err.message, err.cause); // Log full error object
            window.networkIsInitialized = false;
            const errorMsg = `Connection Failed!<br/>Check Console (F12).`; // Simpler message for UI

            // If loading/joining/charSelect, go back to homescreen with error
            if (stateMachine?.is('loading') || stateMachine?.is('joining') || stateMachine?.is('characterSelect')) {
                 stateMachine.transitionTo('homescreen'); // Ensure on homescreen
                 UIManager?.showError(errorMsg, 'homescreen');
                 if (UIManager?.nextButton) { // Disable home button
                      UIManager.nextButton.disabled = true;
                      UIManager.nextButton.textContent = "Connection Failed";
                 }
                 if (UIManager?.confirmDeployButton) { // Disable char select button
                    UIManager.confirmDeployButton.disabled = true;
                    UIManager.confirmDeployButton.textContent = "Connection Failed";
                 }
            } else if (stateMachine?.is('homescreen')) { // If already on homescreen, just show error
                 UIManager?.showError(errorMsg, 'homescreen');
                 if (UIManager?.nextButton) {
                      UIManager.nextButton.disabled = true;
                      UIManager.nextButton.textContent = "Connection Failed";
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
        socket.on('playerDied', (data) => Network.handlePlayerDied(data) );
        socket.on('playerRespawned', (data) => Network.handlePlayerRespawned(data) );
        socket.on('serverFull', () => Network.handleServerFull() );

        console.log("[Network] Core socket event listeners attached.");
    },

    // --- Helper Functions ---
    _getPlayer: function(id) { return (typeof window !== 'undefined' && window.players) ? window.players[id] || null : null; },

    _addPlayer: function(playerData) {
        if (typeof window === 'undefined' || !window.ClientPlayer || !window.players) {
             console.error("!!! Cannot add player: ClientPlayer class or global players object missing.");
             return null;
        }
        if (playerData?.id && !window.players[playerData.id]) {
            console.log(`[Network] Creating ClientPlayer visual instance for: ${playerData.name || '??'} (ID: ${playerData.id})`);
            try {
                 // ClientPlayer constructor handles adding mesh to scene and setting initial pos/rot
                 window.players[playerData.id] = new ClientPlayer(playerData);
                 // Initialize physics state for the new remote player
                 if(window.playerVelocities) window.playerVelocities[playerData.id] = new THREE.Vector3(0,0,0);
                 if(window.playerIsGrounded) window.playerIsGrounded[playerData.id] = false; // Assume airborne
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
         // Delegate cleanup to the Game instance, which handles mesh, velocity, grounded state etc.
         if (currentGameInstance && typeof currentGameInstance.cleanupPlayer === 'function') {
             currentGameInstance.cleanupPlayer(playerId);
             // console.log(`[Network] Requested cleanup for player ${playerId} via Game instance.`);
         } else {
              console.warn(`[Network] Cannot remove player ${playerId}: Game instance or cleanupPlayer method missing.`);
              // Basic fallback cleanup if game instance is gone somehow
              const player = this._getPlayer(playerId);
              if (player instanceof ClientPlayer) { player.remove?.(); } // Remove mesh
              if (window.players?.[playerId]) delete window.players[playerId];
              if (window.playerVelocities?.[playerId]) delete window.playerVelocities[playerId];
              if (window.playerIsGrounded?.[playerId]) delete window.playerIsGrounded[playerId];
         }
    },

    // --- Event Handlers ---
    handleInitialize: function(data) {
        console.log('[Network] RX initialize');
        if (!data?.id || typeof data.players !== 'object') {
             console.error("!!! Invalid initialization data received from server:", data);
             stateMachine?.transitionTo('homescreen'); // Go back to start on bad init
             UIManager?.showError("Server Init Invalid!", "homescreen");
             return;
        }
        window.initializationData = data; // Store the data
        window.networkIsInitialized = true; // Ensure flag is set
        console.log("[Network] Initialization data stored. Attempting to proceed to game...");
        currentGameInstance?.attemptProceedToGame(); // Let game decide if ready
    },

    handlePlayerJoined: function(playerData) {
        if (playerData?.id === window.localPlayerId) return; // Ignore self join message

        if (playerData?.id && !this._getPlayer(playerData.id) && stateMachine?.is('playing')) {
             const name = playerData.name || 'Player';
             console.log(`[Network] RX playerJoined: ${name} (ID: ${playerData.id})`);

             const newPlayer = this._addPlayer(playerData); // Adds to window.players, initializes velocity/grounded

             if (newPlayer && UIManager?.showKillMessage) {
                 UIManager.showKillMessage(`${name} joined the game.`);
             } else if (!newPlayer) {
                 console.warn(`[Network] Failed to create ClientPlayer instance for joined player ${playerData.id}.`);
             }
        } else if (!stateMachine?.is('playing')) {
             // Ignore if not in playing state (player might join server while client is on menu)
        }
    },

    handlePlayerLeft: function(playerId) {
        if (playerId) {
            const player = this._getPlayer(playerId); // Check global players before removing
            const playerName = player?.name || 'Player';
            console.log(`[Network] RX playerLeft: ${playerName} (ID: ${playerId})`);
            this._removePlayer(playerId); // Use helper which calls game cleanup method
            if (player && UIManager?.showKillMessage) { // Only show message if player existed client-side
                 UIManager.showKillMessage(`${playerName} left the game.`);
            }
        }
    },

    handleGameStateUpdate: function(state) {
        // Use global references safely
        const globalPlayers = window.players;

        // Ensure players exist and we are playing before processing updates
        if (!globalPlayers || !state?.players || !stateMachine?.is('playing') || !window.localPlayerId) {
            return; // Not ready or not relevant state
        }

        for (const id in state.players) {
            if (id === window.localPlayerId) continue; // Ignore updates for the local player

            const serverData = state.players[id]; // Data for one remote player from server (x,y,z,r,h)
            const remotePlayer = globalPlayers[id]; // Get ClientPlayer instance from global map

            if (remotePlayer instanceof ClientPlayer) {
                try {
                    // Update server position cache and other non-physics data (like health)
                    remotePlayer.updateData(serverData); // Syncs serverX/Y/Z/RotY and h(health)
                } catch (e) {
                     console.error(`!!! Error updating remote player data for ${id}:`, e);
                }
            }
        }
    },

    handleHealthUpdate: function(data) {
        if (!data?.id || data.health === undefined) { console.warn("Invalid healthUpdate data received:", data); return; }
        const player = this._getPlayer(data.id); // Check global players
        if (player) {
             player.health = data.health;
             if (data.id === window.localPlayerId && UIManager) { // Use global localPlayerId
                 UIManager.updateHealthBar(player.health);
             }
        }
    },

    handlePlayerDied: function(data) {
        if (!data?.targetId) { console.warn("Invalid playerDied data received:", data); return; }
        const targetPlayer = this._getPlayer(data.targetId);
        const targetName = targetPlayer?.name || 'Player';
        const killerName = data.killerName || 'Unknown';
        const killerPhrase = data.killerPhrase || 'eliminated';
        console.log(`[Network] RX playerDied: Target=${targetName}(${data.targetId}), Killer=${killerName}(${data.killerId ?? '?'})`);

        let deathPosition = new THREE.Vector3(0, 5, 0); // Default fallback
        if (targetPlayer) {
             if (targetPlayer.mesh) {
                 deathPosition.copy(targetPlayer.mesh.position); // Use mesh feet pos
                 deathPosition.y += CONFIG.PLAYER_HEIGHT / 2.0; // Add offset for center explosion origin
             } else {
                 // Estimate from last known server position if mesh isn't available
                 deathPosition.set(targetPlayer.serverX || 0, (targetPlayer.serverY || 0) + CONFIG.PLAYER_HEIGHT / 2.0, targetPlayer.serverZ || 0);
             }
        } else { console.warn(`Target player ${data.targetId} not found for death effect position.`); }
        // console.log("[Network] Death Position for effects:", deathPosition);

        if (typeof Effects?.createExplosionEffect === 'function') { Effects.createExplosionEffect(deathPosition); }
        // Apply shockwave uses global playerVelocities map
        if (typeof applyShockwave === 'function') { applyShockwave(deathPosition, data.targetId); }
        else { console.warn("applyShockwave function not found."); }

        if (data.targetId === window.localPlayerId) { // Use global localPlayerId
             if (targetPlayer) targetPlayer.health = 0;
             if (UIManager) {
                 UIManager.updateHealthBar(0);
                 let message = (data.killerId === null) ? "You fell out of the world." : (data.killerId === data.targetId) ? "You eliminated yourself." : `${killerName} ${killerPhrase} you.`;
                 UIManager.showKillMessage(message);
                 if (window.infoDiv) window.infoDiv.textContent = `DEAD - Respawning soon...`; // Use global safely
             }
             if (window.controls?.isLocked) window.controls.unlock();
             // Stop local player movement? gameLogic handles zeroing velocity when dead.
        } else {
             if (targetPlayer instanceof ClientPlayer) {
                 targetPlayer.health = 0;
                 targetPlayer.setVisible?.(false);
                 // Optionally stop interpolation/movement for dead remote players visually?
                 // Or just let them fade out/disappear via setVisible(false).
             } else { console.warn(`Dead remote player ${data.targetId} not found or not ClientPlayer.`); }
             if (UIManager) {
                 let message = (data.killerId === null) ? `${targetName} fell out of the world.` : (data.killerId === data.targetId) ? `${targetName} self-destructed.` : `${killerName} ${killerPhrase} ${targetName}.`;
                 UIManager.showKillMessage(message);
             }
        }
    },

    handlePlayerRespawned: function(playerData) {
        if (!playerData?.id) { console.warn("Invalid playerRespawned data received:", playerData); return; }
        const playerName = playerData.name || 'Player';
        console.log(`[Network] RX playerRespawned: ${playerName} (ID: ${playerData.id})`);

        let player = this._getPlayer(playerData.id);
        let playerMesh = player?.mesh;
        let playerVelocity = window.playerVelocities?.[playerData.id];
        const targetPos = new THREE.Vector3(playerData.x, playerData.y, playerData.z); // Server sends feet position
        const targetRotY = playerData.rotationY || 0;

        if (playerData.id === window.localPlayerId) { // Use global localPlayerId
            console.log("[Network] Processing LOCAL player respawn.");
            if (!player) { console.error("!!! CRITICAL: Local player data missing during respawn!"); return; }
            if (!playerMesh) { console.error("!!! CRITICAL: Local player mesh missing during respawn!"); return; }
            if (!playerVelocity) { console.warn("Local player velocity missing during respawn, re-initializing."); playerVelocity = new THREE.Vector3(); window.playerVelocities[playerData.id] = playerVelocity; }

            // Update local player data store
            player.health = playerData.health;
            player.x = playerData.x; player.y = playerData.y; player.z = playerData.z; player.rotationY = targetRotY;
            player.name = playerData.name; player.phrase = playerData.phrase; // Phrase still sent by server
            // window.localPlayerName = player.name; // Name already set

            // Reset visual and physics state
            playerMesh.position.copy(targetPos);
            // playerMesh.rotation.set(0, targetRotY, 0); // Rotation is controlled by camera for local player

            playerVelocity.set(0, 0, 0); // Reset velocity
            if (window.playerIsGrounded) window.playerIsGrounded[playerData.id] = false; // Assume airborne after respawn

            // Make sure camera matches player's new position/orientation immediately
             if (window.controls) {
                 const cameraParentPos = targetPos.clone().add(new THREE.Vector3(0, CONFIG.CAMERA_Y_OFFSET, 0));
                 window.controls.getObject().position.copy(cameraParentPos);
                 // Set camera's rotation directly (PointerLockControls will take over)
                 window.camera.rotation.set(0, targetRotY, 0);
                 // Might need to force PointerLockControls internal angles? Usually setting camera works.
             }

            console.log(`[Network] Respawned local player to server coords ~(${targetPos.x.toFixed(1)}, ${targetPos.y.toFixed(1)}, ${targetPos.z.toFixed(1)})`);
            if (UIManager) { UIManager.updateHealthBar(player.health); UIManager.updateInfo(`Playing as ${player.name}`); UIManager.clearKillMessage(); }
            console.log("[Network] Local player respawn complete.");

        } else {
            console.log(`[Network] Processing REMOTE player respawn: ${playerName}`);
            // Ensure player exists, if not, try to recreate
            if (!player || !(player instanceof ClientPlayer) || !playerMesh) {
                console.warn(`Remote player object/mesh missing for respawn ID ${playerData.id}. Recreating...`);
                this._removePlayer(playerData.id); // Clean up old state first
                player = this._addPlayer(playerData); // Recreate player, mesh, and velocity/grounded state
                playerMesh = player?.mesh;
            }
            if (!player || !(player instanceof ClientPlayer) || !playerMesh) { console.error(`!!! Failed recreate remote player ${playerData.id}! Aborting respawn.`); return; }
            if (!playerVelocity) { console.warn("Remote player velocity missing during respawn, re-initializing."); playerVelocity = new THREE.Vector3(); window.playerVelocities[playerData.id] = playerVelocity; }

            // Update remote player data and visual state
            player.updateData(playerData); // Updates health, server pos cache etc.
            player.setVisible?.(true);
            playerMesh.position.copy(targetPos); // Teleport mesh
            playerMesh.rotation.set(0, targetRotY, 0);
            playerVelocity.set(0, 0, 0); // Reset velocity
            if (window.playerIsGrounded) window.playerIsGrounded[playerData.id] = false;
            console.log(`[Network] Respawned remote player ${playerData.id} to server coords ~(${targetPos.x.toFixed(1)}, ${targetPos.y.toFixed(1)}, ${targetPos.z.toFixed(1)})`);
        }
    },

    handleServerFull: function() {
        console.warn("[Network] Received 'serverFull' message.");
        if (socket) socket.disconnect(); // Disconnect client
        // Go back to homescreen with error message
        stateMachine?.transitionTo('homescreen');
        UIManager?.showError("Server is Full!", 'homescreen');
    },

     // --- Actions ---
     attemptJoinGame: function() {
        console.log("[Network] Attempting to join game...");
        // Name is now set via UI flow and stored in window.localPlayerName

        if (typeof window === 'undefined' || !window.localPlayerName) {
            console.error("!!! Cannot attempt join: Player name not set globally!");
            UIManager?.showError('Player name not set.', 'characterSelect'); // Show error on char select screen
            return;
        }

        UIManager?.clearError('characterSelect'); // Clear previous errors

        // *** Check Core Game Prerequisites (Manual Raycasting VERSION) ***
        console.log(`[Network Attempt Join] Checking prerequisites:`);
        const areAssetsReady = window.assetsAreReady === true;
        const mapMeshReady = !!window.mapMesh; // Check visual map mesh
        console.log(`  - Assets Ready? ${areAssetsReady}`);
        console.log(`  - Map Mesh Ready? ${mapMeshReady}`);

        if (!areAssetsReady || !mapMeshReady) {
            console.warn("[Network Attempt Join] Blocked: Core components (Assets/Map) not ready yet.");
            UIManager?.showError('Game systems initializing, please wait...', 'characterSelect');
            return;
        }
        console.log("[Network Attempt Join] Prerequisites met.");

        stateMachine?.transitionTo('joining');
        UIManager?.showLoading("Connecting..."); // Use loading screen for joining phase

        if (Network.isConnected()) {
            console.log("[Network Attempt Join] Already connected -> Sending player details...");
            UIManager?.showLoading("Joining..."); // Update loading message
            Network.sendJoinDetails();
        } else {
            console.log("[Network Attempt Join] Not connected -> Triggering connection...");
             UIManager?.showLoading("Connecting..."); // Update loading message
            if (socket && typeof socket.connect === 'function' && !socket.active) {
                 console.log("[Network Attempt Join] Manually calling socket.connect().");
                 socket.connect(); // Connection listener will handle sending details
            } else if (!socket) {
                 console.error("!!! Cannot connect: Socket object doesn't exist!");
                 UIManager?.showError("Network Init Failed!", 'homescreen');
                 stateMachine?.transitionTo('homescreen'); // Go back to start
            } else {
                // Socket exists but might be actively trying to connect already
                console.log("[Network Attempt Join] Socket exists, assuming connection attempt is in progress.");
            }
        }
     }, // End attemptJoinGame

     sendJoinDetails: function() {
         if (!stateMachine?.is('joining')) { console.warn("[Network] Tried sendJoinDetails but not in 'joining' state."); return; }
         if (!Network.isConnected()) {
             console.error("[Network] Cannot send join details: Disconnected.");
             UIManager?.showError('Connection lost.', 'homescreen'); // Show error on home screen
             stateMachine?.transitionTo('homescreen'); // Go back if disconnected
             return;
         }
         const nameToSend = window.localPlayerName;
         console.log(`[Network] TX setPlayerDetails | Name: ${nameToSend}`);
         // Send default phrase, server handles it if needed for kill messages
         socket.emit('setPlayerDetails', { name: nameToSend, phrase: '...' });
     },

     sendPlayerUpdate: function(data) {
         const player = this._getPlayer(window.localPlayerId);
         // Only send updates if connected, playing, and alive
         if (Network.isConnected() && stateMachine?.is('playing') && player?.health > 0) {
             socket.emit('playerUpdate', data);
         }
     },

     sendVoidDeath: function() {
         const player = this._getPlayer(window.localPlayerId);
         if (Network.isConnected() && stateMachine?.is('playing') && player?.health > 0) {
             console.log("[Network] TX fellIntoVoid");
             socket.emit('fellIntoVoid');
         }
     },

     sendPlayerHit: function(hitData) {
         const player = this._getPlayer(window.localPlayerId);
         if (Network.isConnected() && stateMachine?.is('playing') && player?.health > 0) {
              // console.log(`[Network] TX playerHit -> Target: ${hitData.targetId}, Damage: ${hitData.damage}`);
              socket.emit('playerHit', hitData);
         }
     }

}; // End Network object

// Export globally
if (typeof window !== 'undefined') {
    window.Network = Network;
}
console.log("network.js loaded (Manual Raycasting v1)");
// --- END OF FULL network.js FILE ---
